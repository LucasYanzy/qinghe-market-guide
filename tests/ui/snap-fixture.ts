import { expect, type Page } from "@playwright/test";

export async function prepareSnapTomatoes(page: Page) {
  // SNAP orders still require verified market/vendor acceptance and eligible food.
  expect((await page.request.post("/api/auth/login", { data: { email: "admin@qinghe.demo", password: "MarketDemo2026!" } })).ok()).toBe(true);
  const today = (await (await page.request.get("/api/config")).json()).today;
  const product = (await (await page.request.get("/api/products")).json()).find((p: { name: string }) => p.name === "藤熟番茄");
  const policy = { snap_status: "accepted", snap_verified_on: today, snap_note: "Test only: demo vendor terminal." };
  expect((await page.request.put(`/api/admin/markets/${product.market_id}/snap`, { data: { ...policy, snap_model: "vendor_terminal" } })).ok()).toBe(true);
  expect((await page.request.put(`/api/admin/markets/${product.market_id}/vendors/${product.retailer_id}/snap`, { data: policy })).ok()).toBe(true);
  expect((await page.request.post("/api/auth/login", { data: { email: "retailer@qinghe.demo", password: "MarketDemo2026!" } })).ok()).toBe(true);
  expect((await page.request.put(`/api/retailer/products/${product.id}`, { data: { ...product, active: true, organic: !!product.organic, snap_eligibility: "eligible" } })).ok()).toBe(true);
  await page.request.post("/api/auth/logout");
}
