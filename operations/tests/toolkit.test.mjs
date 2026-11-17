import test from "node:test";
import assert from "node:assert/strict";
import {
  exampleData,
  parseCSV,
  readWorkbook,
  prepareImport,
  prepareWorkbook,
  columnsFor,
  guessMapping,
  buildWorkbook,
  delimited,
  ImportValidationError,
  recordValues,
} from "../src/data.ts";
import { datasetSchema, mergeRecords, sales } from "../shared/domain.ts";
import {
  procure,
  procurementDefaults,
  performance,
  quoteGroup,
} from "../shared/analytics.ts";
import {
  readBrowserRecords,
  writeBrowserRecords,
  recordsStorageKey,
} from "../src/browserStorage.ts";
const store = () => {
  const v = new Map();
  return { getItem: (k) => v.get(k) ?? null, setItem: (k, x) => v.set(k, x) };
};
test("legacy browser records gain an empty quote register without losing values or revision", () => {
  const s = store(),
    old = exampleData();
  delete old.quotes;
  s.setItem(recordsStorageKey, JSON.stringify({ ...old, revision: 7 }));
  const migrated = readBrowserRecords(s);
  assert.equal(migrated.sessions.length, 10);
  assert.equal(migrated.revision, 7);
  assert.deepEqual(migrated.quotes, []);
  const q = exampleData().quotes[0];
  writeBrowserRecords(s, "records/quotes", { record: q }, 7);
  const next = readBrowserRecords(s);
  assert.equal(
    next.sessions.reduce((n, r) => n + sales(r), 0),
    459900,
  );
  assert.equal(next.quotes.length, 1);
  writeBrowserRecords(s, "delete/quotes/" + q.id, {}, 8);
  assert.equal(readBrowserRecords(s).quotes.length, 0);
});
test("whole-workbook roundtrip preserves exact records, unknowns, IDs and quotes while ignoring analysis", async () => {
  const original = exampleData(),
    book = await buildWorkbook(original, true),
    bytes = await book.xlsx.writeBuffer();
  // A formatting-only cell and an Excel formula result must not change header discovery.
  book.getWorksheet("Market days").getCell("AZ200").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFFFFF" },
  };
  const file = new File([await book.xlsx.writeBuffer()], "example.xlsx");
  const tables = await readWorkbook(file),
    prepared = prepareWorkbook(tables, "example.xlsx");
  assert.deepEqual(prepared.data, original);
  assert.equal(prepared.sheets.length, 3);
  assert.ok(prepared.ignored.includes("Summary"));
  assert.equal(mergeRecords(original, prepared.data).skipped, 14);
  await assert.rejects(() => readWorkbook(file, false), /Example workbooks/);
  const empty = await buildWorkbook(
    datasetSchema.parse({ sessions: [], inventory: [] }),
    false,
    true,
  );
  const template = prepareWorkbook(
    await readWorkbook(
      new File([await empty.xlsx.writeBuffer()], "template.xlsx"),
    ),
    "template.xlsx",
  );
  assert.deepEqual(template.data, { sessions: [], inventory: [], quotes: [] });
  assert.ok(bytes.byteLength > 6000);
});
test("CSV/TSV handle quoted newlines, zero and blanks; exports escape formulas; customers never map to transactions", async () => {
  const data = exampleData(),
    s = {
      ...data.sessions[0],
      market: "=SUM(A1:A2)",
      notes: '  First line\n"Second", line  ',
      transactions: null,
    };
  const headers = [
    ...columnsFor("sessions"),
    "__provenance",
    "__export_format",
  ];
  for (const d of [",", "\t"]) {
    const text = delimited(
      headers,
      [[...recordValues("sessions", s), "recorded", "qinghe-table-v1"]],
      d,
    );
    assert.ok(text.includes("'=SUM"));
    const table = parseCSV(text, d),
      restored = prepareImport(
        table,
        guessMapping(table.headers, columnsFor("sessions")),
        "sessions",
        "test",
        false,
      );
    assert.deepEqual(restored.sessions, [s]);
  }
  assert.equal(guessMapping(["customers"], ["transactions"]).transactions, "");
  assert.throws(() => parseCSV('a,b\n"x"oops,y'), /Unexpected text/);
  assert.throws(() => parseCSV("a,a\n1,2"), /unique/);
  const synthetic = delimited(headers, [
    [...recordValues("sessions", s), "synthetic", "qinghe-table-v1"],
  ]);
  await assert.rejects(
    () => readWorkbook(new File([synthetic], "demo.csv"), false),
    /Example tables/,
  );
});
test("validation reports all bad rows with worksheet line numbers and never returns a partial import", () => {
  const table = parseCSV(
    "日期,点位,cash_usd,credit_usd,snap_usd,market_bucks_usd,wic_usd,other_usd\n2026-02-30,A,10,0,0,0,0,0\n2026-11-01,B,no,0,0,0,0,0\n2026-11-02,C,10,0,0,0,0,0",
  );
  assert.throws(
    () =>
      prepareImport(
        table,
        guessMapping(table.headers, columnsFor("sessions")),
        "sessions",
        "Sheet A",
        false,
      ),
    (e) => {
      assert.ok(e instanceof ImportValidationError);
      assert.equal(e.issues.length, 2);
      assert.deepEqual(
        e.issues.map((i) => i.row),
        [2, 3],
      );
      return true;
    },
  );
});
test("delivered cost rounds packs, obeys minimums, includes handling and yield, and exposes zero-demand break-even", () => {
  const q = {
    ...exampleData().quotes[0],
    pack_size: 20,
    pack_price: 3000,
    minimum_order: 10000,
    delivery: 1000,
    handling: 200,
    yield_pct: 80,
  };
  const p = {
      ...procurementDefaults,
      target: 30,
      demand: 50,
      price: 5,
      session_cost: 20,
    },
    r = procure(q, p);
  assert.equal(r.packs, 4);
  assert.equal(r.purchased, 80);
  assert.equal(r.usable, 64);
  assert.equal(r.delivered, 138);
  assert.equal(r.effective, 138 / 64);
  assert.equal(r.surplus, 14);
  assert.equal(r.contribution, 92);
  assert.equal(r.breakEven, 158 / 50);
  assert.equal(procure(q, p, 0).breakEven, null);
  assert.equal(procure(q, p, 100).unmet, 36);
  assert.throws(() => procure({ ...q, pack_price: 0 }, p), /zero-price/);
  assert.throws(() => procure(q, { ...p, target: 0 }));
  assert.notEqual(quoteGroup(q), quoteGroup({ ...q, unit: "box" }));
});
test("performance never compares full sales against partial costs or mixes unknown transaction populations", () => {
  const s = exampleData().sessions[0],
    rows = [
      {
        ...s,
        market: "A",
        transactions: 2,
        tenders: {
          ...s.tenders,
          cash: 1000,
          credit: 0,
          snap: 0,
          market_bucks: 0,
        },
        costs: { produce: 200, labor: 100, transport: 0, other: 0 },
      },
      {
        ...s,
        id: "missing",
        market: "A",
        transactions: null,
        costs: { ...s.costs, other: null },
      },
      {
        ...s,
        id: "cancel",
        market: "A",
        status: "cancelled",
        transactions: 0,
        tenders: {
          cash: 0,
          credit: 0,
          snap: 0,
          market_bucks: 0,
          wic: 0,
          other: 0,
        },
        costs: { produce: 0, labor: 100, transport: 0, other: 0 },
      },
    ];
  const p = performance(rows)[0];
  assert.equal(p.sessions, 2);
  assert.equal(p.complete, 1);
  assert.equal(p.cohortSales, 1000);
  assert.equal(p.cohortCosts, 300);
  assert.equal(p.contribution, 700);
  assert.equal(p.basket, 500);
  assert.equal(p.cancelledCosts, 100);
});
