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

test('看板自动更新可暂停，隐藏页面停止请求，失败保留选择并能重试', async ({ page }) => {
  const { market } = await fixture(page);
  await page.clock.install();
  await page.goto(`/admin?market=${market.id}`);
  await expect(page.locator('.analytics-stat-primary > strong')).toHaveText('$7.00');
  const chart = page.getByRole('group', { name: '订单状态占比图', exact: true });
  await chart.getByRole('button', { name: '已取消', exact: true }).click();
  let calls = 0;
  page.on('request', request => { if (request.url().includes('/api/admin/overview?')) calls++; });
  await page.clock.runFor(30100);
  await expect.poll(() => calls).toBe(1);
  await expect(page.getByRole('button', { name: '刷新管理数据', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '暂停自动更新', exact: true }).click();
  await page.clock.runFor(61000);
  expect(calls).toBe(1);
  await page.getByRole('button', { name: '恢复自动更新', exact: true }).click();
  await expect.poll(() => calls).toBe(2);
  await expect(page.getByRole('button', { name: '刷新管理数据', exact: true })).toBeEnabled();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(61000);
  expect(calls).toBe(2);
  await page.route('**/api/admin/overview?**', route => route.fulfill({ status: 503, json: { error: '网络请求失败，请稍后重试。' } }));
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
  await expect(page.locator('.analytics-refresh-error')).toBeVisible();
  // A visibility event followed by focus must only start one request.
  expect(calls).toBe(3);
  await expect(page.locator('.analytics-stat-primary > strong')).toHaveText('$7.00');
  await expect(chart.getByRole('button', { name: '已取消', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.unroute('**/api/admin/overview?**');
  await page.locator('.analytics-refresh-error').getByRole('button', { name: '重新加载', exact: true }).click();
  await expect(page.locator('.analytics-refresh-error')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '刷新管理数据', exact: true })).toBeEnabled();
  await expect(chart.getByRole('button', { name: '已取消', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('link', { name: '市场设置', exact: true }).click();
  const before = calls;
  await page.clock.runFor(61000);
  expect(calls).toBe(before);
});

test('切换周期后，迟到的旧汇总不能覆盖当前筛选', async ({ page }) => {
  const { market } = await fixture(page);
  await page.goto(`/admin?market=${market.id}`);
  await expect(page.locator('.analytics-stat-primary > strong')).toHaveText('$7.00');
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let held = false, delivered = false;
  await page.route('**/api/admin/overview?**', async route => {
    if (new URL(route.request().url()).searchParams.get('range') !== '7') return route.continue();
    const response = await route.fetch(), data = await response.json();
    data.analytics.current.revenueCents = 99900;
    held = true;
    await gate;
    await route.fulfill({ json: data });
    delivered = true;
  });
  await page.getByLabel('统计周期', { exact: true }).selectOption('7');
  await expect.poll(() => held).toBe(true);
  await page.getByLabel('统计周期', { exact: true }).selectOption('90');
  await expect(page.locator('.analytics-stat-primary > strong')).toHaveText('$7.00');
  release();
  await expect.poll(() => delivered).toBe(true);
  await expect(page.getByLabel('统计周期', { exact: true })).toHaveValue('90');
  await expect(page.locator('.analytics-stat-primary > strong')).toHaveText('$7.00');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('报表日期导航区分零值与缺失记录，并能返回最近有记录的日期', async ({ page }) => {
  const { market } = await fixture(page);
  let latest = '';
  await page.route('**/api/admin/overview?**', async route => {
    const response = await route.fetch(), data = await response.json();
    delete data.timeline.at(-1).participants;
    data.timeline.at(-2).participants = 0;
    latest = data.timeline.at(-2).date;
    await route.fulfill({ json: data });
  });
  await page.goto(`/admin?market=${market.id}&view=reports`);
  const story = page.locator('.report-story').filter({ has: page.locator('.report-story-heading').getByText('实际参与顾客', { exact: true }) });
  await expect(story.locator('.report-trend-selection > strong')).toHaveText('0');
  await expect(story.locator('.report-trend-selection > span')).toHaveText(latest);
  await story.getByRole('button', { name: '下一个数据点', exact: true }).click();
  await expect(story.locator('.report-trend-selection > strong')).toHaveText('无记录');
  await expect(story.getByRole('button', { name: '下一个数据点', exact: true })).toBeDisabled();
  await story.getByRole('button', { name: '最近有记录', exact: true }).click();
  await expect(story.locator('.report-trend-selection > strong')).toHaveText('0');
  await story.getByRole('button', { name: '上一个数据点', exact: true }).click();
  await expect(story.locator('.report-trend-selection > span')).not.toHaveText(latest);
});

test("学校看板显示交易、履约、回访与自提分布，趋势可切换指标和粒度", async ({ page }) => {
  const { market } = await fixture(page);
  await page.goto(`/admin?market=${market.id}`);
  await expect(page.locator(".analytics-stat")).toHaveCount(8);
  await expect(page.locator(".analytics-stat").filter({ hasText: "当前市场预购" }).locator(":scope > strong")).toHaveText("3");
  await expect(page.locator(".analytics-stat-primary > strong")).toHaveText("$7.00");
  await expect(page.locator(".analytics-stat").filter({ hasText: "平均完成订单金额" }).locator(":scope > strong")).toHaveText("$7.00");
  await expect(page.getByRole("table", { name: "每周自提时段预购分布", exact: true })).toBeVisible();
  const demand = page.getByRole("table", { name: "每周自提时段预购分布", exact: true });
  await expect(demand.locator("tbody tr")).toHaveCount(1);
  await demand.getByRole("button", { name: /: 2$/ }).click();
  await expect(page.locator(".decision-demand-readout")).toContainText("2 笔有效预购");
  await page.getByRole("group", { name: "趋势指标", exact: true }).getByRole("button", { name: "完成交易额", exact: true }).click();
  await page.getByLabel("趋势汇总粒度", { exact: true }).selectOption("week");
  await expect(page.getByRole("group", { name: "趋势指标", exact: true }).getByRole("button", { name: "完成交易额", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "SNAP 意向", exact: true }).click();
  await page.getByRole("tab", { name: "市场与商户", exact: true }).click();
  await expect(page.getByRole("heading", { name: "跨市场经营对比", exact: true })).toBeVisible();
  await page.getByLabel("市场对比排序", { exact: true }).selectOption("participants");
  await page.getByRole("tab", { name: /商品与库存/ }).click();
  await page.locator(".decision-data-table summary").filter({ hasText: "查看商品数据明细" }).click();
  await expect(page.getByRole("row").filter({ hasText: "Analytics UI greens" }).first()).toContainText("$4.00");
  await expect(page.getByRole("heading", { name: "预购库存提醒", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "SNAP 与服务", exact: true }).click();
  await expect(page.locator(".analytics-snap-numbers")).toContainText("$4.00");
  await expect(page.locator(".analytics-snap-numbers")).toContainText("$3.00");
  await expect(page.locator(".analytics-snap-numbers")).toContainText("50.0%");
});

test("商品排行支持指标切换、键盘选择和搜索，商户可以查看自己的购买记录", async ({ page }) => {
  const { market } = await fixture(page);
  await page.goto(`/admin?market=${market.id}&view=products`);
  const panel = page.getByRole("region", { name: "商品需求分析", exact: true });
  await expect(panel.getByRole("button", { name: "购买人数", exact: true })).toHaveAttribute("aria-pressed", "true");
  await panel.getByRole("button", { name: "完成交易额", exact: true }).click();
  await expect(panel.locator(".decision-bar-name b").first()).toHaveText("$4.00");
  await panel.locator(".decision-bar-row").filter({ hasText: "Analytics unverified food" }).press("Enter");
  await expect(page.getByRole("complementary", { name: "选中商品详情" })).toContainText("Analytics unverified food");
  await expect(page.getByRole("complementary", { name: "选中商品详情" })).toContainText("$3.00");
  await page.getByRole("searchbox", { name: "搜索商品分析" }).fill("greens");
  await expect(panel.locator(".decision-bar-row")).toHaveCount(1);
  await expect(page.getByRole("complementary", { name: "选中商品详情" })).toContainText("Analytics UI greens");
  await login(page, "retailer");
  await page.goto("/retailer");
  await expect(page.getByRole("region", { name: "商品需求分析" })).toBeVisible();
  await page.getByLabel("商品分析周期", { exact: true }).selectOption("7");
  await expect(page.getByRole("region", { name: "商品需求分析" })).toContainText("Analytics UI greens");
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
  await expect(page.locator(".analytics-export-status")).toContainText("报表已生成");
});

test('长周期趋势限制图形与表格渲染量，分页和键盘读数保留完整日期', async ({ page }) => {
  const { today } = await fixture(page);
  const from = new Date(Date.parse(`${today}T12:00:00Z`) - 365 * 86400000).toISOString().slice(0, 10);
  await page.goto(`/admin?range=custom&from=${from}&to=${today}`);
  const trend = page.locator('.analytics-trend');
  await expect(trend).toContainText('图表显示最近 120 个周期');
  await expect(trend.getByRole('slider', { name: '选择趋势日期', exact: true })).toHaveAttribute('max', '119');
  await trend.getByRole('slider', { name: '选择趋势日期', exact: true }).press('End');
  await expect(trend.getByRole('slider', { name: '选择趋势日期', exact: true })).toHaveAttribute('aria-valuetext', `${today}: 3`);
  await trend.getByText('查看趋势数据明细', { exact: true }).click();
  const rows = trend.getByRole('table', { name: '趋势数据明细', exact: true }).locator('tbody tr');
  await expect(rows).toHaveCount(12);
  await expect(rows.first()).toContainText(from);
  await trend.getByRole('button', { name: '下一页', exact: true }).click();
  const next = new Date(Date.parse(`${from}T12:00:00Z`) + 12 * 86400000).toISOString().slice(0, 10);
  await expect(rows.first()).toContainText(next);
  await page.getByLabel('趋势汇总粒度', { exact: true }).selectOption('month');
  await expect(trend.locator('.decision-pagination')).toContainText('第 1 /');
});

for (const width of [320, 390, 768]) {
  test(`统计看板在 ${width}px 可切换全部分区且不横向溢出`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 }); await login(page);
    await page.goto("/admin");
    for (const name of [/数据总览/, /市场与商户/, /商品与库存/, /经营与覆盖/, /报表中心/, /运营收支/, /SNAP 与服务/]) {
      await page.getByRole("tab", { name }).click();
      await expect(page.getByRole("tabpanel")).toBeVisible();
      await page.getByRole("tabpanel").locator("details").evaluateAll(elements => elements.forEach(element => element.setAttribute("open", "")));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await page.getByRole("button", { name: "Switch to English", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Markets & vendors", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "On-site payment intentions", exact: true })).toBeVisible();
  });
}

test("商品可并排对比价格、购买量和复购，筛选与清空操作保留一致状态", async ({ page }) => {
  const { market } = await fixture(page);
  await page.goto(`/admin?market=${market.id}&view=products`);
  const panel = page.getByRole("region", { name: "商品需求分析", exact: true });
  await panel.getByRole("button", { name: "对比商品：Analytics UI greens", exact: true }).click();
  await panel.getByRole("button", { name: "对比商品：Analytics unverified food", exact: true }).click();
  await panel.getByRole("button", { name: "对比 2 项", exact: true }).click();
  const comparison = panel.getByRole("region", { name: "商品对比", exact: true });
  await expect(comparison.getByRole("row", { name: /成交均价/ })).toContainText("$4.00 / 个");
  await expect(comparison.getByRole("row", { name: /成交均价/ })).toContainText("$3.00 / 个");
  await expect(comparison.getByRole("row", { name: /每单平均购买量/ })).toContainText("1.00 个");
  await panel.getByRole("button", { name: "有跨场次复购", exact: true }).click();
  await expect(panel.getByText("没有符合条件的商品", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "重置筛选", exact: true }).first().click();
  await expect(panel.locator(".decision-bar-row")).toHaveCount(2);
  await panel.getByRole("button", { name: "清空对比", exact: true }).click();
  await expect(comparison).toHaveCount(0);
  const first = panel.locator(".decision-bar-row").first(), second = panel.locator(".decision-bar-row").nth(1);
  await first.focus(); await first.press("ArrowDown");
  await expect(second).toBeFocused(); await expect(second).toHaveAttribute("aria-pressed", "true");
});

test("商品分页能查看榜外记录且对比最多三项", async ({ page }) => {
  const { market } = await fixture(page);
  await page.route("**/api/admin/overview?**", async (route) => {
    const response = await route.fetch(), data = await response.json(), source = data.analytics.products[0];
    data.analytics.products = Array.from({ length: 19 }, (_, i) => ({ ...source, productId: 10000 + i, name: `Page product ${i + 1}`, buyers: 19 - i }));
    await route.fulfill({ json: data });
  });
  await page.goto(`/admin?market=${market.id}&view=products`);
  const panel = page.getByRole("region", { name: "商品需求分析", exact: true });
  await expect(panel.locator(".decision-bar-row")).toHaveCount(8);
  for (const name of ["Page product 1", "Page product 2", "Page product 3"]) await panel.getByRole("button", { name: `对比商品：${name}`, exact: true }).click();
  await expect(panel.getByRole("button", { name: "对比商品：Page product 4", exact: true })).toBeDisabled();
  await panel.getByRole("button", { name: "下一页商品", exact: true }).click();
  await expect(panel.locator(".decision-bar-row").first()).toContainText("Page product 9");
  await panel.getByRole("button", { name: "下一页商品", exact: true }).click();
  await expect(panel.locator(".decision-bar-row")).toHaveCount(3);
  await expect(panel.getByRole("button", { name: "下一页商品", exact: true })).toBeDisabled();
  await panel.getByRole("searchbox").fill("Page product 19");
  await expect(panel.locator(".decision-bar-row")).toHaveCount(1);
  await expect(panel.locator(".decision-pagination")).toContainText("第 1 / 1 页");
});

test("趋势支持键盘选日期、隐藏折线，经营页说明收款与缺失成本", async ({ page }) => {
  const { market } = await fixture(page);
  await page.goto(`/admin?market=${market.id}`);
  const slider = page.getByRole("slider", { name: "选择趋势日期", exact: true });
  await slider.focus(); await slider.press("Home");
  await expect(slider).toHaveValue("0");
  const completion = page.locator(".legend-toggle");
  await completion.click(); await expect(completion).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("tab", { name: "经营与覆盖", exact: true }).click();
  await expect(page.getByRole("heading", { name: "平台订单收款登记", exact: true })).toBeVisible();
  await expect(page.locator(".business-panel").filter({ hasText: "平台订单收款登记" }).locator(".business-lead strong")).toHaveText("$7.00");
  const readiness = page.locator(".business-readiness");
  await expect(readiness.getByText("尚未采集", { exact: true })).toHaveCount(1);
  await expect(readiness.getByText("商户私有，可自行填报", { exact: true })).toBeVisible();
  await expect(readiness.getByText("可在运营收支登记", { exact: true })).toHaveCount(2);
  await expect(readiness).toContainText("缺失记录不按零处理");
  await page.getByLabel("选择导出报表", { exact: true }).selectOption("business");
  const exported = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 CSV", exact: true }).click();
  const csv = await readFile((await (await exported).path())!, "utf8");
  expect(csv).toContain('"现金登记","7"');
  expect(csv).toContain('"已登记运营收入",""');
  expect(csv).toContain('"已登记运营支出",""');
  expect(csv).toContain('"已登记净收支",""');
  expect(csv).not.toContain('"商户进货、运输与人工成本"');
  await page.getByRole("button", { name: "Switch to English", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Business & coverage", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Operator vendor fees", exact: true })).toBeVisible();
  await expect(readiness.getByText("Not collected", { exact: true })).toHaveCount(1);
  await expect(readiness.getByText("Private to each vendor; self-reporting available", { exact: true })).toBeVisible();
  await expect(readiness.getByText("Record in operating finance", { exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "90 days", exact: true }).click();
  await expect(page.getByLabel("Reporting period", { exact: true })).toHaveValue("90");
  await page.getByRole("button", { name: "Reset all filters", exact: true }).click();
  await expect(page.getByLabel("Reporting period", { exact: true })).toHaveValue("30");
  await expect(page.getByLabel("Current market", { exact: true })).toHaveValue("all");
});
