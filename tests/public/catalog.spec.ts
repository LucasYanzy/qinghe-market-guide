import { test, expect } from "@playwright/test";

test("research products filter and search in both languages without overflowing on phones", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator(".product-card")).toHaveCount(38);
  const categories = page.getByRole("group", { name: "Product categories", exact: true });
  await categories.getByRole("button", { name: "Fresh fruit", exact: true }).click();
  await expect(page.locator(".product-card")).toHaveCount(10);
  await expect(page.getByRole("button", { name: "View Apples", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Search produce or farms", exact: true }).fill("苹果");
  await expect(page.locator(".product-card")).toHaveCount(1);
  await expect(page.locator(".product-card")).toContainText("Apples");
  await page.getByRole("textbox", { name: "Search produce or farms", exact: true }).fill("");
  await page.getByRole("button", { name: "切换为中文", exact: true }).click();
  await expect(page.locator(".product-card")).toHaveCount(10);
  await expect(page.locator(".product-card").filter({ hasText: "苹果" })).toContainText("$4.00");
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.getByRole("group", { name: "商品分类", exact: true }).getByRole("button", { name: "农场特产", exact: true }).click();
    await expect(page.locator(".product-card")).toHaveCount(1);
    await expect(page.locator(".product-card")).toContainText("本地蜂蜜");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("group", { name: "商品分类", exact: true }).getByRole("button", { name: "新鲜水果", exact: true }).click();
    await expect(page.locator(".product-card")).toHaveCount(10);
  }
  await page.locator("#today-produce").evaluate((element) => element.scrollIntoView({ block: "start", behavior: "instant" }));
  await page.screenshot({ path: test.info().outputPath("fruit-desktop.png"), animations: "disabled" });
});

test("new product packaging survives merchant editing, checkout and refresh", async ({ page }) => {
  await page.goto("./");
  const toolbar = page.locator(".interactive-demo-toolbar");
  await toolbar.getByRole("button", { name: "Vendor", exact: true }).click();
  await page.getByRole("navigation", { name: "Main navigation", exact: true }).getByRole("link", { name: "Products & inventory", exact: true }).click();
  const honey = page.getByRole("row").filter({ hasText: "Local Honey" });
  await honey.getByRole("button", { name: /Edit/ }).click();
  const editor = page.getByRole("dialog");
  await expect(editor.getByRole("combobox", { name: "Product categories", exact: true })).toHaveValue("农场特产");
  await expect(editor.getByRole("combobox", { name: "Product illustration", exact: true })).toHaveValue("honey");
  await expect(editor.getByRole("combobox", { name: "Pricing unit", exact: true })).toHaveValue("瓶");
  await editor.getByLabel("Price (USD)", { exact: true }).fill("16.50");
  await editor.getByRole("button", { name: "Save product", exact: true }).click();
  await expect(editor).not.toBeVisible();
  await toolbar.getByRole("button", { name: "Customer", exact: true }).click();
  await page.getByRole("button", { name: "Add Local Honey to bag", exact: true }).click();
  await page.getByRole("button", { name: "Add Local Honey to bag", exact: true }).click();
  await page.getByRole("button", { name: "Shopping bag 2", exact: true }).click();
  const bag = page.getByRole("dialog");
  await expect(bag).toContainText("$33.00");
  await bag.getByRole("button", { name: "Place preorder", exact: true }).click();
  await bag.getByRole("button", { name: "Confirm and submit preorder", exact: true }).click();
  await expect(page.locator(".order-card")).toContainText("Local Honey");
  await expect(page.locator(".order-card")).toContainText("$33.00");
  await page.reload();
  await expect(page.locator(".order-card")).toContainText("Local Honey");
  await toolbar.getByRole("button", { name: "Customer", exact: true }).click();
  await page.getByRole("navigation", { name: "Main navigation", exact: true }).getByRole("link", { name: "Shop the market", exact: true }).click();
  await expect(page.locator(".product-card").filter({ hasText: "Local Honey" })).toContainText("14 jars");
});
