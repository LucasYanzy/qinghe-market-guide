import { marketDay } from './db.mjs';

const easternDate = stamp => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(stamp.replace(' ', 'T') + 'Z'));
const inside = (row, period) => row.date >= period.from && row.date <= period.to;
function summary(rows) {
  const income = rows.filter(r => r.kind === 'income'), expenses = rows.filter(r => r.kind === 'expense');
  const incomeCents = income.reduce((n, r) => n + r.amountCents, 0), expenseCents = expenses.reduce((n, r) => n + r.amountCents, 0);
  return { incomeCents, expenseCents, incomeEntries: income.length, expenseEntries: expenses.length,
    netCents: income.length && expenses.length ? incomeCents - expenseCents : null };
}
export function operatorFinance(db, period, marketId = null) {
  const scope = marketId ?? 0;
  const manual = db.prepare(`SELECT e.id,e.market_id AS marketId,e.recorded_on AS date,e.kind,e.category,e.amount_cents AS amountCents,
    e.description,e.reference,e.version,m.name AS marketName FROM operator_entries e LEFT JOIN markets m ON m.id=e.market_id
    WHERE e.voided_at IS NULL AND e.recorded_on BETWEEN ? AND ? AND (?=0 OR e.market_id=?)`)
    .all(period.previous?.from ?? period.from, period.to, scope, scope).map(e => ({ ...e, source: 'manual' }));
  const fees = db.prepare(`SELECT p.id,i.market_id AS marketId,p.created_at,i.description,p.reference,p.amount_cents AS amountCents,m.name AS marketName
    FROM invoice_payments p JOIN vendor_invoices i ON i.id=p.invoice_id JOIN markets m ON m.id=i.market_id
    WHERE i.status='issued' AND p.created_at>=? AND p.created_at<datetime(?,'+2 days') AND (?=0 OR i.market_id=?)`)
    .all(`${period.previous?.from ?? period.from} 00:00:00`, period.to, scope, scope)
    .map(({created_at,...r}) => ({ ...r, id: `fee-${r.id}`, date: easternDate(created_at), kind: 'income', category: 'vendor_fees', source: 'invoice', version: 0 }));
  const all = [...manual, ...fees], entries = all.filter(r => inside(r, period)).sort((a,b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)));
  const series = rows => {
    const byDate = new Map();
    for (const r of rows) {
      const row = byDate.get(r.date) ?? { date: r.date, incomeCents: null, expenseCents: null };
      const key = r.kind === 'income' ? 'incomeCents' : 'expenseCents';
      row[key] = (row[key] ?? 0) + r.amountCents;
      byDate.set(r.date, row);
    }
    return [...byDate.values()].sort((a,b) => a.date.localeCompare(b.date));
  };
  const previousEntries = period.previous ? all.filter(r => inside(r, period.previous)) : null;
  const categories = [...new Set(entries.map(r => `${r.kind}:${r.category}`))].map(key => {
    const rows = entries.filter(r => `${r.kind}:${r.category}` === key);
    return { kind: rows[0].kind, category: rows[0].category, entries: rows.length, amountCents: rows.reduce((n,r) => n + r.amountCents, 0) };
  }).sort((a,b) => b.amountCents-a.amountCents);
  return { current: summary(entries), previous: previousEntries ? summary(previousEntries) : null,
    series: series(entries), previousSeries: previousEntries ? series(previousEntries) : null, categories, entries, totalEntries: entries.length };
}

export function vendorProfitability(db, period, vendorId) {
  const rows = db.prepare(`SELECT s.id AS sessionId,s.date,m.name AS marketName,r.gross_cents AS salesCents,
    r.goods_cost_cents AS goodsCostCents,r.operating_cost_cents AS operatingCostCents
    FROM vendor_sales_reports r JOIN market_sessions s ON s.id=r.session_id JOIN markets m ON m.id=s.market_id
    JOIN session_vendors v ON v.session_id=r.session_id AND v.retailer_id=r.retailer_id
    WHERE r.retailer_id=? AND v.status='checked_in' AND s.cancelled=0 AND s.date BETWEEN ? AND ? AND s.date<=? ORDER BY s.date,s.id`)
    .all(vendorId, period.from, period.to, marketDay());
  const gross = rows.filter(r => r.goodsCostCents !== null), complete = gross.filter(r => r.operatingCostCents !== null);
  const sum = (list, key) => list.reduce((n,r) => n+r[key], 0);
  return { reports: rows.length, grossCovered: gross.length, completeCovered: complete.length,
    salesCents: rows.length ? sum(rows, 'salesCents') : null,
    grossCoveredSalesCents: gross.length ? sum(gross,'salesCents') : null,
    goodsCostCents: gross.length ? sum(gross,'goodsCostCents') : null,
    grossProfitCents: gross.length ? sum(gross,'salesCents')-sum(gross,'goodsCostCents') : null,
    completeSalesCents: complete.length ? sum(complete,'salesCents') : null,
    operatingSurplusCents: complete.length ? sum(complete,'salesCents')-sum(complete,'goodsCostCents')-sum(complete,'operatingCostCents') : null,
    rows: rows.map(r => ({ ...r, grossProfitCents: r.goodsCostCents === null ? null : r.salesCents-r.goodsCostCents,
      operatingSurplusCents: r.goodsCostCents === null || r.operatingCostCents === null ? null : r.salesCents-r.goodsCostCents-r.operatingCostCents })) };
}
