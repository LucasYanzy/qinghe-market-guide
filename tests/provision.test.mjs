import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../server/db.mjs";
import { provisionSchoolAdmin } from "../server/provision.mjs";
import { createApp } from "../server/app.mjs";

test("operational bootstrap creates a usable admin without demo data and refuses to overwrite accounts", async () => {
  const db = openDatabase(":memory:", { demo: false });
  const credentials = { email: "operations@example.test", name: "School desk", password: "Test-only-Password-2026" };
  const admin = provisionSchoolAdmin(db, credentials);
  const server = createApp(db, { demo: false }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  try {
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM products").get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM markets").get().n, 0);
    assert.equal(admin.role, "admin");
    assert.throws(() => provisionSchoolAdmin(db, { ...credentials, email: "second@example.test" }), /已存在/);
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const login = await fetch(`${base}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credentials) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie").split(";")[0];
    assert.equal((await fetch(`${base}/admin/operations`, { headers: { Cookie: cookie } })).status, 200);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users").get().n, 1);
  } finally { await new Promise((r) => server.close(r)); db.close(); }
});

test("bootstrap rejects demo databases and short passwords without changing existing data", () => {
  const demo = openDatabase(":memory:"), clean = openDatabase(":memory:", { demo: false });
  try {
    const input = { email: "operations@example.test", name: "School desk", password: "Test-only-Password-2026" };
    assert.throws(() => provisionSchoolAdmin(demo, input), /含演示账号/);
    assert.equal(demo.prepare("SELECT COUNT(*) AS n FROM users WHERE email=?").get(input.email).n, 0);
    assert.throws(() => provisionSchoolAdmin(clean, { ...input, password: "short" }));
    assert.equal(clean.prepare("SELECT COUNT(*) AS n FROM users").get().n, 0);
  } finally { demo.close(); clean.close(); }
});
