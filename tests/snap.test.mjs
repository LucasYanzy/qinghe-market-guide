import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase, marketDay } from "../server/db.mjs";
import { createApp } from "../server/app.mjs";

let db, server, base;
const cookies = {};
const marketPolicy = { snap_status: "accepted", snap_model: "market_tokens", snap_verified_on: marketDay(), snap_note: "Test only: visit the demo service desk." };
const vendorPolicy = { snap_status: "accepted", snap_verified_on: marketDay(), snap_note: "Test only: participating stall confirmed." };
const items = [{ productId: 1, quantity: 2 }, { productId: 2, quantity: 1 }, { productId: 3, quantity: 1 }];
const orderInput = { items, pickupSlot: "10:00–12:00", paymentMethod: "snap_ebt" };
async function request(path, { role = "admin", method = "GET", body } = {}) {
  const response = await fetch(`${base}/api${path}`, { method,
    headers: { "Content-Type": "application/json", ...(cookies[role] ? { Cookie: cookies[role] } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json(), cookie: response.headers.get("set-cookie")?.split(";")[0] };
}
async function accept() {
  assert.equal((await request("/admin/markets/1/snap", { method: "PUT", body: marketPolicy })).status, 200);
  assert.equal((await request("/admin/markets/1/vendors/2/snap", { method: "PUT", body: vendorPolicy })).status, 200);
}
function classify() {
  db.exec("UPDATE products SET snap_eligibility='eligible' WHERE id=1; UPDATE products SET snap_eligibility='ineligible' WHERE id=2");
}
beforeEach(async () => {
  for (const role of Object.keys(cookies)) delete cookies[role];
  db = openDatabase(":memory:"); server = createApp(db).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve)); base = `http://127.0.0.1:${server.address().port}`;
  for (const role of ["admin", "client", "retailer"]) cookies[role] = (await request("/auth/login", { role, method: "POST", body: { email: `${role}@qinghe.demo`, password: "MarketDemo2026!" } })).cookie;
});
afterEach(async () => { await new Promise((resolve) => server.close(resolve)); db.close(); });

test("SNAP defaults to unconfirmed and requires both a verified market and participating vendor", async () => {
  classify();
  const quote = () => request("/checkout/quote", { role: "public", method: "POST", body: { items } });
  assert.equal((await request("/markets")).data[0].snap_status, "unconfirmed");
  const initial = (await quote()).data;
  assert.equal(initial.snapAvailable, false);
  assert.equal(initial.snapUnavailableReason, "market_unconfirmed");
  assert.equal(initial.marketConfirmed, false); assert.equal(initial.vendorConfirmed, false);
  await request("/admin/markets/1/snap", { method: "PUT", body: marketPolicy });
  const marketOnly = (await quote()).data;
  assert.equal(marketOnly.snapAvailable, false);
  assert.equal(marketOnly.snapUnavailableReason, "vendor_unconfirmed");
  assert.equal(marketOnly.marketConfirmed, true); assert.equal(marketOnly.vendorConfirmed, false);
  await request("/admin/markets/1/vendors/2/snap", { method: "PUT", body: vendorPolicy });
  const ready = (await quote()).data;
  assert.equal(ready.snapAvailable, true);
  assert.equal(ready.snapUnavailableReason, null);
  assert.equal(ready.marketConfirmed, true); assert.equal(ready.vendorConfirmed, true);
  await request("/admin/markets/1/vendors/2/snap", { method: "PUT", body: { snap_status: "unavailable", snap_verified_on: "", snap_note: "" } });
  assert.equal((await quote()).data.snapAvailable, false);
  assert.equal((await quote()).data.snapUnavailableReason, "vendor_unavailable");
  await request("/admin/markets/1/snap", { method: "PUT", body: { ...marketPolicy, snap_status: "unavailable" } });
  assert.equal((await quote()).data.snapUnavailableReason, "market_unavailable");
});

test("SNAP verification enforces admin access, evidence, real dates, and an on-site model", async () => {
  for (const role of ["public", "client", "retailer"]) {
    const expected = role === "public" ? 401 : 403;
    assert.equal((await request("/admin/markets/1/snap", { role, method: "PUT", body: marketPolicy })).status, expected);
    assert.equal((await request("/admin/markets/1/vendors/2/snap", { role, method: "PUT", body: vendorPolicy })).status, expected);
  }
  for (const patch of [{ snap_model: "unconfirmed" }, { snap_verified_on: "" }, { snap_verified_on: "2026-02-30" }, { snap_verified_on: "2999-01-01" }, { snap_note: " " }])
    assert.equal((await request("/admin/markets/1/snap", { method: "PUT", body: { ...marketPolicy, ...patch } })).status, 400);
  assert.equal((await request("/admin/markets/1/vendors/2/snap", { method: "PUT", body: { ...vendorPolicy, snap_verified_on: "" } })).status, 400);
  assert.equal((await request("/admin/markets/1/vendors/1/snap", { method: "PUT", body: vendorPolicy })).status, 404);
  assert.equal((await request("/admin/markets/999/snap", { method: "PUT", body: marketPolicy })).status, 404);
});

test("server prices mixed SNAP carts, includes unknown goods in other tender, and snapshots the plan", async () => {
  classify(); await accept();
  const products = db.prepare("SELECT * FROM products WHERE id IN (1,2,3) ORDER BY id").all();
  const eligible = products[0].price_cents * 2;
  const other = products[1].price_cents + products[2].price_cents;
  const quote = await request("/checkout/quote", { method: "POST", body: { items, eligibleCents: 1, totalCents: 1 } });
  assert.equal(quote.status, 200);
  assert.equal(quote.data.eligibleCents, eligible); assert.equal(quote.data.otherCents, other);
  assert.equal(quote.data.unknownCents, products[2].price_cents); assert.equal(quote.data.totalCents, eligible + other);
  assert.deepEqual(quote.data.items.map((i) => i.snapEligibility), ["eligible", "ineligible", "unknown"]);
  const result = await request("/orders", { role: "client", method: "POST", body: { ...orderInput, total_cents: 1, snap_eligible_cents: 1, ebtCardNumber: "not-stored", pin: "not-stored" } });
  assert.equal(result.status, 201); assert.equal(result.data.total_cents, eligible + other);
  assert.equal(result.data.snap_eligible_cents, eligible); assert.equal(result.data.other_payment_cents, other);
  assert.equal(result.data.payment_method, "snap_ebt"); assert.equal(result.data.status, "pending");
  assert.ok(!JSON.stringify(result.data).includes("not-stored"));
  db.exec("UPDATE products SET snap_eligibility='ineligible',price_cents=9999 WHERE id=1");
  await request("/admin/markets/1/snap", { method: "PUT", body: { ...marketPolicy, snap_note: "Changed later" } });
  const saved = (await request("/orders", { role: "retailer" })).data[0];
  assert.equal(saved.snap_plan.items[0].snapEligibility, "eligible");
  assert.equal(saved.snap_plan.items[0].lineCents, eligible); assert.equal(saved.snap_plan.instructions, marketPolicy.snap_note);
  assert.equal(saved.snap_plan.snapModel, "market_tokens");
  assert.equal((await request("/admin/overview")).data.summary.snapIntentOrders, 1);
  await request(`/orders/${result.data.id}/status`, { role: "client", method: "PATCH", body: { status: "cancelled" } });
  assert.equal((await request("/admin/overview")).data.summary.snapIntentOrders, 0);
});

test("order submission rechecks SNAP policies and eligibility without reserving stock on failure", async () => {
  classify(); await accept();
  assert.equal((await request("/checkout/quote", { method: "POST", body: { items } })).data.snapAvailable, true);
  await request("/admin/markets/1/snap", { method: "PUT", body: { ...marketPolicy, snap_status: "unavailable" } });
  const stock = db.prepare("SELECT stock FROM products WHERE id=1").get().stock;
  assert.equal((await request("/orders", { role: "client", method: "POST", body: orderInput })).status, 409);
  assert.equal(db.prepare("SELECT stock FROM products WHERE id=1").get().stock, stock);
  await accept(); db.exec("UPDATE products SET snap_eligibility='ineligible'");
  assert.equal((await request("/orders", { role: "client", method: "POST", body: orderInput })).status, 409);
  assert.equal(db.prepare("SELECT stock FROM products WHERE id=1").get().stock, stock);
  assert.equal((await request("/orders", { role: "client", method: "POST", body: { ...orderInput, paymentMethod: "pay_at_pickup" } })).status, 201);
  assert.equal((await request("/orders", { role: "client", method: "POST", body: { ...orderInput, paymentMethod: "online_ebt" } })).status, 400);
});

test("quotes validate cart quantities and availability without changing inventory", async () => {
  const initial = db.prepare("SELECT stock FROM products WHERE id=1").get().stock;
  for (const invalidItems of [[], [{ productId: 1, quantity: 0 }], [{ productId: 1, quantity: 1 }, { productId: 1, quantity: 2 }]])
    assert.equal((await request("/checkout/quote", { method: "POST", body: { items: invalidItems } })).status, 400);
  assert.equal((await request("/checkout/quote", { method: "POST", body: { items: [{ productId: 9999, quantity: 1 }] } })).status, 409);
  assert.equal(db.prepare("SELECT stock FROM products WHERE id=1").get().stock, initial);
  await request("/admin/markets/status", { method: "PATCH", body: { ids: [1], preorders_enabled: false } });
  assert.equal((await request("/checkout/quote", { method: "POST", body: { items } })).status, 409);
});

test("assignment saves preserve SNAP evidence, while removal and rejoining require reconfirmation", async () => {
  await accept();
  await request("/admin/markets/1/vendors", { method: "PUT", body: { vendorIds: [2] } });
  assert.equal(db.prepare("SELECT snap_note FROM market_vendors WHERE market_id=1 AND retailer_id=2").get().snap_note, vendorPolicy.snap_note);
  await request("/admin/markets/1/vendors", { method: "PUT", body: { vendorIds: [] } });
  await request("/admin/markets/1/vendors", { method: "PUT", body: { vendorIds: [2] } });
  assert.equal(db.prepare("SELECT snap_status FROM market_vendors WHERE market_id=1 AND retailer_id=2").get().snap_status, "unconfirmed");
  assert.equal(db.prepare("SELECT snap_verified_on FROM market_vendors WHERE market_id=1 AND retailer_id=2").get().snap_verified_on, "");
});

test("vendor food classification persists when legacy editors omit the new field", async () => {
  const input = { name: "Food", category: "叶菜类", art: "lettuce", unit: "个", price_cents: 400, stock: 20, description: "Demo", organic: false, active: true, available_date: marketDay() };
  assert.equal((await request("/retailer/products", { role: "retailer", method: "POST", body: input })).data.snap_eligibility, "unknown");
  const created = await request("/retailer/products", { role: "retailer", method: "POST", body: { ...input, snap_eligibility: "eligible" } });
  assert.equal(created.status, 201);
  const edited = await request(`/retailer/products/${created.data.id}`, { role: "retailer", method: "PUT", body: { ...input, price_cents: 500 } });
  assert.equal(edited.data.snap_eligibility, "eligible");
  assert.equal((await request(`/retailer/products/${created.data.id}`, { role: "client", method: "PUT", body: { ...input, snap_eligibility: "eligible" } })).status, 403);
});

test("SNAP verification and product classification survive database restarts", () => {
  const directory = mkdtempSync(join(tmpdir(), "qinghe-snap-")), path = join(directory, "market.sqlite");
  let connection;
  try {
    connection = openDatabase(path);
    connection.prepare("UPDATE markets SET snap_status='accepted',snap_model='vendor_terminal',snap_verified_on=?,snap_note='Verified test' WHERE id=1").run(marketDay());
    connection.prepare("UPDATE products SET snap_eligibility='eligible' WHERE id=1").run();
    connection.close(); connection = openDatabase(path);
    assert.equal(connection.prepare("SELECT snap_model FROM markets WHERE id=1").get().snap_model, "vendor_terminal");
    assert.equal(connection.prepare("SELECT snap_eligibility FROM products WHERE id=1").get().snap_eligibility, "eligible");
    assert.deepEqual(connection.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { connection?.close(); rmSync(directory, { recursive: true, force: true }); }
});
