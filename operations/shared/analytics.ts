import { z } from "zod";
import {
  type Session,
  type Quote,
  sales,
  totalCosts,
  assistance,
  quoteSchema,
} from "./domain.ts";

export function performance(rows: Session[]) {
  return [...new Set(rows.map((s) => s.market))].sort().map((market) => {
    const all = rows.filter((s) => s.market === market);
    const held = all.filter((s) => s.status === "held");
    const complete = held.filter((s) => totalCosts(s) !== null);
    const knownTransactions = held.filter((s) => s.transactions !== null);
    const cohortSales = complete.reduce((n, s) => n + sales(s), 0);
    const cohortCosts = complete.reduce((n, s) => n + totalCosts(s)!, 0);
    const tx = knownTransactions.reduce((n, s) => n + s.transactions!, 0);
    return {
      market,
      sessions: held.length,
      days: new Set(held.map((s) => s.date)).size,
      sales: held.reduce((n, s) => n + sales(s), 0),
      assistance: held.reduce((n, s) => n + assistance(s), 0),
      complete: complete.length,
      missing: held.length - complete.length,
      cohortSales,
      cohortCosts,
      contribution: complete.length ? cohortSales - cohortCosts : null,
      transactions: tx,
      transactionSessions: knownTransactions.length,
      basket:
        tx > 0
          ? knownTransactions.reduce((n, s) => n + sales(s), 0) / tx
          : null,
      cancelled: all.length - held.length,
      cancelledCosts: all
        .filter((s) => s.status === "cancelled" && totalCosts(s) !== null)
        .reduce((n, s) => n + totalCosts(s)!, 0),
    };
  });
}
export const procurementSchema = z
  .object({
    target: z.number().finite().positive().max(1_000_000),
    demand: z.number().finite().min(0).max(1_000_000),
    spread: z.number().finite().min(0).max(100),
    price: z.number().finite().min(0).max(1_000_000),
    session_cost: z.number().finite().min(0).max(10_000_000),
  })
  .strict();
export type ProcurementInputs = z.infer<typeof procurementSchema>;
export const procurementDefaults: ProcurementInputs = {
  target: 100,
  demand: 90,
  spread: 25,
  price: 4.5,
  session_cost: 150,
};
export function quoteGroup(q: Quote) {
  return [q.product, q.unit, q.spec]
    .map((s) => s.trim().toLowerCase())
    .join("\u001f");
}
export function procure(
  quote: Quote,
  inputs: ProcurementInputs,
  demand = inputs.demand,
) {
  const q = quoteSchema.parse(quote),
    p = procurementSchema.parse(inputs);
  if (!Number.isFinite(demand) || demand < 0)
    throw new Error("Demand must be nonnegative");
  if (q.pack_price === 0 && q.minimum_order > 0)
    throw new Error("A zero-price quote cannot meet a positive minimum order");
  const packsForDemand = Math.max(
    1,
    Math.ceil(p.target / ((q.pack_size * q.yield_pct) / 100) - 1e-10),
  );
  const packsForMinimum = q.pack_price
    ? Math.ceil(q.minimum_order / q.pack_price)
    : 0;
  const packs = Math.max(packsForDemand, packsForMinimum);
  if (!Number.isSafeInteger(packs) || packs > 1_000_000_000)
    throw new Error(
      "Order size is too large. Check pack size and usable yield.",
    );
  const purchased = packs * q.pack_size;
  const usable = (purchased * q.yield_pct) / 100;
  const goods = (packs * q.pack_price) / 100;
  const handling = (packs * q.handling) / 100;
  const delivered = goods + handling + q.delivery / 100;
  const sold = Math.min(demand, usable),
    surplus = Math.max(0, usable - demand),
    unmet = Math.max(0, demand - usable);
  const revenue = sold * p.price,
    total = delivered + p.session_cost;
  return {
    packs,
    purchased,
    usable,
    loss: purchased - usable,
    goods,
    handling,
    delivery: q.delivery / 100,
    delivered,
    effective: usable > 0 ? delivered / usable : null,
    excess: usable - p.target,
    sold,
    surplus,
    unmet,
    revenue,
    total,
    contribution: revenue - total,
    breakEven: sold > 0 ? total / sold : null,
    fillRate: demand > 0 ? sold / demand : null,
  };
}
