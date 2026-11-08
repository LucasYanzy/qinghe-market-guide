import { expect } from "@playwright/test";
import { test } from "./isolated";

test("列表与卡片共用数量、筛选和语言状态，刷新记住显示方式", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".product-card")).toHaveCount(38);
  const tomato = page.locator('.product-card[data-product-id="1"]');
  const original = await tomato.elementHandle();
  await tomato.getByRole("button", { name: "将藤熟番茄加入购物袋", exact: true }).click();
  await page.getByRole("button", { name: "列表视图", exact: true }).click();
  await expect(page.locator(".product-list")).toBeVisible();
  expect(await tomato.evaluate((element, before) => element === before, original)).toBe(true);
  await expect(tomato.locator(".product-quantity-value")).toHaveText("1");
  await expect(tomato.locator(".catalog-in-bag")).toHaveText("已选 1");
  await page.getByRole("group", { name: "商品分类", exact: true }).getByRole("button", { name: "新鲜水果", exact: true }).click();
  await expect(page.locator(".product-card")).toHaveCount(10);
  await page.getByRole("button", { name: "Switch to English", exact: true }).click();
  await expect(page.getByRole("button", { name: "List view", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("textbox", { name: "Search produce or farms", exact: true }).fill("苹果");
  await expect(page.locator(".product-card")).toHaveCount(1);
  await expect(page.locator(".catalog-pricing-unit")).toHaveText("Priced per box");
  await page.getByRole("button", { name: "Grid view", exact: true }).click();
  await expect(page.locator(".product-list")).toHaveCount(0);
  await expect(page.locator(".product-card")).toContainText("Apples");
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "List view", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('.product-card[data-product-id="1"] .product-quantity-value')).toHaveText("1");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Grid view", exact: true }).click();
  await page.locator(".product-toolbar").evaluate((element) => element.scrollIntoView({ block: "start", behavior: "instant" }));
  await page.screenshot({ path: test.info().outputPath("catalog-desktop.png"), animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await page.locator(".results-meta").evaluate((element) => element.scrollIntoView({ block: "start", behavior: "instant" }));
  expect(await page.evaluate(() => {
    const bag = document.querySelector(".shopping-bag-dock")!.getBoundingClientRect();
    const top = document.querySelector(".back-to-top")!.getBoundingClientRect();
    return top.bottom <= bag.top || top.left >= bag.right;
  })).toBe(true);
  await page.screenshot({ path: test.info().outputPath("catalog-phone-list.png"), animations: "disabled" });
});

test("长名称、包装和数量控件在两种视图与手机宽度内可读", async ({ page }) => {
  await page.route("**/api/products", async (route) => {
    const response = await route.fetch();
    const products = await response.json();
    products[0].name = "Extra-long farm selection with a full product name";
    await route.fulfill({ json: products });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Switch to English", exact: true }).click();
  await page.getByRole("group", { name: "Product categories", exact: true }).getByRole("button", { name: "Fruiting vegetables", exact: true }).click();
  await page.locator('.product-card[data-product-id="1"] .product-add button').click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const view of ["Grid view", "List view"]) {
      await page.getByRole("button", { name: view, exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const failures = await page.locator(".catalog-card").evaluateAll((cards) => cards.flatMap((card) => {
        const bounds = card.getBoundingClientRect();
        return Array.from(card.querySelectorAll<HTMLElement>(".product-name, .catalog-price, .catalog-controls-slot")).filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left < bounds.left || rect.right > bounds.right + 1 || element.scrollWidth > element.clientWidth + 1;
        }).map((element) => element.className);
      }));
      expect(failures, `${width}px ${view}`).toEqual([]);
    }
  }
  await page.getByRole("button", { name: "Grid view", exact: true }).click();
  await page.locator(".product-toolbar").evaluate((element) => element.scrollIntoView({ block: "start", behavior: "instant" }));
  await page.screenshot({ path: test.info().outputPath("sku-desktop.png"), animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await page.locator(".results-meta").evaluate((element) => element.scrollIntoView({ block: "start", behavior: "instant" }));
  await page.screenshot({ path: test.info().outputPath("sku-phone-list.png"), animations: "disabled" });
});

test("售罄商品可查看但不能加购，包装单位及分类数量准确", async ({ page }) => {
  await page.route("**/api/products", async (route) => {
    const response = await route.fetch();
    const products = await response.json();
    products[0].stock = 0;
    await route.fulfill({ json: products });
  });
  await page.goto("/");
  const tomato = page.locator('.product-card[data-product-id="1"]');
  await expect(tomato.locator(".add-button")).toBeDisabled();
  await expect(tomato.locator(".sold-out")).toHaveText("今日售罄");
  await page.getByRole("button", { name: "列表视图", exact: true }).click();
  await tomato.getByRole("button", { name: "查看藤熟番茄", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("藤熟番茄");
  await page.keyboard.press("Escape");
  const categories = page.getByRole("group", { name: "商品分类", exact: true });
  await expect(categories.getByRole("button", { name: "新鲜水果", exact: true }).locator(".catalog-category-count")).toHaveText("10");
  await categories.getByRole("button", { name: "农场特产", exact: true }).click();
  await expect(page.locator(".product-card")).toHaveCount(1);
  await expect(page.locator(".catalog-pricing-unit")).toHaveText("按瓶计价");
  await expect(page.locator(".catalog-price")).toHaveText("$15.00 / 瓶");
});
