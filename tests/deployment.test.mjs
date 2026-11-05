import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { readConfig } from "../server/config.mjs";
import { openDatabase } from "../server/db.mjs";
import { createApp } from "../server/app.mjs";

test("production refuses volatile storage and defaults to private operational data", () => {
  assert.throws(() => readConfig({ NODE_ENV: "production" }), /DATABASE_PATH/);
  assert.throws(() => readConfig({ NODE_ENV: "production", DATABASE_PATH: ":memory:" }), /persistent/);
  const config = readConfig({ NODE_ENV: "production", DATABASE_PATH: "/data/market.sqlite" });
  assert.equal(config.demo, false);
  assert.equal(config.secureCookie, true);
  assert.equal(config.trustProxy, 0);
  assert.equal(readConfig({}).demo, true);
});

test("invalid deployment options fail without echoing environment secrets", () => {
  const invalid = [
    { PORT: "oops" }, { PORT: "70000" }, { DEMO_MODE: "yes" }, { TRUST_PROXY: "true" },
    { PUBLIC_ORIGIN: "https://example.com/path" }, { PUBLIC_ORIGIN: "ftp://example.com" },
    { PUBLIC_ORIGIN: "https://example.com", COOKIE_SECURE: "false" },
  ];
  for (const settings of invalid) assert.throws(() => readConfig(settings));
  assert.throws(() => readConfig({ PORT: "do-not-echo-this-secret" }), (error) => !error.message.includes("do-not-echo-this-secret"));
});

test("reverse-proxy origin checks, malformed origins and immutable assets work together", async () => {
  const directory = mkdtempSync(join(tmpdir(), "qinghe-http-"));
  const dir = join(directory, ".worktree", "dist");
  const { mkdirSync } = await import("node:fs");
  mkdirSync(join(dir, "assets"), { recursive: true });
  writeFileSync(join(dir, ".private"), "not public");
  writeFileSync(join(dir, "assets", "app-a1b2.js"), "export {};");
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>Qinghe</title>");
  const db = openDatabase(":memory:");
  const app = createApp(db, { publicOrigin: "https://market.example", trustProxy: 1, secureCookie: true, staticDir: dir });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const send = (origin) => fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, "X-Forwarded-Proto": "https" }, body: JSON.stringify({ email: "client@qinghe.demo", password: "MarketDemo2026!" }) });
    const login = await send("https://market.example");
    assert.equal(login.status, 200);
    assert.match(login.headers.get("set-cookie"), /Secure/);
    assert.equal((await send("http://market.example")).status, 403);
    assert.equal((await send("https://attacker.example")).status, 403);
    assert.equal((await send("null")).status, 403);
    const asset = await fetch(`${base}/assets/app-a1b2.js`);
    assert.match(asset.headers.get("cache-control"), /immutable/);
    const page = await fetch(`${base}/admin/operations`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<title>Qinghe<\/title>/);
    assert.doesNotMatch(await (await fetch(`${base}/.private`)).text(), /not public/);
    assert.match(page.headers.get("cache-control"), /no-store/);
    assert.match(page.headers.get("content-security-policy"), /frame-ancestors 'none'/);
    assert.equal((await fetch(`${base}/api/no-such-api`)).status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close(); rmSync(directory, { recursive: true, force: true });
  }
});

test("SQLite online backup preserves WAL transactions and never overwrites a backup", () => {
  const directory = mkdtempSync(join(tmpdir(), "qinghe-backup-"));
  const path = join(directory, "source.sqlite"), destination = join(directory, "snapshot.sqlite");
  const db = new DatabaseSync(path);
  try {
    db.exec("PRAGMA journal_mode=WAL; CREATE TABLE proof (value TEXT); INSERT INTO proof VALUES ('committed while database remains open');");
    execFileSync(process.execPath, ["scripts/backup.mjs", destination], { env: { ...process.env, DATABASE_PATH: path }, stdio: "pipe" });
    const copy = new DatabaseSync(destination);
    try { assert.equal(copy.prepare("SELECT value FROM proof").get().value, "committed while database remains open"); }
    finally { copy.close(); }
    const original = readFileSync(destination);
    assert.throws(() => execFileSync(process.execPath, ["scripts/backup.mjs", destination], { env: { ...process.env, DATABASE_PATH: path }, stdio: "pipe" }));
    assert.deepEqual(readFileSync(destination), original);
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});
