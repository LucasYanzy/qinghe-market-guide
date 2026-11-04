import { expect } from "@playwright/test";
import { test } from "./isolated";

const login = { email: "admin@qinghe.demo", password: "MarketDemo2026!" };

test("学校管理深层入口需要对应角色，演示登录和刷新保留目标页面", async ({ page }) => {
  await page.goto("/admin/impact");
  await expect(page.getByRole("heading", { name: "这里是学校管理工作台", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "学校管理方登录", exact: true }).click();
  await page.getByRole("button", { name: /学校管理方演示/ }).click();
  await expect(page).toHaveURL(/\/admin\/impact$/);
  await page.getByText("查看市场规划示意图", { exact: true }).click();
  await expect(page.getByRole("group", { name: "市场规划服务范围示意图" })).toBeVisible();
  await page.reload();
  await page.getByText("查看市场规划示意图", { exact: true }).click();
  await expect(page.getByRole("group", { name: "市场规划服务范围示意图" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("社区影响");
  await expect(page.getByText("范围示意 · 非导航地图", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^购物袋/ })).toHaveCount(0);
});

test("顾客及商户不能读取学校管理数据，公开注册不能提升权限", async ({ page }) => {
  for (const role of ["client", "retailer"]) {
    await page.request.post("/api/auth/login", { data: { ...login, email: `${role}@qinghe.demo` } });
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "这里是学校管理工作台", exact: true })).toBeVisible();
    expect((await page.request.get("/api/admin/overview")).status()).toBe(403);
    await expect(page.getByText("全平台预购", { exact: true })).toHaveCount(0);
  }
});

test("学校管理页面显示全局数据，可切换周期、搜索商户并浏览历史", async ({ page }) => {
  await page.request.post("/api/auth/login", { data: login });
  await page.goto("/admin");
  await expect(page.getByText("全平台预购", { exact: true })).toBeVisible();
  await page.getByLabel("统计周期").selectOption("7");
  await expect(page.getByLabel("统计周期")).toHaveValue("7");
  await expect(page.getByText("全平台预购", { exact: true })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "主导航", exact: true });
  await nav.getByRole("link", { name: "商户总览", exact: true }).click();
  await expect(page.getByRole("cell", { name: "Green Acre 农场 retailer@qinghe.demo" })).toBeVisible();
  await page.getByLabel("搜索商户").fill("no-such-vendor");
  await expect(page.getByText("没有符合搜索条件的商户。", { exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/admin\?range=7$/);
  await expect(page.getByLabel("统计周期")).toHaveValue("7");
  await page.goForward();
  await expect(page).toHaveURL(/\/admin\/vendors\?range=7$/);
});

test("新增运营市场并修改服务半径，刷新后设置仍保留", async ({ page }) => {
  await page.request.post("/api/auth/login", { data: login });
  await page.goto("/admin/markets");
  await page.getByRole("button", { name: "新增市场", exact: true }).click();
  const form = page.getByRole("form", { name: "市场设置表单", exact: true });
  await form.getByLabel("市场名称", { exact: true }).fill("School UI demo market");
  await form.getByLabel("市场地址", { exact: true }).fill("126 College Ave, New Brunswick, NJ");
  await form.getByLabel("营业与自提说明", { exact: true }).fill("演示周四 10:00–16:00 ET");
  await form.getByLabel("服务社区", { exact: true }).fill("College Avenue");
  await form.getByLabel("纬度", { exact: true }).fill("40.502");
  await form.getByLabel("经度", { exact: true }).fill("-74.452");
  await form.getByLabel("规划半径（km）", { exact: true }).fill("2.5");
  await form.getByRole("button", { name: "保存市场设置", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("市场设置已保存");
  await page.getByRole("button", { name: /School UI demo market/ }).click();
  await expect(form.getByLabel("规划半径（km）", { exact: true })).toHaveValue("2.5");
  await form.getByLabel("规划半径（km）", { exact: true }).fill("4");
  await form.getByLabel("接受新预购").uncheck();
  await form.getByRole("button", { name: "保存市场设置", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("市场设置已保存");
  await page.reload();
  await page.getByRole("button", { name: /School UI demo market/ }).click();
  await expect(form.getByLabel("规划半径（km）", { exact: true })).toHaveValue("4");
  await expect(form.getByLabel("接受新预购")).not.toBeChecked();
  const result = await page.request.get("/api/admin/overview");
  expect((await result.json()).markets.find((m: { name: string }) => m.name === "School UI demo market").coverage_radius_km).toBe(4);
});

test("管理数据加载失败可重试", async ({ page }) => {
  await page.request.post("/api/auth/login", { data: login });
  await page.route("**/api/admin/overview?*", (route) => route.fulfill({ status: 503, json: { error: "管理数据暂时不可用" } }));
  await page.goto("/admin");
  await expect(page.getByRole("alert")).toContainText("管理数据暂时不可用");
  await page.unroute("**/api/admin/overview?*");
  await page.getByRole("button", { name: "重新加载", exact: true }).click();
  await expect(page.getByText("全平台预购", { exact: true })).toBeVisible();
});

for (const width of [320, 390]) {
  test(`学校管理页面在 ${width}px 手机宽度下可导航且不横向溢出`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.request.post("/api/auth/login", { data: login });
    await page.goto("/admin");
    await expect(page.getByText("全平台预购", { exact: true })).toBeVisible();
    for (const label of ["市场设置", "商户总览", "社区影响", "全盘概览"]) {
      await page.getByRole("button", { name: "打开导航", exact: true }).click();
      await page.getByRole("navigation", { name: "主导航", exact: true }).getByRole("link", { name: label, exact: true }).click();
      await expect(page.getByRole("heading", { level: 1 })).toContainText(label);
      await expect(page.locator(".school-workspace")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  });
}

test("2.5D 社区图支持节点选择、服务范围图层、视角和市场链接", async ({ page }) => {
  await page.request.post("/api/auth/login", { data: login });
  await page.goto("/admin/impact");
  await page.getByText("查看市场规划示意图", { exact: true }).click();
  const atlas = page.getByRole("group", { name: "市场规划服务范围示意图", exact: true });
  await expect(atlas).toBeVisible();
  const node = atlas.getByRole("button", { name: "选择市场：Rutgers Gardens 社区市集", exact: true });
  await node.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/market=1/);
  await expect(page.getByLabel("当前市场", { exact: true })).toHaveValue("1");
  await page.getByRole("button", { name: "俯视", exact: true }).click();
  await expect(page.getByRole("button", { name: "俯视", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "服务范围", exact: true }).click();
  await expect(page.getByRole("button", { name: "服务范围", exact: true })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "放大地图", exact: true }).click();
  await page.getByRole("button", { name: "重置地图", exact: true }).click();
  await page.reload();
  await expect(page.getByLabel("当前市场", { exact: true })).toHaveValue("1");
  await page.getByText("查看市场规划示意图", { exact: true }).click();
  await page.getByRole("button", { name: "管理此市场", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/markets\?market=1$/);
  await expect(page.getByRole("form", { name: "市场设置表单" }).getByLabel("市场名称", { exact: true })).toHaveValue("Rutgers Gardens 社区市集");
});

test("学校分配第二市场后商户可选择该市场上架，统计范围与归属持久化", async ({ page }) => {
  await page.request.post("/api/auth/login", { data: login });
  const created = await page.request.post("/api/admin/markets", { data: {
    name: "Multi campus UI market", subtitle: "Demo", address: "Campus road", latitude: 40.523, longitude: -74.458,
    hours: "Demo ET", description: "Demo", community: "Busch campus", coverage_radius_km: 2, active: true, preorders_enabled: true,
  } });
  const market = await created.json();
  await page.goto(`/admin/markets?market=${market.id}`);
  await page.getByRole("tab", { name: /入驻商户/ }).click();
  await page.getByRole("checkbox", { name: "分配商户 Green Acre 农场", exact: true }).check();
  await page.getByRole("button", { name: "保存商户入驻", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("商户入驻已保存");
  await page.reload();
  await page.getByRole("tab", { name: /入驻商户/ }).click();
  await expect(page.getByRole("checkbox", { name: "分配商户 Green Acre 农场", exact: true })).toBeChecked();
  await page.request.post("/api/auth/login", { data: { ...login, email: "retailer@qinghe.demo" } });
  await page.goto("/retailer/inventory");
  await page.getByRole("button", { name: "上架新商品", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "上架一份新鲜", exact: true });
  await editor.getByLabel("所属运营市场", { exact: true }).selectOption(String(market.id));
  await editor.getByLabel("商品名称", { exact: true }).fill("跨市场上架测试青菜");
  await editor.getByLabel("售价（USD）", { exact: true }).fill("4");
  await editor.getByLabel("可预购库存", { exact: true }).fill("15");
  await editor.getByRole("button", { name: "保存商品", exact: true }).click();
  await expect(editor).not.toBeVisible();
  await page.getByLabel("筛选库存市场", { exact: true }).selectOption(String(market.id));
  await expect(page.getByRole("row").filter({ hasText: "跨市场上架测试青菜" })).toBeVisible();
  await page.request.post("/api/auth/login", { data: login });
  await page.goto(`/admin?market=${market.id}`);
  await expect(page.getByText("当前市场预购", { exact: true })).toBeVisible();
  await expect(page.getByLabel("当前市场", { exact: true })).toHaveValue(String(market.id));
  const stats = await page.request.get(`/api/admin/overview?marketId=${market.id}`);
  expect((await stats.json()).summary.activeProducts).toBe(1);
});

test("多个市场可以批量暂停并恢复预购", async ({ page }) => {
  await page.request.post("/api/auth/login", { data: login });
  const created = await page.request.post("/api/admin/markets", { data: {
    name: "Batch test market", subtitle: "", address: "Sample campus road", latitude: 40.5, longitude: -74.45,
    hours: "Sample hours", description: "", community: "", coverage_radius_km: 1, active: true, preorders_enabled: true,
  } });
  expect(created.status()).toBe(201);
  await page.goto("/admin/markets");
  const choices = page.getByRole("checkbox", { name: /^批量选择 / });
  await expect(choices.first()).toBeVisible();
  await choices.nth(0).check();
  await choices.nth(1).check();
  await page.getByRole("button", { name: "批量暂停预购", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("所选市场已暂停预购");
  await expect(page.locator(".market-portfolio-card").nth(0).getByText("暂停预购", { exact: true })).toBeVisible();
  await choices.nth(0).check();
  await choices.nth(1).check();
  await page.getByRole("button", { name: "批量开放预购", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("所选市场已开放预购");
  await expect(page.locator(".market-portfolio-card").nth(0).getByText("开放预购", { exact: true })).toBeVisible();
});
