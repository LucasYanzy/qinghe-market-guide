import { expect } from "@playwright/test";
import { test } from "./isolated";

test("绿色小圆飞入首次出现的购物袋，落点有接收反馈且圆点自动清理", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "将藤熟番茄加入购物袋", exact: true }).click();
  const dot = page.locator(".cart-flight-dot");
  await expect(dot).toHaveCount(1);
  await expect(dot).toHaveCSS("background-color", "rgb(77, 119, 61)");
  await expect(dot).toHaveCSS("pointer-events", "none");
  await expect(dot.locator("svg, img")).toHaveCount(0);
  const flight = await dot.evaluate((element) => {
    const effect = element.getAnimations()[0]?.effect as KeyframeEffect;
    const frames = effect.getKeyframes();
    const last = new DOMMatrix(frames.at(-1)!.transform as string);
    const target = document.querySelector(".basket-dock [data-cart-target]")!.getBoundingClientRect();
    return { x: last.m41 + 11, y: last.m42 + 11, targetX: target.left + target.width / 2, targetY: target.top + target.height / 2 };
  });
  expect(flight.x).toBeCloseTo(flight.targetX, 0);
  expect(flight.y).toBeCloseTo(flight.targetY, 0);
  await expect(page.getByRole("button", { name: "查看购物袋，已选 1 件", exact: true })).toContainText("$3.50");
  await expect(dot).toHaveCount(0);
  await expect(page.locator(".cart-receipt")).toHaveText("+1");
  await expect(page.locator(".cart-receipt")).toHaveCount(0);
  await expect.poll(() => page.locator(".basket-dock [data-cart-target]").evaluate((element) => element.getAnimations().length)).toBe(0);
});

test("4 倍 CPU 减速下连续加购至多 3 个圆点，全部数量立即入袋且可继续操作", async ({ page, context }) => {
  const session = await context.newCDPSession(page);
  await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const add = page.getByRole("button", { name: "将藤熟番茄加入购物袋", exact: true });
  await add.scrollIntoViewIfNeeded();
  await add.evaluate((button: HTMLButtonElement) => {
    for (let i = 0; i < 12; i++) button.click();
  });
  await expect(page.getByRole("button", { name: /^购物袋/ })).toContainText("12");
  await expect(page.locator(".product-quantity")).toContainText("12");
  await expect.poll(() => page.locator(".cart-flight-dot").count()).toBeGreaterThan(0);
  expect(await page.locator(".cart-flight-dot").count()).toBeLessThanOrEqual(3);
  await expect(page.locator(".cart-flight-dot")).toHaveCount(0);
  await page.getByRole("button", { name: "查看购物袋，已选 12 件", exact: true }).click();
  const cart = page.getByRole("dialog", { name: "我的新鲜购物袋" });
  await expect(cart.locator(".quantity-control")).toContainText("12");
  await expect(cart.locator(".cart-total")).toContainText("$42.00");
  await cart.getByLabel("减少藤熟番茄").click();
  await expect(cart.locator(".cart-total")).toContainText("$38.50");
  await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });
});

test("详情页圆点飞向弹窗内购物袋，购物袋入口可直接继续预购", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "查看藤熟番茄", exact: true }).click();
  const detail = page.getByRole("dialog", { name: "这份新鲜的故事" });
  await detail.getByRole("button", { name: "加入购物袋", exact: true }).click();
  const dot = page.locator(".cart-flight-dot");
  await expect(dot).toHaveCount(1);
  const end = await dot.evaluate((element) => {
    const frames = (element.getAnimations()[0].effect as KeyframeEffect).getKeyframes();
    const matrix = new DOMMatrix(frames.at(-1)!.transform as string);
    const rect = document.querySelector(".detail-cart-actions [data-cart-target]")!.getBoundingClientRect();
    return { x: matrix.m41 + 11, y: matrix.m42 + 11, targetX: rect.left + rect.width / 2, targetY: rect.top + rect.height / 2 };
  });
  expect(end.x).toBeCloseTo(end.targetX, 0);
  expect(end.y).toBeCloseTo(end.targetY, 0);
  await detail.getByRole("button", { name: "购物袋", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "我的新鲜购物袋" })).toContainText("藤熟番茄");
  await expect(dot).toHaveCount(0);
});

test("滚动、切页和减少动态效果会清理动画，数量保持正确", async ({ page }) => {
  await page.goto("/");
  const add = page.getByRole("button", { name: "将藤熟番茄加入购物袋", exact: true });
  await add.click();
  await expect(page.locator(".cart-flight-dot")).toHaveCount(1);
  await page.evaluate(() => window.scrollBy(0, 40));
  await expect(page.locator(".cart-flight-dot")).toHaveCount(0);
  await add.click();
  await expect(page.locator(".cart-flight-dot")).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".cart-flight-dot")).toHaveCount(0);
  await add.click();
  await expect(page.getByRole("button", { name: /^购物袋/ })).toContainText("3");
  await expect(page.locator(".cart-flight-dot")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await add.click();
  await expect(page.locator(".cart-flight-dot")).toHaveCount(1);
  await page.getByRole("navigation", { name: "页脚导航", exact: true }).getByRole("link", { name: "关于青禾", exact: true }).click();
  await expect(page.locator(".cart-flight-dot")).toHaveCount(0);
  await expect(page.locator(".cart-flight-layer")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^购物袋/ })).toContainText("4");
});

test("浏览器缺少 Web Animations API 时仍能正常加购和调整数量", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Element.prototype, "animate", { value: undefined, configurable: true });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "将藤熟番茄加入购物袋", exact: true }).click();
  await expect(page.getByRole("button", { name: /^购物袋/ })).toContainText("1");
  await expect(page.locator(".cart-flight-dot")).toHaveCount(0);
  await page.getByRole("button", { name: "减少藤熟番茄", exact: true }).click();
  await expect(page.getByRole("button", { name: /^购物袋/ })).toContainText("0");
});

test("连续点击超过库存时只为实际入袋数量播放飞行动画", async ({ page }) => {
  await page.route("**/api/products", async (route) => {
    const response = await route.fetch();
    const products = await response.json();
    await route.fulfill({ json: products.map((product: { stock: number }) => ({ ...product, stock: 2 })) });
  });
  await page.goto("/");
  const add = page.getByRole("button", { name: "将藤熟番茄加入购物袋", exact: true });
  await add.scrollIntoViewIfNeeded();
  await add.evaluate((button: HTMLButtonElement) => {
    for (let i = 0; i < 20; i++) button.click();
  });
  await expect(page.locator(".cart-flight-dot")).toHaveCount(2);
  await expect(page.getByRole("button", { name: /^购物袋/ })).toContainText("2");
  await expect(add).toBeDisabled();
  await expect(page.locator(".cart-flight-dot")).toHaveCount(0);
});
