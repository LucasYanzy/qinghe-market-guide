import { expect, type Page } from "@playwright/test";
import { test } from './fixtures';
const password = "MarketDemo2026!";
async function login(page: Page, role: string) {
  const response = await page.request.post("/api/auth/login", { data: { email: `${role}@qinghe.demo`, password } });
  expect(response.ok()).toBe(true);
}
async function createMarket(page: Page, name: string) {
  await login(page, "admin");
  const response = await page.request.post("/api/admin/markets", { data: {
    name, subtitle: "SNAP test only", address: "Demo campus road", latitude: 40.51, longitude: -74.45,
    hours: "Demo", description: "Demo", community: "Demo", coverage_radius_km: 1, active: true, preorders_enabled: true,
  } });
  expect(response.ok()).toBe(true); const market = await response.json();
  expect((await page.request.put(`/api/admin/markets/${market.id}/vendors`, { data: { vendorIds: [2] } })).ok()).toBe(true);
  return market;
}
async function setPolicies(page: Page, marketId: number) {
  const today = (await (await page.request.get("/api/config")).json()).today;
  const policy = { snap_status: "accepted", snap_verified_on: today, snap_note: "Test only: visit the demo service desk." };
  expect((await page.request.put(`/api/admin/markets/${marketId}/snap`, { data: { ...policy, snap_model: "market_tokens" } })).ok()).toBe(true);
  expect((await page.request.put(`/api/admin/markets/${marketId}/vendors/2/snap`, { data: policy })).ok()).toBe(true);
}

test("学校逐市场确认 SNAP 流程和参与商户，刷新后仍保留核实记录", async ({ page }) => {
  const market = await createMarket(page, "SNAP verification UI market");
  const today = (await (await page.request.get("/api/config")).json()).today;
  await page.goto(`/admin/markets?market=${market.id}`);
  await page.getByRole("tab", { name: "SNAP / EBT", exact: true }).click();
  const form = page.getByRole("form", { name: "市场 SNAP/EBT 设置", exact: true });
  await expect(form.getByLabel("市场接受状态", { exact: true })).toHaveValue("unconfirmed");
  await form.getByLabel("市场接受状态", { exact: true }).selectOption("accepted");
  await form.getByLabel("现场办理方式", { exact: true }).selectOption("market_tokens");
  await form.getByLabel("市场核实日期", { exact: true }).fill(today);
  await form.getByLabel("核实依据与到场指引", { exact: true }).fill("Test only: demo desk at the entrance.");
  await form.getByRole("button", { name: "保存 SNAP/EBT 设置", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("SNAP/EBT 设置已保存");
  await page.locator(".snap-vendor-policy summary").click();
  const vendor = page.getByRole("form", { name: "商户 SNAP 设置 Green Acre 农场", exact: true });
  await vendor.getByLabel("商户接受状态", { exact: true }).selectOption("accepted");
  await vendor.getByLabel("商户核实日期", { exact: true }).fill(today);
  await vendor.getByLabel("商户核实依据", { exact: true }).fill("Test only: demo vendor confirmation.");
  await vendor.getByRole("button", { name: "保存商户 SNAP 状态", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("商户 SNAP/EBT 状态已保存");
  await page.reload(); await page.getByRole("tab", { name: "SNAP / EBT", exact: true }).click();
  await expect(form.getByLabel("现场办理方式", { exact: true })).toHaveValue("market_tokens");
  await expect(form.getByLabel("市场核实日期", { exact: true })).toHaveValue(today);
  await expect(page.locator(".snap-vendor-policy summary")).toContainText("已确认接受");
  await page.goto(`/admin/impact?market=${market.id}`);
  await expect(page.getByText("已核实参与商户（去重）", { exact: true })).toBeVisible();
  await expect(page.getByText("SNAP 现场付款意向订单", { exact: true })).toBeVisible();
});

test("商户标记食品资格后，混合购物袋拆分现场 SNAP 意向并保存订单快照", async ({ page }) => {
  const market = await createMarket(page, "SNAP checkout UI market"); await setPolicies(page, market.id);
  await login(page, "retailer"); await page.goto("/retailer/inventory");
  const today = (await (await page.request.get("/api/config")).json()).today;
  const name = "SNAP UI lettuce";
  await page.getByRole("button", { name: "上架新商品", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "上架一份新鲜", exact: true });
  await editor.getByLabel("所属运营市场", { exact: true }).selectOption(String(market.id));
  await editor.getByLabel("SNAP 食品资格标记", { exact: true }).selectOption("eligible");
  await editor.getByLabel("商品名称", { exact: true }).fill(name);
  await editor.getByLabel("售价（USD）", { exact: true }).fill("4");
  await editor.getByLabel("可预购库存", { exact: true }).fill("10");
  await editor.getByRole("button", { name: "保存商品", exact: true }).click();
  await expect(editor).not.toBeVisible();
  const response = await page.request.post("/api/retailer/products", { data: {
    market_id: market.id, name: "SNAP UI unknown", category: "叶菜类", art: "lettuce", unit: "个", price_cents: 300, stock: 10,
    description: "Demo", organic: false, active: true, available_date: today,
  } }); expect(response.ok()).toBe(true);
  await login(page, "client"); await page.goto("/");
  await page.getByRole("button", { name: `将${name}加入购物袋`, exact: true }).click();
  await page.getByRole("button", { name: "将SNAP UI unknown加入购物袋", exact: true }).click();
  await page.getByRole("button", { name: /^购物袋/ }).click();
  const cart = page.getByRole("dialog", { name: "我的新鲜购物袋", exact: true });
  await expect(cart.getByText("本次可预约现场 SNAP/EBT 付款", { exact: true })).toBeVisible();
  await cart.getByRole("button", { name: "SNAP / EBT 付款选项", exact: true }).click();
  await cart.getByLabel("现场付款方式", { exact: true }).selectOption("snap_ebt");
  const split = cart.locator(".snap-split");
  await expect(split).toContainText("$4.00"); await expect(split).toContainText("$3.00");
  await cart.getByText("查看逐项资格与金额", { exact: true }).click();
  await expect(cart.locator(".snap-item-breakdown")).toContainText("SNAP 食品资格待核实");
  await cart.getByRole("button", { name: "确认预购", exact: true }).click();
  await expect(cart).not.toBeVisible();
  const order = page.locator(".order-card").filter({ hasText: name });
  await expect(order).toContainText("现场 SNAP/EBT 付款意向");
  await order.getByText("查看购买时的付款计划", { exact: true }).click();
  await expect(order).toContainText("Test only: visit the demo service desk.");
  const orders = await (await page.request.get("/api/orders")).json();
  const saved = orders.find((o: { market_id: number }) => o.market_id === market.id);
  expect(saved.snap_eligible_cents).toBe(400); expect(saved.other_payment_cents).toBe(300);
  await login(page, "retailer"); await page.goto("/orders");
  await expect(page.locator(".order-card").filter({ hasText: name })).toContainText("现场 SNAP/EBT 付款意向");
});

test("未确认的市场不开放 SNAP 付款；预估失败仍允许选择普通现场付款", async ({ page }) => {
  await page.goto("/"); await page.getByRole("button", { name: "将藤熟番茄加入购物袋", exact: true }).click();
  await page.getByRole("button", { name: /^购物袋/ }).click();
  const cart = page.getByRole("dialog", { name: "我的新鲜购物袋", exact: true });
  await cart.getByRole("button", { name: "SNAP / EBT 付款选项", exact: true }).click();
  await expect(cart.getByRole("option", { name: "现场 SNAP/EBT（需接受条件满足）", exact: true })).toHaveAttribute("disabled", "");
  await expect(cart.getByText("本次 SNAP/EBT 接受条件尚未确认", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.route("**/api/checkout/quote", (route) => route.fulfill({ status: 503, json: { error: "Quote unavailable" } }));
  await page.getByRole("button", { name: /^购物袋/ }).click();
  await cart.getByRole("button", { name: "SNAP / EBT 付款选项", exact: true }).click();
  await expect(cart.getByRole("button", { name: "重新核对", exact: true })).toBeVisible();
  await expect(cart.getByRole("button", { name: "登录后预购", exact: true })).toBeEnabled();
  await page.unroute("**/api/checkout/quote"); await cart.getByRole("button", { name: "重新核对", exact: true }).click();
  await expect(cart.getByText("本次 SNAP/EBT 接受条件尚未确认", { exact: true })).toBeVisible();
});

for (const width of [320, 390]) {
  test(`SNAP 管理和食品指南在 ${width}px 宽度下可操作且支持英语`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 }); await login(page, "admin");
    await page.goto("/admin/markets?market=1"); await page.getByRole("tab", { name: "SNAP / EBT", exact: true }).click();
    await expect(page.getByLabel("市场接受状态", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.goto("/help");
    await page.locator(".help-resource-disclosure > summary").click();
    await expect(page.getByRole("heading", { name: "一份新鲜，也可以多一种购买方式。", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Switch to English", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Another way to bring fresh food home.", exact: true })).toBeVisible();
  });
}
