import { marketDay } from "./db.mjs";
import { HttpError } from "./services.mjs";

const DAY = 86400000;
export const shiftDate = (date, offset) => new Date(Date.parse(`${date}T12:00:00Z`) + offset * DAY).toISOString().slice(0, 10);
export function reportPeriod(range = "30", { from, to, today = marketDay() } = {}) {
  if (!["7", "30", "90", "all", "custom"].includes(range)) throw new HttpError(400, "统计周期无效。");
  if (range === "all") return { from: "0000-01-01", to: today, previous: null, days: null };
  if (range !== "custom") { to = today; from = shiftDate(today, 1 - Number(range)); }
  const valid = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && value >= "1970-01-01" && !Number.isNaN(Date.parse(`${value}T12:00:00Z`))
    && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
  if (!valid(from) || !valid(to) || from > to || to > today) throw new HttpError(400, "请选择有效的起止日期，结束日期不能晚于今天。");
  const days = Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY) + 1;
  if (days > 366) throw new HttpError(400, "自定义统计最多支持 366 天。");
  return { from, to, days, previous: { from: shiftDate(from, -days), to: shiftDate(from, -1) } };
}

function periodSummary(db, from, to, scope) {
  const s = db.prepare(`SELECT COUNT(*) AS orders,
    COUNT(CASE WHEN status='completed' THEN 1 END) AS completed,
    COUNT(CASE WHEN status='cancelled' THEN 1 END) AS cancelled,
    COUNT(DISTINCT CASE WHEN status='completed' THEN client_id END) AS participants,
    COALESCE(SUM(CASE WHEN status='completed' THEN COALESCE(final_total_cents,total_cents) ELSE 0 END),0) AS revenueCents,
    COALESCE(SUM(CASE WHEN status IN ('pending','confirmed') THEN COALESCE(final_total_cents,total_cents) ELSE 0 END),0) AS reservedCents
    FROM orders WHERE pickup_date BETWEEN ? AND ? AND (?=0 OR market_id=?)`).get(from, to, scope, scope);
  return { ...s, averageOrderCents: s.completed ? Math.round(s.revenueCents / s.completed) : null,
    completionRate: s.orders ? s.completed / s.orders * 100 : null, cancellationRate: s.orders ? s.cancelled / s.orders * 100 : null };
}

export function schoolAnalytics(db, period, marketId = null) {
  const scope = marketId ?? 0, params = [period.from, period.to, scope, scope];
  const current = periodSummary(db, period.from, period.to, scope);
  const previous = period.previous ? { ...period.previous, ...periodSummary(db, period.previous.from, period.previous.to, scope) } : null;
  const customers = db.prepare(`WITH cohort AS (
      SELECT client_id,COUNT(*) AS orders FROM orders WHERE status='completed' AND pickup_date BETWEEN ? AND ?
      AND (?=0 OR market_id=?) GROUP BY client_id
    ), first_visit AS (
      SELECT client_id,MIN(pickup_date) AS firstDate FROM orders WHERE status='completed' AND (?=0 OR market_id=?) GROUP BY client_id
    ) SELECT COUNT(*) AS participants,
      COUNT(CASE WHEN f.firstDate>=? THEN 1 END) AS newParticipants,
      COUNT(CASE WHEN f.firstDate<? THEN 1 END) AS returningParticipants,
      COUNT(CASE WHEN c.orders=1 THEN 1 END) AS once,
      COUNT(CASE WHEN c.orders BETWEEN 2 AND 3 THEN 1 END) AS twoToThree,
      COUNT(CASE WHEN c.orders>=4 THEN 1 END) AS fourPlus
    FROM cohort c JOIN first_visit f ON f.client_id=c.client_id`).get(...params, scope, scope, period.from, period.from);
  const inventory = db.prepare(`SELECT p.id,p.name,p.unit,p.stock,p.category,p.snap_eligibility,p.market_id AS marketId,
      m.name AS marketName,u.business_name AS vendorName
    FROM products p JOIN markets m ON m.id=p.market_id JOIN vendor_directory u ON u.id=p.retailer_id
    JOIN market_vendors mv ON mv.market_id=p.market_id AND mv.retailer_id=p.retailer_id
    WHERE p.available_date=? AND p.active=1 AND m.active=1 AND m.preorders_enabled=1 AND (?=0 OR p.market_id=?)
    ORDER BY p.stock,p.id`).all(marketDay(), scope, scope);
  const inventorySummary = { listed: inventory.length, available: inventory.filter((p) => p.stock > 0).length,
    lowStock: inventory.filter((p) => p.stock > 0 && p.stock <= 5).length, soldOut: inventory.filter((p) => p.stock === 0).length,
    snapUnknown: inventory.filter((p) => p.snap_eligibility === "unknown").length,
    categories: [...new Set(inventory.map((p) => p.category))].map((name) => ({ name, products: inventory.filter((p) => p.category === name).length })),
    alerts: inventory.filter((p) => p.stock <= 5).slice(0, 20),
  };
  const products = db.prepare(`SELECT i.product_id AS productId,i.name,i.unit,o.market_id AS marketId,m.name AS marketName,
      i.retailer_id AS vendorId,u.business_name AS vendorName, SUM(i.quantity) AS quantity,
      SUM(ROUND(i.price_cents*i.quantity)) AS revenueCents,COUNT(DISTINCT o.id) AS orders
    FROM effective_order_items i JOIN orders o ON o.id=i.order_id JOIN markets m ON m.id=o.market_id JOIN vendor_directory u ON u.id=i.retailer_id
    WHERE i.quantity>0 AND o.status='completed' AND o.pickup_date BETWEEN ? AND ? AND (?=0 OR o.market_id=?)
    GROUP BY i.product_id,i.name,i.unit,o.market_id,i.retailer_id ORDER BY revenueCents DESC,i.product_id,i.name`).all(...params);
  const vendorActivity = db.prepare(`SELECT COUNT(DISTINCT i.retailer_id) AS sellingVendors,COUNT(DISTINCT i.product_id) AS soldProducts
    FROM effective_order_items i JOIN orders o ON o.id=i.order_id
    WHERE i.quantity>0 AND o.status='completed' AND o.pickup_date BETWEEN ? AND ? AND (?=0 OR o.market_id=?)`).get(...params);
  const slots = db.prepare(`SELECT pickup_slot AS slot,COUNT(*) AS orders,
      COUNT(CASE WHEN status='completed' THEN 1 END) AS completed,
      COALESCE(SUM(CASE WHEN status='completed' THEN COALESCE(final_total_cents,total_cents) ELSE 0 END),0) AS revenueCents
    FROM orders WHERE status!='cancelled' AND pickup_date BETWEEN ? AND ? AND (?=0 OR market_id=?) GROUP BY pickup_slot ORDER BY pickup_slot`).all(...params);
  const heatmap = db.prepare(`SELECT CAST(strftime('%w',pickup_date) AS INTEGER) AS weekday,pickup_slot AS slot,COUNT(*) AS orders
    FROM orders WHERE status!='cancelled' AND pickup_date BETWEEN ? AND ? AND (?=0 OR market_id=?) GROUP BY weekday,pickup_slot`).all(...params);
  const payments = db.prepare(`SELECT payment_method AS method,COUNT(*) AS orders,
      COALESCE(SUM(COALESCE(final_total_cents,total_cents)),0) AS totalCents,
      COALESCE(SUM(CASE WHEN payment_method='snap_ebt' THEN COALESCE(final_snap_eligible_cents,snap_eligible_cents) ELSE 0 END),0) AS eligibleCents,
      COALESCE(SUM(CASE WHEN payment_method='snap_ebt' THEN (COALESCE(final_total_cents,total_cents)-COALESCE(final_snap_eligible_cents,snap_eligible_cents)) ELSE 0 END),0) AS otherCents,
      COUNT(CASE WHEN status='completed' THEN 1 END) AS completed,
      COUNT(DISTINCT client_id) AS customers
    FROM orders WHERE status!='cancelled' AND pickup_date BETWEEN ? AND ? AND (?=0 OR market_id=?) GROUP BY payment_method`).all(...params);
  const outstanding = db.prepare(`SELECT o.id,o.status,o.pickup_date AS date,o.pickup_slot AS slot,COALESCE(o.final_total_cents,o.total_cents) AS totalCents,
      m.name AS marketName FROM orders o JOIN markets m ON m.id=o.market_id
    WHERE o.status IN ('pending','confirmed') AND o.pickup_date BETWEEN ? AND ? AND (?=0 OR o.market_id=?) ORDER BY o.pickup_date,o.id LIMIT 20`).all(...params);
  const overdue = db.prepare(`SELECT COUNT(*) AS count FROM orders WHERE status IN ('pending','confirmed')
    AND pickup_date BETWEEN ? AND ? AND (?=0 OR market_id=?) AND pickup_date<?`).get(...params, marketDay()).count;
  return { current, previous, customers, inventory: inventorySummary, products, ...vendorActivity, slots, heatmap, payments,
    operations: { overdue, outstanding },
  };
}
