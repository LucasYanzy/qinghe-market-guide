import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from './services.mjs';
import { audit } from './operations.mjs';
import { notifyUser } from './notifications.mjs';

const id = z.coerce.number().int().positive();
const version = z.number().int().nonnegative();
const fields = z.object({
  businessName: z.string().trim().min(1).max(80),
  publicDescription: z.string().trim().max(1000),
  contactName: z.string().trim().max(80),
  phone: z.string().trim().max(40),
});
const submission = fields.extend({ version }).strict();

function transaction(db, run) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = run(); db.exec('COMMIT'); return result; }
  catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); throw error; }
}

function profileFor(db, vendorId) {
  const row = db.prepare(`SELECT u.id,u.business_name,p.contact_name,p.phone,p.public_description,
    COALESCE(p.version,0) AS version,COALESCE(p.staff_managed,0) AS staff_managed
    FROM vendor_directory u LEFT JOIN vendor_profiles p ON p.retailer_id=u.id
    WHERE u.id=? AND (u.role='retailer' OR EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='retailer'))`).get(vendorId);
  if (!row) throw new HttpError(404, '商户档案不存在。');
  return { id: row.id, version: row.version, staffManaged: !!row.staff_managed,
    businessName: row.business_name, publicDescription: row.public_description ?? '',
    contactName: row.contact_name ?? '', phone: row.phone ?? '' };
}
const snapshot = profile => fields.parse(profile);
function requestsFor(db, vendorId) {
  return db.prepare('SELECT * FROM vendor_profile_requests WHERE retailer_id=? ORDER BY id DESC LIMIT 100').all(vendorId)
    .map(({ before_json, proposed_json, ...row }) => ({ ...row, before: JSON.parse(before_json), proposed: JSON.parse(proposed_json) }));
}

export function createVendorProfilesRouter(db) {
  const router = Router();
  const authenticated = (req, res, next) => req.user ? next() : res.status(401).json({ error: '请先登录。' });
  router.use('/vendor', authenticated);
  router.use('/admin', authenticated, (req, res, next) => req.user.role === 'admin' ? next() : res.status(403).json({ error: '当前账号无权进行此操作。' }));

  const workspace = vendorId => ({ profile: profileFor(db, vendorId), requests: requestsFor(db, vendorId) });
  router.get('/vendor/profile', (req, res) => res.json(workspace(req.user.id)));
  router.get('/admin/vendor-profiles', (req, res) => {
    const marketId = req.query.marketId === undefined ? null : id.parse(req.query.marketId);
    const vendors = db.prepare(`SELECT u.id,EXISTS(SELECT 1 FROM vendor_profile_requests c WHERE c.retailer_id=u.id AND c.status='pending') AS pendingRequests FROM vendor_directory u WHERE
      (u.role='retailer' OR EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='retailer'))
      AND (? IS NULL OR EXISTS(SELECT 1 FROM market_vendors mv WHERE mv.retailer_id=u.id AND mv.market_id=?))
      ORDER BY pendingRequests DESC,u.business_name,u.id`).all(marketId, marketId);
    res.json(vendors.map(v => ({ ...profileFor(db, v.id), pendingRequests: v.pendingRequests })));
  });
  router.get('/admin/vendor-profiles/:id', (req, res) => res.json(workspace(id.parse(req.params.id))));

  function submit(req, res, vendorId) {
    const input = submission.parse(req.body);
    res.status(201).json(transaction(db, () => {
      const current = profileFor(db, vendorId);
      if (current.version !== input.version) throw new HttpError(409, '商户档案已变化，请刷新后重新提交。');
      if (db.prepare("SELECT 1 FROM vendor_profile_requests WHERE retailer_id=? AND status='pending'").get(vendorId))
        throw new HttpError(409, '已有待审核的档案变更，请等待审核或先撤回。');
      const before = snapshot(current), proposed = snapshot(input);
      if (JSON.stringify(before) === JSON.stringify(proposed)) throw new HttpError(400, '请先修改商户档案。');
      const requestId = Number(db.prepare(`INSERT INTO vendor_profile_requests
        (retailer_id,before_json,proposed_json,base_version,submitted_by) VALUES (?,?,?,?,?)`)
        .run(vendorId, JSON.stringify(before), JSON.stringify(proposed), current.version, req.user.id).lastInsertRowid);
      // Contact details stay in the private record, never in a notification or public roster.
      audit(db, req.user.id, 'vendor_profile_request', requestId, 'profile_change_submitted', { vendorId, baseVersion: current.version });
      for (const staff of db.prepare("SELECT id FROM users WHERE role='admin'").all())
        notifyUser(db, staff.id, 'profile_change_submitted', requestId, '收到商户档案变更 {id}，请查看待审核记录。', { id: requestId, vendorId });
      if (req.user.id !== vendorId) notifyUser(db, vendorId, 'profile_change_submitted', requestId, '工作人员已代提交商户档案变更 {id}，请查看记录。', { id: requestId, vendorId });
      return { id: requestId };
    }));
  }
  router.post('/vendor/profile-requests', (req, res) => submit(req, res, req.user.id));
  router.post('/admin/vendor-profiles/:id/requests', (req, res) => submit(req, res, id.parse(req.params.id)));

  router.post('/vendor/profile-requests/:id/withdraw', (req, res) => {
    const input = z.object({ version }).strict().parse(req.body), requestId = id.parse(req.params.id);
    res.json(transaction(db, () => {
      const row = db.prepare('SELECT * FROM vendor_profile_requests WHERE id=? AND retailer_id=?').get(requestId, req.user.id);
      if (!row) throw new HttpError(404, '档案变更不存在。');
      if (row.status !== 'pending' || row.version !== input.version) throw new HttpError(409, '档案变更状态已变化，请刷新。');
      db.prepare("UPDATE vendor_profile_requests SET status='withdrawn',version=version+1,reviewed_at=CURRENT_TIMESTAMP WHERE id=?").run(requestId);
      audit(db, req.user.id, 'vendor_profile_request', requestId, 'profile_change_withdrawn', {});
      return { ok: true };
    }));
  });
  router.patch('/admin/vendor-profile-requests/:id', (req, res) => {
    const input = z.object({ version, status: z.enum(['approved', 'rejected']), note: z.string().trim().min(1).max(500) }).strict().parse(req.body);
    res.json(transaction(db, () => {
      const row = db.prepare('SELECT * FROM vendor_profile_requests WHERE id=?').get(id.parse(req.params.id));
      if (!row) throw new HttpError(404, '档案变更不存在。');
      if (row.status !== 'pending' || row.version !== input.version) throw new HttpError(409, '档案变更状态已变化，请刷新。');
      if (input.status === 'approved') {
        const current = profileFor(db, row.retailer_id);
        if (current.version !== row.base_version || JSON.stringify(snapshot(current)) !== row.before_json)
          throw new HttpError(409, '商户档案已变化，请拒绝旧变更并重新提交。');
        const proposed = fields.strict().parse(JSON.parse(row.proposed_json));
        db.prepare(`INSERT INTO vendor_profiles (retailer_id,business_name,public_description,contact_name,phone,staff_managed,version)
          VALUES (?,?,?,?,?,?,?) ON CONFLICT(retailer_id) DO UPDATE SET business_name=excluded.business_name,
          public_description=excluded.public_description,contact_name=excluded.contact_name,phone=excluded.phone,version=excluded.version`)
          .run(row.retailer_id, proposed.businessName, proposed.publicDescription, proposed.contactName, proposed.phone, Number(current.staffManaged), current.version + 1);
        db.prepare('UPDATE products SET farm=? WHERE retailer_id=?').run(proposed.businessName, row.retailer_id);
      }
      db.prepare(`UPDATE vendor_profile_requests SET status=?,review_note=?,version=version+1,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?`)
        .run(input.status, input.note, req.user.id, row.id);
      audit(db, req.user.id, 'vendor_profile_request', row.id, 'profile_change_reviewed', { status: input.status, note: input.note, vendorId: row.retailer_id });
      notifyUser(db, row.retailer_id, 'profile_change_reviewed', row.id, '商户档案变更 {id} 已审核，请查看结果与意见。', { id: row.id, vendorId: row.retailer_id });
      return { ok: true };
    }));
  });
  return router;
}
