import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase, marketDay } from "../server/db.mjs";
import { createApp } from "../server/app.mjs";
import { forecastPrices } from "../server/forecast.mjs";
import { vendorAnalytics } from "../server/vendor.mjs";

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
  assert.equal(
    (await make([{ productId: p.id, quantity: p.stock + 1 }])).status,
    409,
  );
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

test("vendor visibility changes enforce ownership and preserve reserved stock and price history", async () => {
  const p = (await request("/retailer/products", { cookie: retailer })).data[0];
  const history = db
    .prepare("SELECT * FROM price_history WHERE product_id=? ORDER BY date")
    .all(p.id);
  const path = `/retailer/products/${p.id}/visibility`;
  assert.equal(
    (await request(path, { method: "PATCH", body: { active: false } })).status,
    401,
  );
  assert.equal(
    (
      await request(path, {
        method: "PATCH",
        cookie: client,
        body: { active: false },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(path, {
        method: "PATCH",
        cookie: retailer,
        body: { active: "false" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/retailer/products/999999/visibility", {
        method: "PATCH",
        cookie: retailer,
        body: { active: false },
      })
    ).status,
    404,
  );
  const hidden = await request(path, {
    method: "PATCH",
    cookie: retailer,
    body: { active: false, stock: 999, price_cents: 1 },
  });
  assert.equal(hidden.status, 200);
  assert.equal(hidden.data.active, 0);
  assert.equal(hidden.data.stock, p.stock);
  assert.equal(hidden.data.price_cents, p.price_cents);
  assert.deepEqual(
    db
      .prepare("SELECT * FROM price_history WHERE product_id=? ORDER BY date")
      .all(p.id),
    history,
  );
  assert.ok(
    !(await request("/products")).data.some((item) => item.id === p.id),
  );
  const otherUser = db
    .prepare("INSERT INTO users(email,name,password_hash,role) VALUES(?,?,?,?)")
    .run("other-vendor@test.local", "Other Farm", "unused", "retailer");
  const otherProduct = db
    .prepare(
      "INSERT INTO products(market_id,retailer_id,name,category,art,unit,price_cents,stock,farm,description,available_date) VALUES(1,?,'Other','叶菜类','lettuce','把',100,2,'Other','',?)",
    )
    .run(otherUser.lastInsertRowid, marketDay());
  assert.equal(
    (
      await request(
        `/retailer/products/${otherProduct.lastInsertRowid}/visibility`,
        { method: "PATCH", cookie: retailer, body: { active: false } },
      )
    ).status,
    404,
  );
  const restored = await request(path, {
    method: "PATCH",
    cookie: retailer,
    body: { active: true },
  });
  assert.equal(restored.data.active, 1);
  assert.equal(restored.data.stock, p.stock);
});

test("vendor overview excludes hidden and other-date products from today's stock watch", async () => {
  const input = {
    name: "Stock watch",
    category: "叶菜类",
    art: "lettuce",
    unit: "把",
    price_cents: 100,
    stock: 0,
    description: "",
    organic: false,
    active: true,
    available_date: marketDay(),
  };
  const soldOut = (
    await request("/retailer/products", {
      method: "POST",
      cookie: retailer,
      body: input,
    })
  ).data;
  const offDate = (
    await request("/retailer/products", {
      method: "POST",
      cookie: retailer,
      body: { ...input, available_date: "2020-01-01" },
    })
  ).data;
  const hidden = (
    await request("/retailer/products", {
      method: "POST",
      cookie: retailer,
      body: { ...input, active: false },
    })
  ).data;
  const dashboard = (await request("/retailer/dashboard", { cookie: retailer }))
    .data;
  assert.ok(dashboard.lowStock.some((p) => p.id === soldOut.id));
  assert.ok(
    !dashboard.lowStock.some((p) => [offDate.id, hidden.id].includes(p.id)),
  );
  const products = (await request("/retailer/products", { cookie: retailer }))
    .data;
  assert.equal(
    dashboard.outOfStock,
    products.filter(
      (p) => p.active && p.available_date === marketDay() && p.stock === 0,
    ).length,
  );
  assert.equal(
    dashboard.offDateProducts,
    products.filter((p) => p.active && p.available_date !== marketDay()).length,
  );
  const orders = (await request("/orders", { cookie: retailer })).data;
  assert.equal(
    dashboard.waitingPickup,
    orders.filter((o) => o.status === "confirmed").length,
  );
});

test("vendor analytics keep seven pickup dates across year boundaries and exclude cancellations", () => {
  const orders = [
    {
      pickup_date: "2025-12-31",
      pickup_slot: "10:00–12:00",
      status: "completed",
      total_cents: 1000,
    },
    {
      pickup_date: "2026-01-02",
      pickup_slot: "10:00–12:00",
      status: "pending",
      total_cents: 250,
    },
    {
      pickup_date: "2026-01-02",
      pickup_slot: "10:00–12:00",
      status: "confirmed",
      total_cents: 350,
    },
    {
      pickup_date: "2026-01-02",
      pickup_slot: "12:00–14:00",
      status: "completed",
      total_cents: 400,
    },
    {
      pickup_date: "2026-01-02",
      pickup_slot: "12:00–14:00",
      status: "cancelled",
      total_cents: 9999,
    },
    { pickup_date: "2025-12-26", status: "completed", total_cents: 8888 },
    { pickup_date: "2026-01-03", status: "pending", total_cents: 7777 },
  ];
  const data = vendorAnalytics(orders, "2026-01-02");
  assert.equal(data.series.length, 7);
  assert.equal(data.series[0].date, "2025-12-27");
  assert.deepEqual(data.series.at(-1), {
    date: "2026-01-02",
    orders: 3,
    completedCents: 400,
    reservedCents: 600,
  });
  assert.equal(
    data.series.reduce(
      (sum, day) => sum + day.completedCents + day.reservedCents,
      0,
    ),
    2000,
  );
  assert.deepEqual(data.statusCounts, {
    pending: 1,
    confirmed: 1,
    completed: 1,
    cancelled: 1,
  });
  assert.deepEqual(data.pickupSummary[0], {
    slot: "10:00–12:00",
    pending: 1,
    confirmed: 1,
    completed: 0,
  });
  const empty = vendorAnalytics([], "2026-01-02");
  assert.ok(
    empty.series.every(
      (day) =>
        day.orders === 0 && day.completedCents === 0 && day.reservedCents === 0,
    ),
  );
  assert.ok(
    empty.pickupSummary.every(
      (slot) => slot.pending + slot.confirmed + slot.completed === 0,
    ),
  );
});

test("stock adjustment enforces access, validates quantities and rejects stale edits without changing prices", async () => {
  const p = (await request("/retailer/products", { cookie: retailer })).data[0];
  const path = `/retailer/products/${p.id}/stock`;
  const input = { stock: p.stock + 5, expected_stock: p.stock };
  const history = db
    .prepare("SELECT * FROM price_history WHERE product_id=? ORDER BY date")
    .all(p.id);
  assert.equal(
    (await request(path, { method: "PATCH", body: input })).status,
    401,
  );
  assert.equal(
    (await request(path, { method: "PATCH", body: input, cookie: client }))
      .status,
    403,
  );
  for (const body of [
    { stock: -1, expected_stock: p.stock },
    { stock: 1.5, expected_stock: p.stock },
    { stock: 10001, expected_stock: p.stock },
    { stock: 10 },
  ]) {
    assert.equal(
      (await request(path, { method: "PATCH", cookie: retailer, body })).status,
      400,
    );
  }
  const other = db
    .prepare("SELECT id FROM products WHERE retailer_id<>?")
    .get(p.retailer_id);
  assert.equal(
    (
      await request(`/retailer/products/${other.id}/stock`, {
        method: "PATCH",
        cookie: retailer,
        body: input,
      })
    ).status,
    404,
  );
  const saved = await request(path, {
    method: "PATCH",
    cookie: retailer,
    body: { ...input, price_cents: 1, active: false },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.stock, p.stock + 5);
  for (const key of ["price_cents", "active", "available_date", "name"])
    assert.equal(saved.data[key], p[key]);
  assert.equal(
    (await request(path, { method: "PATCH", cookie: retailer, body: input }))
      .status,
    409,
  );
  const staleEdit = await request(`/retailer/products/${p.id}`, {
    method: "PUT",
    cookie: retailer,
    body: {
      ...p,
      stock: 999,
      expected_stock: p.stock,
      price_cents: 1,
      organic: !!p.organic,
      active: !!p.active,
    },
  });
  assert.equal(staleEdit.status, 409);
  const stored = db.prepare("SELECT * FROM products WHERE id=?").get(p.id);
  assert.equal(stored.stock, p.stock + 5);
  assert.equal(stored.price_cents, p.price_cents);
  assert.deepEqual(
    db
      .prepare("SELECT * FROM price_history WHERE product_id=? ORDER BY date")
      .all(p.id),
    history,
  );
});

test("dashboard analytics include only this vendor's orders", async () => {
  const before = (await request("/retailer/dashboard", { cookie: retailer }))
    .data;
  const other = db.prepare("SELECT * FROM products WHERE farm='Other'").get();
  const customer = db
    .prepare("SELECT id FROM users WHERE role='client' LIMIT 1")
    .get();
  db.prepare(
    "INSERT INTO orders(id,client_id,market_id,status,total_cents,pickup_date,pickup_slot) VALUES('other-vendor-analytics',?,1,'completed',98765,?,'10:00–12:00')",
  ).run(customer.id, marketDay());
  db.prepare(
    "INSERT INTO order_items VALUES('other-vendor-analytics',?,'Other','把',98765,1,?)",
  ).run(other.id, other.retailer_id);
  const after = (await request("/retailer/dashboard", { cookie: retailer }))
    .data;
  for (const key of ["series", "statusCounts", "pickupSummary"])
    assert.deepEqual(after[key], before[key]);
  const today = after.series.at(-1);
  assert.equal(today.orders, after.todayOrders);
  assert.equal(today.completedCents, after.revenueCents);
  assert.equal(today.reservedCents, after.reservedCents);
});

test("bulk visibility validates the entire selection and preserves live stock and price history", async () => {
  const products = (
    await request("/retailer/products", { cookie: retailer })
  ).data.slice(0, 2);
  const other = db.prepare("SELECT id FROM products WHERE farm='Other'").get();
  const path = "/retailer/products/visibility";
  const body = { ids: products.map((p) => p.id), active: false };
  assert.equal((await request(path, { method: "PATCH", body })).status, 401);
  assert.equal(
    (await request(path, { method: "PATCH", cookie: client, body })).status,
    403,
  );
  for (const ids of [[], [products[0].id, products[0].id], [0], [1.5]]) {
    assert.equal(
      (
        await request(path, {
          method: "PATCH",
          cookie: retailer,
          body: { ...body, ids },
        })
      ).status,
      400,
    );
  }
  assert.equal(
    (
      await request(path, {
        method: "PATCH",
        cookie: retailer,
        body: { ids: [products[0].id, other.id], active: false },
      })
    ).status,
    404,
  );
  assert.equal(
    db.prepare("SELECT active FROM products WHERE id=?").get(products[0].id)
      .active,
    products[0].active,
  );
  const placed = await request("/orders", {
    method: "POST",
    cookie: client,
    body: {
      items: [{ productId: products[0].id, quantity: 1 }],
      pickupSlot: "10:00–12:00",
    },
  });
  assert.equal(placed.status, 201);
  const before = products.map((p) =>
    db.prepare("SELECT * FROM products WHERE id=?").get(p.id),
  );
  const history = db
    .prepare("SELECT * FROM price_history ORDER BY product_id,date")
    .all();
  const result = await request(path, {
    method: "PATCH",
    cookie: retailer,
    body: { ...body, stock: 999, price_cents: 1 },
  });
  assert.equal(result.status, 200);
  for (const [index, product] of result.data.entries()) {
    assert.equal(product.active, 0);
    for (const key of ["stock", "price_cents", "available_date"])
      assert.equal(product[key], before[index][key]);
  }
  assert.deepEqual(
    db.prepare("SELECT * FROM price_history ORDER BY product_id,date").all(),
    history,
  );
  assert.equal(
    db.prepare("SELECT status FROM orders WHERE id=?").get(placed.data.id)
      .status,
    "pending",
  );
  assert.equal(
    (
      await request(path, {
        method: "PATCH",
        cookie: retailer,
        body: { ...body, active: true },
      })
    ).status,
    200,
  );
});
