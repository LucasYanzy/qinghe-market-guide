import { Router } from "express";
import { z } from "zod";
import { randomBytes, randomUUID } from "node:crypto";
import { marketDay, hashPassword } from "./db.mjs";
import { HttpError, updateOrderStatus } from "./services.mjs";
import { notifyOrder } from "./notifications.mjs";

export const validDay = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= "1970-01-01" && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
export const daySchema = z.string().refine(validDay, "日期无效。");
const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const idSchema = z.coerce.number().int().positive();
const minutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const hhmm = (n) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
export function localClock(now = new Date()) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
}
export function audit(db, actorId, entity, entityId, action, detail = {}) {
  db.prepare("INSERT INTO operation_events (actor_id,entity_type,entity_id,action,detail_json) VALUES (?,?,?,?,?)")
    .run(actorId, entity, String(entityId), action, JSON.stringify(detail));
}
export function pickupOptions(db, marketId, date, { requireSchedule = false, now = new Date() } = {}) {
  const market = db.prepare("SELECT * FROM markets WHERE id=?").get(marketId);
  if (!market) throw new HttpError(404, "市场不存在。");
  const session = db.prepare("SELECT * FROM market_sessions WHERE market_id=? AND date=?").get(marketId, date);
  const today = marketDay(now), time = localClock(now);
  if (!session) return { session: null, slots: !requireSchedule && !market.schedule_required && market.active && market.preorders_enabled && date === today
    ? ["10:00–12:00", "12:00–14:00", "14:00–16:00"].map((label) => ({ label, remaining: null })) : [] };
  const bookable = market.active && market.preorders_enabled && !session.cancelled && session.status === "open" && date >= today && (date > today || time < session.cutoff);
  const slots = [];
  for (let start = minutes(session.starts_at); start < minutes(session.ends_at); start += session.slot_minutes) {
    const end = Math.min(start + session.slot_minutes, minutes(session.ends_at));
    const label = `${hhmm(start)}–${hhmm(end)}`;
    const count = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE market_session_id=? AND pickup_slot=? AND status!='cancelled'").get(session.id, label).n;
    if (bookable && (date > today || time < hhmm(end))) slots.push({ label, remaining: Math.max(0, session.capacity - count) });
  }
  return { session, slots };
}
export function checkPickup(db, marketId, date, slot, options) {
  const available = pickupOptions(db, marketId, date, options);
  const selected = available.slots.find((s) => s.label === slot);
  if (!selected) throw new HttpError(409, "此场次未开放、已截止或自提时段已结束，请重新选择。");
  if (selected.remaining === 0) throw new HttpError(409, "该自提时段已满，请选择其他时段。");
  return available.session?.id ?? null;
}
const sessionSchema = z.object({ marketId: z.number().int().positive(), date: daySchema,
  startsAt: timeSchema, endsAt: timeSchema, cutoff: timeSchema,
  slotMinutes: z.number().int().min(15).max(240), capacity: z.number().int().min(1).max(1000),
}).strict().refine((p) => p.startsAt < p.endsAt && p.cutoff <= p.endsAt, "营业起止时间或接单截止时间无效。");
const receiptSchema = z.object({ pickupCode: z.string().regex(/^\d{6}$/),
  cashCents: z.number().int().min(0), cardCents: z.number().int().min(0), snapCents: z.number().int().min(0), reference: z.string().trim().max(100).default(""),
}).strict();
export function recordPickup(db, actor, id, input) {
  if (!actor || !["admin", "retailer"].includes(actor.role)) throw new HttpError(403, "当前账号无权进行此操作。");
  const p = receiptSchema.parse(input);
  db.exec("BEGIN IMMEDIATE");
  try {
    const order = db.prepare("SELECT * FROM orders WHERE id=?").get(id);
    if (!order) throw new HttpError(404, "订单不存在。");
    if (actor.role === "retailer" && db.prepare("SELECT 1 FROM order_items WHERE order_id=? AND retailer_id!=? LIMIT 1").get(id, actor.id))
      throw new HttpError(403, "当前账号无权进行此操作。");
    if (order.status !== "confirmed") throw new HttpError(409, "仅已确认且未领取订单可以核验。");
    if (order.pickup_code !== p.pickupCode) throw new HttpError(400, "取货码不匹配，请核对顾客订单。");
    if (order.pickup_date > marketDay()) throw new HttpError(409, "尚未到自提日期。");
    if (db.prepare("SELECT 1 FROM order_adjustments WHERE order_id=? AND status='proposed'").get(id)) throw new HttpError(409, "请先等待顾客确认商品与金额调整。");
    if (p.cashCents + p.cardCents + p.snapCents !== (order.final_total_cents ?? order.total_cents)) throw new HttpError(400, "现场收款登记合计必须等于订单金额。");
    if (p.snapCents > 0 && (order.payment_method !== "snap_ebt" || p.snapCents > (order.final_snap_eligible_cents ?? order.snap_eligible_cents) || !p.reference))
      throw new HttpError(400, "SNAP 登记需要付款意向、合资格金额和终端小票参考号。");
    db.prepare("INSERT INTO order_receipts (order_id,cash_cents,card_cents,snap_cents,reference,recorded_by) VALUES (?,?,?,?,?,?)")
      .run(id, p.cashCents, p.cardCents, p.snapCents, p.reference, actor.id);
    db.prepare("UPDATE orders SET status='completed' WHERE id=?").run(id);
    audit(db, actor.id, "order", id, "pickup_recorded", { from: "confirmed", to: "completed", cashCents: p.cashCents, cardCents: p.cardCents, snapCents: p.snapCents });
    notifyOrder(db, id, 'completed', "预购 {id} 已完成。");
    db.exec("COMMIT"); return { ok: true };
  } catch (e) { if (db.isTransaction) db.exec("ROLLBACK"); throw e; }
}
export function createOperationsRouter(db) {
  const router = Router();
  router.get("/operations", (req, res) => {
    const date = daySchema.parse(req.query.date ?? marketDay()), marketId = req.query.marketId ? idSchema.parse(req.query.marketId) : 0;
    const orders = db.prepare(`SELECT o.id,o.market_id,o.status,COALESCE(o.final_total_cents,o.total_cents) AS total_cents,o.total_cents AS original_total_cents,o.pickup_date,o.pickup_slot,o.note,o.payment_method,COALESCE(o.final_snap_eligible_cents,o.snap_eligible_cents) AS snap_eligible_cents,
      u.name AS client_name,m.name AS market_name,v.business_name AS vendor_name,v.id AS vendor_id
      FROM orders o JOIN users u ON u.id=o.client_id JOIN markets m ON m.id=o.market_id
      JOIN order_items i ON i.order_id=o.id JOIN vendor_directory v ON v.id=i.retailer_id
      WHERE o.pickup_date=? AND (?=0 OR o.market_id=?) GROUP BY o.id ORDER BY o.pickup_slot,o.created_at`).all(date, marketId, marketId)
      .map((o) => ({ ...o, items: db.prepare("SELECT product_id,name,unit,quantity,price_cents FROM effective_order_items WHERE order_id=?").all(o.id), adjustment: (() => { const a=db.prepare('SELECT * FROM order_adjustments WHERE order_id=?').get(o.id); return a ? {...a,items:JSON.parse(a.items_json)} : null; })(), receipt: db.prepare("SELECT cash_cents,card_cents,snap_cents,reference,recorded_at FROM order_receipts WHERE order_id=?").get(o.id) ?? null }));
    const sessions = db.prepare(`SELECT s.*,m.name AS market_name,
      (SELECT COUNT(*) FROM orders WHERE market_session_id=s.id AND status!='cancelled') AS orders
      FROM market_sessions s JOIN markets m ON m.id=s.market_id WHERE s.date=? AND (?=0 OR s.market_id=?) ORDER BY starts_at,s.id`).all(date, marketId, marketId);
    const events = db.prepare(`SELECT e.*,u.name AS actor_name FROM operation_events e JOIN users u ON u.id=e.actor_id
      WHERE (e.entity_type='order' AND e.entity_id IN (SELECT id FROM orders WHERE pickup_date=? AND (?=0 OR market_id=?)))
      OR (e.entity_type='session' AND e.entity_id IN (SELECT CAST(id AS TEXT) FROM market_sessions WHERE date=? AND (?=0 OR market_id=?)))
      ORDER BY e.id DESC LIMIT 30`).all(date, marketId, marketId, date, marketId, marketId).map((e) => ({ ...e, detail: JSON.parse(e.detail_json) }));
    res.json({ date, orders, sessions, events, overdue: db.prepare("SELECT COUNT(*) AS n FROM orders WHERE pickup_date<? AND status IN ('pending','confirmed') AND (?=0 OR market_id=?)").get(marketDay(), marketId, marketId).n });
  });
  router.post("/sessions", (req, res) => {
    const p = sessionSchema.parse(req.body);
    if (p.date < marketDay()) throw new HttpError(400, "不能为过去日期新建场次。");
    if (!db.prepare("SELECT id FROM markets WHERE id=?").get(p.marketId)) throw new HttpError(404, "市场不存在。");
    if (db.prepare("SELECT id FROM market_sessions WHERE market_id=? AND date=?").get(p.marketId, p.date)) throw new HttpError(409, "该市场当天已有场次，请使用现有场次。");
    // Do not silently omit orders accepted before a market adopted scheduling.
    if (db.prepare("SELECT id FROM orders WHERE market_id=? AND pickup_date=? AND status IN ('pending','confirmed') LIMIT 1").get(p.marketId, p.date))
      throw new HttpError(409, "当天已有未履约订单，请先处理完毕或选择其他日期建立场次。");
    db.exec("BEGIN IMMEDIATE");
    try {
      const id = Number(db.prepare("INSERT INTO market_sessions (market_id,date,starts_at,ends_at,cutoff,slot_minutes,capacity) VALUES (?,?,?,?,?,?,?)").run(p.marketId, p.date, p.startsAt, p.endsAt, p.cutoff, p.slotMinutes, p.capacity).lastInsertRowid);
      db.prepare("UPDATE markets SET schedule_required=1 WHERE id=?").run(p.marketId);
      audit(db, req.user.id, "session", id, "session_created", p);
      db.exec("COMMIT"); res.status(201).json({ id });
    } catch (e) { if (db.isTransaction) db.exec("ROLLBACK"); throw e; }
  });
  router.patch("/sessions/:id", (req, res) => {
    const id = idSchema.parse(req.params.id), p = z.object({ status: z.enum(["open", "closed"]), version: z.number().int().min(0) }).strict().parse(req.body);
    db.exec("BEGIN IMMEDIATE");
    try {
      const session = db.prepare("SELECT * FROM market_sessions WHERE id=?").get(id);
      if (!session) throw new HttpError(404, "场次不存在。");
      if (session.version !== p.version) throw new HttpError(409, "场次已被其他工作人员更新，请刷新。");
      if (p.status === "open") {
        if (session.cancelled) throw new HttpError(409, "此场次已取消，不能重新开放。");
        if (session.date < marketDay() || (session.date === marketDay() && session.cutoff <= localClock())) throw new HttpError(409, "场次已过接单截止时间。");
        if (!db.prepare("SELECT id FROM markets WHERE id=? AND active=1 AND preorders_enabled=1").get(session.market_id)
          || !db.prepare("SELECT retailer_id FROM market_vendors WHERE market_id=? LIMIT 1").get(session.market_id)) throw new HttpError(409, "请先启用市场、允许预购并分配商户。");
      }
      db.prepare("UPDATE market_sessions SET status=?,version=version+1 WHERE id=?").run(p.status, id);
      audit(db, req.user.id, "session", id, p.status === "open" ? "session_opened" : "session_closed", { from: session.status, to: p.status });
      db.exec("COMMIT"); res.json({ ok: true });
    } catch (e) { if (db.isTransaction) db.exec("ROLLBACK"); throw e; }
  });
  router.patch("/operations/orders/:id", (req, res) => {
    const p = z.object({ status: z.enum(["confirmed", "cancelled"]), reason: z.string().trim().max(300).default("") }).strict().parse(req.body);
    if (p.status === "cancelled" && !p.reason) throw new HttpError(400, "请填写取消原因，便于现场交接和后续追溯。");
    res.json(updateOrderStatus(db, req.user, req.params.id, p.status, { reason: p.reason }));
  });
  router.post("/operations/orders/:id/pickup", (req, res) => res.json(recordPickup(db, req.user, req.params.id, req.body)));
  router.get("/assisted-vendors", (_req, res) => res.json(db.prepare(`SELECT u.id,u.business_name AS name,p.contact_name,p.phone,COALESCE(p.staff_managed,0) AS staff_managed
    FROM vendor_directory u LEFT JOIN vendor_profiles p ON p.retailer_id=u.id WHERE u.role='retailer' ORDER BY u.id`).all()
    .map((vendor) => ({ ...vendor, marketIds: db.prepare("SELECT market_id FROM market_vendors WHERE retailer_id=? ORDER BY market_id").all(vendor.id).map((m) => m.market_id) }))));
  router.post("/assisted-vendors", (req, res) => {
    const p = z.object({ name: z.string().trim().min(1).max(80), contactName: z.string().trim().max(80).default(""), phone: z.string().trim().max(40).default(""), marketId: z.number().int().positive() }).strict().parse(req.body);
    if (!db.prepare("SELECT id FROM markets WHERE id=?").get(p.marketId)) throw new HttpError(404, "市场不存在。");
    db.exec("BEGIN IMMEDIATE");
    try {
      const id = Number(db.prepare("INSERT INTO users (email,name,password_hash,role) VALUES (?,?,?,'retailer')").run(`managed-${randomUUID()}@local.invalid`, p.name, hashPassword(randomBytes(32).toString("hex"))).lastInsertRowid);
      db.prepare("INSERT INTO vendor_profiles (retailer_id,contact_name,phone,staff_managed) VALUES (?,?,?,1)").run(id, p.contactName, p.phone);
      db.prepare("INSERT INTO market_vendors (market_id,retailer_id) VALUES (?,?)").run(p.marketId, id);
      audit(db, req.user.id, "vendor", id, "vendor_assisted_created", { name: p.name, marketId: p.marketId });
      db.exec("COMMIT"); res.status(201).json({ id, name: p.name });
    } catch (e) { if (db.isTransaction) db.exec("ROLLBACK"); throw e; }
  });
  router.get("/operations/products", (req, res) => {
    const scope = req.query.marketId ? idSchema.parse(req.query.marketId) : 0;
    res.json(db.prepare("SELECT p.*,m.name AS market_name FROM products p JOIN markets m ON m.id=p.market_id WHERE (?=0 OR p.market_id=?) ORDER BY available_date DESC,p.id DESC").all(scope, scope));
  });
  router.post("/operations/products", (req, res) => {
    const p = z.object({ marketId: z.number().int().positive(), vendorId: z.number().int().positive(), name: z.string().trim().min(1).max(50), unit: z.enum(["磅", "颗", "把", "个", "袋"]),
      priceCents: z.number().int().min(1).max(100000), stock: z.number().min(0).max(10000), date: daySchema,
      category: z.enum(["叶菜类", "根茎类", "果实类"]), snapEligibility: z.enum(["eligible", "ineligible", "unknown"]).default("unknown"),
    }).strict().parse(req.body);
    if (p.date < marketDay()) throw new HttpError(400, "不能上架过去日期的商品。");
    if (Math.abs(p.stock*1000-Math.round(p.stock*1000))>1e-7 || p.unit!=="磅" && !Number.isInteger(p.stock)) throw new HttpError(400,"库存数量无效；称重商品最多支持三位小数，其他商品需为整数。");
    const vendor = db.prepare("SELECT u.business_name AS name FROM market_vendors mv JOIN vendor_directory u ON u.id=mv.retailer_id WHERE mv.market_id=? AND mv.retailer_id=?").get(p.marketId, p.vendorId);
    if (!vendor) throw new HttpError(409, "请先将商户分配到该市场。");
    db.exec("BEGIN IMMEDIATE");
    try {
      const id = Number(db.prepare(`INSERT INTO products (market_id,retailer_id,name,category,art,unit,price_cents,stock,farm,description,organic,available_date,snap_eligibility)
        VALUES (?,?,?,?,'lettuce',?,?,?,?, '',0,?,?)`).run(p.marketId, p.vendorId, p.name, p.category, p.unit, p.priceCents, p.stock, vendor.name, p.date, p.snapEligibility).lastInsertRowid);
      db.prepare("INSERT INTO price_history VALUES (?,?,?)").run(id, marketDay(), p.priceCents);
      audit(db, req.user.id, "product", id, "product_assisted_created", p);
      db.exec("COMMIT"); res.status(201).json({ id });
    } catch (e) { if (db.isTransaction) db.exec("ROLLBACK"); throw e; }
  });
  router.patch("/operations/products/:id", (req, res) => {
    const id = idSchema.parse(req.params.id), p = z.object({ expectedStock: z.number().min(0), stock: z.number().min(0).max(10000), active: z.boolean() }).strict().parse(req.body);
    db.exec("BEGIN IMMEDIATE");
    try {
      const product=db.prepare("SELECT unit FROM products WHERE id=?").get(id);
      if (!product) throw new HttpError(404,"商品不存在。");
      if (Math.abs(p.stock*1000-Math.round(p.stock*1000))>1e-7 || product.unit!=="磅" && !Number.isInteger(p.stock)) throw new HttpError(400,"库存数量无效；称重商品最多支持三位小数，其他商品需为整数。");
      const result = db.prepare("UPDATE products SET stock=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND stock=?").run(p.stock, Number(p.active), id, p.expectedStock);
      if (!result.changes) throw new HttpError(409, "库存已变化，请刷新后重新核对，避免覆盖刚收到的订单。");
      audit(db, req.user.id, "product", id, "inventory_adjusted", { before: p.expectedStock, stock: p.stock, active: p.active });
      db.exec("COMMIT"); res.json({ ok: true });
    } catch (e) { if (db.isTransaction) db.exec("ROLLBACK"); throw e; }
  });
  return router;
}
