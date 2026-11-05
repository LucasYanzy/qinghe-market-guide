import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase, marketDay } from "../server/db.mjs";
import { schoolOverview } from "../server/admin.mjs";
import { productPerformance, reportPeriod, shiftDate } from "../server/analytics.mjs";
import { businessAnalytics } from "../server/business-analytics.mjs";
import { tenderChannels, emptyTenders } from '../server/tenders.mjs';
import { aggregateTimeline, changePercent, csvText } from "../src/schoolReports.ts";

function fixture() {
  const db = openDatabase(":memory:");
  db.exec(`INSERT INTO users (id,email,name,password_hash,role) VALUES (10,'analytics-c@test.local','Test customer','unused','client'),(11,'analytics-v@test.local','Test vendor','unused','retailer');
    INSERT INTO markets (id,name,subtitle,address,latitude,longitude,hours,description) VALUES (2,'Second','','Address',40,-74,'Demo','');
    INSERT INTO market_vendors (market_id,retailer_id) VALUES (2,11);`);
  const today = marketDay(), from = shiftDate(today, -6), previous = shiftDate(from, -1);
  const add = (id, client, market, status, cents, date, method = "pay_at_pickup", eligible = 0, other = 0) => {
    db.prepare(`INSERT INTO orders (id,client_id,market_id,status,total_cents,pickup_date,pickup_slot,payment_method,snap_eligible_cents,other_payment_cents)
      VALUES (?,?,?,?,?,?,'10:00–12:00',?,?,?)`).run(id, client, market, status, cents, date, method, eligible, other);
  };
  add("PREVIOUS", 1, 1, "completed", 1000, previous);
  add("COMPLETED-A", 1, 1, "completed", 1000, from, "snap_ebt", 700, 300);
  add("COMPLETED-B", 1, 2, "completed", 500, from);
  add("COMPLETED-C", 10, 1, "completed", 900, today);
  add("CANCELLED", 10, 1, "cancelled", 8000, today, "snap_ebt", 8000, 0);
  add("PENDING", 10, 1, "pending", 400, from, "snap_ebt", 400, 0);
  add("CONFIRMED", 10, 1, "confirmed", 600, today);
  db.prepare("INSERT INTO order_items VALUES ('COMPLETED-A',1,'Original tomato','磅',350,2,2),('COMPLETED-A',2,'Original broccoli','颗',300,1,2),('COMPLETED-B',1,'At second market','磅',500,1,11),('COMPLETED-C',1,'Original tomato','磅',450,2,2)").run();
  return { db, today, from, previous };
}

test("custom report dates use inclusive days and an adjacent equal-length comparison across DST and leap days", () => {
  const period = reportPeriod("custom", { from: "2024-02-28", to: "2024-03-02", today: "2026-10-29" });
  assert.equal(period.days, 4); assert.deepEqual(period.previous, { from: "2024-02-24", to: "2024-02-27" });
  assert.equal(reportPeriod("custom", { from: "2026-10-30", to: "2026-11-03", today: "2026-11-04" }).days, 5);
  for (const dates of [{ from: "2026-02-30", to: "2026-03-01" }, { from: "2026-10-29", to: "2026-10-28" }, { from: "2026-10-28", to: "2026-10-30" }, { from: "2024-01-01", to: "2026-10-29" }])
    assert.throws(() => reportPeriod("custom", { ...dates, today: "2026-10-29" }), (error) => error.status === 400);
  assert.throws(() => reportPeriod("custom", { from: ["2026-10-28"], to: "2026-10-29" }), (error) => error.status === 400);
  assert.equal(reportPeriod("all").previous, null);
});

test("analytics deduplicate order totals, preserve product snapshots, and compare scoped periods", () => {
  const { db, from, today } = fixture();
  try {
    db.prepare("UPDATE products SET name='Changed now',price_cents=9999,market_id=2 WHERE id=1").run();
    const data = schoolOverview(db, "custom", null, { from, to: today });
    const a = data.analytics;
    assert.equal(a.current.orders, 6); assert.equal(a.current.completed, 3); assert.equal(a.current.revenueCents, 2400);
    assert.equal(a.current.averageOrderCents, 800); assert.equal(a.current.reservedCents, 1000);
    assert.equal(a.current.completionRate, 50); assert.ok(Math.abs(a.current.cancellationRate - 100 / 6) < 1e-10);
    assert.equal(a.previous.revenueCents, 1000); assert.equal(a.previous.orders, 1);
    assert.equal(a.sellingVendors, 2); assert.equal(a.soldProducts, 2);
    assert.equal(a.products.reduce((n, p) => n + p.revenueCents, 0), 2400);
    assert.equal(a.products.find((p) => p.name === "Original tomato").quantity, 4);
    assert.equal(a.products.find((p) => p.name === "Original tomato").marketId, 1);
    const tomato = a.products.find((p) => p.name === "Original tomato");
    assert.equal(tomato.minPriceCents, 350); assert.equal(tomato.maxPriceCents, 450);
    assert.equal(tomato.sellingDays, 2); assert.equal(tomato.lastSoldOn, today);
    assert.equal(a.previousProducts.length, 0);
    assert.equal(data.timeline.length, 7); assert.equal(data.timeline.reduce((n, d) => n + d.revenueCents, 0), 2400);
    assert.equal(data.timeline.reduce((n, d) => n + d.cancelled, 0), 1);
    assert.equal(data.markets.find((m) => m.id === 1).cancelled, 1);
    const scoped = schoolOverview(db, "custom", 2, { from, to: today });
    assert.equal(scoped.analytics.current.revenueCents, 500); assert.equal(scoped.analytics.previous.revenueCents, 0);
    assert.equal(scoped.analytics.current.participants, 1); assert.equal(scoped.markets.length, 2);
  } finally { db.close(); }
});

test("business coverage keeps vendor receipts, reported sales and operator fees separate with Eastern recording dates", () => {
  const { db, from, today, previous } = fixture();
  try {
    const addSession = (market, date, cancelled = 0) => Number(db.prepare(`INSERT INTO market_sessions
      (market_id,date,starts_at,ends_at,cutoff,slot_minutes,capacity,cancelled) VALUES (?,?,'09:00','13:00','08:00',30,10,?)`).run(market, date, cancelled).lastInsertRowid);
    const current = addSession(1, from), cancelled = addSession(1, today, 1), outside = addSession(2, today), future = addSession(1, shiftDate(today, 1));
    for (const [session, vendor, status] of [[current,2,'checked_in'],[current,11,'confirmed'],[cancelled,2,'checked_in'],[outside,11,'checked_in'],[future,2,'planned']])
      db.prepare("INSERT INTO session_vendors(session_id,retailer_id,status) VALUES (?,?,?)").run(session,vendor,status);
    for (const [session, vendor, gross] of [[current,2,9000],[cancelled,2,99999],[outside,11,3000]])
      db.prepare("INSERT INTO vendor_sales_reports(session_id,retailer_id,gross_cents,transactions,note,recorded_by) VALUES (?,?,?,4,'test',2)").run(session,vendor,gross);
    db.prepare("INSERT INTO order_receipts(order_id,cash_cents,card_cents,snap_cents,recorded_by) VALUES ('COMPLETED-A',100,200,700,2),('COMPLETED-B',500,0,0,2),('CANCELLED',8000,0,0,2)").run();
    const invoice = (market, due, amount, status = 'issued') => Number(db.prepare("INSERT INTO vendor_invoices(market_id,retailer_id,description,amount_cents,due_on,status,created_by) VALUES (?,2,'test',?,?,?,2)").run(market,amount,due,status).lastInsertRowid);
    const due = invoice(1,from,5000), old = invoice(1,previous,4000), other = invoice(2,from,2000), voided = invoice(1,from,8000,'void');
    const pay = (id, cents, stamp) => db.prepare("INSERT INTO invoice_payments(invoice_id,amount_cents,reference,recorded_by,created_at) VALUES (?,?,'test',2,?)").run(id,cents,stamp);
    pay(due,1000,`${from} 12:00:00`); pay(due,500,`${from} 02:00:00`);
    pay(old,700,`${today} 12:00:00`); pay(other,1000,`${today} 12:00:00`); pay(voided,8000,`${today} 12:00:00`);
    const scoped = businessAnalytics(db, { from, to: today }, 1);
    assert.deepEqual({ ...scoped.receipts }, { orders:1,cashCents:100,cardCents:200,snapCents:700 });
    assert.deepEqual({ ...scoped.attendance }, { assignments:2,checkedIn:1,absent:0,unconfirmed:1,sessions:1 });
    assert.deepEqual({ ...scoped.reports }, { reports:1,grossCents:9000,transactions:4 });
    assert.deepEqual(scoped.fees, { invoices:1,billedCents:5000,paidCents:1500,outstandingCents:3500,overdueCents:3500,periodReceiptsCents:1700 });
    assert.equal(businessAnalytics(db, { from, to: today }, 2).reports.grossCents, 3000);
    assert.equal(businessAnalytics(db, { from, to: today }).receipts.orders, 2);
    assert.equal(scoped.tenderMix.reports, 0);
    assert.equal(scoped.tenderMix.unclassifiedCents, 9000);
    assert.deepEqual(scoped.tenderMix.channels, emptyTenders());
    const channels = Object.fromEntries(tenderChannels.map((c, i) => [c.key, (i + 1) * 250]));
    db.prepare('UPDATE vendor_sales_reports SET tenders_json=? WHERE session_id=?').run(JSON.stringify(channels), current);
    const mixed = businessAnalytics(db, { from, to: today });
    assert.deepEqual(mixed.tenderMix, { reports: 1, classifiedCents: 9000, unclassifiedCents: 3000, channels });
    assert.equal(mixed.reports.grossCents, 12000); // Categories are a breakdown, not additional sales.
    assert.equal(businessAnalytics(db, { from, to: today }, 2).tenderMix.reports, 0);
    const empty = businessAnalytics(db, { from:'2000-01-01',to:'2000-01-02' });
    assert.equal(empty.attendance.assignments,0); assert.equal(empty.fees.periodReceiptsCents,0);
  } finally { db.close(); }
});

test("first-time and returning customers use scoped completed history and do not count cancelled or pending orders", () => {
  const { db, from, today } = fixture();
  try {
    const all = schoolOverview(db, "custom", null, { from, to: today }).analytics.customers;
    assert.deepEqual({ ...all }, { participants: 2, newParticipants: 1, returningParticipants: 1, once: 1, twoToThree: 1, fourPlus: 0 });
    const second = schoolOverview(db, "custom", 2, { from, to: today }).analytics.customers;
    assert.equal(second.newParticipants, 1); assert.equal(second.returningParticipants, 0);
    const first = schoolOverview(db, "custom", 1, { from, to: today }).analytics.customers;
    assert.equal(first.once, 2); assert.equal(first.twoToThree, 0);
  } finally { db.close(); }
});

test("product demand deduplicates buyers and same-session split orders, excludes zero fulfillment and isolates vendors", () => {
  const { db, from, today } = fixture();
  try {
    const period = reportPeriod("custom", { from, to: today });
    let tomato = productPerformance(db, period, 1, 2).find((p) => p.name === "Original tomato");
    assert.equal(tomato.buyers, 2); assert.equal(tomato.orders, 2); assert.equal(tomato.repeatBuyers, 0);
    const add = (id, date) => {
      db.prepare("INSERT INTO orders (id,client_id,market_id,status,total_cents,pickup_date,pickup_slot) VALUES (?,1,1,'completed',350,?,'10:00–12:00')").run(id, date);
      db.prepare("INSERT INTO order_items VALUES (?,1,'Original tomato','磅',350,1,2)").run(id);
    };
    add("SPLIT-ORDER", from);
    const session = db.prepare("INSERT INTO market_sessions (market_id,date,starts_at,ends_at,cutoff,slot_minutes,capacity) VALUES (1,?,'09:00','13:00','08:00',30,10)").run(from).lastInsertRowid;
    db.prepare("UPDATE orders SET market_session_id=? WHERE id='SPLIT-ORDER'").run(session);
    tomato = productPerformance(db, period, 1, 2).find((p) => p.name === "Original tomato");
    assert.equal(tomato.buyers, 2); assert.equal(tomato.orders, 3); assert.equal(tomato.repeatBuyers, 0);
    add("REPEAT-OCCASION", today);
    tomato = productPerformance(db, period, 1, 2).find((p) => p.name === "Original tomato");
    assert.equal(tomato.buyers, 2); assert.equal(tomato.repeatBuyers, 1);
    db.prepare("INSERT INTO fulfillment_items VALUES ('COMPLETED-A',2,0)").run();
    assert.equal(productPerformance(db, period, 1, 2).some((p) => p.name === "Original broccoli"), false);
    const other = productPerformance(db, period, null, 11);
    assert.equal(other.length, 1); assert.equal(other[0].vendorId, 11); assert.equal(other[0].buyers, 1);
  } finally { db.close(); }
});

test("SNAP reports non-cancelled intentions and saved eligible estimates independently of completion", () => {
  const { db, from, today } = fixture();
  try {
    const a = schoolOverview(db, "custom", null, { from, to: today }).analytics;
    const snap = a.payments.find((p) => p.method === "snap_ebt");
    assert.equal(snap.orders, 2); assert.equal(snap.completed, 1); assert.equal(snap.totalCents, 1400);
    assert.equal(snap.eligibleCents, 1100); assert.equal(snap.otherCents, 300); assert.equal(snap.customers, 2);
    assert.equal(a.slots.reduce((n, p) => n + p.orders, 0), 5);
    assert.equal(a.heatmap.reduce((n, p) => n + p.orders, 0), 5);
    assert.equal(a.operations.overdue, 1); assert.equal(a.operations.outstanding.length, 2);
  } finally { db.close(); }
});

test("inventory remains a current snapshot under historical filters and excludes paused or unassigned markets", () => {
  const { db, from, today } = fixture();
  try {
    db.exec("UPDATE products SET stock=CASE WHEN id=1 THEN 0 WHEN id=2 THEN 3 ELSE 20 END");
    const live = schoolOverview(db, "custom", null, { from, to: shiftDate(today, -1) }).analytics.inventory;
    assert.equal(live.listed, 8); assert.equal(live.available, 7); assert.equal(live.lowStock, 1); assert.equal(live.soldOut, 1);
    assert.equal(live.categories.reduce((n, c) => n + c.products, 0), 8);
    db.exec("UPDATE markets SET preorders_enabled=0 WHERE id=1");
    assert.equal(schoolOverview(db).analytics.inventory.listed, 0);
    db.exec("UPDATE markets SET preorders_enabled=1 WHERE id=1; DELETE FROM market_vendors WHERE market_id=1");
    assert.equal(schoolOverview(db).analytics.inventory.listed, 0);
  } finally { db.close(); }
});

test("empty periods expose undefined ratios and no fabricated growth; all-time comparison stays unavailable", () => {
  const db = openDatabase(":memory:");
  try {
    const result = schoolOverview(db);
    assert.equal(result.analytics.current.completionRate, null); assert.equal(result.analytics.current.averageOrderCents, null);
    assert.equal(result.sampleData, false); assert.equal(schoolOverview(db, "all").analytics.previous, null);
    assert.equal(changePercent(10, 0), null); assert.equal(changePercent(10, undefined), null); assert.equal(changePercent(0, 10), -100);
  } finally { db.close(); }
});

test("weekly/monthly chart aggregation preserves all totals at calendar boundaries", () => {
  const series = ["2026-10-31", "2026-11-01", "2026-11-02"].map((date) => ({ date, orders: 2, completed: 1, cancelled: 1, snapOrders: 1, revenueCents: 350 }));
  const weekly = aggregateTimeline(series, "week");
  assert.deepEqual(weekly.map((d) => d.date), ["2026-10-26", "2026-11-02"]);
  assert.equal(weekly[0].orders, 4); assert.equal(weekly.reduce((n, d) => n + d.revenueCents, 0), 1050);
  const monthly = aggregateTimeline(series, "month");
  assert.deepEqual(monthly.map((d) => d.date), ["2026-10-01", "2026-11-01"]);
  assert.equal(monthly[1].completed, 2);
});

test("CSV escapes formula-like user names, quotes, and newlines without altering numeric values", () => {
  const csv = csvText([["=SUM(A1)", " +cmd", "@formula", 'quote"name', "line\nbreak", -3, 2.5]]);
  assert.ok(csv.startsWith("\uFEFF")); assert.ok(csv.includes('"\'=SUM(A1)"')); assert.ok(csv.includes('"\' +cmd"'));
  assert.ok(csv.includes('"\'@formula"')); assert.ok(csv.includes('"quote""name"')); assert.ok(csv.includes('"line\nbreak"'));
  assert.ok(csv.includes('"-3","2.5"'));
});

test("custom analytics API validates query dates and retains administrator-only access", async () => {
  const { createApp } = await import("../server/app.mjs");
  const db = openDatabase(":memory:"), server = createApp(db).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  try {
    const response = await fetch(`${base}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@qinghe.demo", password: "MarketDemo2026!" }) });
    const cookie = response.headers.get("set-cookie").split(";")[0], headers = { Cookie: cookie };
    assert.equal((await fetch(`${base}/admin/overview?range=custom&from=2026-02-30&to=2026-03-01`, { headers })).status, 400);
    assert.equal((await fetch(`${base}/admin/overview?range=custom&from=1970-01-01&to=${marketDay()}`, { headers })).status, 400);
    assert.equal((await fetch(`${base}/admin/overview?range=custom&from=${marketDay()}&to=${marketDay()}`)).status, 401);
    const valid = await fetch(`${base}/admin/overview?range=custom&from=${marketDay()}&to=${marketDay()}`, { headers });
    assert.equal(valid.status, 200); assert.equal((await valid.json()).timeline.length, 1);
    assert.equal((await fetch(`${base}/retailer/analytics`, { headers })).status, 403);
    assert.equal((await fetch(`${base}/retailer/analytics`)).status, 401);
    const vendorLogin = await fetch(`${base}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "retailer@qinghe.demo", password: "MarketDemo2026!" }) });
    const vendorHeaders = { Cookie: vendorLogin.headers.get("set-cookie").split(";")[0] };
    assert.equal((await fetch(`${base}/retailer/analytics?range=custom`, { headers: vendorHeaders })).status, 400);
    assert.equal((await fetch(`${base}/retailer/analytics?range=7`, { headers: vendorHeaders })).status, 200);
  } finally { await new Promise((resolve) => server.close(resolve)); db.close(); }
});
