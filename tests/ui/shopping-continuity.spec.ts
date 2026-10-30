import { expect, type Page } from "@playwright/test";
import { test } from "./isolated";
import type { Product } from "../../src/types";

const storageKey = "qinghe-shopping-draft";
const bag = (page: Page) => page.getByRole("dialog", { name: "我的新鲜购物袋", exact: true });
const add = (page: Page) => page.getByRole("button", { name: "将藤熟番茄加入购物袋", exact: true });
const open = (page: Page) => page.getByRole("button", { name: /^购物袋/ }).click();

async function choose(page: Page, quantity = 1) {
  await page.goto("/");
  for (let i = 0; i < quantity; i++) await add(page).click();
  await open(page);
  return bag(page);
}

async function login(page: Page) {
  const response = await page.request.post("/api/auth/login", {
    data: { email: "client@qinghe.demo", password: "MarketDemo2026!" },
  });
  expect(response.ok()).toBe(true);
}

test("游客刷新后恢复数量、自提草稿，价格和库存仍读取最新服务端数据", async ({ page }) => {
  const cart = await choose(page, 2);
  await cart.getByRole("textbox").fill("刷新也请保留");
  const slot = await cart.getByLabel("选择自提时段").selectOption({ index: 1 });
  await page.route("**/api/products", async (route) => {
    const response = await route.fetch();
    const products: Product[] = await response.json();
    await route.fulfill({ json: products.map((product) => product.name === "藤熟番茄" ? { ...product, price_cents: 450, stock: 1 } : product) });
  });
  await page.reload();
  await expect(page.getByRole("button", { name: /^购物袋/ })).toContainText("2");
  await expect(page.locator(".cart-flight-dot")).toHaveCount(0);
  await open(page);
  await expect(cart.getByRole("textbox")).toHaveValue("刷新也请保留");
  await expect(cart.getByLabel("选择自提时段")).toHaveValue(slot[0]);
  await expect(cart.locator(".cart-total")).toContainText("$9.00");
  await expect(cart.getByText("当前仅剩 1 磅", { exact: true })).toBeVisible();
  await expect(cart.getByRole("button", { name: "登录后预购" })).toBeDisabled();
});

test("同一顾客刷新后继续确认，下单成功后刷新不会恢复已提交的购物袋", async ({ page }) => {
  await login(page);
  const cart = await choose(page);
  await cart.getByRole("textbox").fill("恢复后手动确认");
  await page.reload();
  await open(page);
  await expect(cart.getByRole("textbox")).toHaveValue("恢复后手动确认");
  let submissions = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/orders") && request.method() === "POST") submissions++;
  });
  await cart.getByRole("button", { name: "确认预购", exact: true }).click();
  await expect(page).toHaveURL("/orders");
  await expect(page.locator(".order-note").filter({ hasText: "恢复后手动确认" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /^购物袋/ })).toContainText("0");
  await open(page);
  await expect(cart.getByRole("heading", { name: "购物袋在等一份新鲜" })).toBeVisible();
  expect(submissions).toBe(1);
  expect(await page.evaluate((key) => sessionStorage.getItem(key), storageKey)).toBeNull();
});

for (const nextAccount of ["guest", "different", "retailer"] as const) {
  test(`刷新后账号变为 ${nextAccount} 时清空上一位顾客的草稿`, async ({ page }) => {
    await login(page);
    const cart = await choose(page);
    await cart.getByRole("textbox").fill("只属于原顾客");
    if (nextAccount === "different") {
      const response = await page.request.post("/api/auth/register", {
        data: { name: "另一位顾客", email: `session-${Date.now()}@example.test`, password: "SessionFlow2026!" },
      });
      expect(response.ok()).toBe(true);
    } else if (nextAccount === "retailer") {
      const response = await page.request.post("/api/auth/login", { data: { email: "retailer@qinghe.demo", password: "MarketDemo2026!" } });
      expect(response.ok()).toBe(true);
    } else await page.request.post("/api/auth/logout");
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect.poll(() => page.evaluate((key) => sessionStorage.getItem(key), storageKey)).toBeNull();
    if (nextAccount !== "retailer") {
      await expect(page.getByRole("button", { name: /^购物袋/ })).toContainText("0");
      await add(page).click();
      await open(page);
      await expect(cart.getByRole("textbox")).toHaveValue("");
    }
  });
}

test("退出登录后刷新不会恢复之前的购物袋", async ({ page }) => {
  await login(page);
  const cart = await choose(page);
  await cart.getByRole("textbox").fill("退出后清空");
  await cart.getByLabel("关闭弹窗").click();
  await expect(cart).not.toBeVisible();
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("已退出登录");
  await page.reload();
  await expect(page.getByRole("button", { name: /^购物袋/ })).toContainText("0");
  expect(await page.evaluate((key) => sessionStorage.getItem(key), storageKey)).toBeNull();
});

test("跨日和损坏的本地草稿不会进入购物袋", async ({ page }) => {
  await page.goto("/");
  const config = await (await page.request.get("/api/config")).json();
  const cases = [
    "not-json",
    JSON.stringify({ version: 1, date: "2000-01-01", ownerId: null, cart: { 1: 2 }, checkout: { slot: "", note: "昨天的草稿" } }),
    JSON.stringify({ version: 1, date: config.today, ownerId: null, cart: { 1: 999 }, checkout: { slot: "", note: "非法数量" } }),
  ];
  for (const value of cases) {
    await page.evaluate(({ key, value }) => sessionStorage.setItem(key, value), { key: storageKey, value });
    await page.reload();
    await expect(page.getByRole("button", { name: /^购物袋/ })).toContainText("0");
    await expect.poll(() => page.evaluate((key) => sessionStorage.getItem(key), storageKey)).toBeNull();
  }
});

test("长时间打开的购物袋跨日时清空旧日期的商品和自提草稿", async ({ page }) => {
  const cart = await choose(page);
  await cart.getByRole("textbox").fill("旧日期备注");
  await page.route("**/api/config", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ json: { ...await response.json(), today: "2099-01-01" } });
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(cart.getByRole("heading", { name: "购物袋在等一份新鲜" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("市集日期已更新");
  await expect(cart.getByRole("button", { name: "撤销", exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate((key) => sessionStorage.getItem(key), storageKey)).toBeNull();
});

test("浏览器禁用存储时仍可选菜并填写购物袋", async ({ page }) => {
  await page.addInitScript(() => {
    for (const method of ["getItem", "setItem", "removeItem"]) {
      Object.defineProperty(Storage.prototype, method, { configurable: true, value: () => { throw new DOMException("blocked", "SecurityError"); } });
    }
  });
  const cart = await choose(page);
  await cart.getByRole("textbox").fill("无存储也可操作");
  await cart.getByLabel("增加藤熟番茄").click();
  await expect(cart.locator(".quantity-control")).toHaveText("2");
  await cart.getByRole("button", { name: "登录后预购" }).click();
  await expect(page.getByRole("dialog", { name: "你好，欢迎来到青禾" })).toBeVisible();
});

test("移除最后一项可以撤销，库存下降时按最新数量恢复且只撤销一次", async ({ page }) => {
  const cart = await choose(page, 3);
  await cart.getByRole("textbox").fill("撤销仍保留备注");
  await cart.getByLabel("移除藤熟番茄", { exact: true }).click();
  await expect(cart.getByRole("heading", { name: "购物袋在等一份新鲜" })).toBeVisible();
  const undo = cart.getByRole("button", { name: "撤销", exact: true });
  await expect(undo).toBeFocused();
  await page.route("**/api/products", async (route) => {
    const response = await route.fetch();
    const products: Product[] = await response.json();
    await route.fulfill({ json: products.map((product) => product.name === "藤熟番茄" ? { ...product, stock: 1 } : product) });
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => page.evaluate(() => document.querySelector(".stock-label")?.textContent)).toContain("1");
  await undo.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(cart.locator(".quantity-control")).toHaveText("1");
  await expect(cart.getByLabel("增加藤熟番茄")).toBeDisabled();
  await expect(cart.getByLabel("减少藤熟番茄")).toBeFocused();
  await expect(cart.getByRole("textbox")).toHaveValue("撤销仍保留备注");
  await expect(cart.getByRole("status")).toHaveText("库存已变化，已按可购数量恢复。");
  await expect(undo).toHaveCount(0);
});

test("减到零后可撤销；已下架商品不会被撤销操作重新加入", async ({ page }) => {
  const cart = await choose(page);
  await cart.getByLabel("减少藤熟番茄").click();
  await expect(cart.getByRole("button", { name: "撤销", exact: true })).toBeVisible();
  await page.route("**/api/products", (route) => route.fulfill({ json: [] }));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".product-card")).toHaveCount(0);
  await cart.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(cart.getByRole("status")).toHaveText("这份商品暂不可购，请选择其他新鲜。");
  await expect(cart.getByRole("heading", { name: "购物袋在等一份新鲜" })).toBeVisible();
});

test("320px 英文撤销提示和按钮可用且没有横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const cart = await choose(page);
  await cart.getByLabel("移除藤熟番茄", { exact: true }).click();
  await cart.getByLabel("关闭弹窗").click();
  await expect(cart).not.toBeVisible();
  await page.getByRole("button", { name: "Switch to English", exact: true }).click();
  await page.getByRole("button", { name: /^Shopping bag/ }).click();
  // A removal can be undone while its shopping bag remains open.
  await page.getByRole("dialog").getByRole("button", { name: "Keep shopping", exact: true }).click();
  await page.getByRole("button", { name: "Add Vine-ripened Tomatoes to bag", exact: true }).click();
  await page.getByRole("button", { name: /^Shopping bag/ }).click();
  const englishBag = page.getByRole("dialog");
  await englishBag.getByRole("button", { name: "Remove Vine-ripened Tomatoes", exact: true }).click();
  await expect(englishBag.locator(".cart-undo")).toContainText("Removed Vine-ripened Tomatoes");
  await expect(englishBag.getByRole("button", { name: "Undo", exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await englishBag.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(englishBag.locator(".quantity-control")).toHaveText("1");
});
