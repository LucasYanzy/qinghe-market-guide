import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, marketDay } from '../server/db.mjs';
import { createApp } from '../server/app.mjs';
import { pickupOptions, checkPickup, recordPickup } from '../server/operations.mjs';
import { placeOrder, updateOrderStatus } from '../server/services.mjs';
import { shiftDate } from '../server/analytics.mjs';

function sessionFixture() {
  const db = openDatabase(':memory:'), date = marketDay();
  db.prepare("INSERT INTO market_sessions (market_id,date,starts_at,ends_at,cutoff,slot_minutes,capacity,status) VALUES (1,?,'00:00','23:59','23:59',60,1,'open')").run(date);
  db.exec('UPDATE markets SET schedule_required=1 WHERE id=1');
  return { db, date, user: { id: 1, role: 'client' }, admin: db.prepare("SELECT * FROM users WHERE role='admin'").get() };
}
const input = { items: [{ productId: 1, quantity: 1 }], pickupSlot: '22:00–23:00', note: '' };

test('scheduled orders reserve capacity atomically, release it once on cancellation, and enforce cutoff and market scope', () => {
  const { db, date, user, admin } = sessionFixture();
  try {
    const first = placeOrder(db, user, input);
    assert.match(first.pickup_code, /^\d{6}$/); assert.ok(first.market_session_id);
    assert.throws(() => placeOrder(db, user, input), (e) => e.status === 409);
    assert.throws(() => checkPickup(db, 1, date, '22:00–23:00', { now: new Date(`${date}T23:59:00-04:00`) }), (e) => e.status === 409);
    const count = db.prepare('SELECT stock FROM products WHERE id=1').get().stock;
    updateOrderStatus(db, admin, first.id, 'cancelled', { reason: 'Vendor unavailable' });
    assert.equal(db.prepare('SELECT stock FROM products WHERE id=1').get().stock, count + 1);
    assert.throws(() => updateOrderStatus(db, admin, first.id, 'cancelled', { reason: 'again' }), (e) => e.status === 409);
    const second = placeOrder(db, user, input); assert.equal(second.status, 'pending');
    db.exec("UPDATE market_sessions SET status='closed'");
    assert.throws(() => checkPickup(db, 1, date, '21:00–22:00'), (e) => e.status === 409);
    assert.equal(pickupOptions(db, 1, shiftDate(date, 1)).slots.length, 0);
  } finally { db.close(); }
});

test('staff-assisted pickup requires a customer code, exact tender totals, and a SNAP receipt; duplicate completion is rejected', () => {
  const { db, user, admin } = sessionFixture();
  try {
    const order = placeOrder(db, user, input);
    updateOrderStatus(db, admin, order.id, 'confirmed');
    assert.throws(() => updateOrderStatus(db, { id: 2, role: 'retailer' }, order.id, 'completed'), (e) => e.status === 409);
    const payment = { pickupCode: order.pickup_code, cashCents: order.total_cents, cardCents: 0, snapCents: 0, reference: '' };
    assert.throws(() => recordPickup(db, user, order.id, payment), (e) => e.status === 403);
    assert.throws(() => recordPickup(db, { id: 999, role: 'retailer' }, order.id, payment), (e) => e.status === 403);
    assert.throws(() => recordPickup(db, admin, order.id, { ...payment, pickupCode: '000000' }), (e) => e.status === 400);
    assert.throws(() => recordPickup(db, admin, order.id, { ...payment, cashCents: 1 }), (e) => e.status === 400);
    assert.throws(() => recordPickup(db, admin, order.id, { ...payment, cashCents: 0, snapCents: order.total_cents }), (e) => e.status === 400);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM order_receipts').get().n, 0);
    recordPickup(db, admin, order.id, payment);
    assert.equal(db.prepare('SELECT status FROM orders WHERE id=?').get(order.id).status, 'completed');
    assert.equal(db.prepare('SELECT recorded_by FROM order_receipts WHERE order_id=?').get(order.id).recorded_by, admin.id);
    assert.throws(() => recordPickup(db, admin, order.id, payment), (e) => e.status === 409);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM operation_events WHERE entity_id=? AND action='pickup_recorded'").get(order.id).n, 1);
  } finally { db.close(); }
});

test('school can onboard a vendor without a login, list stock on their behalf, and cannot overwrite stock changed by an order', async () => {
  const db = openDatabase(':memory:'), server = createApp(db).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (path, cookie, method = 'GET', body) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    const login = await request('/auth/login', '', 'POST', { email: 'admin@qinghe.demo', password: 'MarketDemo2026!' }); const cookie = login.headers.get('set-cookie').split(';')[0];
    assert.equal((await request('/admin/operations', '')).status, 401);
    const v = await request('/admin/assisted-vendors', cookie, 'POST', { name: 'Assisted farm', marketId: 1 }); assert.equal(v.status, 201); const vendor = await v.json();
    assert.equal(db.prepare('SELECT staff_managed FROM vendor_profiles WHERE retailer_id=?').get(vendor.id).staff_managed, 1);
    const directory = await (await request('/admin/assisted-vendors', cookie)).json();
    assert.deepEqual(directory.find((v) => v.id === vendor.id).marketIds, [1]);
    const product = await request('/admin/operations/products', cookie, 'POST', { marketId: 1, vendorId: vendor.id, name: 'Staff listed greens', date: marketDay(), unit: '把', category: '叶菜类', priceCents: 400, stock: 10 });
    assert.equal(product.status, 201); const { id } = await product.json();
    const o = placeOrder(db, { id: 1, role: 'client' }, { ...input, pickupSlot: '10:00–12:00', items: [{ productId: id, quantity: 2 }] });
    assert.equal((await request(`/admin/operations/products/${id}`, cookie, 'PATCH', { expectedStock: 10, stock: 20, active: true })).status, 409);
    assert.equal(db.prepare('SELECT stock FROM products WHERE id=?').get(id).stock, 8);
    const list = await (await request(`/admin/operations?date=${marketDay()}&marketId=1`, cookie)).json();
    assert.equal(list.orders[0].id, o.id); assert.equal('pickup_code' in list.orders[0], false);
    assert.equal((await request(`/admin/operations/orders/${o.id}`, cookie, 'PATCH', { status: 'cancelled' })).status, 400);
    assert.equal((await request(`/admin/operations/orders/${o.id}`, cookie, 'PATCH', { status: 'cancelled', reason: 'Customer requested' })).status, 200);
  } finally { await new Promise((r) => server.close(r)); db.close(); }
});

test('future dates use the product date and only published sessions; the public API accepts configured non-demo slot lengths', async () => {
  const db = openDatabase(':memory:'), date = shiftDate(marketDay(), 1);
  const server = createApp(db).listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  try {
    db.prepare("UPDATE products SET available_date=? WHERE id=1").run(date);
    db.prepare("INSERT INTO market_sessions (market_id,date,starts_at,ends_at,cutoff,slot_minutes,capacity,status) VALUES (1,?,'09:00','10:00','08:00',30,10,'draft')").run(date);
    assert.throws(() => placeOrder(db, { id: 1, role: 'client' }, { ...input, pickupSlot: '09:00–09:30' }), (e) => e.status === 409);
    db.exec("UPDATE market_sessions SET status='open'");
    const login = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'client@qinghe.demo', password: 'MarketDemo2026!' }) });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const response = await fetch(base + '/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ ...input, pickupSlot: '09:00–09:30' }) });
    assert.equal(response.status, 201); assert.equal((await response.json()).pickup_date, date);
    assert.equal((await (await fetch(base + `/products?date=${date}`)).json()).length, 1);
    assert.equal(pickupOptions(db, 1, date, { requireSchedule: true }).slots.length, 2);
  } finally { await new Promise((r) => server.close(r)); db.close(); }
});
