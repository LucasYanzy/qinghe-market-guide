import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-29T12:00:00-04:00") });
});

test("首页先显示最近开市的真实时间、地址与下一场入口", async ({ page }) => {
  await page.goto("/");
  const hero = page.getByRole("region", { name: "最近开市安排" });
  await expect(hero).toContainText("College Avenue Student Center");
  await expect(hero).toContainText("11:00");
  await expect(hero).toContainText("16:00");
  await expect(hero).toContainText("126 College Avenue, New Brunswick, NJ 08901");
  await expect(hero.getByRole("link", { name: "导航到这里" })).toBeInViewport();
  const primaryOrder = await page.locator(".next-market-hero").evaluate((element) => Boolean(element.compareDocumentPosition(document.querySelector("#today-produce")!) & Node.DOCUMENT_POSITION_FOLLOWING));
  expect(primaryOrder).toBe(true);
  await hero.getByRole("link", { name: /Cook’s/ }).click();
  await expect(page).toHaveURL(/\/markets\?date=2026-10-30$/);
  await expect(page.locator(".visit-day-results")).toContainText("Cook’s");
});

test("日期选择保留深层链接、排除休市日并遵守各场营业季", async ({ page }) => {
  await page.goto("/markets?date=2026-10-01");
  const results = page.locator(".visit-day-results");
  await expect(results).toContainText("当天没有已公布的场次");
  await page.getByLabel("选择出行日期").fill("2026-10-27");
  await expect(results).toContainText("Jones Avenue");
  await page.getByLabel("选择出行日期").fill("2026-11-03");
  await expect(results).toContainText("当天没有已公布的场次");
  await page.getByLabel("选择出行日期").fill("2026-10-31");
  await page.reload();
  await expect(page.getByLabel("选择出行日期")).toHaveValue("2026-10-31");
  await expect(results).toContainText("Jones Avenue");
  await page.getByRole("button", { name: "下一周", exact: true }).click();
  await expect(page.getByLabel("选择出行日期")).toHaveValue("2026-11-07");
  await page.getByRole("button", { name: "今天", exact: true }).click();
  await expect(page.getByLabel("选择出行日期")).toHaveValue("2026-10-29");
  await expect(results).toContainText("按日程 · 营业时段内");
});

test("导航模式同步到日程与地点卡，搜索筛选可撤销", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/markets?date=2026-10-31");
  await page.getByLabel("导航出行方式").selectOption("transit");
  await expect(page.locator(".visit-day-results").getByRole("link", { name: "导航到这里" })).toHaveAttribute("href", /travelmode=transit/);
  const search = page.getByLabel("搜索市场地址");
  await search.fill("Jones");
  const cards = page.locator(".official-location-card");
  await expect(cards).toHaveCount(1);
  await expect(cards.getByRole("link", { name: "Apple 地图" })).toHaveAttribute("href", /dirflg=r/);
  await expect(cards.getByRole("link", { name: "Google 地图" })).toHaveAttribute("href", /178%20Jones%20Avenue.*travelmode=transit/);
  await cards.getByRole("button", { name: /复制 .* 地址/ }).click();
  await expect(cards.getByRole("button", { name: /复制 .* 地址/ })).toContainText("已复制");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("178 Jones Avenue, New Brunswick, NJ");
  await page.getByRole("button", { name: "清除市场搜索" }).click();
  await page.getByRole("button", { name: "New Brunswick 社区", exact: true }).click();
  await expect(cards).toHaveCount(1);
  await expect(page.getByRole("button", { name: "New Brunswick 社区", exact: true })).toHaveAttribute("aria-pressed", "true");
  await search.fill("no-such-location");
  await page.getByRole("button", { name: "清除筛选", exact: true }).click();
  await expect(cards).toHaveCount(4);
});

test("日历下载包含具体场次，营业季结束后提供官方入口", async ({ page }) => {
  await page.goto("/markets?date=2026-11-05");
  const calendar = page.getByRole("link", { name: "加入日历", exact: true });
  const data = decodeURIComponent((await calendar.getAttribute("href"))!.split(",").slice(1).join(",")).replace(/\r\n /g, "");
  expect(data).toContain("DTSTART;TZID=America/New_York:20261105T110000");
  expect(data).toContain("DTEND;TZID=America/New_York:20261105T160000");
  expect(data).toContain("126 College Avenue");
  const download = page.waitForEvent("download");
  await calendar.click();
  expect((await download).suggestedFilename()).toBe("market-college-ave-2026-11-05.ics");
  await page.clock.setSystemTime(new Date("2026-11-22T09:00:00-05:00"));
  await page.goto("/");
  const hero = page.getByRole("region", { name: "最近开市安排" });
  await expect(hero).toContainText("等待新一季的相见");
  await expect(hero.getByRole("link", { name: "查看官方日程" })).toBeVisible();
  await expect(hero.getByRole("link", { name: "导航到这里" })).toHaveCount(0);
});

test("中英文切换保留日期与出行方式，日历可用键盘操作", async ({ page }) => {
  await page.goto("/markets?date=2026-10-31");
  await page.getByLabel("导航出行方式").selectOption("walking");
  await page.getByRole("button", { name: "Switch to English", exact: true }).click();
  await expect(page.getByLabel("Choose a visit date")).toHaveValue("2026-10-31");
  await expect(page.getByLabel("Travel mode for directions")).toHaveValue("walking");
  await expect(page.locator(".market-day-planner")).not.toContainText(/[\u4e00-\u9fff]/);
  await expect(page.locator(".official-location-grid")).not.toContainText(/[\u4e00-\u9fff]/);
  const day = page.getByRole("button", { name: "Sun, Nov 1, 0 markets", exact: true });
  await day.focus();
  await page.keyboard.press("Enter");
  await expect(day).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".visit-day-results")).toContainText("No markets scheduled for this date");
});

for (const width of [320, 390, 768, 1440]) {
  test(`${width}px 市场时间、日期选择与导航不产生横向溢出`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.locator(".next-market-hours")).toBeInViewport();
    await expect(page.locator(".next-market-main").getByRole("link", { name: "导航到这里" })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.goto("/markets?date=2026-10-31");
    await expect(page.getByLabel("选择出行日期")).toBeVisible();
    const week = page.getByRole("group", { name: "按日期查看市场" });
    await expect(week.getByRole("button")).toHaveCount(7);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Switch to English", exact: true }).click();
    await expect(page.getByLabel("Choose a visit date")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
