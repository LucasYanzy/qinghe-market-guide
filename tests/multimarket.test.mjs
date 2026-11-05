import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDatabase, marketDay } from "../server/db.mjs";
import { createApp } from "../server/app.mjs";
let db, server, base, transferredProductId;
const cookies = {};
const market = { name: "Second campus", subtitle: "Demo", address: "Campus road", latitude: 40.523, longitude: -74.458,
  hours: "Demo 10:00–16:00 ET", description: "Demo", community: "Busch", coverage_radius_km: 2, active: true, preorders_enabled: true };
const product = { name: "Second campus lettuce", category: "叶菜类", art: "lettuce", unit: "个", price_cents: 400, stock: 20,
  description: "Demo", organic: false, active: true, available_date: marketDay() };
async function request(path, { role = "admin", method = "GET", body } = {}) {
  const response = await fetch(`${base}/api${path}`, { method,
    headers: { "Content-Type": "application/json", ...(cookies[role] ? { Cookie: cookies[role] } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json(), cookie: response.headers.get("set-cookie")?.split(";")[0] };
}
async function fulfill(order) {
  assert.equal((await request(`/orders/${order.id}/status`, { role: "retailer", method: "PATCH", body: { status: "confirmed" } })).status, 200);
  assert.equal((await request(`/orders/${order.id}/pickup`, { role: "retailer", method: "POST", body: {
    pickupCode: order.pickup_code, cashCents: order.total_cents, cardCents: 0, snapCents: 0,
  } })).status, 200);
}
before(async () => {
  db = openDatabase(":memory:"); server = createApp(db).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve)); base = `http://127.0.0.1:${server.address().port}`;
  for (const role of ["admin", "client", "retailer"]) cookies[role] = (await request("/auth/login", { role, method: "POST", body: { email: `${role}@qinghe.demo`, password: "MarketDemo2026!" } })).cookie;
});
after(async () => { await new Promise((resolve) => server.close(resolve)); db.close(); });

test("schools assign vendors to several markets; product creation enforces market membership", async () => {
  const second = await request("/admin/markets", { method: "POST", body: market });
  assert.equal(second.status, 201); assert.equal(second.data.id, 2);
  assert.equal((await request("/retailer/products", { role: "retailer", method: "POST", body: { ...product, market_id: 2 } })).status, 409);
  assert.equal((await request("/admin/markets/2/vendors", { role: "retailer", method: "PUT", body: { vendorIds: [2] } })).status, 403);
  assert.equal((await request("/admin/markets/2/vendors", { method: "PUT", body: { vendorIds: [1] } })).status, 400);
  assert.equal((await request("/admin/markets/2/vendors", { method: "PUT", body: { vendorIds: [2, 2] } })).status, 200);
  assert.equal((await request("/retailer/markets", { role: "retailer" })).data.length, 2);
  const created = await request("/retailer/products", { role: "retailer", method: "POST", body: { ...product, market_id: 2 } });
  assert.equal(created.status, 201); assert.equal(created.data.market_id, 2);
  transferredProductId = created.data.id;
  assert.equal((await request("/retailer/products", { role: "retailer" })).data.find((p) => p.id === created.data.id).market_name, market.name);
  const overview = await request("/admin/overview?marketId=2");
  assert.equal(overview.data.marketId, 2); assert.equal(overview.data.summary.totalMarkets, 1);
  assert.equal(overview.data.summary.totalVendors, 1); assert.equal(overview.data.summary.activeProducts, 1);
  assert.deepEqual(overview.data.vendors[0].marketIds, [1, 2]);
});

test("listing transfers protect outstanding orders and retain the order's original market", async () => {
  const order = await request("/orders", { role: "client", method: "POST", body: { items: [{ productId: transferredProductId, quantity: 2 }], pickupSlot: "10:00–12:00" } });
  assert.equal(order.status, 201);
  const moved = await request(`/retailer/products/${transferredProductId}`, { role: "retailer", method: "PUT", body: { ...product, market_id: 1 } });
  assert.equal(moved.status, 409);
  assert.equal(db.prepare("SELECT market_id FROM products WHERE id=?").get(transferredProductId).market_id, 2);
  await fulfill(order.data);
  assert.equal((await request("/admin/overview?marketId=2")).data.summary.revenueCents, 800);
  assert.equal((await request("/admin/overview?marketId=1")).data.summary.revenueCents, 0);
  assert.equal((await request(`/retailer/products/${transferredProductId}`, { role: "retailer", method: "PUT", body: { ...product, market_id: 1 } })).status, 200);
  const scoped = (await request("/admin/overview?marketId=2")).data;
  assert.equal(scoped.summary.orders, 1); assert.equal(scoped.summary.participants, 1);
  assert.equal(scoped.vendors[0].revenueCents, 800);
  assert.equal(scoped.markets.length, 2);
  assert.equal(scoped.timeline.reduce((n, d) => n + d.orders, 0), 1);
});

test("removing a vendor unlists only that market and keeps existing fulfillment", async () => {
  const created = await request("/retailer/products", { role: "retailer", method: "POST", body: { ...product, market_id: 2 } });
  const order = await request("/orders", { role: "client", method: "POST", body: { items: [{ productId: created.data.id, quantity: 1 }], pickupSlot: "10:00–12:00" } });
  assert.equal(order.status, 201);
  assert.equal((await request("/admin/markets/2/vendors", { method: "PUT", body: { vendorIds: [] } })).status, 200);
  assert.equal(db.prepare("SELECT active FROM products WHERE id=?").get(created.data.id).active, 0);
  assert.equal(db.prepare("SELECT active FROM products WHERE id=1").get().active, 1);
  assert.equal((await request(`/retailer/products/${created.data.id}`, { role: "retailer", method: "PUT", body: { ...product, market_id: 2 } })).status, 403);
  assert.equal((await request("/orders", { role: "client", method: "POST", body: { items: [{ productId: created.data.id, quantity: 1 }], pickupSlot: "10:00–12:00" } })).status, 409);
  await fulfill(order.data);
  assert.equal((await request("/admin/overview?marketId=2")).data.summary.revenueCents, 1200);
  await request("/admin/markets/2/vendors", { method: "PUT", body: { vendorIds: [2] } });
  assert.equal(db.prepare("SELECT active FROM products WHERE id=?").get(created.data.id).active, 0);
});

test("batch market changes and invalid vendor assignments roll back atomically", async () => {
  assert.equal((await request("/admin/markets/status", { method: "PATCH", body: { ids: [1, 9999], preorders_enabled: false } })).status, 404);
  assert.equal(db.prepare("SELECT preorders_enabled FROM markets WHERE id=1").get().preorders_enabled, 1);
  assert.equal((await request("/admin/markets/status", { method: "PATCH", body: { ids: [1, 2], preorders_enabled: false } })).data.updated, 2);
  assert.equal((await request("/products", { role: "client" })).data.length, 0);
  assert.equal((await request("/admin/markets/status", { role: "client", method: "PATCH", body: { ids: [1], active: false } })).status, 403);
  assert.equal((await request("/admin/markets/status", { method: "PATCH", body: { ids: [1] } })).status, 400);
  assert.equal((await request("/admin/markets/2/vendors", { method: "PUT", body: { vendorIds: [9999] } })).status, 400);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM market_vendors WHERE market_id=2").get().n, 1);
  assert.equal((await request("/admin/overview?marketId=9999")).status, 404);
  assert.equal((await request("/admin/overview?marketId=-1")).status, 400);
  await request("/admin/markets/status", { method: "PATCH", body: { ids: [1, 2], preorders_enabled: true } });
});

test("membership migration runs once and does not restore revoked market access", () => {
  const directory = mkdtempSync(join(tmpdir(), "qinghe-memberships-"));
  const path = join(directory, "market.sqlite");
  let connection;
  try {
    connection = openDatabase(path);
    assert.equal(connection.prepare("SELECT COUNT(*) AS n FROM market_vendors").get().n, 1);
    connection.prepare("DELETE FROM market_vendors").run(); connection.close();
    connection = openDatabase(path);
    assert.equal(connection.prepare("SELECT COUNT(*) AS n FROM market_vendors").get().n, 0);
    assert.equal(connection.prepare("SELECT COUNT(*) AS n FROM products").get().n, 38);
    assert.deepEqual(connection.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { connection?.close(); rmSync(directory, { recursive: true, force: true }); }
});
