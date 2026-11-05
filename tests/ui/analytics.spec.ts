import { expect, type Page } from "@playwright/test";
import { test } from "./isolated";
import { readFile } from "node:fs/promises";
const credentials = { password: "MarketDemo2026!" };
async function login(page: Page, role = "admin") {
  const response = await page.request.post("/api/auth/login", { data: { ...credentials, email: `${role}@qinghe.demo` } });
  expect(response.ok()).toBe(true);
}
async function fixture(page: Page) {
  await login(page);
  const today = (await (await page.request.get("/api/config")).json()).today;
  const marketResponse = await page.request.post("/api/admin/markets", { data: {
    name: `Analytics UI ${test.info().testId}`, subtitle: "Test", address: "Demo campus road", latitude: 40.51, longitude: -74.45,
    hours: "Demo", description: "Test only", community: "Test", coverage_radius_km: 1, active: true, preorders_enabled: true,
  } });
  expect(marketResponse.ok()).toBe(true); const market = await marketResponse.json();
  const policy = { snap_status: "accepted", snap_verified_on: today, snap_note: "Test-only confirmation." };
  await page.request.put(`/api/admin/markets/${market.id}/vendors`, { data: { vendorIds: [2] } });
  await page.request.put(`/api/admin/markets/${market.id}/snap`, { data: { ...policy, snap_model: "vendor_terminal" } });
  await page.request.put(`/api/admin/markets/${market.id}/vendors/2/snap`, { data: policy });
  await login(page, "retailer");
  const products = [];
  for (const [name, price, eligibility, stock] of [["Analytics UI greens", 400, "eligible", 3], ["Analytics unverified food", 300, "unknown", 10]] as const) {
    const response = await page.request.post("/api/retailer/products", { data: {
      market_id: market.id, name, category: "叶菜类", art: "lettuce", unit: "个", price_cents: price, stock,
      description: "Test", organic: false, active: true, available_date: today, snap_eligibility: eligibility,
    } }); expect(response.ok()).toBe(true); products.push(await response.json());
  }
  await login(page, "client");
  const orders = [];
  for (let n = 0; n < 3; n++) {
    const response = await page.request.post("/api/orders", { data: { items: [{ productId: products[0].id, quantity: 1 }, { productId: products[1].id, quantity: 1 }], pickupSlot: "10:00–12:00", paymentMethod: n === 0 ? "snap_ebt" : "pay_at_pickup" } });
    expect(response.ok()).toBe(true); orders.push(await response.json());
  }
  await page.request.patch(`/api/orders/${orders[2].id}/status`, { data: { status: "cancelled" } });
  await login(page, "retailer");
  expect((await page.request.patch(`/api/orders/${orders[0].id}/status`, { data: { status: "confirmed" } })).ok()).toBe(true);
  expect((await page.request.post(`/api/orders/${orders[0].id}/pickup`, { data: {
    pickupCode: orders[0].pickup_code, cashCents: orders[0].total_cents, cardCents: 0, snapCents: 0,
  } })).ok()).toBe(true);
  await login(page);
  return { market, today };
}

test("学校看板显示交易、履约、回访与自提分布，趋势可切换指标和粒度", async ({ page }) => {
  const { market } = await fixture(page);
  await page.goto(`/admin?market=${market.id}`);
  await expect(page.locator(".analytics-stat")).toHaveCount(8);
  await expect(page.locator(".analytics-stat").filter({ hasText: "当前市场预购" }).locator(":scope > strong")).toHaveText("3");
  await expect(page.locator(".analytics-stat-primary > strong")).toHaveText("$7.00");
  await expect(page.locator(".analytics-stat").filter({ hasText: "平均完成订单金额" }).locator(":scope > strong")).toHaveText("$7.00");
  await expect(page.getByRole("table", { name: "每周自提时段预购分布", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "完成交易额", exact: true }).click();
  await page.getByLabel("趋势汇总粒度", { exact: true }).selectOption("week");
  await expect(page.getByRole("button", { name: "完成交易额", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "SNAP 意向", exact: true }).click();
  await page.getByRole("tab", { name: "市场与商户", exact: true }).click();
  await expect(page.getByRole("heading", { name: "跨市场经营对比", exact: true })).toBeVisible();
  await page.getByLabel("市场对比排序", { exact: true }).selectOption("participants");
  await page.getByRole("tab", { name: /商品与库存/ }).click();
  await expect(page.getByRole("row").filter({ hasText: "Analytics UI greens" }).first()).toContainText("$4.00");
  await expect(page.getByRole("heading", { name: "补货与售罄提醒", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "SNAP 与服务", exact: true }).click();
  await expect(page.locator(".analytics-snap-numbers")).toContainText("$4.00");
  await expect(page.locator(".analytics-snap-numbers")).toContainText("$3.00");
  await expect(page.locator(".analytics-snap-numbers")).toContainText("50.0%");
});

test("自定义日期与市场筛选可分享和刷新，非法日期范围可修正", async ({ page }) => {
  await login(page); const today = (await (await page.request.get("/api/config")).json()).today;
  await page.goto("/admin?market=1");
  await page.getByLabel("统计周期", { exact: true }).selectOption("custom");
  await page.getByLabel("开始日期", { exact: true }).fill(today);
  await page.getByLabel("结束日期", { exact: true }).fill(today);
  await page.getByRole("button", { name: "应用日期范围", exact: true }).click();
  await expect(page.locator(".analytics-stat")).toHaveCount(8);
  await expect(page).toHaveURL(new RegExp(`from=${today}&to=${today}`));
  await page.getByRole("tab", { name: /商品与库存/ }).click();
  await page.reload();
  await expect(page.getByRole("tab", { name: /商品与库存/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("统计周期", { exact: true })).toHaveValue("custom");
  await expect(page.getByLabel("开始日期", { exact: true })).toHaveValue(today);
  await page.getByLabel("开始日期", { exact: true }).fill("2024-01-01");
  await page.getByRole("button", { name: "应用日期范围", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("366");
  await page.getByLabel("统计周期", { exact: true }).selectOption("all");
  await expect(page.getByText("全部时间不计算上期增幅", { exact: true })).toBeVisible();
});

test("CSV 导出遵循当前市场和日期范围，使用成交快照且不含顾客信息", async ({ page }) => {
  const { market, today } = await fixture(page);
  await page.goto(`/admin?market=${market.id}&range=custom&from=${today}&to=${today}`);
  await expect(page.locator(".analytics-stat")).toHaveCount(8);
  await page.getByLabel("选择导出报表", { exact: true }).selectOption("products");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 CSV", exact: true }).click();
  const download = await downloadEvent, path = await download.path();
  const csv = await readFile(path!, "utf8");
  expect(download.suggestedFilename()).toContain(`products-${market.id}`);
  expect(csv).toContain("Analytics UI greens"); expect(csv).toContain(market.name); expect(csv).toContain(today);
  expect(csv).not.toContain("client@qinghe.demo"); expect(csv).toContain("非核销记录");
  await expect(page.getByRole("status")).toContainText("报表已生成");
});

for (const width of [320, 390, 768]) {
  test(`统计看板在 ${width}px 可切换全部分区且不横向溢出`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 }); await login(page);
    await page.goto("/admin");
    for (const name of [/数据总览/, /市场与商户/, /商品与库存/, /SNAP 与服务/]) {
      await page.getByRole("tab", { name }).click();
      await expect(page.getByRole("tabpanel")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await page.getByRole("button", { name: "Switch to English", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Markets & vendors", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "On-site payment intentions", exact: true })).toBeVisible();
  });
}
