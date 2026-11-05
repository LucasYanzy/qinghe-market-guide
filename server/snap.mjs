import { z } from "zod";
import { marketDay } from "./db.mjs";
const verifiedDate = z.string().refine((v) => {
  if (v === "") return true;
  const date = new Date(`${v}T12:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === v && v <= marketDay();
});
export const snapVerificationSchema = z.object({
  snap_status: z.enum(["unconfirmed", "accepted", "unavailable"]),
  snap_verified_on: verifiedDate,
  snap_note: z.string().trim().max(1000),
}).strict().refine((v) => v.snap_status !== "accepted" || (!!v.snap_verified_on && v.snap_note.length > 0));
export const snapMarketSchema = z.object({
  snap_status: z.enum(["unconfirmed", "accepted", "unavailable"]),
  snap_model: z.enum(["unconfirmed", "market_tokens", "vendor_terminal"]),
  snap_verified_on: verifiedDate, snap_note: z.string().trim().max(1000),
}).strict().refine((v) => v.snap_status !== "accepted" || (!!v.snap_verified_on && !!v.snap_note && v.snap_model !== "unconfirmed"));

export function snapPlan(db, marketId, vendorId, items) {
  const market = db.prepare("SELECT * FROM markets WHERE id=?").get(marketId);
  const vendor = db.prepare("SELECT * FROM market_vendors WHERE market_id=? AND retailer_id=?").get(marketId, vendorId);
  const eligibleCents = items.filter((i) => i.snap_eligibility === "eligible").reduce((n, i) => n + Math.round(i.price_cents * i.quantity), 0);
  const unknownCents = items.filter((i) => i.snap_eligibility === "unknown").reduce((n, i) => n + Math.round(i.price_cents * i.quantity), 0);
  const totalCents = items.reduce((n, i) => n + Math.round(i.price_cents * i.quantity), 0);
  const marketVerified = market.snap_status === "accepted" && market.snap_model !== "unconfirmed" && !!market.snap_verified_on && !!market.snap_note;
  const vendorVerified = vendor?.snap_status === "accepted" && !!vendor.snap_verified_on && !!vendor.snap_note;
  const snapUnavailableReason = !marketVerified
    ? market.snap_status === "unavailable" ? "market_unavailable" : "market_unconfirmed"
    : !vendorVerified ? vendor?.snap_status === "unavailable" ? "vendor_unavailable" : "vendor_unconfirmed" : null;
  return {
    marketId, marketName: market.name, totalCents, eligibleCents, unknownCents, otherCents: totalCents - eligibleCents,
    snapAvailable: marketVerified && vendorVerified, snapUnavailableReason,
    marketConfirmed: marketVerified, vendorConfirmed: vendorVerified,
    snapModel: market.snap_model,
    marketVerifiedOn: market.snap_verified_on, vendorVerifiedOn: vendor?.snap_verified_on ?? "",
    instructions: market.snap_note,
    items: items.map((i) => ({ productId: i.id, name: i.name, quantity: i.quantity, lineCents: Math.round(i.price_cents * i.quantity), snapEligibility: i.snap_eligibility })),
  };
}
