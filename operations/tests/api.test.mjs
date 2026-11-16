import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "../server/app.mjs";
function record(id = "row1", extra = {}) {
  return {
    id,
    date: "2026-11-10",
    market: "A",
    session: "Main",
    format: "mobile",
    status: "held",
    transactions: 2,
    tenders: {
      cash: 1000,
      credit: 0,
      snap: 300,
      market_bucks: 0,
      wic: 0,
      other: 0,
    },
    costs: { produce: null, labor: null, transport: null, other: null },
    source_ref: "Private log",
    notes: "",
    ...extra,
  };
}
test("local records persist; stale tabs and import conflicts cannot overwrite data", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "operations-test-"));
  const file = path.join(dir, "db.sqlite");
  let db, server;
  try {
    let built = createApp(file);
    db = built.db;
    server = built.app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const base = "http://127.0.0.1:" + server.address().port;
    const post = async (url, body, headers = {}) => {
      const r = await fetch(base + url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
      });
      return { status: r.status, body: await r.json() };
    };
    assert.deepEqual(await (await fetch(base + "/api/state")).json(), {
      sessions: [],
      inventory: [],
      revision: 0,
    });
    assert.equal(
      (await post("/api/records/sessions", { revision: 0, record: record() }))
        .status,
      200,
    );
    assert.equal(
      (
        await post("/api/records/sessions", {
          revision: 0,
          record: record("row2", { market: "B" }),
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await post("/api/import", {
          revision: 1,
          data: { sessions: [record("duplicate")], inventory: [] },
        })
      ).body.skipped,
      1,
    );
    const bad = await post("/api/import", {
      revision: 2,
      data: {
        sessions: [
          record("new", { market: "B" }),
          record("conflict", { transactions: 10 }),
        ],
        inventory: [],
      },
    });
    assert.equal(bad.status, 400);
    const current = await (await fetch(base + "/api/state")).json();
    assert.equal(current.sessions.length, 1);
    assert.equal(current.revision, 2);
    assert.equal(
      (
        await post(
          "/api/records/sessions",
          { revision: 2, record: record("third", { market: "C" }) },
          { Origin: "https://elsewhere.example" },
        )
      ).status,
      403,
    );
    await new Promise((r) => server.close(r));
    server = null;
    db.close();
    db = null;
    built = createApp(file);
    db = built.db;
    assert.equal(db.prepare("SELECT revision FROM state").get().revision, 2);
    assert.equal(
      JSON.parse(db.prepare("SELECT body FROM state").get().body).sessions[0]
        .id,
      "row1",
    );
  } finally {
    if (server) await new Promise((r) => server.close(r));
    db?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
