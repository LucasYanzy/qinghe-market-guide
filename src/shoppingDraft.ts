import { readShoppingSession } from "./shoppingSession.ts";
import type { User } from "./types";

export type Cart = Record<number, number>;
export type CheckoutDraft = { slot: string; note: string; paymentMethod?: "pay_at_pickup" | "snap_ebt"; submissionKey?: string; submissionFingerprint?: string };
type ShoppingDraft = { version: 1; savedOn: string; date: string; owner: number | null; cart: Cart; checkout: CheckoutDraft };
const storageKey = "qinghe-shopping-draft";

export function shoppingToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function parseShoppingDraft(raw: string | null, today = shoppingToday()): ShoppingDraft | undefined {
  try {
    const value = JSON.parse(raw ?? "null");
    if (!value || value.version !== 1 || value.savedOn !== today || !/^\d{4}-\d{2}-\d{2}$/.test(value.date) || value.date < today ||
      new Date(`${value.date}T12:00:00Z`).toISOString().slice(0, 10) !== value.date ||
      (value.owner !== null && (!Number.isSafeInteger(value.owner) || value.owner <= 0)) ||
      !value.cart || typeof value.cart !== "object" || Array.isArray(value.cart) || Object.keys(value.cart).length > 200 ||
      !Object.entries(value.cart).every(([id, count]) => /^\d+$/.test(id) && Number.isSafeInteger(Number(id)) && Number(id) > 0 && typeof count === 'number' && Number.isFinite(count) && Math.abs(count*1000-Math.round(count*1000))<1e-7 && count > 0 && count <= 100) ||
      !value.checkout || typeof value.checkout.slot !== "string" || typeof value.checkout.note !== "string") return;
    return { version: 1, savedOn: today, date: value.date, owner: value.owner, cart: value.cart,
      checkout: { slot: value.checkout.slot.slice(0, 100), note: value.checkout.note.slice(0, 300),
        paymentMethod: value.checkout.paymentMethod === "snap_ebt" ? "snap_ebt" : "pay_at_pickup",
        ...(typeof value.checkout.submissionKey === 'string' && /^[a-zA-Z0-9_-]{8,128}$/.test(value.checkout.submissionKey) && typeof value.checkout.submissionFingerprint === 'string' && value.checkout.submissionFingerprint.length < 10000
          ? {submissionKey:value.checkout.submissionKey,submissionFingerprint:value.checkout.submissionFingerprint} : {}) } };
  } catch { return; }
}

export function readShoppingDraft() {
  try {
    const current = sessionStorage.getItem(storageKey);
    if (current !== null) return parseShoppingDraft(current);
    const legacy = readShoppingSession();
    if (!legacy) return;
    return parseShoppingDraft(JSON.stringify({ version: 1, savedOn: legacy.date, date: legacy.date,
      owner: legacy.ownerId, cart: legacy.cart, checkout: legacy.checkout }));
  } catch { return; }
}

export function canRestoreShoppingDraft(saved: ShoppingDraft | undefined, user: User | null) {
  return !!saved && (!user || user.role === "client") && (saved.owner === null || saved.owner === user?.id);
}

export function saveShoppingDraft(date: string, cart: Cart, checkout: CheckoutDraft, user: User | null) {
  try {
    sessionStorage.removeItem("qinghe-shopping-session-v1");
    if ((user && user.role !== "client") || (!Object.keys(cart).length && !checkout.slot && !checkout.note)) {
      sessionStorage.removeItem(storageKey); return;
    }
    sessionStorage.setItem(storageKey, JSON.stringify({ version: 1, savedOn: shoppingToday(), date, owner: user?.id ?? null, cart, checkout }));
  } catch { /* Shopping continues when browser storage is unavailable. */ }
}
