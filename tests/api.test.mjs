import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase, marketDay } from "../server/db.mjs";
import { createApp } from "../server/app.mjs";
import { forecastPrices } from "../server/forecast.mjs";

let db, server, base, client, retailer;
const directory = mkdtempSync(join(tmpdir(), "qinghe-test-"));
async function request(path, { method = "GET", body, cookie } = {}) {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: response.status,
    data: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}
before(async () => {
  db = openDatabase(join(directory, "test.sqlite"));
  server = createApp(db).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  client = (
    await request("/auth/login", {
      method: "POST",
      body: { email: "client@qinghe.demo", password: "MarketDemo2026!" },
    })
  ).cookie;
  retailer = (
    await request("/auth/login", {
      method: "POST",
      body: { email: "retailer@qinghe.demo", password: "MarketDemo2026!" },
    })
  ).cookie;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  rmSync(directory, { recursive: true, force: true });
});

test("seeded catalogue uses the Eastern business date; filters and market address work", async () => {
  const config = await request("/config");
  assert.equal(config.data.today, marketDay());
  const products = await request("/products");
  assert.equal(products.status, 200);
  const pickupMarket = db.prepare("SELECT name,address FROM markets WHERE id=?").get(products.data[0].market_id);
  assert.equal(products.data[0].market_name, pickupMarket.name);
  assert.equal(products.data[0].market_address, pickupMarket.address);
  assert.equal(products.data.length, 8);
  assert.ok(products.data.every((p) => p.available_date === marketDay()));
  const leaves = await request(
    "/products?category=" + encodeURIComponent("叶菜类"),
  );
  assert.equal(leaves.data.length, 2);
  const search = await request(
    "/products?search=" + encodeURIComponent("番茄"),
  );
  assert.equal(search.data[0].art, "tomato");
  const markets = await request("/markets");
  assert.match(markets.data[0].address, /Log Cabin/);
});
test("authentication and retailer access are enforced", async () => {
  assert.equal((await request("/retailer/products")).status, 401);
  assert.equal(
    (await request("/retailer/products", { cookie: client })).status,
    403,
  );
  assert.equal(
    (await request("/retailer/products", { cookie: retailer })).data.length,
    8,
  );
  assert.equal(
    (
      await request("/auth/login", {
        method: "POST",
        body: { email: "client@qinghe.demo", password: "wrong" },
      })
    ).status,
    401,
  );
  assert.equal(
    (await request("/auth/me", { cookie: client })).data.user.role,
    "client",
  );
});
test("preorders snapshot server prices, deduct stock and advance through merchant fulfillment", async () => {
  const p = (await request("/products")).data[0];
  const placed = await request("/orders", {
    method: "POST",
    cookie: client,
    body: {
      items: [{ productId: p.id, quantity: 2 }],
      pickupSlot: "10:00–12:00",
      note: "测试预购",
      total_cents: 1,
    },
  });
  assert.equal(placed.status, 201);
  assert.equal(placed.data.payment_method, "pay_at_pickup");
  assert.equal(placed.data.total_cents, p.price_cents * 2);
  assert.equal((await request("/products")).data[0].stock, p.stock - 2);
  assert.equal(
    (await request("/orders", { cookie: retailer })).data[0].id,
    placed.data.id,
  );
  assert.equal(
    (
      await request(`/orders/${placed.data.id}/status`, {
        method: "PATCH",
        cookie: client,
        body: { status: "completed" },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`/orders/${placed.data.id}/status`, {
        method: "PATCH",
        cookie: retailer,
        body: { status: "confirmed" },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(`/orders/${placed.data.id}/status`, {
        method: "PATCH",
        cookie: retailer,
        body: { status: "completed" },
      })
    ).status,
    200,
  );
  const dashboard = await request("/retailer/dashboard", { cookie: retailer });
  assert.equal(dashboard.data.revenueCents, p.price_cents * 2);
});
test("cancellation restores stock exactly once; overselling and duplicate lines are rejected", async () => {
  const p = (await request("/products")).data[1];
  const make = (items) =>
    request("/orders", {
      method: "POST",
      cookie: client,
      body: { items, pickupSlot: "12:00–14:00" },
    });
  const insufficient = await make([{ productId: p.id, quantity: p.stock + 1 }]);
  assert.equal(insufficient.status, 409);
  assert.equal(insufficient.data.error, `${p.name} 库存不足，当前剩余 ${p.stock} ${p.unit}。`);
  assert.equal(insufficient.data.messageKey, "{product} 库存不足，当前剩余 {stock} {unit}。");
  assert.deepEqual(insufficient.data.values, { product: p.name, stock: p.stock, unit: p.unit });
  assert.equal(
    (
      await make([
        { productId: p.id, quantity: 1 },
        { productId: p.id, quantity: 1 },
      ])
    ).status,
    400,
  );
  assert.equal((await request("/products")).data[1].stock, p.stock);
  const placed = await make([{ productId: p.id, quantity: 3 }]);
  assert.equal(placed.status, 201);
  assert.equal(
    (
      await request(`/orders/${placed.data.id}/status`, {
        method: "PATCH",
        cookie: client,
        body: { status: "cancelled" },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(`/orders/${placed.data.id}/status`, {
        method: "PATCH",
        cookie: client,
        body: { status: "cancelled" },
      })
    ).status,
    409,
  );
  assert.equal((await request("/products")).data[1].stock, p.stock);
});
test("customers see only their orders and cannot act on another customer’s order", async () => {
  const other = await request("/auth/register", {
    method: "POST",
    body: {
      name: "另一位顾客",
      email: "other@example.test",
      password: "a-safe-test-password",
      role: "retailer",
    },
  });
  assert.equal(other.status, 201);
  assert.equal(other.data.user.role, "client");
  assert.equal(
    (await request("/orders", { cookie: other.cookie })).data.length,
    0,
  );
  const order = (await request("/orders", { cookie: client })).data[0];
  assert.equal(
    (
      await request(`/orders/${order.id}/status`, {
        method: "PATCH",
        cookie: other.cookie,
        body: { status: "cancelled" },
      })
    ).status,
    403,
  );
  assert.equal(
    (await request("/auth/logout", { method: "POST", cookie: other.cookie }))
      .status,
    200,
  );
  assert.equal(
    (await request("/orders", { cookie: other.cookie })).status,
    401,
  );
});
test("retailers can create/update listings and daily history; invalid dates and prices fail validation", async () => {
  const input = {
    name: "测试青菜",
    category: "叶菜类",
    art: "lettuce",
    unit: "把",
    price_cents: 320,
    stock: 12,
    description: "测试说明",
    organic: false,
    active: true,
    available_date: marketDay(),
  };
  assert.equal(
    (
      await request("/retailer/products", {
        method: "POST",
        cookie: client,
        body: input,
      })
    ).status,
    403,
  );
  const created = await request("/retailer/products", {
    method: "POST",
    cookie: retailer,
    body: input,
  });
  assert.equal(created.status, 201);
  const updated = await request(`/retailer/products/${created.data.id}`, {
    method: "PUT",
    cookie: retailer,
    body: { ...input, stock: 5, price_cents: 375 },
  });
  assert.equal(updated.data.stock, 5);
  const prices = await request(`/products/${created.data.id}/prices`);
  assert.equal(prices.data.history.length, 1);
  assert.equal(prices.data.history[0].price_cents, 375);
  assert.equal(prices.data.forecast.points.length, 0);
  assert.equal(
    (
      await request(`/retailer/products/${created.data.id}`, {
        method: "PUT",
        cookie: retailer,
        body: { ...input, available_date: "2026-99-99" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(`/retailer/products/${created.data.id}`, {
        method: "PUT",
        cookie: retailer,
        body: { ...input, price_cents: -1 },
      })
    ).status,
    400,
  );
});
test("forecast uses dated observations, supplies seven bounded estimates and a holdout error", async () => {
  const prices = await request("/products/1/prices");
  assert.equal(prices.data.history.length, 28);
  assert.equal(prices.data.forecast.points.length, 7);
  assert.ok(prices.data.forecast.maeCents >= 0);
  for (const p of prices.data.forecast.points) {
    assert.ok(p.low_cents <= p.price_cents);
    assert.ok(p.high_cents >= p.price_cents);
    assert.ok(p.price_cents > 0);
  }
  const exact = forecastPrices(
    Array.from({ length: 10 }, (_, i) => ({
      date: `2026-10-${String(i + 1).padStart(2, "0")}`,
      price_cents: 100 + i * 10,
    })),
  );
  assert.equal(exact.points[0].price_cents, 200);
  assert.equal(exact.maeCents, 0);
});
test("a second database connection reads persisted listings and orders", () => {
  const second = openDatabase(join(directory, "test.sqlite"));
  assert.equal(
    second.prepare("SELECT COUNT(*) AS count FROM products").get().count,
    9,
  );
  assert.equal(
    second.prepare("SELECT COUNT(*) AS count FROM orders").get().count,
    2,
  );
  second.close();
});

test("SNAP/EBT preference persists for customer and vendor; invalid methods do not reserve stock", async () => {
  const p = (await request("/products")).data[0];
  const input = { items: [{ productId: p.id, quantity: 1 }], pickupSlot: "10:00–12:00" };
  assert.equal((await request("/orders", { method: "POST", cookie: client, body: { ...input, paymentMethod: "online_ebt" } })).status, 400);
  assert.equal((await request("/products")).data[0].stock, p.stock);
  assert.equal((await request("/orders", { method: "POST", cookie: client, body: { ...input, paymentMethod: "snap_ebt" } })).status, 409);
  assert.equal((await request("/products")).data[0].stock, p.stock);
  db.prepare("UPDATE markets SET snap_status='accepted',snap_model='vendor_terminal',snap_verified_on=?,snap_note='Test vendor terminal' WHERE id=?").run(marketDay(), p.market_id);
  db.prepare("UPDATE market_vendors SET snap_status='accepted',snap_verified_on=?,snap_note='Test vendor confirmation' WHERE market_id=? AND retailer_id=?").run(marketDay(), p.market_id, p.retailer_id);
  db.prepare("UPDATE products SET snap_eligibility='eligible' WHERE id=?").run(p.id);
  const placed = await request("/orders", { method: "POST", cookie: client, body: { ...input, paymentMethod: "snap_ebt" } });
  assert.equal(placed.status, 201);
  assert.equal(placed.data.payment_method, "snap_ebt");
  assert.equal(placed.data.status, "pending");
  assert.equal(placed.data.total_cents, p.price_cents);
  for (const cookie of [client, retailer]) {
    assert.equal((await request("/orders", { cookie })).data.find((o) => o.id === placed.data.id).payment_method, "snap_ebt");
  }
  const second = openDatabase(join(directory, "test.sqlite"));
  try { assert.equal(second.prepare("SELECT payment_method FROM orders WHERE id=?").get(placed.data.id).payment_method, "snap_ebt"); }
  finally { second.close(); }
});

test("opening a legacy database adds a payment preference without losing old orders", () => {
  const path = join(directory, "legacy.sqlite");
  const legacy = openDatabase(path);
  const product = legacy.prepare("SELECT * FROM products LIMIT 1").get();
  legacy.prepare("INSERT INTO orders (id,client_id,market_id,total_cents,pickup_date,pickup_slot,note) VALUES (?,?,?,?,?,?,?)")
    .run("LEGACY", 1, product.market_id, product.price_cents, marketDay(), "10:00–12:00", "legacy-note");
  legacy.exec("ALTER TABLE orders DROP COLUMN payment_method");
  legacy.close();
  const migrated = openDatabase(path);
  try {
    const order = migrated.prepare("SELECT * FROM orders WHERE id='LEGACY'").get();
    assert.equal(order.payment_method, "pay_at_pickup");
    assert.equal(order.note, "legacy-note");
    assert.equal(order.total_cents, product.price_cents);
  } finally { migrated.close(); }
});
