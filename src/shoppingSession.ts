import type { PaymentMethod } from "./types";

export type Cart = Record<number, number>;
export type CheckoutDraft = { slot: string; note: string; paymentMethod: PaymentMethod };

export type ShoppingSession = {
  version: 1;
  date: string;
  ownerId: number | null;
  cart: Cart;
  checkout: CheckoutDraft;
};

const storageKey = "qinghe-shopping-session-v1";

// Store only the customer's choices; prices and stock always come from the API.
export function readShoppingSession(): ShoppingSession | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const value = JSON.parse(raw) as ShoppingSession;
    if (!value || value.version !== 1 || typeof value.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.date) ||
      !(value.ownerId === null || (Number.isSafeInteger(value.ownerId) && value.ownerId > 0)) ||
      !value.cart || typeof value.cart !== "object" || Array.isArray(value.cart) ||
      !value.checkout || typeof value.checkout.slot !== "string" || value.checkout.slot.length > 80 ||
      typeof value.checkout.note !== "string" || value.checkout.note.length > 300 ||
      (value.checkout.paymentMethod !== undefined && !["pay_at_pickup", "snap_ebt"].includes(value.checkout.paymentMethod))) return null;
    const entries = Object.entries(value.cart);
    if (entries.length > 50 || entries.some(([id, quantity]) =>
      !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)) ||
      !Number.isInteger(quantity) || quantity < 1 || quantity > 100)) return null;
    return {
      version: 1,
      date: value.date,
      ownerId: value.ownerId,
      cart: Object.fromEntries(entries),
      checkout: { slot: value.checkout.slot, note: value.checkout.note, paymentMethod: value.checkout.paymentMethod ?? "pay_at_pickup" },
    };
  } catch {
    return null;
  }
}

export function saveShoppingSession(session: ShoppingSession | null) {
  try {
    if (!session || (!Object.keys(session.cart).length && !session.checkout.slot && !session.checkout.note && session.checkout.paymentMethod !== "snap_ebt"))
      window.sessionStorage.removeItem(storageKey);
    else window.sessionStorage.setItem(storageKey, JSON.stringify(session));
  } catch {
    // Browsing and checkout remain available when storage is blocked or full.
  }
}
