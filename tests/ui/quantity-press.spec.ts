import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./isolated";

const tomato = (page: Page) => page.getByRole("button", { name: "将藤熟番茄加入购物袋", exact: true });
const count = (page: Page) => page.locator(".product-quantity > span").first();

async function press(page: Page, button: Locator) {
  await button.scrollIntoViewIfNeeded();
  await button.hover();
  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
}

async function freeze(page: Page) {
  // Freeze just the repeat clock; all actions below use native pointer events.
  await page.clock.install({ time: new Date("2030-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2030-01-01T00:00:01Z"));
}

test("单击仍只加一份；长按逐步增加，松开不再追加且不刷飞行动画和通知", async ({ page }) => {
  await page.goto("/");
  const add = tomato(page);
  await add.click();
  await expect(count(page)).toHaveText("1");
  await page.getByRole("button", { name: "关闭提示", exact: true }).click();
  await add.hover();
  await freeze(page);
  await press(page, add);
  await page.clock.runFor(740);
  await expect(count(page)).toHaveText("4");
  await expect(page.locator("[data-repeating]")).toHaveCount(1);
  await expect(page.locator(".cart-flight-dot")).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "已加入购物袋" })).toHaveCount(0);
  await page.mouse.up();
  await page.clock.runFor(1000);
  await expect(count(page)).toHaveText("4");
  await expect(page.locator("[data-repeating]")).toHaveCount(0);
});

for (const action of ["leave", "wheel", "scroll", "blur", "escape"] as const) {
  test(`长按遇到 ${action} 立即停止，重新点击仍然可用`, async ({ page }) => {
    await page.goto("/");
    await tomato(page).click();
    await freeze(page);
    await press(page, tomato(page));
    await page.clock.runFor(600);
    await expect(count(page)).toHaveText("3");
    if (action === "leave") await page.mouse.move(8, 8);
    if (action === "wheel") await page.mouse.wheel(0, 30);
    if (action === "scroll") await page.evaluate(() => window.scrollBy({ top: 30, behavior: "instant" }));
    if (action === "blur") await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    if (action === "escape") await page.keyboard.press("Escape");
    // Native wheel events can reach the page after the input command resolves.
    // Observe cancellation before advancing the mocked repeat clock.
    await expect(page.locator("[data-repeating]")).toHaveCount(0);
    await page.clock.runFor(1000);
    await expect(count(page)).toHaveText("3");
    await page.mouse.up();
    await page.clock.runFor(200);
    await expect(count(page)).toHaveText("3");
    await tomato(page).click();
    await expect(count(page)).toHaveText("4");
  });
}

test("购物袋长按按最新库存停在上限，切换英文显示具体限制", async ({ page }) => {
  await page.route("**/api/products", async (route) => {
    const response = await route.fetch();
    const products = await response.json();
    await route.fulfill({ json: products.map((p: { id: number }) => p.id === 1 ? { ...p, stock: 3 } : p) });
  });
  await page.goto("/");
  await tomato(page).click();
  await page.getByRole("button", { name: "Switch to English", exact: true }).click();
  await page.getByRole("button", { name: /^Shopping bag/ }).click();
  const bag = page.getByRole("dialog", { name: "My shopping bag" });
  const add = bag.getByRole("button", { name: "Increase Vine-ripened Tomatoes", exact: true });
  await freeze(page);
  await press(page, add);
  await page.clock.runFor(1200);
  await expect(bag.locator(".quantity-control")).toHaveText("3");
  await expect(add).toBeDisabled();
  await expect(bag.getByRole("status")).toHaveText("Limit reached: 3 lb");
  await expect(bag.locator(".cart-total")).toContainText("$10.50");
  await page.mouse.up();
  await page.clock.runFor(500);
  await expect(bag.locator(".quantity-control")).toHaveText("3");
});

test("长按仍遵守每种商品 100 份限制，库存较多时显示 100 份上限", async ({ page }) => {
  await page.goto("/");
  const config = await (await page.request.get("/api/config")).json();
  await page.evaluate((date) => sessionStorage.setItem("qinghe-shopping-session-v1", JSON.stringify({
    version: 1, date, ownerId: null, cart: { 1: 99 }, checkout: { slot: "", note: "" },
  })), config.today);
  await page.route("**/api/products", async (route) => {
    const response = await route.fetch();
    const products = await response.json();
    await route.fulfill({ json: products.map((p: { id: number }) => p.id === 1 ? { ...p, stock: 500 } : p) });
  });
  await page.reload();
  await freeze(page);
  await press(page, tomato(page));
  await page.clock.runFor(1000);
  await expect(count(page)).toHaveText("100");
  await expect(tomato(page)).toBeDisabled();
  await expect(page.locator(".product-card").first().getByRole("status")).toHaveText("已达上限 100 磅");
  await page.mouse.up();
});

test("长按减到零后终止，撤销恢复一份且继续减购不会误触其他按钮", async ({ page }) => {
  await page.goto("/");
  await tomato(page).click();
  await tomato(page).click();
  await page.getByRole("button", { name: /^购物袋/ }).click();
  const bag = page.getByRole("dialog", { name: "我的新鲜购物袋" });
  await freeze(page);
  await press(page, bag.getByRole("button", { name: "减少藤熟番茄", exact: true }));
  await page.clock.runFor(450);
  await expect(bag.locator(".quantity-control")).toHaveText("1");
  await page.clock.runFor(550);
  await expect(bag.getByRole("heading", { name: "购物袋在等一份新鲜" })).toBeVisible();
  await page.mouse.up();
  await page.clock.runFor(300);
  await bag.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(bag.locator(".quantity-control")).toHaveText("1");
  await page.clock.runFor(1000);
  await expect(bag.locator(".quantity-control")).toHaveText("1");
});

test("切页后不留长按定时器，键盘仍可单次加减", async ({ page }) => {
  await page.goto("/");
  await tomato(page).click();
  await freeze(page);
  await press(page, tomato(page));
  await page.clock.runFor(600);
  await expect(count(page)).toHaveText("3");
  await page.getByRole("navigation", { name: "主导航", exact: true }).getByRole("link", { name: "关于青禾", exact: true }).click();
  await page.mouse.up();
  await page.clock.runFor(1500);
  await expect(page.getByRole("button", { name: /^购物袋/ })).toContainText("3");
  await page.getByRole("navigation", { name: "主导航", exact: true }).getByRole("link", { name: "逛逛市集", exact: true }).click();
  await tomato(page).focus();
  await page.keyboard.press("Enter");
  await expect(count(page)).toHaveText("4");
});

test("长按中库存降低会立即停止，后续输入仍能正常操作", async ({ page }) => {
  await page.goto("/");
  await tomato(page).click();
  await freeze(page);
  await press(page, tomato(page));
  await page.clock.runFor(450);
  await expect(count(page)).toHaveText("2");
  await page.route("**/api/products", async (route) => {
    const response = await route.fetch();
    const products = await response.json();
    await route.fulfill({ json: products.map((p: { id: number }) => p.id === 1 ? { ...p, stock: 2 } : p) });
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(tomato(page)).toBeDisabled();
  await page.clock.runFor(1200);
  await expect(count(page)).toHaveText("2");
  await page.mouse.up();
  await page.getByRole("button", { name: "减少藤熟番茄", exact: true }).click();
  await expect(count(page)).toHaveText("1");
});

test("触屏点击只加一份，减少动态效果时数量操作照常", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, hasTouch: true, isMobile: true, viewport: { width: 320, height: 844 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  try {
    await page.goto("/");
    await tomato(page).tap();
    await expect(count(page)).toHaveText("1");
    await expect(page.locator("[data-repeating]")).toHaveCount(0);
    await expect(page.locator(".quantity-hint").first()).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await context.close(); }
});
