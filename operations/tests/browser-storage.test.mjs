import test from "node:test";
import assert from "node:assert/strict";
import {
  readBrowserRecords,
  writeBrowserRecords,
  recordsStorageKey,
} from "../src/browserStorage.ts";
function memory() {
  const values = new Map();
  return {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
  };
}
function record(id = "one", extra = {}) {
  return {
    id,
    date: "2026-11-16",
    market: "A",
    session: "Main",
    format: "mobile",
    status: "held",
    transactions: null,
    tenders: {
      cash: 1000,
      credit: 0,
      snap: 0,
      market_bucks: 0,
      wic: 0,
      other: 0,
    },
    costs: { produce: null, labor: null, transport: null, other: null },
    source_ref: "test fixture",
    notes: "",
    ...extra,
  };
}
test("browser records persist, reject stale writes and preserve unknown costs", () => {
  const store = memory();
  assert.deepEqual(readBrowserRecords(store), {
    sessions: [],
    inventory: [],
    quotes: [],
    revision: 0,
  });
  writeBrowserRecords(store, "records/sessions", { record: record() }, 0);
  assert.equal(readBrowserRecords(store).sessions[0].costs.labor, null);
  assert.throws(
    () =>
      writeBrowserRecords(
        store,
        "records/sessions",
        { record: record("two", { market: "B" }) },
        0,
      ),
    /another tab/,
  );
  assert.equal(readBrowserRecords(store).sessions.length, 1);
});
test("browser import skips duplicates and rejects a conflicting batch before saving", () => {
  const store = memory();
  writeBrowserRecords(store, "records/sessions", { record: record() }, 0);
  assert.equal(
    writeBrowserRecords(
      store,
      "import",
      { data: { sessions: [record("copy")], inventory: [] } },
      1,
    ).skipped,
    1,
  );
  const before = store.getItem(recordsStorageKey);
  assert.throws(() =>
    writeBrowserRecords(
      store,
      "import",
      {
        data: {
          sessions: [
            record("two", { market: "B" }),
            record("conflict", { transactions: 20 }),
          ],
          inventory: [],
        },
      },
      2,
    ),
  );
  assert.equal(store.getItem(recordsStorageKey), before);
});
test("corrupt storage and a quota error never silently erase saved records", () => {
  const store = memory();
  store.setItem(recordsStorageKey, "invalid");
  assert.throws(() => readBrowserRecords(store), /kept unchanged/);
  assert.equal(store.getItem(recordsStorageKey), "invalid");
  const full = {
    getItem: () => null,
    setItem: () => {
      throw new Error("Storage quota exceeded");
    },
  };
  assert.throws(
    () =>
      writeBrowserRecords(full, "records/sessions", { record: record() }, 0),
    /quota/,
  );
});
