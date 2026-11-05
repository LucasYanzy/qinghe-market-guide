import { expect } from "@playwright/test";
import { test } from "./isolated";

test("商品卡片直接加减，手机购物袋入口随时可用，移除最后一件后键盘焦点保留", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/");
  const card = page.locator(".product-card").filter({ has: page.getByRole("button", { name: "藤熟番茄", exact: true }) });
  const add = card.getByRole("button", { name: "将藤熟番茄加入购物袋", exact: true });
  await add.click(); await add.click();
  const dock = page.getByRole("button", { name: "查看购物袋，已选 2 件", exact: true });
  await expect(dock).toBeInViewport();
  await expect(dock).toContainText("$7.00");
  const dockFits = await dock.evaluate((element) => element.scrollWidth <= element.clientWidth);
  expect(dockFits).toBe(true);
  const controlsFit = await card.locator(".product-quantity").evaluate((element) => {
    const controls = element.getBoundingClientRect(); const card = element.closest(".product-card")!.getBoundingClientRect();
    return controls.left >= card.left && controls.right <= card.right;
  });
  expect(controlsFit).toBe(true);
  const quantity = card.locator(".product-quantity-value");
  await expect(quantity).toHaveText("2");
  const reduce = card.getByRole("button", { name: "减少藤熟番茄", exact: true });
  await reduce.click(); await reduce.focus(); await page.keyboard.press("Enter");
  await expect(page.locator(".shopping-bag-dock")).toHaveCount(0);
  await expect(add).toBeFocused();
  await add.click();
  await page.locator(".visitor-footer").scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "查看购物袋，已选 1 件", exact: true }).click();
  const cart = page.getByRole("dialog", { name: "我的新鲜购物袋" });
  await expect(cart).toContainText("藤熟番茄");
  const products = await (await page.request.get("/api/products")).json();
  const product = products.find((item: { name: string }) => item.name === "藤熟番茄");
  await expect(cart.locator(".pickup-box")).toContainText(product.market_address);
  await expect(page.locator(".shopping-bag-dock")).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("刷新恢复当前标签页的商品、备注和时段，登录后仍需明确确认下单", async ({ page }) => {
  let submissions = 0;
  page.on("request", (request) => { if (request.url().endsWith("/api/orders") && request.method() === "POST") submissions++; });
  await page.goto("/");
  await page.getByRole("button", { name: "将藤熟番茄加入购物袋", exact: true }).click();
  await page.getByRole("button", { name: /^购物袋/ }).click();
  const cart = page.getByRole("dialog", { name: "我的新鲜购物袋" });
  const selected = await cart.getByLabel("选择自提时段").selectOption({ index: 1 });
  await cart.getByRole("textbox").fill("保留我的备注");
  await page.reload();
  await page.getByRole("button", { name: "查看购物袋，已选 1 件", exact: true }).click();
  await expect(cart.getByRole("textbox")).toHaveValue("保留我的备注");
  await expect(cart.getByLabel("选择自提时段")).toHaveValue(selected[0]);
  await cart.getByRole("button", { name: "登录后预购" }).click();
  await page.getByRole("button", { name: /顾客端演示/ }).click();
  await expect(cart.getByRole("textbox")).toHaveValue("保留我的备注");
  await page.reload();
  await page.getByRole("button", { name: "查看购物袋，已选 1 件", exact: true }).click();
  await expect(cart.getByRole("textbox")).toHaveValue("保留我的备注");
  expect(submissions).toBe(0);
  await cart.getByRole("button", { name: "确认预购", exact: true }).click();
  await cart.getByRole("button", { name: "确认并提交预购", exact: true }).click();
  await expect(page).toHaveURL(/\/orders$/);
  expect(submissions).toBe(1);
  await page.reload();
  await expect(page.locator(".shopping-bag-dock")).toHaveCount(0);
});

test("会话失效后不会恢复其他账号的购物袋", async ({ page }) => {
  await page.request.post("/api/auth/login", { data: { email: "client@qinghe.demo", password: "MarketDemo2026!" } });
  await page.goto("/");
  await page.getByRole("button", { name: "将藤熟番茄加入购物袋", exact: true }).click();
  await expect(page.locator(".shopping-bag-dock")).toBeVisible();
  await page.request.post("/api/auth/logout");
  await page.reload();
  await expect(page.getByRole("button", { name: /^购物袋/ })).toContainText("0");
  await expect(page.locator(".shopping-bag-dock")).toHaveCount(0);
});

test("自提时段请求失败可原地重试，商品和备注保持", async ({ page }) => {
  await page.route("**/api/checkout/options?*", (route) => route.fulfill({ status: 503, json: { error: "Unavailable" } }));
  await page.goto("/");
  await page.getByRole("button", { name: "将藤熟番茄加入购物袋", exact: true }).click();
  await page.getByRole("button", { name: /^购物袋/ }).click();
  const cart = page.getByRole("dialog", { name: "我的新鲜购物袋" });
  await cart.getByRole("textbox").fill("保留我的备注");
  await expect(cart.getByRole("alert")).toContainText("自提时段加载失败");
  await expect(cart.getByRole("button", { name: "登录后预购" })).toBeDisabled();
  await page.unroute("**/api/checkout/options?*");
  await cart.getByRole("button", { name: "重新加载时段", exact: true }).click();
  await expect(cart.getByLabel("选择自提时段")).toBeEnabled();
  await expect(cart.getByRole("button", { name: "登录后预购" })).toBeEnabled();
  await expect(cart.getByRole("textbox")).toHaveValue("保留我的备注");
  await expect(cart).toContainText("藤熟番茄");
});

test("辅助页面空购物袋可直接回到商品，筛选支持点外部和 Escape 关闭", async ({ page }) => {
  await page.goto("/help");
  await page.getByRole("button", { name: /^购物袋/ }).click();
  await page.getByRole("button", { name: "继续逛逛", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(page.locator("#today-produce")).toBeInViewport();
  const summary = page.locator(".product-filter-options > summary");
  await summary.click(); await page.getByLabel("商品排序", { exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(summary).toBeFocused();
  await expect(page.getByLabel("商品排序", { exact: true })).not.toBeVisible();
  await summary.click();
  await page.getByLabel("搜索商品或农场", { exact: true }).click();
  await expect(page.getByLabel("商品排序", { exact: true })).not.toBeVisible();
});
