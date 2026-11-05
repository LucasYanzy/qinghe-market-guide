import { marketDay } from "./db.mjs";
import { emptyTenders, tenderChannels } from './tenders.mjs';

// Sales, operator fees and self-reported totals have different owners and coverage.
export function businessAnalytics(db, period, marketId = null) {
  const scope = marketId ?? 0, params = [period.from, period.to, scope, scope];
  const receipts = db.prepare(`SELECT COUNT(*) AS orders,
    COALESCE(SUM(r.cash_cents),0) AS cashCents,COALESCE(SUM(r.card_cents),0) AS cardCents,
    COALESCE(SUM(r.snap_cents),0) AS snapCents
    FROM order_receipts r JOIN orders o ON o.id=r.order_id
    WHERE o.status='completed' AND o.pickup_date BETWEEN ? AND ? AND (?=0 OR o.market_id=?)`).get(...params);
  const attendance = db.prepare(`SELECT COUNT(*) AS assignments,
    COUNT(CASE WHEN v.status='checked_in' THEN 1 END) AS checkedIn,
    COUNT(CASE WHEN v.status='absent' THEN 1 END) AS absent,
    COUNT(CASE WHEN v.status IN ('planned','confirmed') THEN 1 END) AS unconfirmed,
    COUNT(DISTINCT s.id) AS sessions
    FROM session_vendors v JOIN market_sessions s ON s.id=v.session_id
    WHERE s.cancelled=0 AND s.date BETWEEN ? AND ? AND (?=0 OR s.market_id=?) AND s.date<=?`).get(...params, marketDay());
  const reportRows = db.prepare(`SELECT r.gross_cents,r.transactions,r.tenders_json
    FROM vendor_sales_reports r JOIN market_sessions s ON s.id=r.session_id
    JOIN session_vendors v ON v.session_id=r.session_id AND v.retailer_id=r.retailer_id
    WHERE v.status='checked_in' AND s.cancelled=0 AND s.date BETWEEN ? AND ? AND (?=0 OR s.market_id=?) AND s.date<=?`).all(...params, marketDay());
  const reports = { reports: reportRows.length, grossCents: 0, transactions: 0 };
  const tenderMix = { reports: 0, classifiedCents: 0, unclassifiedCents: 0, channels: emptyTenders() };
  for (const r of reportRows) {
    reports.grossCents += r.gross_cents; reports.transactions += r.transactions;
    if (!r.tenders_json) { tenderMix.unclassifiedCents += r.gross_cents; continue; }
    const values = JSON.parse(r.tenders_json);
    tenderMix.reports++; tenderMix.classifiedCents += r.gross_cents;
    for (const c of tenderChannels) tenderMix.channels[c.key] += values[c.key];
  }
  const invoices = db.prepare(`SELECT amount_cents AS amountCents,due_on AS dueOn,
    COALESCE((SELECT SUM(p.amount_cents) FROM invoice_payments p WHERE p.invoice_id=i.id),0) AS paidCents
    FROM vendor_invoices i WHERE status='issued' AND due_on BETWEEN ? AND ? AND (?=0 OR market_id=?)`).all(...params);
  const fees = { invoices: invoices.length, billedCents: 0, paidCents: 0, outstandingCents: 0, overdueCents: 0, periodReceiptsCents: 0 };
  for (const i of invoices) {
    fees.billedCents += i.amountCents; fees.paidCents += i.paidCents;
    fees.outstandingCents += i.amountCents - i.paidCents;
    if (i.dueOn < marketDay()) fees.overdueCents += i.amountCents - i.paidCents;
  }
  const payments = db.prepare(`SELECT p.amount_cents AS cents,p.created_at AS recordedAt
    FROM invoice_payments p JOIN vendor_invoices i ON i.id=p.invoice_id
    WHERE i.status='issued' AND (?=0 OR i.market_id=?)`).all(scope, scope);
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
  for (const p of payments) {
    const date = day.format(new Date(p.recordedAt.replace(' ', 'T') + 'Z'));
    if (date >= period.from && date <= period.to) fees.periodReceiptsCents += p.cents;
  }
  return { receipts, attendance, reports, fees, tenderMix };
}
