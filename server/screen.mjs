import { marketDay } from "./db.mjs";
import { localClock } from "./operations.mjs";
import { shiftDate } from "./analytics.mjs";

// Aggregate operational records only; no customer identities are sent to the display.
export function schoolLiveSnapshot(db, marketId = null, now = new Date()) {
  const date = marketDay(now), time = localClock(now), scope = marketId ?? 0;
  const orderStats = db.prepare(`SELECT COUNT(*) AS orders,
    COUNT(CASE WHEN status='pending' THEN 1 END) AS pending,
    COUNT(CASE WHEN status='confirmed' THEN 1 END) AS confirmed,
    COUNT(CASE WHEN status='completed' THEN 1 END) AS completed,
    COUNT(CASE WHEN status='cancelled' THEN 1 END) AS cancelled,
    COUNT(DISTINCT CASE WHEN status='completed' THEN client_id END) AS participants,
    COUNT(CASE WHEN payment_method='snap_ebt' AND status!='cancelled' THEN 1 END) AS snapIntentOrders,
    COALESCE(SUM(CASE WHEN status='completed' THEN COALESCE(final_total_cents,total_cents) ELSE 0 END),0) AS completedCents
    FROM orders WHERE pickup_date=? AND (?=0 OR market_id=?)`);
  const receipts = db.prepare(`SELECT COUNT(*) AS count,COALESCE(SUM(r.cash_cents),0) AS cashCents,
    COALESCE(SUM(r.card_cents),0) AS cardCents,COALESCE(SUM(r.snap_cents),0) AS snapCents
    FROM order_receipts r JOIN orders o ON o.id=r.order_id
    WHERE o.pickup_date=? AND o.status='completed' AND (?=0 OR o.market_id=?)`);
  const inventory = db.prepare(`SELECT COUNT(*) AS listed,
    COUNT(CASE WHEN p.stock>0 THEN 1 END) AS available,
    COUNT(CASE WHEN p.stock BETWEEN 1 AND 5 THEN 1 END) AS lowStock,
    COUNT(CASE WHEN p.stock=0 THEN 1 END) AS soldOut
    FROM products p JOIN market_vendors v ON v.market_id=p.market_id AND v.retailer_id=p.retailer_id
    WHERE p.available_date=? AND p.active=1 AND (?=0 OR p.market_id=?)`);
  const summary = { ...orderStats.get(date, scope, scope), ...inventory.get(date, scope, scope), receipts: receipts.get(date, scope, scope),
    overdue: db.prepare("SELECT COUNT(*) AS n FROM orders WHERE pickup_date<? AND status IN ('pending','confirmed') AND (?=0 OR market_id=?)").get(date, scope, scope).n };
  const sessions = db.prepare(`SELECT s.*,m.name AS marketName,m.active,m.preorders_enabled,
    (SELECT COUNT(*) FROM orders o WHERE o.market_session_id=s.id AND o.status!='cancelled') AS orders
    FROM market_sessions s JOIN markets m ON m.id=s.market_id
    WHERE s.date BETWEEN ? AND ? AND (?=0 OR s.market_id=?) ORDER BY s.date,s.starts_at,s.market_id`).all(date, shiftDate(date, 6), scope, scope)
    .map((s) => ({ ...s, booking: !s.active ? "inactive" : !s.preorders_enabled ? "paused" : s.date === date && time >= s.ends_at ? "ended"
      : s.status !== "open" ? s.status : s.date === date && time >= s.cutoff ? "cutoff" : "open" }));
  const markets = db.prepare("SELECT id,name,active,preorders_enabled FROM markets WHERE (?=0 OR id=?) ORDER BY id").all(scope, scope)
    .map((m) => ({ ...m, ...orderStats.get(date, m.id, m.id), ...inventory.get(date, m.id, m.id), receipts: receipts.get(date, m.id, m.id),
      vendors: db.prepare("SELECT COUNT(*) AS n FROM market_vendors WHERE market_id=?").get(m.id).n,
      overdue: db.prepare("SELECT COUNT(*) AS n FROM orders WHERE market_id=? AND pickup_date<? AND status IN ('pending','confirmed')").get(m.id, date).n,
      session: sessions.find((s) => s.market_id === m.id && s.date === date) ?? null,
    }));
  const worklist = db.prepare(`SELECT o.market_id AS marketId,m.name AS marketName,o.pickup_date AS date,
    COUNT(*) AS count,COUNT(CASE WHEN o.status='pending' THEN 1 END) AS pending
    FROM orders o JOIN markets m ON m.id=o.market_id
    WHERE o.status IN ('pending','confirmed') AND o.pickup_date<=? AND (?=0 OR o.market_id=?)
    GROUP BY o.market_id,o.pickup_date ORDER BY o.pickup_date,o.market_id`).all(date, scope, scope);
  return { date, timezone: "America/New_York", generatedAt: now.toISOString(), summary, markets, sessions, worklist };
}
