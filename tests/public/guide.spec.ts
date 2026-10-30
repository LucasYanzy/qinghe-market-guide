import { test, expect } from "@playwright/test";

test("the public guide works without an API, respects its repository path and restores deep links", async ({ page }) => {
  const apiRequests: string[] = [], errors: string[] = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "下一场新鲜，离你不远。" })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "主导航", exact: true });
  await expect(nav.getByRole("link", { name: "市场与导航" })).toHaveAttribute("href", "/qinghe-market-guide/markets");
  await nav.getByRole("link", { name: "市场与导航" }).click();
  await expect(page.getByRole("region", { name: "开市日历", exact: true })).toBeVisible();
  await page.getByLabel("选择出行日期", { exact: true }).fill("2026-10-31");
  await expect(page.getByRole("heading", { name: /10.*31/ }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("选择出行日期", { exact: true })).toHaveValue("2026-10-31");
  await expect(page.locator('.visit-day-results a[href*="maps"]')).toHaveCount(1);
  const map = page.locator('.visit-day-results a[href*="maps"]').first();
  await expect(map).toHaveAttribute("href", /178.*Jones/);
  await nav.getByRole("link", { name: "价格档案" }).click();
  await expect(page.getByRole("heading", { name: "市场历史采价档案" })).toBeVisible();
  await nav.getByRole("link", { name: "帮助与资源" }).click();
  await expect(page.getByText("RUoffcampus@echo.rutgers.edu", { exact: true }).first()).toBeVisible();
  expect(apiRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test("language switching and mobile layouts remain usable", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Switch to English", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your next fresh find is close by." })).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("markets/?date=2026-10-31");
    await expect(page.getByRole("heading", { name: "Plan your next market visit." })).toBeVisible();
    await expect(page.getByRole("region", { name: "Market calendar", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  }
});

test("authenticated routes clearly show service availability on the public site", async ({ page }) => {
  await page.goto("orders/");
  await expect(page.getByText("线上预购和管理服务尚未在此网站开放。先查看市场时间与地点，安排下一次到访。", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /登录|预购/ })).toHaveCount(0);
});


test("all three demo roles are read-only, searchable and scoped to synthetic markets", async ({ page }) => {
  const writes: string[] = [], api: string[] = [];
  page.on("request", (request) => { if (request.method() !== "GET") writes.push(request.url()); if (new URL(request.url()).pathname.startsWith("/api/")) api.push(request.url()); });
  await page.goto("demo/");
  await expect(page.getByText("DEMO · 只读展示", { exact: true })).toBeVisible();
  await expect(page.locator(".demo-product")).toHaveCount(4);
  await page.getByRole("searchbox", { name: "搜索示例商品" }).fill("番茄");
  await expect(page.locator(".demo-product")).toHaveCount(1);
  await page.locator(".demo-product").getByRole("button", { name: "查看" }).click();
  await expect(page.locator(".demo-product-detail")).toContainText("示例库存 24");
  await page.getByRole("tab", { name: "商户工作台" }).click();
  await page.getByRole("button", { name: "商品与库存", exact: true }).click();
  await expect(page.getByRole("heading", { name: "示例库存清单" })).toBeVisible();
  await page.getByRole("tab", { name: "学校管理" }).click();
  await expect(page.locator(".demo-metrics article").nth(1)).toContainText("$45.00");
  await page.getByLabel("筛选演示市场", { exact: true }).selectOption("1");
  await expect(page.locator(".demo-metrics article").nth(1)).toContainText("$30.50");
  await expect(page.locator(".demo-market-grid article")).toHaveCount(1);
  await page.getByRole("button", { name: "Switch to English", exact: true }).click();
  await expect(page.getByText("DEMO · Read-only preview", { exact: true })).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of ["Customer", "Vendor", "University"]) {
      await page.getByRole("tab", { name, exact: true }).click();
      await expect(page.getByRole("tabpanel")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    }
  }
  expect(writes).toEqual([]); expect(api).toEqual([]);
});
