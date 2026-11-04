import { expect, type Page } from "@playwright/test";
import { test } from "./isolated";
import type { Order, Product } from "../../src/types";

const bag = (page: Page) => page.getByRole("dialog", { name: "我的新鲜购物袋", exact: true });
const addTomato = (page: Page) => page.getByRole("button", { name: "将藤熟番茄加入购物袋", exact: true });

async function signIn(page: Page) {
  const response = await page.request.post("/api/auth/login", {
    data: { email: "client@qinghe.demo", password: "MarketDemo2026!" },
  });
  expect(response.ok()).toBe(true);
}

async function selectTomatoes(page: Page, count = 1) {
  await page.goto("/");
  for (let i = 0; i < count; i++) await addTomato(page).click();
  await page.getByRole("button", { name: /^购物袋/ }).click();
  return bag(page);
}

async function createOrder(page: Page) {
  await signIn(page);
  const products: Product[] = await (await page.request.get("/api/products")).json();
  const config = await (await page.request.get("/api/config")).json();
  const response = await page.request.post("/api/orders", {
    data: { items: [{ productId: products[0].id, quantity: 1 }], pickupSlot: config.pickupSlots[0] },
  });
  expect(response.ok()).toBe(true);
  return await response.json() as Order;
}

test("连续点击按最新数量加减，商品卡和购物袋均不超库存", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  let stock = 2;
  await page.route("**/api/products", async (route) => {
    const response = await route.fetch();
    const products: Product[] = await response.json();
    await route.fulfill({ json: products.map((p) => p.name === "藤熟番茄" ? { ...p, stock } : p) });
  });
  await page.goto("/");
  await addTomato(page).evaluate((button: HTMLButtonElement) => {
    for (let i = 0; i < 20; i++) button.click();
  });
  await expect(page.locator(".product-quantity")).toContainText("2");
  await expect(addTomato(page)).toBeDisabled();
  await page.getByRole("button", { name: /^购物袋/ }).click();
  await expect(bag(page).getByLabel("增加藤熟番茄")).toBeDisabled();
  stock = 5;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(bag(page).getByLabel("增加藤熟番茄")).toBeEnabled();
  await bag(page).getByLabel("增加藤熟番茄").evaluate((button: HTMLButtonElement) => {
    button.click(); button.click();
  });
  await expect(bag(page).locator(".quantity-control")).toHaveText("4");
  await bag(page).getByLabel("减少藤熟番茄").evaluate((button: HTMLButtonElement) => {
    button.click(); button.click(); button.click();
  });
  await expect(bag(page).locator(".quantity-control")).toHaveText("1");
});

test("库存充足时仍遵守服务端每种商品 100 份的上限", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/products", async (route) => {
    const response = await route.fetch();
    const products: Product[] = await response.json();
    await route.fulfill({ json: products.map((p) => ({ ...p, stock: 250 })) });
  });
  await page.goto("/");
  await addTomato(page).evaluate((button: HTMLButtonElement) => {
    for (let i = 0; i < 130; i++) button.click();
  });
  await expect(page.locator(".product-quantity")).toHaveText("100");
  await expect(addTomato(page)).toBeDisabled();
  await page.getByRole("button", { name: /^购物袋/ }).click();
  await expect(bag(page).getByLabel("增加藤熟番茄")).toBeDisabled();
  await bag(page).getByLabel("减少藤熟番茄").click();
  await bag(page).getByLabel("增加藤熟番茄").evaluate((button: HTMLButtonElement) => {
    for (let i = 0; i < 10; i++) button.click();
  });
  await expect(bag(page).locator(".quantity-control")).toHaveText("100");
});

test("从页面下方登录结账后继续选购，保留浏览位置和备注", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await addTomato(page).click();
  await page.evaluate(() => window.scrollTo({ top: 1100, behavior: "instant" }));
  await page.getByRole("button", { name: "查看购物袋，已选 1 件", exact: true }).click();
  const scroll = await page.evaluate(() => window.scrollY);
  await bag(page).getByRole("textbox").fill("继续选购时保留");
  await bag(page).getByRole("button", { name: "登录后预购" }).click();
  await page.getByRole("button", { name: /顾客端演示/ }).click();
  await expect(bag(page)).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(scroll, 0);
  await bag(page).getByRole("button", { name: "继续选购", exact: true }).click();
  await expect(bag(page)).not.toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(scroll, 0);
  await page.getByRole("navigation", { name: "手机快捷导航" }).getByRole("link", { name: "我的预购", exact: true }).click();
  await page.getByRole("button", { name: /^购物袋/ }).click();
  await expect(bag(page).getByRole("textbox")).toHaveValue("继续选购时保留");
  await bag(page).getByRole("button", { name: "继续选购", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(page.locator("#today-produce")).toBeInViewport();
  await expect(page.locator("#today-produce")).toBeFocused();
  await expect(addTomato(page)).toBeVisible();
});

test("详情跟随库存、价格和下架变化，空购物袋可以返回商品页", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "查看藤熟番茄", exact: true }).click();
  const detail = page.getByRole("dialog", { name: "这份新鲜的故事" });
  let removed = false;
  await page.route("**/api/products", async (route) => {
    const response = await route.fetch();
    const products: Product[] = await response.json();
    await route.fulfill({ json: removed ? [] : products.map((p) => p.name === "藤熟番茄" ? { ...p, stock: 0, price_cents: 450 } : p) });
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(detail.getByRole("button", { name: "今日已售罄", exact: true })).toBeDisabled();
  await expect(detail).toContainText("$4.50");
  removed = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(detail.getByRole("heading", { name: "这份新鲜暂时下架了" })).toBeVisible();
  await detail.getByRole("button", { name: "继续逛逛", exact: true }).click();
  await page.getByRole("navigation", { name: "主导航", exact: true }).getByRole("link", { name: "我的预购", exact: true }).click();
  await page.getByRole("button", { name: /^购物袋/ }).click();
  await bag(page).getByRole("button", { name: "继续逛逛", exact: true }).click();
  await expect(page).toHaveURL("/");
});

test("提交遇到库存冲突会读取最新库存，修正后由顾客明确重试", async ({ page }) => {
  await signIn(page);
  const cart = await selectTomatoes(page, 3);
  await cart.getByRole("textbox").fill("库存变动仍保留");
  await page.route("**/api/products", async (route) => {
    const response = await route.fetch();
    const products: Product[] = await response.json();
    await route.fulfill({ json: products.map((p) => p.name === "藤熟番茄" ? { ...p, stock: 1 } : p) });
  });
  let attempts = 0;
  await page.route("**/api/orders", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    attempts++;
    if (attempts === 1) return route.fulfill({ status: 409, json: { error: "库存已变化" } });
    expect(route.request().postDataJSON().items[0].quantity).toBe(1);
    await route.continue();
  });
  await cart.getByRole("button", { name: "确认预购", exact: true }).click();
  await expect(cart.getByText("当前仅剩 1 磅", { exact: true })).toBeVisible();
  await expect(cart.getByRole("button", { name: "确认预购", exact: true })).toBeDisabled();
  expect(attempts).toBe(1);
  await cart.getByRole("button", { name: "调整至可购数量" }).click();
  await expect(cart.getByRole("textbox")).toHaveValue("库存变动仍保留");
  await cart.getByRole("button", { name: "确认预购", exact: true }).click();
  await expect(page).toHaveURL("/orders");
  await expect(page.locator(".order-note").filter({ hasText: "库存变动仍保留" })).toBeVisible();
  expect(attempts).toBe(2);
});

test("结账会话过期后恢复同一顾客的购物袋，连续提交只创建一单", async ({ page }) => {
  await signIn(page);
  const cart = await selectTomatoes(page, 2);
  const slot = await cart.getByLabel("选择自提时段").selectOption({ index: 1 });
  await cart.getByRole("textbox").fill("重新登录继续");
  await page.request.post("/api/auth/logout");
  let submissions = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/orders") && request.method() === "POST") submissions++;
  });
  await cart.getByRole("button", { name: "确认预购", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "你好，欢迎来到青禾" })).toBeVisible();
  await page.getByRole("button", { name: /顾客端演示/ }).click();
  await expect(cart).toBeVisible();
  await expect(cart.getByLabel("选择自提时段")).toHaveValue(slot[0]);
  await expect(cart.getByRole("textbox")).toHaveValue("重新登录继续");
  await expect(cart.locator(".quantity-control")).toHaveText("2");
  expect(submissions).toBe(1);
  await cart.locator("form").evaluate((form: HTMLFormElement) => { form.requestSubmit(); form.requestSubmit(); });
  await expect(page).toHaveURL("/orders");
  await expect(page.locator(".order-note").filter({ hasText: "重新登录继续" })).toBeVisible();
  expect(submissions).toBe(2);
});

test("会话过期后换账号，不带入上一位顾客的购物袋和备注", async ({ page }) => {
  await signIn(page);
  const cart = await selectTomatoes(page);
  await cart.getByRole("textbox").fill("上一位顾客的备注");
  await page.request.post("/api/auth/logout");
  await cart.getByRole("button", { name: "确认预购", exact: true }).click();
  const auth = page.getByRole("dialog", { name: "你好，欢迎来到青禾" });
  await auth.getByRole("button", { name: "注册顾客账号", exact: true }).click();
  const register = page.getByRole("dialog", { name: "加入青禾社区" });
  await register.getByLabel("称呼").fill("新顾客");
  await register.getByLabel("邮箱地址").fill(`flow-${Date.now()}@example.test`);
  await register.getByLabel("密码", { exact: true }).fill("CustomerFlow2026!");
  await register.getByRole("button", { name: "创建顾客账号", exact: true }).click();
  await expect(register).not.toBeVisible();
  await expect(cart).not.toBeVisible();
  await expect(page.getByRole("button", { name: /^购物袋/ })).toContainText("0");
  await addTomato(page).click();
  await page.getByRole("button", { name: /^购物袋/ }).click();
  await expect(cart.getByRole("textbox")).toHaveValue("");
});

test("订单筛选为空可查看全部，取消失败在弹窗内重试并更新操作指引", async ({ page }) => {
  const order = await createOrder(page);
  await page.route("**/api/orders", async (route) => {
    const response = await route.fetch();
    const orders: Order[] = await response.json();
    await route.fulfill({ json: orders.filter((o) => o.id === order.id) });
  });
  await page.goto("/orders");
  const card = page.locator(".order-card").filter({ hasText: order.id });
  await expect(card.locator(".order-next-step")).toContainText("等待商户确认");
  await page.locator(".order-tabs").getByRole("button", { name: /已取消/ }).click();
  await page.getByRole("button", { name: "查看全部订单", exact: true }).click();
  await expect(page.locator(".order-tabs").getByRole("button", { name: /全部订单/ })).toHaveAttribute("aria-pressed", "true");
  await card.getByRole("button", { name: "取消订单", exact: true }).click();
  let attempts = 0;
  await page.route(`**/api/orders/${order.id}/status`, async (route) => {
    attempts++;
    if (attempts === 1) return route.fulfill({ status: 503, json: { error: "暂时无法取消，请重试。" } });
    await route.continue();
  });
  const cancel = page.getByRole("dialog", { name: "取消这份预购？" });
  await cancel.getByRole("button", { name: "确认取消" }).click();
  await expect(cancel.getByRole("alert")).toHaveText("暂时无法取消，请重试。");
  await expect(card.locator(".status-badge")).toHaveText("待商户确认");
  await cancel.getByRole("button", { name: "确认取消" }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(cancel).not.toBeVisible();
  await expect(card.locator(".status-badge")).toHaveText("已取消");
  await expect(card.locator(".order-next-step")).toContainText("无需到场");
  expect(attempts).toBe(2);
});

test("商户已确认的旧订单不能再取消，冲突后读取新状态", async ({ page }) => {
  const order = await createOrder(page);
  let confirmed = false;
  await page.route("**/api/orders", (route) => route.fulfill({ json: [{ ...order, status: confirmed ? "confirmed" : "pending" }] }));
  await page.goto("/orders");
  const card = page.locator(".order-card").filter({ hasText: order.id });
  await card.getByRole("button", { name: "取消订单", exact: true }).click();
  await page.route(`**/api/orders/${order.id}/status`, (route) => {
    confirmed = true;
    return route.fulfill({ status: 409, json: { error: "仅待确认订单支持由顾客取消。" } });
  });
  await page.getByRole("dialog").getByRole("button", { name: "确认取消" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(card.locator(".status-badge")).toHaveText("待到场自提");
  await expect(card.getByRole("button", { name: "取消订单", exact: true })).toHaveCount(0);
  await expect(card.locator(".order-next-step")).toContainText("到场付款");
});

test("订单读取会话过期时可以登录后继续查看订单", async ({ page }) => {
  const order = await createOrder(page);
  let first = true;
  await page.route("**/api/orders", (route) => {
    if (first) {
      first = false;
      return route.fulfill({ status: 401, json: { error: "请先登录。" } });
    }
    return route.continue();
  });
  await page.goto("/orders");
  await page.getByRole("alert").getByRole("button", { name: "登录 / 注册", exact: true }).click();
  await page.getByRole("button", { name: /顾客端演示/ }).click();
  await expect(page).toHaveURL("/orders");
  await expect(page.locator(".order-card").filter({ hasText: order.id })).toBeVisible();
});
