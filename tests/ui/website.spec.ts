import { expect, test } from "@playwright/test";

test("网站页面支持直接访问、刷新和页面标题", async ({ page }) => {
  for (const [path, title] of [
    ["/markets", "市场与导航"],
    ["/prices", "价格观察"],
    ["/about", "关于青禾"],
    ["/help", "帮助与食品援助"],
    ["/orders", "我的预购"],
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(title);
    await expect(page).toHaveTitle(new RegExp(title));
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(title);
  }
});

test("网站导航支持浏览器前进后退，购物袋不会因切页丢失", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "将藤熟番茄加入购物袋", exact: true })
    .click();
  const nav = page.getByRole("navigation", { name: "主导航", exact: true });
  await nav.getByRole("link", { name: "市场与导航", exact: true }).click();
  await expect(page).toHaveURL(/\/markets$/);
  await nav.getByRole("link", { name: "价格观察", exact: true }).click();
  await expect(page).toHaveURL(/\/prices$/);
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "市场与导航",
  );
  await page.goForward();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "价格观察",
  );
  await nav.getByRole("link", { name: "逛逛市集", exact: true }).click();
  await expect(page.getByRole("button", { name: /^购物袋/ })).toContainText(
    "1",
  );
  await page.getByRole("button", { name: /^购物袋/ }).click();
  await expect(page.getByRole("dialog")).toContainText("藤熟番茄");
});

test("首页入口能定位商品，并进入完整的访客指南", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "挑选今日蔬菜", exact: true }).click();
  await expect(page).toHaveURL(/#today-produce$/);
  await expect(page.locator("#today-produce")).toBeInViewport();
  await page.getByRole("link", { name: "了解预购流程", exact: true }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(
    page.getByRole("heading", { name: "三步，把新鲜带回家。", exact: true }),
  ).toBeVisible();
  const faq = page
    .locator("details")
    .filter({ hasText: "预购需要在线付款吗？" });
  await faq.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(faq.locator("p")).toBeVisible();
  await expect(faq.locator("p")).toContainText("到场付款");
  await page.keyboard.press("Enter");
  await expect(faq.locator("p")).not.toBeVisible();
  await expect(
    page.getByRole("link", { name: "Rutgers 官方市场信息" }).first(),
  ).toHaveAttribute("href", /ruoffcampus\.rutgers\.edu/);
});

test("商户深层链接先提示登录，登录及刷新后仍停留在库存页", async ({ page }) => {
  await page.goto("/retailer/inventory");
  await expect(
    page.getByRole("heading", { name: "这里是商户工作台", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "商户登录", exact: true }).click();
  await page.getByRole("button", { name: /商户端演示/ }).click();
  await expect(page).toHaveURL(/\/retailer\/inventory$/);
  await expect(
    page.getByRole("button", { name: "编辑", exact: true }).first(),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "商品与库存",
  );
  await expect(
    page.getByRole("button", { name: "编辑", exact: true }).first(),
  ).toBeVisible();
});

test("顾客不能通过商户网址进入商户管理", async ({ page }) => {
  await page.request.post("/api/auth/login", {
    data: { email: "client@qinghe.demo", password: "MarketDemo2026!" },
  });
  await page.goto("/retailer");
  await expect(
    page.getByRole("heading", { name: "这里是商户工作台", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "今日经营概览", exact: true }),
  ).not.toBeVisible();
});

test("未知网址有返回首页的入口", async ({ page }) => {
  await page.goto("/this-page-does-not-exist");
  await expect(
    page.getByRole("heading", { name: "这条小路还没通往市集", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "返回市集首页", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "今天，也要好好吃饭。",
  );
});

for (const width of [320, 390]) {
  test(`手机 ${width}px 的快捷导航、菜单和访客指南可用`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    const nav = page.getByRole("navigation", {
      name: "手机快捷导航",
      exact: true,
    });
    await expect(nav).toBeInViewport();
    await nav.getByRole("link", { name: "价格观察", exact: true }).click();
    await expect(page).toHaveURL(/\/prices$/);
    await expect(
      nav.getByRole("link", { name: "价格观察", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await nav.getByRole("link", { name: "我的预购", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "我的预购",
    );
    await page.getByRole("button", { name: "打开导航", exact: true }).click();
    await page
      .getByRole("navigation", { name: "主导航", exact: true })
      .getByRole("link", { name: "关于青禾", exact: true })
      .click();
    await expect(page).toHaveURL(/\/about$/);
    await expect(
      page.getByRole("button", { name: "打开导航", exact: true }),
    ).toHaveAttribute("aria-expanded", "false");
    await expect(
      page.getByRole("heading", { name: "来之前，你可能想知道", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("navigation", { name: "页脚导航", exact: true })
      .getByRole("link", { name: "今日蔬菜", exact: true })
      .click();
    await expect(page).toHaveURL("/");
  });
}
