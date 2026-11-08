import { expect } from "@playwright/test";
import { test } from "./isolated";

test("简洁商品网格可筛选、切换语言，购物袋保持同步", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".product-card")).toHaveCount(38);
  const tomato = page.locator('.product-card[data-product-id="1"]');
  await tomato.getByRole("button", { name: "将藤熟番茄加入购物袋", exact: true }).click();
  await expect(tomato.locator(".product-quantity-value")).toHaveText("1");
  const categories = page.getByRole("group", { name: "商品分类", exact: true });
  await categories.getByRole("button", { name: "新鲜水果", exact: true }).click();
  await expect(page.locator(".product-card")).toHaveCount(10);
  await page.getByRole("button", { name: "Switch to English", exact: true }).click();
  await page.getByRole("textbox", { name: "Search produce or farms", exact: true }).fill("苹果");
  await expect(page.locator(".product-card")).toHaveCount(1);
  await expect(page.locator(".product-card")).toContainText("Apples");
  await expect(page.locator(".product-bottom")).toContainText("$4.00 / box");
  await page.getByRole("button", { name: "View Apples", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Crisp, fragrant fruit");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Reset all", exact: true }).click();
  await expect(tomato.locator(".product-quantity-value")).toHaveText("1");
  await page.reload();
  await expect(tomato.locator(".product-quantity-value")).toHaveText("1");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator(".product-toolbar").evaluate((element) => element.scrollIntoView({ block: "start", behavior: "instant" }));
  await page.screenshot({ path: test.info().outputPath("catalog-simple-desktop.png"), animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".results-meta").evaluate((element) => element.scrollIntoView({ block: "start", behavior: "instant" }));
  await page.screenshot({ path: test.info().outputPath("catalog-simple-phone.png"), animations: "disabled" });
});

test("长名称和数量控件在手机及桌面内可读，售罄仍可查看", async ({ page }) => {
  await page.route("**/api/products", async (route) => {
    const response = await route.fetch();
    const products = await response.json();
    products[0].name = "Extra-long farm selection with a full product name";
    products[1].stock = 0;
    await route.fulfill({ json: products });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Switch to English", exact: true }).click();
  await page.locator('.product-card[data-product-id="1"] .product-add button').click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const failures = await page.locator(".product-card").evaluateAll((cards) => cards.flatMap((card) => {
      const bounds = card.getBoundingClientRect();
      return Array.from(card.querySelectorAll<HTMLElement>(".product-name, .product-quantity, .product-add")).filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left < bounds.left || rect.right > bounds.right + 1 || element.scrollWidth > element.clientWidth + 1;
      }).map((element) => element.className);
    }));
    expect(failures, `${width}px`).toEqual([]);
  }
  const broccoli = page.locator('.product-card[data-product-id="2"]');
  await expect(broccoli.locator(".add-button")).toBeDisabled();
  await expect(broccoli.locator(".sold-out")).toHaveText("Sold out today");
  await broccoli.getByRole("button", { name: "View Farm-fresh Broccoli", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Farm-fresh Broccoli");
});
