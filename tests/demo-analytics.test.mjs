import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, marketDay } from '../server/db.mjs';
import { addDemoAnalytics, demoAnalyticsStatus } from '../server/demo-analytics.mjs';
import { schoolOverview } from '../server/admin.mjs';
import { placeOrder } from '../server/services.mjs';
import { tenderTotal } from '../server/tenders.mjs';

test('opt-in history preserves interactive changes and reconciles orders, items, receipts and reports', () => {
  const db = openDatabase(':memory:');
  try {
    assert.equal(demoAnalyticsStatus(db), null);
    const order = placeOrder(db, { id: 1, role: 'client' }, { items: [{ productId: 1, quantity: 2 }], pickupSlot: '10:00–12:00', note: 'Keep my order' });
    db.prepare('UPDATE products SET stock=3,price_cents=479 WHERE id=3').run();
    const products = db.prepare('SELECT * FROM products ORDER BY id').all();
    const markets = db.prepare('SELECT * FROM markets ORDER BY id').all();
    const original = db.prepare('SELECT * FROM orders WHERE id=?').get(order.id);
    const status = addDemoAnalytics(db, marketDay());
    assert.equal(status.sessions, 24);
    assert.ok(status.orders > 100 && status.orders < 300);
    assert.deepEqual(db.prepare('SELECT * FROM products ORDER BY id').all(), products);
    assert.deepEqual(db.prepare('SELECT * FROM markets ORDER BY id').all(), markets);
    assert.deepEqual(db.prepare('SELECT * FROM orders WHERE id=?').get(order.id), original);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM orders WHERE id LIKE 'CHART-SAMPLE-%' AND pickup_date>=?").get(marketDay()).n, 0);
    for (const sample of db.prepare("SELECT * FROM orders WHERE id LIKE 'CHART-SAMPLE-%'").all()) {
      const items = db.prepare('SELECT SUM(quantity*price_cents) total FROM order_items WHERE order_id=?').get(sample.id);
      assert.equal(items.total, sample.total_cents);
      assert.equal(sample.snap_eligible_cents + sample.other_payment_cents, sample.total_cents);
      const receipt = db.prepare('SELECT * FROM order_receipts WHERE order_id=?').get(sample.id);
      if (sample.status === 'completed') assert.equal(receipt.cash_cents + receipt.card_cents + receipt.snap_cents, sample.total_cents);
      else assert.equal(receipt, undefined);
    }
    for (const row of db.prepare('SELECT * FROM vendor_sales_reports WHERE tenders_json IS NOT NULL').all())
      assert.equal(tenderTotal(JSON.parse(row.tenders_json)), row.gross_cents);
    const overview = schoolOverview(db);
    assert.equal(overview.sampleData, true);
    assert.equal(overview.analytics.current.orders, overview.summary.orders);
    assert.equal(overview.analytics.products.reduce((sum, p) => sum + p.revenueCents, 0), overview.summary.revenueCents);
    assert.ok(overview.analytics.previous.completed > 0);
    assert.ok(overview.analytics.customers.newParticipants > 0);
    assert.ok(overview.analytics.customers.returningParticipants > 0);
    assert.ok(overview.analytics.products.some(p => p.repeatBuyers > 0));
    assert.ok(overview.analytics.business.tenderMix.unclassifiedCents > 0);
    const changes = db.prepare('SELECT total_changes() n').get().n;
    assert.deepEqual(addDemoAnalytics(db, marketDay()), status);
    assert.deepEqual(demoAnalyticsStatus(db), status);
    assert.equal(db.prepare('SELECT total_changes() n').get().n, changes);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { db.close(); }
});

test('sample loading skips existing sessions and rolls back a failed generation', () => {
  const db = openDatabase(':memory:');
  try {
    const date = new Date(Date.parse(`${marketDay()}T12:00:00Z`) - 2 * 86400000).toISOString().slice(0, 10);
    db.prepare(`INSERT INTO market_sessions (market_id,date,starts_at,ends_at,cutoff,slot_minutes,capacity,status,notice)
      VALUES (1,?,'09:00','12:00','08:00',60,7,'draft','Keep my session')`).run(date);
    const before = db.prepare('SELECT * FROM market_sessions').all();
    const failAfterOneOrder = { prepare(sql) {
      if (sql.startsWith('INSERT INTO order_items')) throw new Error('Simulated storage failure');
      return db.prepare(sql);
    }, exec(sql) { db.exec(sql); } };
    assert.throws(() => addDemoAnalytics(failAfterOneOrder, marketDay()), /Simulated storage failure/);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM users WHERE email LIKE 'chart-sample-%'").get().n, 0);
    assert.equal(demoAnalyticsStatus(db), null);
    assert.deepEqual(db.prepare('SELECT * FROM market_sessions').all(), before);
    assert.equal(addDemoAnalytics(db, marketDay()).sessions, 23);
    assert.deepEqual(db.prepare('SELECT * FROM market_sessions WHERE date=?').all(date), before);
  } finally { db.close(); }
});

test('server startup never loads analytics samples, including production databases', () => {
  for (const demo of [false, true]) {
    const db = openDatabase(':memory:', { demo });
    try {
      assert.equal(demoAnalyticsStatus(db), null);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n, 0);
      if (!demo) assert.throws(() => addDemoAnalytics(db, marketDay()), /Demo catalogue unavailable/);
    } finally { db.close(); }
  }
});
