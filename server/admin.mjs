import { Router } from "express";
import { z } from "zod";
import { marketDay } from "./db.mjs";
import { HttpError } from "./services.mjs";
import { snapMarketSchema, snapVerificationSchema } from "./snap.mjs";
import { reportPeriod, schoolAnalytics, shiftDate } from "./analytics.mjs";
import { createOperationsRouter } from "./operations.mjs";
import { schoolLiveSnapshot } from "./screen.mjs";

const marketSchema = z.object({
  name: z.string().trim().min(1).max(100), subtitle: z.string().trim().max(150),
  address: z.string().trim().min(1).max(250), latitude: z.number().min(-85).max(85),
  longitude: z.number().min(-180).max(180), hours: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000), community: z.string().trim().max(150),
  coverage_radius_km: z.number().min(0.1).max(100), active: z.boolean(), preorders_enabled: z.boolean(),
}).strict();
const positiveId = z.coerce.number().int().positive();

export function schoolOverview(db, range = "30", marketId = null, options = {}) {
  if (marketId && !db.prepare("SELECT id FROM markets WHERE id=?").get(marketId))
    throw new HttpError(404, "市场不存在。");
  const period = reportPeriod(range, options);
  const today = marketDay();
  const { from, to } = period;
  const scope = marketId ?? 0;
  const dates = [from, to];
  const summary = db.prepare(`SELECT COUNT(*) AS orders,
    COUNT(CASE WHEN status='pending' THEN 1 END) AS pending,
    COUNT(CASE WHEN status='confirmed' THEN 1 END) AS confirmed,
    COUNT(CASE WHEN status='completed' THEN 1 END) AS completed,
    COUNT(CASE WHEN status='cancelled' THEN 1 END) AS cancelled,
    COALESCE(SUM(CASE WHEN status='completed' THEN COALESCE(final_total_cents,total_cents) ELSE 0 END),0) AS revenueCents,
    COALESCE(SUM(CASE WHEN status IN ('pending','confirmed') THEN COALESCE(final_total_cents,total_cents) ELSE 0 END),0) AS reservedCents,
    COUNT(DISTINCT CASE WHEN status='completed' THEN client_id END) AS participants,
    COUNT(CASE WHEN payment_method='snap_ebt' AND status!='cancelled' THEN 1 END) AS snapIntentOrders
    FROM orders WHERE pickup_date BETWEEN ? AND ? AND (?=0 OR market_id=?)`).get(...dates, scope, scope);
  const repeat = db.prepare(`SELECT COUNT(*) AS count FROM (
    SELECT client_id FROM orders WHERE status='completed' AND pickup_date BETWEEN ? AND ?
    AND (?=0 OR market_id=?) GROUP BY client_id HAVING COUNT(*)>1)`).get(...dates, scope, scope).count;
  const markets = db.prepare(`SELECT m.*,
    COALESCE(o.orders,0) AS orders, COALESCE(o.completed,0) AS completed,
    COALESCE(o.participants,0) AS participants, COALESCE(o.revenueCents,0) AS revenueCents,
    COALESCE(o.pending,0) AS pending, COALESCE(o.confirmed,0) AS confirmed, COALESCE(o.cancelled,0) AS cancelled,
    (SELECT COUNT(*) FROM market_vendors WHERE market_id=m.id) AS vendors,
    (SELECT COUNT(*) FROM market_vendors WHERE market_id=m.id AND snap_status='accepted') AS snapVendors,
    (SELECT COUNT(*) FROM products WHERE market_id=m.id) AS products,
    (SELECT COUNT(*) FROM products p WHERE p.market_id=m.id AND p.active=1 AND p.stock>0 AND p.available_date=?
      AND m.active=1 AND m.preorders_enabled=1
      AND EXISTS (SELECT 1 FROM market_vendors mv WHERE mv.market_id=p.market_id AND mv.retailer_id=p.retailer_id)) AS activeProducts
    FROM markets m LEFT JOIN (
      SELECT market_id, COUNT(*) AS orders,
      COUNT(CASE WHEN status='completed' THEN 1 END) AS completed,
      COUNT(CASE WHEN status='pending' THEN 1 END) AS pending,
      COUNT(CASE WHEN status='confirmed' THEN 1 END) AS confirmed,
      COUNT(CASE WHEN status='cancelled' THEN 1 END) AS cancelled,
      COUNT(DISTINCT CASE WHEN status='completed' THEN client_id END) AS participants,
      SUM(CASE WHEN status='completed' THEN COALESCE(final_total_cents,total_cents) ELSE 0 END) AS revenueCents
      FROM orders WHERE pickup_date BETWEEN ? AND ? GROUP BY market_id
    ) o ON o.market_id=m.id ORDER BY m.id`).all(today, ...dates);
  const vendors = db.prepare(`SELECT u.id,u.business_name AS name,u.email,
    (SELECT COUNT(*) FROM products WHERE retailer_id=u.id AND (?=0 OR market_id=?)) AS products,
    (SELECT COUNT(*) FROM products p JOIN markets m ON m.id=p.market_id
      JOIN market_vendors mv ON mv.market_id=p.market_id AND mv.retailer_id=p.retailer_id
      WHERE p.retailer_id=u.id AND p.active=1 AND p.stock>0 AND p.available_date=? AND m.active=1
      AND m.preorders_enabled=1 AND (?=0 OR p.market_id=?)) AS activeProducts,
    COALESCE(o.orders,0) AS orders, COALESCE(o.completed,0) AS completed,
    COALESCE(o.participants,0) AS participants, COALESCE(o.revenueCents,0) AS revenueCents
    FROM vendor_directory u LEFT JOIN (
      SELECT i.retailer_id, COUNT(DISTINCT o.id) AS orders,
      COUNT(DISTINCT CASE WHEN o.status='completed' THEN o.id END) AS completed,
      COUNT(DISTINCT CASE WHEN o.status='completed' THEN o.client_id END) AS participants,
      SUM(CASE WHEN o.status='completed' THEN ROUND(i.price_cents*i.quantity) ELSE 0 END) AS revenueCents
      FROM effective_order_items i JOIN orders o ON o.id=i.order_id
      WHERE o.pickup_date BETWEEN ? AND ? AND (?=0 OR o.market_id=?) GROUP BY i.retailer_id
    ) o ON o.retailer_id=u.id WHERE u.role='retailer' ORDER BY revenueCents DESC,u.id`)
    .all(scope, scope, today, scope, scope, ...dates, scope, scope)
    .map((vendor) => {
      const assigned = db.prepare(`SELECT m.id,m.name FROM market_vendors mv JOIN markets m ON m.id=mv.market_id
        WHERE mv.retailer_id=? ORDER BY m.id`).all(vendor.id);
      // Legacy product history remains visible even when a vendor has since left a market.
      const historical = db.prepare("SELECT DISTINCT m.name FROM products p JOIN markets m ON m.id=p.market_id WHERE p.retailer_id=?").all(vendor.id);
      const snapMarkets = db.prepare("SELECT market_id,snap_status,snap_verified_on,snap_note FROM market_vendors WHERE retailer_id=? ORDER BY market_id").all(vendor.id);
      return { ...vendor, snapMarkets, marketIds: assigned.map((m) => m.id), marketNames: (assigned.length ? assigned : historical).map((m) => m.name).join(", ") || null };
    });
  const daily = db.prepare(`SELECT pickup_date AS date, COUNT(*) AS orders,
    COUNT(CASE WHEN status='completed' THEN 1 END) AS completed,
    COUNT(CASE WHEN status='cancelled' THEN 1 END) AS cancelled,
    COUNT(CASE WHEN payment_method='snap_ebt' AND status!='cancelled' THEN 1 END) AS snapOrders,
    SUM(CASE WHEN status='completed' THEN COALESCE(final_total_cents,total_cents) ELSE 0 END) AS revenueCents
    FROM orders WHERE pickup_date BETWEEN ? AND ? AND (?=0 OR market_id=?)
    GROUP BY pickup_date ORDER BY pickup_date`).all(...dates, scope, scope);
  const days = new Map(daily.map((d) => [d.date, d]));
  const timeline = range === "all" ? daily : Array.from({ length: period.days }, (_, i) => {
    const date = shiftDate(from, i);
    return days.get(date) ?? { date, orders: 0, completed: 0, cancelled: 0, snapOrders: 0, revenueCents: 0 };
  });
  const scopedMarkets = markets.filter((m) => !marketId || m.id === marketId);
  return {
    range, marketId, from: range === "all" ? null : from, to, updatedAt: new Date().toISOString(),
    sampleData: !!db.prepare("SELECT 1 FROM app_metadata WHERE key='analytics_sample'").get(),
    analytics: schoolAnalytics(db, period, marketId), timezone: "America/New_York",
    summary: { ...summary, repeatParticipants: repeat,
      activeMarkets: scopedMarkets.filter((m) => m.active).length, totalMarkets: scopedMarkets.length,
      totalVendors: vendors.filter((v) => !marketId || v.marketIds.includes(marketId)).length,
      activeProducts: scopedMarkets.reduce((n, m) => n + m.activeProducts, 0),
    }, markets, vendors, timeline,
  };
}

export function createAdminRouter(db) {
  const router = Router();
  router.use(createOperationsRouter(db));
  router.get("/screen", (req, res) => {
    const range = z.enum(["7", "30", "90"]).parse(req.query.range ?? "30");
    const marketId = req.query.marketId === undefined ? null : positiveId.parse(req.query.marketId);
    db.exec("BEGIN");
    try {
      const overview = schoolOverview(db, range, marketId);
      const result = { overview, live: schoolLiveSnapshot(db, marketId) };
      db.exec("COMMIT"); res.json(result);
    } catch (error) { if (db.isTransaction) db.exec("ROLLBACK"); throw error; }
  });
  router.get("/overview", (req, res) => {
    const range = z.enum(["7", "30", "90", "all", "custom"]).parse(req.query.range ?? "30");
    const marketId = req.query.marketId === undefined ? null : positiveId.parse(req.query.marketId);
    res.json(schoolOverview(db, range, marketId, { from: req.query.from, to: req.query.to }));
  });
  router.get("/markets", (_req, res) => res.json(db.prepare("SELECT * FROM markets ORDER BY id").all()));
  router.patch("/markets/status", (req, res) => {
    const input = z.object({ ids: z.array(z.number().int().positive()).min(1).max(100),
      active: z.boolean().optional(), preorders_enabled: z.boolean().optional(),
    }).strict().refine((v) => v.active !== undefined || v.preorders_enabled !== undefined).parse(req.body);
    const ids = [...new Set(input.ids)];
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const id of ids) {
        if (!db.prepare("SELECT id FROM markets WHERE id=?").get(id)) throw new HttpError(404, "市场不存在。");
        if (input.active !== undefined) db.prepare("UPDATE markets SET active=? WHERE id=?").run(Number(input.active), id);
        if (input.preorders_enabled !== undefined) db.prepare("UPDATE markets SET preorders_enabled=? WHERE id=?").run(Number(input.preorders_enabled), id);
      }
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
    res.json({ updated: ids.length });
  });
  router.put("/markets/:id/vendors", (req, res) => {
    const id = positiveId.parse(req.params.id);
    const { vendorIds } = z.object({ vendorIds: z.array(z.number().int().positive()).max(500) }).strict().parse(req.body);
    if (!db.prepare("SELECT id FROM markets WHERE id=?").get(id)) throw new HttpError(404, "市场不存在。");
    const ids = [...new Set(vendorIds)];
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const vendorId of ids)
        if (!db.prepare("SELECT id FROM users WHERE id=? AND role='retailer'").get(vendorId))
          throw new HttpError(400, "只能分配已有商户账号。");
      const previous = db.prepare("SELECT retailer_id FROM market_vendors WHERE market_id=?").all(id);
      for (const vendor of previous) if (!ids.includes(vendor.retailer_id)) {
        db.prepare("UPDATE products SET active=0,updated_at=CURRENT_TIMESTAMP WHERE market_id=? AND retailer_id=?").run(id, vendor.retailer_id);
      }
      for (const vendor of previous) if (!ids.includes(vendor.retailer_id))
        db.prepare("DELETE FROM market_vendors WHERE market_id=? AND retailer_id=?").run(id, vendor.retailer_id);
      const insert = db.prepare("INSERT OR IGNORE INTO market_vendors (market_id,retailer_id) VALUES (?,?)");
      for (const vendorId of ids) insert.run(id, vendorId);
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
    res.json({ marketId: id, vendorIds: ids });
  });
  router.put("/markets/:id/snap", (req, res) => {
    const id = positiveId.parse(req.params.id), p = snapMarketSchema.parse(req.body);
    const result = db.prepare("UPDATE markets SET snap_status=?,snap_model=?,snap_verified_on=?,snap_note=? WHERE id=?")
      .run(p.snap_status, p.snap_model, p.snap_verified_on, p.snap_note, id);
    if (!result.changes) throw new HttpError(404, "市场不存在。");
    res.json(db.prepare("SELECT * FROM markets WHERE id=?").get(id));
  });
  router.put("/markets/:id/vendors/:vendorId/snap", (req, res) => {
    const id = positiveId.parse(req.params.id), vendorId = positiveId.parse(req.params.vendorId), p = snapVerificationSchema.parse(req.body);
    const result = db.prepare("UPDATE market_vendors SET snap_status=?,snap_verified_on=?,snap_note=? WHERE market_id=? AND retailer_id=?")
      .run(p.snap_status, p.snap_verified_on, p.snap_note, id, vendorId);
    if (!result.changes) throw new HttpError(404, "该商户尚未入驻此市场。");
    res.json({ marketId: id, vendorId, ...p });
  });
  const writeMarket = (req, res, create) => {
    const p = marketSchema.parse(req.body);
    const values = [p.name, p.subtitle, p.address, p.latitude, p.longitude, p.hours,
      p.description, p.community, p.coverage_radius_km, Number(p.active), Number(p.preorders_enabled)];
    let id;
    if (create) {
      id = Number(db.prepare(`INSERT INTO markets
        (name,subtitle,address,latitude,longitude,hours,description,community,coverage_radius_km,active,preorders_enabled)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(...values).lastInsertRowid);
    } else {
      id = positiveId.parse(req.params.id);
      const result = db.prepare(`UPDATE markets SET name=?,subtitle=?,address=?,latitude=?,longitude=?,hours=?,
        description=?,community=?,coverage_radius_km=?,active=?,preorders_enabled=? WHERE id=?`).run(...values, id);
      if (!result.changes) throw new HttpError(404, "市场不存在。");
    }
    res.status(create ? 201 : 200).json(db.prepare("SELECT * FROM markets WHERE id=?").get(id));
  };
  router.post("/markets", (req, res) => writeMarket(req, res, true));
  router.put("/markets/:id", (req, res) => writeMarket(req, res, false));
  return router;
}
