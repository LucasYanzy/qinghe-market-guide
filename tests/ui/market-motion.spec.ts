import { expect, type Locator } from "@playwright/test";
import { test } from "./isolated";

async function expectHighlightAligned(tabs: Locator) {
  await expect.poll(() => tabs.evaluate((element) => {
    const selected = element.querySelector('button[aria-pressed="true"]')!.getBoundingClientRect();
    const indicator = element.querySelector(".motion-tabs-indicator")!.getBoundingClientRect();
    return Math.max(Math.abs(selected.x - indicator.x), Math.abs(selected.y - indicator.y), Math.abs(selected.width - indicator.width), Math.abs(selected.height - indicator.height));
  })).toBeLessThan(1);
}

test("分类选中背景跟随键盘选择、中英切换及手机换行", async ({ page }) => {
  await page.goto("/");
  const tabs = page.locator(".product-toolbar .motion-tabs");
  await expectHighlightAligned(tabs);
  const fruit = tabs.getByRole("button", { name: "新鲜水果", exact: true });
  await fruit.focus();
  await page.keyboard.press("Enter");
  await expect(fruit).toBeFocused();
  await expect(page.locator(".product-card")).toHaveCount(10);
  await expectHighlightAligned(tabs);
  await page.getByRole("button", { name: "Switch to English", exact: true }).click();
  await expectHighlightAligned(tabs);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    await tabs.getByRole("button", { name: "Farm specialties", exact: true }).click();
    await expect(page.locator(".product-card")).toHaveCount(1);
    await expectHighlightAligned(tabs);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await tabs.getByRole("button", { name: "All produce", exact: true }).click();
    await expectHighlightAligned(tabs);
  }
  await page.getByRole("navigation", { name: "Main navigation", exact: true }).getByRole("link", { name: "Markets & directions", exact: true }).click();
  const regions = page.locator(".guide-toolbar .motion-tabs");
  await regions.getByRole("button", { name: "Rutgers campuses", exact: true }).click();
  await expectHighlightAligned(regions);
});

test("加购前后卡片和加号位置稳定，数量归零可继续键盘操作", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const card = page.locator(".product-card").filter({ hasText: "藤熟番茄" });
  await card.scrollIntoViewIfNeeded();
  await card.evaluate(async (element) => {
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    await Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => {})));
  });
  const add = card.getByRole("button", { name: "将藤熟番茄加入购物袋", exact: true });
  const before = await card.evaluate((element) => {
    const button = element.querySelector(".product-controls .add-button")!.getBoundingClientRect();
    return { height: element.getBoundingClientRect().height, x: button.x + button.width / 2, y: button.y + button.height / 2 };
  });
  await add.focus();
  await page.keyboard.press("Enter");
  await expect(card.locator(".product-quantity-value")).toHaveText("1");
  await expect(card.locator(".product-picked")).toBeVisible();
  const after = await card.evaluate((element) => {
    const button = element.querySelector(".product-controls .has-quantity")!.getBoundingClientRect();
    return { height: element.getBoundingClientRect().height, x: button.x + button.width / 2, y: button.y + button.height / 2 };
  });
  expect(Math.abs(before.height - after.height)).toBeLessThan(1);
  expect(Math.abs(before.x - after.x)).toBeLessThan(1);
  expect(Math.abs(before.y - after.y)).toBeLessThan(1);
  await card.getByRole("button", { name: "减少藤熟番茄", exact: true }).click();
  await expect(card.locator(".product-picked")).toHaveCount(0);
  await expect(add).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(card.locator(".product-quantity-value")).toHaveText("1");
  await expect(page.locator(".shopping-bag-dock")).toContainText("$3.50");
  await expect.poll(() => page.evaluate(() => {
    const bag = document.querySelector(".shopping-bag-dock")!.getBoundingClientRect();
    const top = document.querySelector(".back-to-top")!.getBoundingClientRect();
    return bag.top - top.bottom;
  })).toBeGreaterThan(0);
  await page.screenshot({ path: test.info().outputPath("market-phone.png"), animations: "disabled" });
});

test("快速排序保留商品节点和焦点，动态偏好变更会停止过渡", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("group", { name: "商品分类", exact: true }).getByRole("button", { name: "果实类", exact: true }).click();
  const card = page.locator('.product-card[data-product-id="1"]');
  const original = await card.elementHandle();
  await page.locator(".product-filter-options > summary").click();
  const sort = page.getByLabel("商品排序", { exact: true });
  await sort.focus();
  await sort.selectOption("price-down");
  await sort.selectOption("price-up");
  await sort.selectOption("recommended");
  await expect(sort).toBeFocused();
  expect(await card.evaluate((element, previous) => element === previous, original)).toBe(true);
  await expect(page.locator(".product-card")).toHaveCount(13);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === "running").length)).toBe(0);
  await sort.selectOption("price-up");
  await page.locator(".product-filter-options > summary").click();
  await page.getByRole("button", { name: "将藤熟番茄加入购物袋", exact: true }).click();
  await expect(page.locator(".shopping-bag-dock")).toContainText("$3.50");
  expect(await page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === "running").length)).toBe(0);
});
