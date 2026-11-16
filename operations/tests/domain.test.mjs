import test from "node:test";
import assert from "node:assert/strict";
import {
  sessionSchema,
  inventorySchema,
  dateSchema,
  centsFrom,
  mergeRecords,
  summary,
  totalCosts,
  periodKey,
  crossSubsidy,
} from "../shared/domain.ts";
export const session = (extra = {}) => ({
  id: crypto.randomUUID(),
  date: "2026-11-10",
  market: "A",
  session: "Main",
  format: "mobile",
  status: "held",
  transactions: 10,
  tenders: {
    cash: 1200,
    credit: 800,
    snap: 1000,
    market_bucks: 200,
    wic: 0,
    other: 0,
  },
  costs: { produce: 1500, labor: null, transport: 100, other: 0 },
  source_ref: "Receipt 123",
  notes: "",
  ...extra,
});
test("currency uses exact cents and rejects silent rounding / negative amounts", () => {
  assert.equal(centsFrom("19.99"), 1999);
  assert.equal(centsFrom("1,234.56"), 123456);
  assert.equal(centsFrom("", true), null);
  for (const n of ["", "-1", "1.001", "Infinity", "not a number"])
    assert.throws(() => centsFrom(n));
});
test("calendar dates and cancellation rules are validated", () => {
  assert.equal(dateSchema.safeParse("2026-02-29").success, false);
  assert.equal(dateSchema.safeParse("2024-02-29").success, true);
  assert.equal(
    sessionSchema.safeParse(session({ status: "cancelled" })).success,
    false,
  );
  assert.equal(
    sessionSchema.safeParse(session({ transactions: 0 })).success,
    false,
  );
});
test("inventory handles fractional units and rejects unbalanced stock", () => {
  const r = {
    id: "i",
    date: "2026-11-10",
    market: "A",
    session: "Main",
    product: "Tomatoes",
    unit: "lb",
    opening: 0,
    received: 10.5,
    sold: 6.1,
    donated: 1,
    spoiled: 0.4,
    transferred: 2,
    closing: 1,
    source_ref: "Scale sheet",
    notes: "",
  };
  assert.equal(inventorySchema.safeParse(r).success, true);
  assert.equal(inventorySchema.safeParse({ ...r, closing: 2 }).success, false);
});
test("daily KPIs aggregate multiple stops and do not count assistance twice", () => {
  const a = session(),
    b = session({ market: "B" }),
    c = session({
      date: "2026-11-11",
      tenders: {
        cash: 0,
        credit: 0,
        snap: 1000,
        market_bucks: 0,
        wic: 0,
        other: 0,
      },
    });
  const s = summary([a, b, c]);
  assert.equal(s.total, 7400);
  assert.equal(s.supported, 3400);
  assert.equal(s.averageDay, 3700);
  assert.deepEqual(s.bestDay, ["2026-11-10", 6400]);
  assert.equal(totalCosts(a), null);
  assert.equal(summary([]).share, null);
});
test("reimports skip exact records and conflicts never mutate the original", () => {
  const a = session();
  const current = { sessions: [a], inventory: [] };
  const dup = { ...a, id: "other-id" };
  assert.equal(
    mergeRecords(current, { sessions: [dup], inventory: [] }).skipped,
    1,
  );
  assert.throws(() =>
    mergeRecords(current, {
      sessions: [session({ date: "2026-11-11" }), { ...a, transactions: 20 }],
      inventory: [],
    }),
  );
  assert.equal(current.sessions.length, 1);
});
test("weekly grouping uses Monday across year boundaries", () => {
  assert.equal(periodKey("2027-01-01", "week"), "2026-12-28");
  assert.equal(periodKey("2026-11-16", "week"), "2026-11-16");
});
test("cross subsidy uses contribution after loss and all entered costs", () => {
  const p = {
    price: 5,
    cost: 2,
    volume: 100,
    shrink: 10,
    labor: 100,
    transport: 25,
    other: 25,
    accessGap: 250,
    support: 50,
  };
  const r = crossSubsidy(p);
  assert.equal(r.revenue, 450);
  assert.equal(r.cost, 350);
  assert.equal(r.contribution, 100);
  assert.equal(r.visits, 2);
  assert.equal(r.gap, 100);
  assert.equal(crossSubsidy({ ...p, price: 1 }).visits, null);
  assert.equal(crossSubsidy({ ...p, price: 1 }).gap, 460);
  assert.equal(crossSubsidy({ ...p, price: 1, support: 250 }).visits, 0);
  assert.equal(
    crossSubsidy({ ...p, price: 1, accessGap: 0, support: 0 }).visits,
    0,
  );
});
