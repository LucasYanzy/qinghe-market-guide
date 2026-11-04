import { Router } from 'express';
import { z } from 'zod';
import guide from '../references/rutgers-market-guide.json' with { type: 'json' };
import { HttpError } from './services.mjs';
import { daySchema, audit } from './operations.mjs';
import { marketDay } from './db.mjs';
import { notifyOrder, notifyUser } from './notifications.mjs';

const id = z.coerce.number().int().positive();
const version = z.number().int().min(0);
const quantity = z.number().min(0).max(100).refine(n => Math.abs(n*1000-Math.round(n*1000))<1e-7);
const reason = z.string().trim().min(1).max(500);
function transaction(db, run) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = run(); db.exec('COMMIT'); return result; }
  catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); throw error; }
}
function orderFor(db, actor, orderId) {
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
  if (!order) throw new HttpError(404, '订单不存在。');
  if (actor.role !== 'admin' && (actor.role === 'retailer'
    ? !db.prepare('SELECT 1 FROM order_items WHERE order_id=? AND retailer_id=?').get(orderId, actor.id)
      || !!db.prepare('SELECT 1 FROM order_items WHERE order_id=? AND retailer_id!=?').get(orderId, actor.id)
    : order.client_id !== actor.id)) throw new HttpError(403, '无权操作此订单。');
  return order;
}
function adjustmentFor(db, orderId) {
  const a = db.prepare('SELECT * FROM order_adjustments WHERE order_id=?').get(orderId);
  return a ? { ...a, items: JSON.parse(a.items_json) } : null;
}

export function createWorkflowsRouter(db) {
  const router = Router();
  const authenticated = (req,res,next) => req.user ? next() : res.status(401).json({error:'请先登录。'});
  const admin = (req,res,next) => req.user?.role === 'admin' ? next() : res.status(403).json({error:'当前账号无权进行此操作。'});
  router.use('/admin', authenticated, admin);

  router.get('/session-directory', (req,res) => {
    const from = daySchema.parse(req.query.from ?? req.query.date ?? marketDay());
    const to = daySchema.parse(req.query.to ?? req.query.date ?? from);
    if (to < from || (Date.parse(to)-Date.parse(from))/86400000 > 366) throw new HttpError(400,'日期范围无效。');
    const rows = db.prepare(`SELECT s.id,s.market_id,s.date,s.starts_at,s.ends_at,s.cutoff,s.status,s.cancelled,s.notice,
      m.name AS market_name,m.address,m.official_location_id,m.preorders_enabled,m.active
      FROM market_sessions s JOIN markets m ON m.id=s.market_id WHERE s.date BETWEEN ? AND ?
      AND s.status!='draft' ORDER BY s.date,s.starts_at,s.id`).all(from,to);
    res.json(rows.map(s => ({...s, vendors: db.prepare(`SELECT u.id,u.business_name AS name,v.booth,v.status,
      COALESCE(p.public_description,'') AS description FROM session_vendors v
      JOIN vendor_directory u ON u.id=v.retailer_id LEFT JOIN vendor_profiles p ON p.retailer_id=u.id
      WHERE v.session_id=? AND v.status IN ('confirmed','checked_in') ORDER BY v.booth,u.business_name`).all(s.id)})));
  });

  router.get('/notifications', authenticated, (req,res) => res.json(db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 100').all(req.user.id)
    .map(n=>({...n,values:JSON.parse(n.values_json)}))));
  router.patch('/notifications/:id', authenticated, (req,res) => {
    const result = db.prepare('UPDATE notifications SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE id=? AND user_id=?').run(id.parse(req.params.id),req.user.id);
    if (!result.changes) throw new HttpError(404,'通知不存在。');
    res.json({ok:true});
  });
  router.get('/admin/communications', (_req,res) => res.json({
    emailConfigured:!!(process.env.RESEND_API_KEY && process.env.MAIL_FROM),
    outbox:db.prepare(`SELECT e.id,e.recipient,e.status,e.attempts,e.last_error,e.created_at,e.sent_at,n.message_key,n.values_json
      FROM email_outbox e JOIN notifications n ON n.id=e.notification_id ORDER BY e.id DESC LIMIT 100`).all().map(n=>({...n,values:JSON.parse(n.values_json)})),
  }));
  router.post('/admin/sessions/:id/reminders', (req,res) => {
    const session = db.prepare('SELECT * FROM market_sessions WHERE id=?').get(id.parse(req.params.id));
    if (!session || session.cancelled) throw new HttpError(409,'场次不存在或已取消。');
    const n = transaction(db,()=>{
      const orders = db.prepare("SELECT id FROM orders WHERE market_session_id=? AND status='confirmed'").all(session.id);
      for (const o of orders) notifyOrder(db,o.id,'pickup_reminder','预购 {id} 即将自提：{date}。请查看订单中的时间和取货码。',{date:session.date});
      audit(db,req.user.id,'session',session.id,'reminders_queued',{orders:orders.length}); return orders.length;
    });
    res.json({orders:n});
  });

  router.post('/orders/:id/adjustment', authenticated, (req,res) => {
    if (!['admin','retailer'].includes(req.user.role)) throw new HttpError(403,'当前账号无权进行此操作。');
    const p = z.object({items:z.array(z.object({productId:id,quantity})).min(1).max(50),reason,version:version.default(0)}).strict().parse(req.body);
    res.json(transaction(db,()=>{
      const order = orderFor(db,req.user,req.params.id), previous = adjustmentFor(db,order.id);
      if (order.status !== 'confirmed' || order.final_total_cents !== null) throw new HttpError(409,'仅未结算的待自提订单可以提出调整。');
      if ((previous?.version ?? 0) !== p.version) throw new HttpError(409,'调整记录已变化，请刷新。');
      const original = db.prepare('SELECT * FROM order_items WHERE order_id=?').all(order.id);
      if (new Set(p.items.map(i=>i.productId)).size !== original.length || p.items.length !== original.length) throw new HttpError(400,'请逐项确认全部原订单商品。');
      const snap = JSON.parse(order.snap_plan_json || '[]');
      const items = original.map(item=>{
        const q = p.items.find(i=>i.productId===item.product_id)?.quantity;
        if (q === undefined || q > item.quantity || (item.unit !== '磅' && !Number.isInteger(q))) throw new HttpError(400,'实际数量不能超过预订数量；非称重商品需为整数。');
        if (q > 0 && Math.round(item.price_cents*q) < 1) throw new HttpError(400,'每项商品的金额需至少为一美分，请增加数量。');
        return {productId:item.product_id,name:item.name,unit:item.unit,quantity:q,lineCents:Math.round(item.price_cents*q),
          eligible:snap.items?.find(i=>i.productId===item.product_id)?.snapEligibility === 'eligible'};
      });
      const total=items.reduce((n,i)=>n+i.lineCents,0), eligible=items.filter(i=>i.eligible).reduce((n,i)=>n+i.lineCents,0);
      if (total<=0 || total === order.total_cents && items.every(i=>i.quantity===original.find(o=>o.product_id===i.productId).quantity)) throw new HttpError(400,'请填写实际变更；全部缺货时请取消订单。');
      db.prepare(`INSERT INTO order_adjustments (order_id,items_json,total_cents,eligible_cents,reason,status,version,requested_by)
        VALUES (?,?,?,?,?,'proposed',?,?) ON CONFLICT(order_id) DO UPDATE SET items_json=excluded.items_json,total_cents=excluded.total_cents,
        eligible_cents=excluded.eligible_cents,reason=excluded.reason,status='proposed',version=excluded.version,requested_by=excluded.requested_by,reviewed_at=NULL`)
        .run(order.id,JSON.stringify(items),total,eligible,p.reason,p.version+1,req.user.id);
      notifyOrder(db,order.id,`adjustment_${p.version+1}`,'预购 {id} 的商品或称重金额有调整，请在订单中确认。');
      audit(db,req.user.id,'order',order.id,'adjustment_proposed',{...p,totalCents:total});
      return adjustmentFor(db,order.id);
    }));
  });
  router.post('/orders/:id/adjustment/review', authenticated, (req,res) => {
    const p=z.object({accept:z.boolean(),version}).strict().parse(req.body);
    res.json(transaction(db,()=>{
      const order=orderFor(db,req.user,req.params.id),a=adjustmentFor(db,order.id);
      if (order.client_id!==req.user.id || req.user.role!=='client') throw new HttpError(403,'仅订购顾客可以确认调整。');
      if (order.status!=='confirmed' || !a || a.status!=='proposed' || a.version!==p.version) throw new HttpError(409,'调整记录已变化，请刷新。');
      if (p.accept) {
        for (const item of a.items) {
          const original=db.prepare('SELECT quantity FROM order_items WHERE order_id=? AND product_id=?').get(order.id,item.productId);
          db.prepare('INSERT INTO fulfillment_items VALUES (?,?,?)').run(order.id,item.productId,item.quantity);
          db.prepare('UPDATE products SET stock=ROUND(stock+?,3) WHERE id=?').run(original.quantity-item.quantity,item.productId);
        }
        db.prepare('UPDATE orders SET final_total_cents=?,final_snap_eligible_cents=? WHERE id=?').run(a.total_cents,a.eligible_cents,order.id);
      }
      db.prepare('UPDATE order_adjustments SET status=?,reviewed_at=CURRENT_TIMESTAMP WHERE order_id=?').run(p.accept?'accepted':'rejected',order.id);
      audit(db,req.user.id,'order',order.id,p.accept?'adjustment_accepted':'adjustment_rejected',{version:p.version,totalCents:a.total_cents});
      for (const vendor of db.prepare('SELECT DISTINCT retailer_id FROM order_items WHERE order_id=?').all(order.id))
        notifyUser(db,vendor.retailer_id,`adjustment_review_${a.version}`,order.id,'预购 {id} 的调整已由顾客处理，请查看订单。',{id:order.id});
      return {ok:true};
    }));
  });

  router.get('/vendor/applications', authenticated, (req,res)=>res.json(db.prepare(`SELECT a.*,m.name AS market_name FROM vendor_applications a JOIN markets m ON m.id=a.market_id
    WHERE a.applicant_id=? ORDER BY a.id DESC`).all(req.user.id)));
  router.post('/vendor/applications', authenticated, (req,res)=>{
    const p=z.object({marketId:id,businessName:z.string().trim().min(1).max(80),contactName:z.string().trim().min(1).max(80),phone:z.string().trim().max(40),description:z.string().trim().min(1).max(1000)}).strict().parse(req.body);
    if (req.user.role==='admin') throw new HttpError(403,'请使用商户或顾客账号申请。');
    res.status(201).json(transaction(db,()=>{
      if (!db.prepare('SELECT 1 FROM markets WHERE id=? AND active=1').get(p.marketId)) throw new HttpError(404,'市场不存在。');
      if (db.prepare("SELECT 1 FROM vendor_applications WHERE applicant_id=? AND market_id=? AND status IN ('submitted','needs_info','waitlisted')").get(req.user.id,p.marketId)) throw new HttpError(409,'该市场已有待处理申请。');
      const result=db.prepare('INSERT INTO vendor_applications (applicant_id,market_id,business_name,contact_name,phone,description) VALUES (?,?,?,?,?,?)').run(req.user.id,p.marketId,p.businessName,p.contactName,p.phone,p.description);
      audit(db,req.user.id,'application',result.lastInsertRowid,'application_submitted',{marketId:p.marketId});
      for (const staff of db.prepare("SELECT id FROM users WHERE role='admin'").all())
        notifyUser(db,staff.id,'application_submitted',result.lastInsertRowid,'收到商户申请 {id}，请查看待审核记录。',{id:Number(result.lastInsertRowid)});
      return {id:Number(result.lastInsertRowid)};
    }));
  });
  router.patch('/vendor/applications/:id', authenticated, (req,res)=>{
    const p=z.object({description:z.string().trim().min(1).max(1000),version}).strict().parse(req.body);
    res.json(transaction(db,()=>{
      const applicationId=id.parse(req.params.id);
      const result=db.prepare("UPDATE vendor_applications SET description=?,status='submitted',version=version+1 WHERE id=? AND applicant_id=? AND status IN ('needs_info','waitlisted') AND version=?")
        .run(p.description,applicationId,req.user.id,p.version);
      if (!result.changes) throw new HttpError(409,'申请状态已变化，请刷新。');
      audit(db,req.user.id,'application',applicationId,'application_resubmitted',p);
      for (const staff of db.prepare("SELECT id FROM users WHERE role='admin'").all())
        notifyUser(db,staff.id,`application_resubmitted_${p.version+1}`,applicationId,'商户申请 {id} 已补充资料，请重新审核。',{id:applicationId});
      return {ok:true};
    }));
  });
  router.get('/admin/applications',(req,res)=>res.json(db.prepare(`SELECT a.*,m.name AS market_name,u.email FROM vendor_applications a JOIN markets m ON m.id=a.market_id
    JOIN users u ON u.id=a.applicant_id WHERE (?=0 OR a.market_id=?) ORDER BY a.id DESC`).all(Number(req.query.marketId)||0,Number(req.query.marketId)||0)));
  router.patch('/admin/applications/:id',(req,res)=>{
    const p=z.object({status:z.enum(['approved','rejected','needs_info','waitlisted']),note:reason,version}).strict().parse(req.body);
    res.json(transaction(db,()=>{
      const a=db.prepare('SELECT * FROM vendor_applications WHERE id=?').get(id.parse(req.params.id));
      if (!a || a.version!==p.version || ['approved','rejected'].includes(a.status)) throw new HttpError(409,'申请状态已变化，请刷新。');
      if (p.status==='approved') {
        if (!db.prepare('SELECT 1 FROM markets WHERE id=? AND active=1').get(a.market_id)) throw new HttpError(409,'请先启用市场。');
        const applicant=db.prepare('SELECT role FROM users WHERE id=?').get(a.applicant_id);
        if (applicant.role==='admin') throw new HttpError(409,'管理员账号不能转为商户。');
        db.prepare('INSERT OR IGNORE INTO session_roles SELECT token_hash,? FROM sessions WHERE user_id=?').run(applicant.role,a.applicant_id);
        db.prepare('INSERT OR IGNORE INTO user_roles VALUES (?,?)').run(a.applicant_id,applicant.role);
        db.prepare("INSERT OR IGNORE INTO user_roles VALUES (?,'retailer')").run(a.applicant_id);
        db.prepare("UPDATE users SET role='retailer' WHERE id=?").run(a.applicant_id);
        db.prepare(`INSERT INTO vendor_profiles (retailer_id,contact_name,phone,staff_managed,business_name) VALUES (?,?,?,0,?)
          ON CONFLICT(retailer_id) DO NOTHING`).run(a.applicant_id,a.contact_name,a.phone,a.business_name);
        const businessName=db.prepare('SELECT business_name FROM vendor_directory WHERE id=?').get(a.applicant_id).business_name;
        db.prepare('UPDATE products SET farm=? WHERE retailer_id=?').run(businessName,a.applicant_id);
        db.prepare('INSERT OR IGNORE INTO market_vendors (market_id,retailer_id) VALUES (?,?)').run(a.market_id,a.applicant_id);
      }
      db.prepare('UPDATE vendor_applications SET status=?,review_note=?,version=version+1,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?').run(p.status,p.note,req.user.id,a.id);
      audit(db,req.user.id,'application',a.id,'application_reviewed',p);
      notifyUser(db,a.applicant_id,`application_${a.version+1}`,a.id,'商户申请 {id} 已更新，请查看审核意见。',{id:a.id});
      return {ok:true};
    }));
  });

  router.get('/vendor/sessions',authenticated,(req,res)=>res.json(db.prepare(`SELECT v.*,s.date,s.starts_at,s.ends_at,s.cancelled,s.notice,m.name AS market_name,
    r.gross_cents,r.transactions,r.version AS sales_version FROM session_vendors v JOIN market_sessions s ON s.id=v.session_id
    JOIN markets m ON m.id=s.market_id LEFT JOIN vendor_sales_reports r ON r.session_id=v.session_id AND r.retailer_id=v.retailer_id
    WHERE v.retailer_id=? ORDER BY s.date DESC`).all(req.user.id)));
  router.get('/admin/sessions/:id/vendors',(req,res)=>res.json(db.prepare(`SELECT v.*,u.business_name AS name,u.email FROM session_vendors v JOIN vendor_directory u ON u.id=v.retailer_id WHERE v.session_id=? ORDER BY v.booth,u.business_name`).all(id.parse(req.params.id))));
  const changeAttendance=(req,res)=>{
    const p=z.object({vendorId:id,status:z.enum(['planned','confirmed','absent','checked_in']),booth:z.string().trim().max(40).default(''),note:z.string().trim().max(300).default(''),version:version.default(0)}).strict().parse(req.body);
    res.json(transaction(db,()=>{
      const session=db.prepare('SELECT * FROM market_sessions WHERE id=?').get(id.parse(req.params.id));
      if (!session || session.cancelled) throw new HttpError(409,'场次不存在或已取消。');
      if (req.user.role!=='admin' && (req.user.id!==p.vendorId || !['confirmed','absent'].includes(p.status))) throw new HttpError(403,'当前账号无权进行此操作。');
      if (!db.prepare('SELECT 1 FROM market_vendors WHERE market_id=? AND retailer_id=?').get(session.market_id,p.vendorId)) throw new HttpError(409,'请先将商户分配到该市场。');
      const previous=db.prepare('SELECT * FROM session_vendors WHERE session_id=? AND retailer_id=?').get(session.id,p.vendorId);
      if ((previous?.version??0)!==p.version || req.user.role!=='admin' && !previous) throw new HttpError(409,'出摊记录已变化，请刷新。');
      if (p.status==='checked_in' && session.date>marketDay()) throw new HttpError(409,'未到营业日期，不能提前签到。');
      if (req.user.role!=='admin' && (previous.status==='checked_in' || session.date<marketDay())) throw new HttpError(409,'已签到或已结束的出摊记录请联系工作人员修改。');
      const booth=req.user.role==='admin'?p.booth:previous.booth;
      if (p.status!=='absent' && booth && db.prepare("SELECT 1 FROM session_vendors WHERE session_id=? AND retailer_id!=? AND booth=? COLLATE NOCASE AND status!='absent'").get(session.id,p.vendorId,booth)) throw new HttpError(409,'该摊位已分配给其他商户。');
      db.prepare(`INSERT INTO session_vendors VALUES (?,?,?,?,?,?) ON CONFLICT(session_id,retailer_id) DO UPDATE SET status=excluded.status,booth=excluded.booth,note=excluded.note,version=excluded.version`)
        .run(session.id,p.vendorId,p.status,booth,p.note,p.version+1);
      audit(db,req.user.id,'session',session.id,'vendor_attendance_changed',{...p,booth});
      notifyUser(db,p.vendorId,`attendance_${p.version+1}`,`${session.id}:${p.vendorId}`,'出摊安排已更新：{date}。请查看商户服务。',{date:session.date});
      if (req.user.role!=='admin') for (const staff of db.prepare("SELECT id FROM users WHERE role='admin'").all())
        notifyUser(db,staff.id,`attendance_${p.version+1}`,`${session.id}:${p.vendorId}`,'商户已更新 {date} 的出摊确认或请假，请查看出摊记录。',{date:session.date});
      return {ok:true};
    }));
  };
  router.put('/admin/sessions/:id/vendors',changeAttendance);
  router.put('/vendor/sessions/:id',authenticated,changeAttendance);

  router.post('/admin/sessions/:id/cancel',(req,res)=>{
    const p=z.object({reason,version}).strict().parse(req.body);
    const sessionId=id.parse(req.params.id);
    // Status transitions own their transactions; first acquire a write transaction for the whole batch.
    res.json(transaction(db,()=>{
      const session=db.prepare('SELECT * FROM market_sessions WHERE id=?').get(sessionId);
      if (!session || session.version!==p.version || session.cancelled) throw new HttpError(409,'场次已被其他工作人员更新，请刷新。');
      db.prepare("UPDATE market_sessions SET cancelled=1,status='closed',notice=?,version=version+1 WHERE id=?").run(p.reason,sessionId);
      const orders=db.prepare("SELECT * FROM orders WHERE market_session_id=? AND status IN ('pending','confirmed')").all(sessionId);
      for (const order of orders) {
        for (const item of db.prepare('SELECT * FROM effective_order_items WHERE order_id=?').all(order.id)) db.prepare('UPDATE products SET stock=ROUND(stock+?,3) WHERE id=?').run(item.quantity,item.product_id);
        db.prepare("UPDATE orders SET status='cancelled' WHERE id=?").run(order.id);
        audit(db,req.user.id,'order',order.id,'order_cancelled',{from:order.status,to:'cancelled',reason:p.reason});
        notifyOrder(db,order.id,'cancelled','预购 {id} 已取消。原因：{reason}',{reason:p.reason});
      }
      for (const vendor of db.prepare('SELECT retailer_id FROM market_vendors WHERE market_id=?').all(session.market_id))
        notifyUser(db,vendor.retailer_id,'session_cancelled',sessionId,'{date} 的市场已取消：{reason}',{date:session.date,reason:p.reason});
      audit(db,req.user.id,'session',sessionId,'session_cancelled',{reason:p.reason,cancelledOrders:orders.length});
      return {ok:true,cancelledOrders:orders.length};
    }));
  });
  router.put('/admin/market-links',(req,res)=>{
    const p=z.object({marketId:id,officialLocationId:z.string().max(80)}).strict().parse(req.body);
    if (p.officialLocationId && !guide.locations.some(l=>l.id===p.officialLocationId)) throw new HttpError(400,'请选择已有官方地点。');
    if (p.officialLocationId && db.prepare('SELECT 1 FROM markets WHERE official_location_id=? AND id!=?').get(p.officialLocationId,p.marketId)) throw new HttpError(409,'该官方地点已关联其他运营市场。');
    const r=db.prepare('UPDATE markets SET official_location_id=? WHERE id=?').run(p.officialLocationId,p.marketId);
    if (!r.changes) throw new HttpError(404,'市场不存在。');
    audit(db,req.user.id,'market',p.marketId,'official_link_changed',p); res.json({ok:true});
  });

  const sales=(req,res)=>{
    const p=z.object({sessionId:id,vendorId:id,grossCents:z.number().int().min(0).max(100000000),transactions:z.number().int().min(0).max(100000),note:z.string().trim().max(500),version:version.default(0)}).strict().parse(req.body);
    if (req.user.role!=='admin' && (req.user.role!=='retailer'||req.user.id!==p.vendorId)) throw new HttpError(403,'当前账号无权进行此操作。');
    res.json(transaction(db,()=>{
      const s=db.prepare('SELECT * FROM market_sessions WHERE id=?').get(p.sessionId);
      if (!s || s.date>marketDay() || s.cancelled || !db.prepare("SELECT 1 FROM session_vendors WHERE session_id=? AND retailer_id=? AND status='checked_in'").get(p.sessionId,p.vendorId)) throw new HttpError(409,'仅已签到且已到营业日期的商户可以填报销售。');
      const old=db.prepare('SELECT * FROM vendor_sales_reports WHERE session_id=? AND retailer_id=?').get(p.sessionId,p.vendorId);
      if ((old?.version??0)!==p.version) throw new HttpError(409,'销售记录已变化，请刷新。');
      db.prepare(`INSERT INTO vendor_sales_reports (session_id,retailer_id,gross_cents,transactions,note,version,recorded_by) VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(session_id,retailer_id) DO UPDATE SET gross_cents=excluded.gross_cents,transactions=excluded.transactions,note=excluded.note,version=excluded.version,recorded_by=excluded.recorded_by,updated_at=CURRENT_TIMESTAMP`)
        .run(p.sessionId,p.vendorId,p.grossCents,p.transactions,p.note,p.version+1,req.user.id);
      audit(db,req.user.id,'session',p.sessionId,'sales_reported',p);return {ok:true};
    }));
  };
  router.post('/admin/sales-reports',sales);
  router.post('/vendor/sales-reports',authenticated,sales);
  router.get('/admin/sales-reports',(req,res)=>res.json(db.prepare(`SELECT r.*,u.business_name AS vendor_name,m.name AS market_name,s.date FROM vendor_sales_reports r
    JOIN vendor_directory u ON u.id=r.retailer_id JOIN market_sessions s ON s.id=r.session_id JOIN markets m ON m.id=s.market_id
    WHERE (?=0 OR m.id=?) ORDER BY s.date DESC,r.retailer_id LIMIT 500`).all(Number(req.query.marketId)||0,Number(req.query.marketId)||0)));
  const invoices=(vendorId=null)=>db.prepare(`SELECT i.*,u.business_name AS vendor_name,m.name AS market_name,
    COALESCE((SELECT SUM(amount_cents) FROM invoice_payments WHERE invoice_id=i.id),0) AS paid_cents FROM vendor_invoices i
    JOIN vendor_directory u ON u.id=i.retailer_id JOIN markets m ON m.id=i.market_id WHERE (?=0 OR i.retailer_id=?) ORDER BY i.id DESC LIMIT 500`).all(vendorId??0,vendorId??0);
  router.get('/admin/invoices',(_req,res)=>res.json(invoices()));
  router.get('/vendor/invoices',authenticated,(req,res)=>res.json(invoices(req.user.id)));
  router.post('/admin/invoices',(req,res)=>{
    const p=z.object({marketId:id,vendorId:id,description:reason,amountCents:z.number().int().min(1).max(10000000),dueOn:daySchema}).strict().parse(req.body);
    res.status(201).json(transaction(db,()=>{
      if (!db.prepare('SELECT 1 FROM market_vendors WHERE market_id=? AND retailer_id=?').get(p.marketId,p.vendorId)) throw new HttpError(409,'请先将商户分配到该市场。');
      const result=db.prepare('INSERT INTO vendor_invoices (market_id,retailer_id,description,amount_cents,due_on,created_by) VALUES (?,?,?,?,?,?)').run(p.marketId,p.vendorId,p.description,p.amountCents,p.dueOn,req.user.id);
      notifyUser(db,p.vendorId,'invoice_issued',result.lastInsertRowid,'商户账单 {id} 已开立，请查看费用明细。',{id:Number(result.lastInsertRowid)});
      audit(db,req.user.id,'invoice',result.lastInsertRowid,'invoice_issued',p);return {id:Number(result.lastInsertRowid)};
    }));
  });
  router.post('/admin/invoices/:id/payments',(req,res)=>{
    const p=z.object({amountCents:z.number().int().min(1),reference:reason,version}).strict().parse(req.body);
    res.json(transaction(db,()=>{
      const invoice=db.prepare(`SELECT i.*,COALESCE((SELECT SUM(amount_cents) FROM invoice_payments WHERE invoice_id=i.id),0) AS paid_cents
        FROM vendor_invoices i WHERE i.id=?`).get(id.parse(req.params.id));
      if (!invoice || invoice.status!=='issued' || invoice.version!==p.version || p.amountCents>invoice.amount_cents-invoice.paid_cents) throw new HttpError(409,'账单已变化或登记金额超过未收金额。');
      db.prepare('INSERT INTO invoice_payments (invoice_id,amount_cents,reference,recorded_by) VALUES (?,?,?,?)').run(invoice.id,p.amountCents,p.reference,req.user.id);
      db.prepare('UPDATE vendor_invoices SET version=version+1 WHERE id=?').run(invoice.id);
      audit(db,req.user.id,'invoice',invoice.id,'invoice_payment_recorded',p);return {ok:true};
    }));
  });
  router.post('/admin/invoices/:id/void',(req,res)=>{
    const p=z.object({reason,version}).strict().parse(req.body);
    res.json(transaction(db,()=>{
      const invoice=db.prepare(`SELECT i.*,COALESCE((SELECT SUM(amount_cents) FROM invoice_payments WHERE invoice_id=i.id),0) AS paid_cents
        FROM vendor_invoices i WHERE i.id=?`).get(id.parse(req.params.id));
      if (!invoice || invoice.status!=='issued' || invoice.version!==p.version || invoice.paid_cents>0) throw new HttpError(409,'仅未登记收款且未作废的账单可以作废，请刷新核对。');
      db.prepare("UPDATE vendor_invoices SET status='void',version=version+1 WHERE id=?").run(invoice.id);
      audit(db,req.user.id,'invoice',invoice.id,'invoice_voided',p);
      notifyUser(db,invoice.retailer_id,'invoice_voided',invoice.id,'商户账单 {id} 已作废：{reason}',{id:invoice.id,reason:p.reason});
      return {ok:true};
    }));
  });
  return router;
}
