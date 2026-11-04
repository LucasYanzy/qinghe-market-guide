import { expect, type Page } from "@playwright/test";
import { test } from "./isolated";

async function choose(page: Page) {
  await page.request.post("/api/auth/login", { data: { email: "client@qinghe.demo", password: "MarketDemo2026!" } });
  await page.goto("/");
  await page.getByRole("button", { name: "将藤熟番茄加入购物袋", exact: true }).click();
  await page.getByRole("button", { name: /^购物袋/ }).click();
  return page.getByRole("dialog", { name: "我的新鲜购物袋", exact: true });
}

test("每笔订单都先提示预购，返回修改保留草稿，明确确认前不会发送订单", async ({ page }) => {
  let submissions = 0;
  page.on("request", (request) => { if (request.method() === "POST" && request.url().endsWith("/api/orders")) submissions++; });
  await page.request.post("/api/auth/login", { data: { email: "admin@qinghe.demo", password: "MarketDemo2026!" } });
  const today = (await (await page.request.get("/api/config")).json()).today;
  const product = (await (await page.request.get("/api/products")).json()).find((p: { name: string }) => p.name === "藤熟番茄");
  const policy = { snap_status: "accepted", snap_verified_on: today, snap_note: "Test only: demo vendor terminal." };
  expect((await page.request.put(`/api/admin/markets/${product.market_id}/snap`, { data: { ...policy, snap_model: "vendor_terminal" } })).ok()).toBe(true);
  expect((await page.request.put(`/api/admin/markets/${product.market_id}/vendors/${product.retailer_id}/snap`, { data: policy })).ok()).toBe(true);
  await page.request.post("/api/auth/login", { data: { email: "retailer@qinghe.demo", password: "MarketDemo2026!" } });
  expect((await page.request.put(`/api/retailer/products/${product.id}`, { data: { ...product, active: true, organic: !!product.organic, snap_eligibility: "eligible" } })).ok()).toBe(true);
  const bag = await choose(page);
  const date = (await (await page.request.get("/api/config")).json()).today;
  await bag.getByRole("textbox").fill("确认后再预留");
  const [slot] = await bag.getByLabel("选择自提时段").selectOption({ index: 1 });
  await bag.getByRole("button", { name: "切换付款偏好", exact: true }).click();
  await bag.getByRole("radio", { name: "SNAP/EBT", exact: true }).check();
  await bag.getByRole("button", { name: "确认预购", exact: true }).click();
  const heading = bag.getByRole("heading", { name: "提交前确认预购", exact: true });
  await expect(heading).toBeFocused();
  expect(await bag.evaluate((modal) => modal.scrollTop)).toBe(0);
  await expect(bag.locator(".preorder-reminder")).toContainText("这是一笔预购");
  await expect(bag.locator(".preorder-details")).toContainText(`${date} · ${slot} ET`);
  await expect(bag.locator(".preorder-details")).toContainText("SNAP/EBT（到场确认）");
  await expect(bag.locator(".preorder-total")).toContainText("$3.50");
  expect(submissions).toBe(0);
  await bag.getByRole("button", { name: "返回修改", exact: true }).click();
  await expect(bag.getByRole("button", { name: "确认预购", exact: true })).toBeFocused();
  await expect(bag.getByRole("textbox")).toHaveValue("确认后再预留");
  await expect(bag.locator(".payment-current strong")).toHaveText("SNAP/EBT");
  await bag.getByLabel("增加藤熟番茄", { exact: true }).click();
  await bag.getByRole("button", { name: "确认预购", exact: true }).click();
  await expect(bag.locator(".preorder-total")).toContainText("$7.00");
  await bag.getByLabel("关闭弹窗").click();
  await expect(bag).not.toBeVisible();
  await page.getByRole("button", { name: /^购物袋/ }).click();
  await bag.getByRole("button", { name: "确认预购", exact: true }).click();
  expect(submissions).toBe(0);
  await bag.getByRole("button", { name: "确认并提交预购", exact: true }).click();
  await expect(page).toHaveURL("/orders");
  expect(submissions).toBe(1);
  await page.getByRole("navigation", { name: "主导航", exact: true }).getByRole("link", { name: "逛逛市集", exact: true }).click();
  await page.getByRole("button", { name: "将藤熟番茄加入购物袋", exact: true }).click();
  await page.getByRole("button", { name: /^购物袋/ }).click();
  await bag.getByRole("button", { name: "确认预购", exact: true }).click();
  await expect(heading).toBeVisible();
  expect(submissions).toBe(1);
});

test("请求失败后每次重试都重新显示预购说明", async ({ page }) => {
  const bag = await choose(page);
  let attempts = 0;
  await page.route("**/api/orders", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    attempts++;
    if (attempts === 1) return route.fulfill({ status: 503, json: { error: "请稍后重试" } });
    return route.continue();
  });
  await bag.getByRole("button", { name: "确认预购", exact: true }).click();
  expect(attempts).toBe(0);
  await bag.getByRole("button", { name: "确认并提交预购", exact: true }).click();
  await expect(bag.getByRole("alert")).toHaveText("请稍后重试");
  await bag.getByRole("button", { name: "确认预购", exact: true }).click();
  await expect(bag.getByRole("heading", { name: "提交前确认预购", exact: true })).toBeVisible();
  expect(attempts).toBe(1);
  await bag.getByRole("button", { name: "确认并提交预购", exact: true }).click();
  await expect(page).toHaveURL("/orders");
  expect(attempts).toBe(2);
});

test("核对期间价格或库存变化，返回购物袋并要求重新确认", async ({ page }) => {
  const bag = await choose(page);
  await bag.getByRole("button", { name: "确认预购", exact: true }).click();
  let stock = 2;
  await page.route("**/api/products*", async (route) => {
    const response = await route.fetch();
    const products = await response.json();
    await route.fulfill({ json: products.map((p: { id: number }) => p.id === 1 ? { ...p, stock, price_cents: 450 } : p) });
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(bag.getByRole("alert")).toHaveText("商品或自提信息已更新，请重新确认预购。");
  await expect(bag.getByRole("button", { name: "确认并提交预购", exact: true })).toHaveCount(0);
  await bag.getByRole("button", { name: "确认预购", exact: true }).click();
  await expect(bag.locator(".preorder-total")).toContainText("$4.50");
  stock = 0;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(bag.getByRole("button", { name: "确认预购", exact: true })).toBeDisabled();
  await expect(bag.locator("form")).toBeFocused();
  expect(await (await page.request.get("/api/orders")).json()).toEqual([]);
});

test("320px 英文确认页支持键盘、减少动态效果，按 Enter 不会跳过确认", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const bag = await choose(page);
  await bag.getByLabel("关闭弹窗").click();
  await page.getByRole("button", { name: "Switch to English", exact: true }).click();
  await page.getByRole("button", { name: /^Shopping bag/ }).click();
  const englishBag = page.getByRole("dialog", { name: "My shopping bag", exact: true });
  await englishBag.getByRole("button", { name: "Place preorder", exact: true }).click();
  await expect(englishBag.getByRole("heading", { name: "Review your preorder before submitting", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  expect(await (await page.request.get("/api/orders")).json()).toEqual([]);
  await expect(englishBag.locator(".preorder-reminder")).toContainText("Wait for vendor confirmation");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await englishBag.locator(".preorder-review").evaluate((form) => getComputedStyle(form).animationName)).toBe("none");
  await englishBag.getByLabel("Close dialog").focus();
  await page.keyboard.press("Shift+Tab");
  await expect(englishBag.getByRole("button", { name: "Confirm and submit preorder", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(englishBag.getByLabel("Close dialog")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(englishBag).not.toBeVisible();
});
