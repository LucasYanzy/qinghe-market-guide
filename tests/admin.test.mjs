import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase, marketDay, hashPassword } from "../server/db.mjs";
import { createApp } from "../server/app.mjs";
import { schoolOverview } from "../server/admin.mjs";

let db, server, base, admin, client, retailer;
const marketInput = {
  name: "Busch 演示市场", subtitle: "校园与社区", address: "604 Bartholomew Rd, Piscataway, NJ",
  latitude: 40.523, longitude: -74.458, hours: "演示周四 10:00–16:00 ET", description: "测试运营市场",
  community: "Busch campus", coverage_radius_km: 2.5, active: true, preorders_enabled: true,
};
async function request(path, { method = "GET", cookie, body } = {}) {
  const response = await fetch(`${base}/api${path}`, { method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json(), cookie: response.headers.get("set-cookie")?.split(";")[0] };
}
before(async () => {
  db = openDatabase(":memory:");
  server = createApp(db).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  for (const role of ["admin", "client", "retailer"]) {
    const result = await request("/auth/login", { method: "POST", body: { email: `${role}@qinghe.demo`, password: "MarketDemo2026!" } });
    assert.equal(result.status, 200);
    if (role === "admin") admin = result.cookie;
    if (role === "client") client = result.cookie;
    if (role === "retailer") retailer = result.cookie;
  }
});
after(async () => { await new Promise((resolve) => server.close(resolve)); db.close(); });

test("school administration requires its own server-validated role", async () => {
  for (const path of ["/admin/overview", "/admin/markets"]) {
    assert.equal((await request(path)).status, 401);
    assert.equal((await request(path, { cookie: client })).status, 403);
    assert.equal((await request(path, { cookie: retailer })).status, 403);
    assert.equal((await request(path, { cookie: admin })).status, 200);
  }
  for (const cookie of [client, retailer]) {
    assert.equal((await request("/admin/markets", { method: "POST", cookie, body: marketInput })).status, 403);
    assert.equal((await request("/admin/markets/1", { method: "PUT", cookie, body: marketInput })).status, 403);
  }
  assert.equal((await request("/retailer/products", { cookie: admin })).status, 403);
  assert.equal((await request("/orders", { cookie: admin, method: "POST", body: {} })).status, 403);
  assert.equal((await request("/orders/unknown/status", { cookie: admin, method: "PATCH", body: { status: "completed" } })).status, 403);
  const signup = await request("/auth/register", { method: "POST", body: { email: "school-attempt@example.test", name: "Visitor", password: "test-password-2026", role: "admin" } });
  assert.equal(signup.data.user.role, "client");
  assert.equal((await request("/admin/overview?range=365", { cookie: admin })).status, 400);
});

test("school market settings validate and persist operational switches and coverage", async () => {
  const created = await request("/admin/markets", { method: "POST", cookie: admin, body: marketInput });
  assert.equal(created.status, 201);
  assert.equal(created.data.coverage_radius_km, 2.5);
  assert.equal(created.data.community, "Busch campus");
  const id = created.data.id;
  for (const change of [{ latitude: 91 }, { longitude: 181 }, { coverage_radius_km: -1 }, { coverage_radius_km: 101 }, { name: " " }, { active: "false" }]) {
    assert.equal((await request(`/admin/markets/${id}`, { method: "PUT", cookie: admin, body: { ...marketInput, ...change } })).status, 400);
  }
  assert.equal((await request("/admin/markets/99999", { method: "PUT", cookie: admin, body: marketInput })).status, 404);
  const saved = await request(`/admin/markets/${id}`, { method: "PUT", cookie: admin, body: { ...marketInput, active: false, coverage_radius_km: 4 } });
  assert.equal(saved.data.active, 0);
  assert.equal(saved.data.coverage_radius_km, 4);
  assert.ok(!(await request("/markets")).data.some((m) => m.id === id));
  assert.ok((await request("/admin/markets", { cookie: admin })).data.some((m) => m.id === id));
});

test("pausing preorders blocks stale carts atomically and keeps existing fulfillment available", async () => {
  const market = (await request("/admin/markets", { cookie: admin })).data.find((m) => m.id === 1);
  // The read model also contains independently managed SNAP verification fields.
  const input = { ...Object.fromEntries(Object.keys(marketInput).map((key) => [key, market[key]])), active: true, preorders_enabled: false };
  for (const key of Object.keys(input)) if (key.startsWith("snap_")) delete input[key];
  const orderInput = { items: [{ productId: 1, quantity: 1 }], pickupSlot: "10:00–12:00" };
  const pending = await request("/orders", { cookie: client, method: "POST", body: orderInput });
  assert.equal(pending.status, 201);
  const stock = db.prepare("SELECT stock FROM products WHERE id=1").get().stock;
  assert.equal((await request("/admin/markets/1", { cookie: admin, method: "PUT", body: input })).status, 200);
  assert.equal((await request("/products")).data.length, 0);
  assert.equal((await request("/orders", { cookie: client, method: "POST", body: orderInput })).status, 409);
  assert.equal(db.prepare("SELECT stock FROM products WHERE id=1").get().stock, stock);
  assert.equal((await request(`/orders/${pending.data.id}/status`, { cookie: retailer, method: "PATCH", body: { status: "confirmed" } })).status, 200);
  assert.equal((await request(`/orders/${pending.data.id}/pickup`, { cookie: retailer, method: "POST", body: {
    pickupCode: pending.data.pickup_code, cashCents: pending.data.total_cents, cardCents: 0, snapCents: 0,
  } })).status, 200);
  await request("/admin/markets/1", { cookie: admin, method: "PUT", body: { ...input, preorders_enabled: true, active: false } });
  assert.equal((await request("/orders", { cookie: client, method: "POST", body: orderInput })).status, 409);
  await request("/admin/markets/1", { cookie: admin, method: "PUT", body: { ...input, preorders_enabled: true } });
  assert.equal((await request("/products")).data.length, 8);
});

test("global statistics deduplicate customers and orders across items, vendors and markets", () => {
  const stats = openDatabase(":memory:");
  try {
    stats.prepare("INSERT INTO users (id,email,name,password_hash,role) VALUES (4,'second-client@test.local','Second client','unused','client'),(5,'second-vendor@test.local','Second vendor','unused','retailer')").run();
    stats.prepare("INSERT INTO markets (id,name,subtitle,address,latitude,longitude,hours,description) VALUES (2,'Second market','','Address',40.52,-74.45,'Hours','')").run();
    stats.prepare(`INSERT INTO products (id,market_id,retailer_id,name,category,art,unit,price_cents,stock,farm,description,available_date)
      VALUES (9,2,5,'Product','叶菜类','lettuce','个',400,10,'Second vendor','',?)`).run(marketDay());
    const old = new Date(`${marketDay()}T12:00:00Z`); old.setUTCDate(old.getUTCDate() - 120);
    const insertOrder = stats.prepare("INSERT INTO orders (id,client_id,market_id,status,total_cents,pickup_date,pickup_slot) VALUES (?,?,?,?,?,?,'10:00–12:00')");
    for (const values of [
      ["A", 1, 1, "completed", 980, marketDay()], ["B", 1, 2, "completed", 400, marketDay()],
      ["C", 4, 1, "pending", 350, marketDay()], ["D", 4, 1, "confirmed", 280, marketDay()],
      ["E", 4, 1, "cancelled", 999, marketDay()], ["F", 4, 1, "completed", 350, old.toISOString().slice(0, 10)],
    ]) insertOrder.run(...values);
    const item = stats.prepare("INSERT INTO order_items VALUES (?,?,?,'个',?,?,?)");
    for (const values of [["A", 1, "Tomato", 350, 2, 2], ["A", 2, "Broccoli", 280, 1, 2], ["B", 9, "Product", 400, 1, 5], ["C", 1, "Tomato", 350, 1, 2], ["D", 2, "Broccoli", 280, 1, 2], ["E", 1, "Tomato", 999, 1, 2], ["F", 1, "Tomato", 350, 1, 2]]) item.run(...values);
    const overview = schoolOverview(stats, "7");
    assert.equal(overview.summary.orders, 5);
    assert.equal(overview.summary.completed, 2);
    assert.equal(overview.summary.revenueCents, 1380);
    assert.equal(overview.summary.reservedCents, 630);
    assert.equal(overview.summary.cancelled, 1);
    assert.equal(overview.summary.participants, 1);
    assert.equal(overview.summary.repeatParticipants, 1);
    assert.equal(overview.markets.reduce((n, m) => n + m.participants, 0), 2);
    assert.equal(overview.vendors.find((v) => v.id === 2).completed, 1);
    assert.equal(overview.vendors.find((v) => v.id === 2).revenueCents, 980);
    assert.equal(overview.vendors.find((v) => v.id === 5).marketNames, "Second market");
    assert.equal(overview.timeline.length, 7);
    assert.equal(overview.timeline.reduce((n, d) => n + d.orders, 0), 5);
    assert.equal(schoolOverview(stats, "all").summary.participants, 2);
    assert.equal(schoolOverview(stats, "all").summary.revenueCents, 1730);
  } finally { stats.close(); }
});

test("legacy databases upgrade without losing accounts, sessions, markets or references", () => {
  const directory = mkdtempSync(join(tmpdir(), "qinghe-legacy-"));
  const path = join(directory, "legacy.sqlite");
  const legacy = new DatabaseSync(path);
  legacy.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('client','retailer')));
    CREATE TABLE sessions (token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL);
    CREATE TABLE markets (id INTEGER PRIMARY KEY,name TEXT NOT NULL,subtitle TEXT NOT NULL,address TEXT NOT NULL,
      latitude REAL NOT NULL,longitude REAL NOT NULL,hours TEXT NOT NULL,description TEXT NOT NULL);
    INSERT INTO markets VALUES (7,'Existing market','','Existing address',40.5,-74.4,'Existing hours','');`);
  legacy.prepare("INSERT INTO users VALUES (42,'existing@test.local','Existing user',?,'client')").run(hashPassword("existing-password"));
  legacy.prepare("INSERT INTO sessions VALUES ('retained-token',42,?)").run(Date.now() + 60000);
  legacy.close();
  let upgraded;
  try {
    upgraded = openDatabase(path);
    assert.equal(upgraded.prepare("SELECT name FROM users WHERE id=42").get().name, "Existing user");
    assert.equal(upgraded.prepare("SELECT user_id FROM sessions WHERE token_hash='retained-token'").get().user_id, 42);
    assert.equal(upgraded.prepare("SELECT active FROM markets WHERE id=7").get().active, 1);
    assert.equal(upgraded.prepare("SELECT role FROM users WHERE email='admin@qinghe.demo'").get().role, "admin");
    assert.deepEqual(upgraded.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(upgraded.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
    upgraded.close(); upgraded = openDatabase(path);
    assert.equal(upgraded.prepare("SELECT COUNT(*) AS n FROM users").get().n, 2);
    upgraded.close(); upgraded = openDatabase(path, { demo: false });
    assert.equal(upgraded.prepare("SELECT COUNT(*) AS n FROM markets").get().n, 1);
  } finally { upgraded?.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("non-demo databases do not create a public school administrator", () => {
  const empty = openDatabase(":memory:", { demo: false });
  try { assert.equal(empty.prepare("SELECT COUNT(*) AS n FROM users").get().n, 0); } finally { empty.close(); }
});
