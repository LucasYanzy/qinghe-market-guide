import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, marketDay } from '../server/db.mjs';
import { shiftDate } from '../server/analytics.mjs';
import { schoolLiveSnapshot } from '../server/screen.mjs';
import { createApp } from '../server/app.mjs';

test('display totals deduplicate customers, separate recorded tender from order values, and include overdue work outside the trend period', () => {
  const db = openDatabase(':memory:'), date = marketDay(), admin = db.prepare("SELECT id FROM users WHERE role='admin'").get().id;
  try {
    db.exec("INSERT INTO markets (id,name,subtitle,address,latitude,longitude,hours,description) VALUES (2,'Second market','','Campus',40.5,-74.4,'Configured sessions','')");
    const add = db.prepare('INSERT INTO orders (id,client_id,market_id,status,total_cents,pickup_date,pickup_slot,note,pickup_code) VALUES (?,1,?,?,?,?,?,\'Private note\',\'765432\')');
    add.run('one', 1, 'completed', 350, date, '10:00–11:00');
    add.run('two', 2, 'completed', 700, date, '10:00–11:00');
    add.run('legacy', 1, 'completed', 1000, date, '10:00–11:00');
    add.run('pending', 1, 'pending', 250, date, '10:00–11:00');
    add.run('cancelled', 2, 'cancelled', 300, date, '10:00–11:00');
    add.run('old', 2, 'confirmed', 500, shiftDate(date, -100), '10:00–11:00');
    add.run('future', 1, 'confirmed', 500, shiftDate(date, 1), '10:00–11:00');
    db.prepare('INSERT INTO order_receipts (order_id,cash_cents,card_cents,snap_cents,recorded_by) VALUES (\'one\',350,0,0,?)').run(admin);
    db.prepare('INSERT INTO order_receipts (order_id,cash_cents,card_cents,snap_cents,recorded_by) VALUES (\'two\',0,100,600,?)').run(admin);
    db.exec('UPDATE products SET active=0; UPDATE products SET active=1,stock=2 WHERE id=1; UPDATE products SET active=1,stock=0 WHERE id=2');
    const all = schoolLiveSnapshot(db);
    assert.equal(all.summary.orders, 5); assert.equal(all.summary.participants, 1); assert.equal(all.summary.completed, 3);
    assert.equal(all.summary.completedCents, 2050); assert.deepEqual({ ...all.summary.receipts }, { count: 2, cashCents: 350, cardCents: 100, snapCents: 600 });
    assert.equal(all.summary.overdue, 1); assert.equal(all.summary.lowStock, 1); assert.equal(all.summary.soldOut, 1);
    assert.equal(all.worklist[0].date, shiftDate(date, -100)); assert.equal(all.worklist[0].marketId, 2);
    assert.equal(all.markets.reduce((sum, m) => sum + m.participants, 0), 2);
    const scoped = schoolLiveSnapshot(db, 1); assert.equal(scoped.summary.orders, 3); assert.equal(scoped.summary.overdue, 0);
    assert.equal(scoped.summary.receipts.snapCents, 0); assert.ok(scoped.markets.every((m) => m.id === 1));
    const serialized = JSON.stringify(all);
    assert.ok(!serialized.includes('Private note')); assert.ok(!serialized.includes('765432')); assert.ok(!serialized.includes('林同学'));
  } finally { db.close(); }
});

test('session status follows New York cutoff and closing time, while draft and paused states remain explicit', () => {
  const db = openDatabase(':memory:');
  try {
    db.exec("INSERT INTO market_sessions (market_id,date,starts_at,ends_at,cutoff,slot_minutes,capacity,status) VALUES (1,'2026-10-30','10:00','16:00','09:00',60,20,'open')");
    assert.equal(schoolLiveSnapshot(db, null, new Date('2026-10-30T08:00:00-04:00')).markets[0].session.booking, 'open');
    assert.equal(schoolLiveSnapshot(db, null, new Date('2026-10-30T09:00:00-04:00')).markets[0].session.booking, 'cutoff');
    assert.equal(schoolLiveSnapshot(db, null, new Date('2026-10-30T16:00:00-04:00')).markets[0].session.booking, 'ended');
    db.exec("UPDATE market_sessions SET status='draft'");
    assert.equal(schoolLiveSnapshot(db, null, new Date('2026-10-30T08:00:00-04:00')).sessions[0].booking, 'draft');
    db.exec('UPDATE markets SET preorders_enabled=0');
    assert.equal(schoolLiveSnapshot(db, null, new Date('2026-10-30T08:00:00-04:00')).sessions[0].booking, 'paused');
    db.exec("UPDATE market_sessions SET cancelled=1,status='closed'");
    assert.equal(schoolLiveSnapshot(db, null, new Date('2026-10-30T17:00:00-04:00')).sessions[0].booking, 'cancelled');
  } finally { db.close(); }
});

test('operating follow-up keeps attendance, zero sales reports, partial invoice receipts and cross-date adjustments independent', () => {
  const db = openDatabase(':memory:'), date = '2026-10-31';
  const now = new Date(`${date}T12:00:00-04:00`), admin = db.prepare("SELECT id FROM users WHERE role='admin'").get().id;
  try {
    for (const id of [2,3,4]) db.prepare("INSERT INTO markets (id,name,subtitle,address,latitude,longitude,hours,description) VALUES (?,?,'','Campus',40.5,-74.4,'Sessions','')").run(id, `Market ${id}`);
    db.exec("INSERT INTO users (id,email,name,password_hash,role) VALUES (4,'four@example.test','Vendor Four','unused','retailer'),(5,'five@example.test','Vendor Five','unused','retailer')");
    const session = db.prepare("INSERT INTO market_sessions (id,market_id,date,starts_at,ends_at,cutoff,slot_minutes,capacity,status,cancelled) VALUES (?,?,?,?,'23:59','08:00',60,20,?,?)");
    session.run(1,1,date,'09:00','open',0); session.run(2,2,date,'13:00','open',0);
    session.run(3,3,date,'09:00','draft',0); session.run(4,4,date,'09:00','closed',1);
    const attend = db.prepare("INSERT INTO session_vendors (session_id,retailer_id,status,note) VALUES (?,?,?,'Private attendance note')");
    attend.run(1,2,'checked_in'); attend.run(1,4,'confirmed'); attend.run(1,5,'absent');
    attend.run(2,2,'checked_in'); attend.run(2,4,'planned'); attend.run(2,5,'checked_in');
    attend.run(3,2,'planned'); attend.run(4,2,'checked_in');
    const report = db.prepare("INSERT INTO vendor_sales_reports (session_id,retailer_id,gross_cents,transactions,note,recorded_by) VALUES (?,2,?,?,'Private sales note',?)");
    report.run(1,0,0,admin); report.run(2,1200,2,admin); report.run(4,500,1,admin);
    const invoice = db.prepare("INSERT INTO vendor_invoices (id,market_id,retailer_id,description,amount_cents,due_on,status,created_by) VALUES (?,?,2,'Private invoice',?,?,?,?)");
    invoice.run(1,1,1000,shiftDate(date,-1),'issued',admin); invoice.run(2,1,500,shiftDate(date,-1),'issued',admin);
    invoice.run(3,1,9999,shiftDate(date,-1),'void',admin); invoice.run(4,2,800,date,'issued',admin);
    invoice.run(5,2,400,shiftDate(date,1),'issued',admin);
    const payment = db.prepare("INSERT INTO invoice_payments (invoice_id,amount_cents,reference,recorded_by) VALUES (?,?,'Private reference',?)");
    payment.run(1,100,admin); payment.run(1,200,admin); payment.run(2,500,admin); payment.run(5,100,admin);
    const order = db.prepare("INSERT INTO orders (id,client_id,market_id,status,total_cents,pickup_date,pickup_slot,note) VALUES (?,1,?,?,500,?,'10:00','Private order note')");
    const adjustment = db.prepare("INSERT INTO order_adjustments VALUES (?,'[]',400,0,'Private reason','proposed',1,?,NULL)");
    for (const [id,market,status,day] of [['old',1,'confirmed',shiftDate(date,-100)],['future',2,'confirmed',shiftDate(date,1)],['pending',2,'pending',date],['complete',1,'completed',date]]) {
      order.run(id,market,status,day); adjustment.run(id,admin);
    }
    const all = schoolLiveSnapshot(db,null,now).followup;
    assert.equal(all.summary.sessions,2); assert.equal(all.summary.expected,5); assert.equal(all.summary.checkedIn,3);
    assert.equal(all.summary.late,1); assert.equal(all.summary.absent,1); assert.equal(all.summary.unconfirmed,1);
    assert.equal(all.summary.attendanceReports,2); assert.equal(all.summary.missingReports,1);
    assert.equal(all.summary.reports,3); assert.equal(all.summary.grossCents,1700); assert.equal(all.summary.transactions,3);
    assert.equal(all.summary.invoiceCount,3); assert.equal(all.summary.unpaidCents,1800);
    assert.equal(all.summary.overdueInvoiceCount,1); assert.equal(all.summary.overdueCents,700);
    assert.equal(all.summary.adjustmentCount,2); assert.deepEqual(all.adjustments.map(a=>a.date),[shiftDate(date,-100),shiftDate(date,1)]);
    const one = schoolLiveSnapshot(db,1,now).followup;
    assert.equal(one.summary.reports,1); assert.equal(one.summary.grossCents,0); assert.equal(one.summary.missingReports,0);
    assert.equal(one.summary.unpaidCents,700); assert.equal(one.summary.adjustmentCount,1); assert.equal(one.markets.length,1);
    const early = schoolLiveSnapshot(db,null,new Date(`${date}T08:00:00-04:00`)).followup;
    assert.equal(early.summary.late,0);
    const serialized = JSON.stringify(all);
    assert.ok(!serialized.includes('Private')); assert.ok(!serialized.includes('@example.test')); assert.ok(!serialized.includes('retailer_id'));
  } finally { db.close(); }
});

test('large display API remains administrator-only and validates its market and period', async () => {
  const db = openDatabase(':memory:'), server = createApp(db).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  try {
    assert.equal((await fetch(base + '/admin/screen')).status, 401);
    for (const [role, expected] of [['client', 403], ['retailer', 403], ['admin', 200]]) {
      const login = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${role}@qinghe.demo`, password: 'MarketDemo2026!' }) });
      const headers = { Cookie: login.headers.get('set-cookie').split(';')[0] };
      const result = await fetch(base + '/admin/screen?range=7', { headers }); assert.equal(result.status, expected);
      if (role === 'admin') {
        const body = await result.json(); assert.equal(body.live.date, marketDay()); assert.equal(body.overview.range, '7');
        assert.ok(!('vendors' in body.overview)); assert.ok(!('operations' in body.overview.analytics));
        assert.ok(!JSON.stringify(body).includes('@qinghe.demo'));
        assert.equal(body.live.summary.orders, 0); assert.equal(body.live.summary.receipts.cashCents, 0);
        assert.equal((await fetch(base + '/admin/screen?range=all', { headers })).status, 400);
        assert.equal((await fetch(base + '/admin/screen?marketId=999', { headers })).status, 404);
      }
    }
  } finally { await new Promise((r) => server.close(r)); db.close(); }
});
