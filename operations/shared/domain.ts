import { z } from "zod";
export const tenderKeys = [
  "cash",
  "credit",
  "snap",
  "market_bucks",
  "wic",
  "other",
] as const;
export const costKeys = ["produce", "labor", "transport", "other"] as const;
export type Tender = (typeof tenderKeys)[number];
export type Cost = (typeof costKeys)[number];
const text = z.string().trim().max(300);
const cents = z.number().int().min(0).max(1_000_000_000);
const quantity = z.number().finite().min(0).max(1_000_000);
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    try {
      return new Date(v + "T12:00:00Z").toISOString().slice(0, 10) === v;
    } catch {
      return false;
    }
  }, "Invalid calendar date");
export const sessionSchema = z
  .object({
    id: text.min(1),
    date: dateSchema,
    market: text.min(1),
    session: text.min(1),
    format: z.enum(["mobile", "onsite"]),
    status: z.enum(["held", "cancelled"]),
    transactions: z.number().int().min(0).max(1_000_000).nullable(),
    tenders: z
      .object({
        cash: cents,
        credit: cents,
        snap: cents,
        market_bucks: cents,
        wic: cents,
        other: cents,
      })
      .strict(),
    costs: z
      .object({
        produce: cents.nullable(),
        labor: cents.nullable(),
        transport: cents.nullable(),
        other: cents.nullable(),
      })
      .strict(),
    source_ref: text.min(1),
    notes: z.string().max(2000),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (
      s.status === "cancelled" &&
      (Object.values(s.tenders).some(Boolean) || (s.transactions ?? 0) > 0)
    )
      ctx.addIssue({
        code: "custom",
        message: "Cancelled sessions cannot have sales or transactions",
      });
    if (s.transactions === 0 && Object.values(s.tenders).some(Boolean))
      ctx.addIssue({
        code: "custom",
        message: "Sales require a positive or unknown transaction count",
      });
  });
export const inventorySchema = z
  .object({
    id: text.min(1),
    date: dateSchema,
    market: text.min(1),
    session: text.min(1),
    product: text.min(1),
    unit: text.min(1),
    opening: quantity,
    received: quantity,
    sold: quantity,
    donated: quantity,
    spoiled: quantity,
    transferred: quantity,
    closing: quantity,
    source_ref: text.min(1),
    notes: z.string().max(2000),
  })
  .strict()
  .refine(
    (s) =>
      Math.abs(
        s.opening +
          s.received -
          s.sold -
          s.donated -
          s.spoiled -
          s.transferred -
          s.closing,
      ) < 0.00001,
    "Inventory must balance: opening + received = sold + donated + spoiled + transferred out + closing",
  );
export type Session = z.infer<typeof sessionSchema>;
export type Inventory = z.infer<typeof inventorySchema>;
export const quoteSchema = z
  .object({
    id: text.min(1),
    date: dateSchema,
    supplier: text.min(1),
    product: text.min(1),
    unit: text.min(1),
    spec: text.min(1),
    pack_size: quantity.positive(),
    pack_price: cents,
    minimum_order: cents,
    delivery: cents,
    handling: cents,
    yield_pct: z.number().finite().positive().max(100),
    lead_days: z.number().int().min(0).max(365),
    source_ref: text.min(1),
    notes: z.string().max(2000),
  })
  .strict();
export type Quote = z.infer<typeof quoteSchema>;
export type RecordKind = "sessions" | "inventory" | "quotes";
export type MarketRecord = Session | Inventory | Quote;
export type Dataset = {
  sessions: Session[];
  inventory: Inventory[];
  quotes: Quote[];
};
export const datasetSchema = z
  .object({
    sessions: z.array(sessionSchema).max(20000),
    inventory: z.array(inventorySchema).max(50000),
    quotes: z.array(quoteSchema).max(10000).default([]),
  })
  .strict();
export function recordKey(s: MarketRecord) {
  if ("supplier" in s)
    return [s.date, s.supplier, s.product, s.unit, s.spec, String(s.pack_size)]
      .map((x) => x.trim().toLowerCase())
      .join("\u001f");
  return [
    s.date,
    s.market.toLowerCase(),
    s.session.toLowerCase(),
    ...("product" in s ? [s.product.toLowerCase(), s.unit.toLowerCase()] : []),
  ]
    .map((x) => x.trim())
    .join("\u001f");
}
export function sales(s: Session) {
  return tenderKeys.reduce((n, k) => n + s.tenders[k], 0);
}
export function assistance(s: Session) {
  return s.tenders.snap + s.tenders.market_bucks + s.tenders.wic;
}
export function totalCosts(s: Session) {
  return costKeys.every((k) => s.costs[k] !== null)
    ? costKeys.reduce((n, k) => n + s.costs[k]!, 0)
    : null;
}
export function centsFrom(value: unknown, optional = false): number | null {
  if (value === "" || value === null || value === undefined) {
    if (optional) return null;
    throw new Error("Enter a dollar amount, including 0 when confirmed");
  }
  const raw = String(value).trim().replace(/^\$/, "");
  if (raw.includes(",") && !/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(raw))
    throw new Error(
      "Use comma thousands groups and a dot decimal separator for USD",
    );
  const s = raw.replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s))
    throw new Error("Use nonnegative USD with at most two decimals");
  const [d, f = ""] = s.split(".");
  const n = Number(d) * 100 + Number(f.padEnd(2, "0"));
  if (!Number.isSafeInteger(n) || n > 1_000_000_000)
    throw new Error("Amount is too large");
  return n;
}
export function mergeRecords(current: Dataset, incoming: Dataset) {
  const next: Dataset = {
    sessions: [...current.sessions],
    inventory: [...current.inventory],
    quotes: [...(current.quotes ?? [])],
  };
  let added = 0,
    skipped = 0;
  for (const kind of ["sessions", "inventory", "quotes"] as const) {
    const keys = new Map(next[kind].map((r) => [recordKey(r), r]));
    const ids = new Set(next[kind].map((r) => r.id));
    for (const row of incoming[kind] ?? []) {
      const old = keys.get(recordKey(row));
      if (old) {
        const { id: _, ...a } = old;
        const { id: __, ...b } = row;
        if (JSON.stringify(a) !== JSON.stringify(b))
          throw new Error(
            `Conflicting existing record: ${row.date} / ${"supplier" in row ? row.supplier + " / " + row.product : row.market + " / " + row.session}. Edit that record instead.`,
          );
        skipped++;
        continue;
      }
      if (ids.has(row.id)) throw new Error("Duplicate record ID");
      (next[kind] as MarketRecord[]).push(row);
      keys.set(recordKey(row), row);
      ids.add(row.id);
      added++;
    }
  }
  return { data: next, added, skipped };
}
export function summary(rows: Session[]) {
  const held = rows.filter((s) => s.status === "held");
  const total = held.reduce((n, s) => n + sales(s), 0);
  const supported = held.reduce((n, s) => n + assistance(s), 0);
  const best = [...held].sort(
    (a, b) => sales(b) - sales(a) || a.date.localeCompare(b.date),
  )[0];
  const perDay = new Map<string, number>();
  for (const s of held)
    perDay.set(s.date, (perDay.get(s.date) ?? 0) + sales(s));
  const bestDay = [...perDay].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0];
  return {
    held,
    total,
    supported,
    share: total ? supported / total : null,
    average: held.length ? total / held.length : null,
    best,
    bestDay,
    days: perDay.size,
    averageDay: perDay.size ? total / perDay.size : null,
  };
}
export function periodKey(date: string, period: "day" | "week" | "month") {
  if (period === "month") return date.slice(0, 7);
  if (period === "day") return date;
  const d = new Date(date + "T12:00:00Z");
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}
export function grouped(rows: Session[], period: "day" | "week" | "month") {
  const result = new Map<
    string,
    { date: string; total: number } & Record<Tender, number>
  >();
  for (const s of rows.filter((s) => s.status === "held")) {
    const date = periodKey(s.date, period);
    const r = result.get(date) ?? {
      date,
      total: 0,
      cash: 0,
      credit: 0,
      snap: 0,
      market_bucks: 0,
      wic: 0,
      other: 0,
    };
    for (const k of tenderKeys) r[k] += s.tenders[k];
    r.total += sales(s);
    result.set(date, r);
  }
  return [...result.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({
      ...r,
      total: r.total / 100,
      ...Object.fromEntries(tenderKeys.map((k) => [k, r[k] / 100])),
    })) as ({ date: string; total: number } & Record<Tender, number>)[];
}
export function crossSubsidy(p: {
  price: number;
  cost: number;
  volume: number;
  shrink: number;
  labor: number;
  transport: number;
  other: number;
  accessGap: number;
  support: number;
}) {
  const revenue = p.price * p.volume * (1 - p.shrink / 100);
  const cost = p.cost * p.volume + p.labor + p.transport + p.other;
  const contribution = revenue - cost;
  const available = contribution + p.support;
  const required = Math.max(0, p.accessGap);
  const gap = Math.max(0, required - available);
  const remaining = Math.max(0, required - p.support);
  const visits =
    remaining === 0
      ? 0
      : contribution > 0
        ? Math.ceil(remaining / contribution)
        : null;
  return { revenue, cost, contribution, available, gap, visits };
}
