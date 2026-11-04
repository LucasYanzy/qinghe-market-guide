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
    .map((s) => ({ ...s, booking: s.cancelled ? "cancelled" : !s.active ? "inactive" : !s.preorders_enabled ? "paused" : s.date === date && time >= s.ends_at ? "ended"
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
  return { date, timezone: "America/New_York", generatedAt: now.toISOString(), summary, markets, sessions, worklist,
    followup: operatingFollowup(db, scope, date, time) };
}

function operatingFollowup(db, scope, date, time) {
  // Each source is aggregated before combining it. Joining invoices, payments,
  // attendance and orders directly would multiply receipts and sales totals.
  const attendance = db.prepare(`SELECT s.market_id AS marketId,COUNT(DISTINCT s.id) AS sessions,
    COUNT(CASE WHEN v.status IN ('planned','confirmed','checked_in') THEN 1 END) AS expected,
    COUNT(CASE WHEN v.status='checked_in' THEN 1 END) AS checkedIn,
    COUNT(CASE WHEN v.status='planned' THEN 1 END) AS unconfirmed,
    COUNT(CASE WHEN v.status='confirmed' THEN 1 END) AS confirmed,
    COUNT(CASE WHEN v.status='absent' THEN 1 END) AS absent,
    COUNT(CASE WHEN v.status IN ('planned','confirmed') AND s.starts_at<=? THEN 1 END) AS late,
    COUNT(CASE WHEN v.status='checked_in' AND r.session_id IS NULL THEN 1 END) AS missingReports,
    COUNT(CASE WHEN v.status='checked_in' AND r.session_id IS NOT NULL THEN 1 END) AS attendanceReports
    FROM market_sessions s LEFT JOIN session_vendors v ON v.session_id=s.id
    LEFT JOIN vendor_sales_reports r ON r.session_id=v.session_id AND r.retailer_id=v.retailer_id
    WHERE s.date=? AND s.cancelled=0 AND s.status!='draft' AND (?=0 OR s.market_id=?)
    GROUP BY s.market_id`).all(time, date, scope, scope);
  // A later cancellation or attendance edit does not erase a submitted sales report.
  const sales = db.prepare(`SELECT s.market_id AS marketId,COUNT(*) AS reports,
    SUM(r.gross_cents) AS grossCents,SUM(r.transactions) AS transactions
    FROM vendor_sales_reports r JOIN market_sessions s ON s.id=r.session_id
    WHERE s.date=? AND (?=0 OR s.market_id=?) GROUP BY s.market_id`).all(date, scope, scope);
  const invoices = db.prepare(`WITH balances AS (
    SELECT i.id,i.market_id,i.due_on,MAX(0,i.amount_cents-COALESCE(SUM(p.amount_cents),0)) AS balance
    FROM vendor_invoices i LEFT JOIN invoice_payments p ON p.invoice_id=i.id
    WHERE i.status='issued' AND (?=0 OR i.market_id=?) GROUP BY i.id
  ) SELECT market_id AS marketId,COUNT(CASE WHEN balance>0 THEN 1 END) AS invoiceCount,
    SUM(balance) AS unpaidCents,COUNT(CASE WHEN balance>0 AND due_on<? THEN 1 END) AS overdueInvoiceCount,
    SUM(CASE WHEN due_on<? THEN balance ELSE 0 END) AS overdueCents
    FROM balances GROUP BY market_id`).all(scope, scope, date, date);
  const adjustments = db.prepare(`SELECT o.market_id AS marketId,m.name AS marketName,o.pickup_date AS date,COUNT(*) AS count
    FROM order_adjustments a JOIN orders o ON o.id=a.order_id JOIN markets m ON m.id=o.market_id
    WHERE a.status='proposed' AND o.status='confirmed' AND (?=0 OR o.market_id=?)
    GROUP BY o.market_id,o.pickup_date ORDER BY o.pickup_date,o.market_id`).all(scope, scope);
  const empty = { sessions: 0, expected: 0, checkedIn: 0, unconfirmed: 0, confirmed: 0, absent: 0, late: 0,
    missingReports: 0, attendanceReports: 0, reports: 0, grossCents: 0, transactions: 0,
    invoiceCount: 0, unpaidCents: 0, overdueInvoiceCount: 0, overdueCents: 0, adjustmentCount: 0 };
  const byMarket = (rows) => new Map(rows.map(({ marketId, ...values }) => [marketId, values]));
  const attendanceMap = byMarket(attendance), salesMap = byMarket(sales), invoiceMap = byMarket(invoices);
  const markets = db.prepare('SELECT id,name FROM markets WHERE (?=0 OR id=?) ORDER BY id').all(scope, scope).map(m => ({
    ...m, ...empty, ...attendanceMap.get(m.id), ...salesMap.get(m.id), ...invoiceMap.get(m.id),
    adjustmentCount: adjustments.filter(a => a.marketId === m.id).reduce((sum, a) => sum + a.count, 0),
  }));
  const summary = { ...empty };
  for (const m of markets) for (const key of Object.keys(empty)) summary[key] += m[key];
  return { summary, markets, adjustments };
}
