import { test, expect } from "@playwright/test";

test("read-only quotes and rejected writes do not export the demo database", async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    (window as any).databaseSaves = 0;
    Storage.prototype.setItem = function (key, value) {
      if (key === "qinghe-interactive-demo-v1") (window as any).databaseSaves++;
      return original.call(this, key, value);
    };
  });
  await page.goto("./");
  await expect(page.locator(".product-card")).toHaveCount(8);
  const result = await page.evaluate(async () => {
    const before = (window as any).databaseSaves;
    const products = await (await fetch("/api/products")).json();
    for (let n = 0; n < 5; n++) {
      const response = await fetch("/api/checkout/quote", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ productId: products[0].id, quantity: 1 }] }),
      });
      if (!response.ok) throw new Error("Quote failed");
    }
    const rejected = await fetch("/api/orders", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    });
    return { saves: (window as any).databaseSaves - before, rejected: rejected.status };
  });
  expect(result.rejected).toBe(400);
  expect(result.saves).toBe(0);
});
