import { expect } from "@playwright/test";
import { test } from "./isolated";

test("访客只保留三个主入口，辅助链接和统一登录仍可访问", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "主导航", exact: true });
  await expect(nav.getByRole("link")).toHaveText(["市场与导航", "逛逛市集", "我的预购"]);
  await expect(page.locator(".sidebar")).toHaveCount(0);
  await expect(page.locator(".hero, .benefits-row, .market-strip")).toHaveCount(0);
  const header = page.locator(".visitor-header");
  await expect(header.getByRole("button", { name: "登录", exact: true })).toBeVisible();
  await expect(header).not.toContainText("商户");
  await expect(header).not.toContainText("学校");
  await header.getByRole("link", { name: "帮助", exact: true }).click();
  await expect(page).toHaveURL(/\/help$/);
  const footer = page.getByRole("navigation", { name: "页脚导航", exact: true });
  await footer.getByRole("link", { name: "价格观察", exact: true }).click();
  await expect(page).toHaveURL(/\/prices$/);
  await footer.getByRole("button", { name: "商户与学校登录", exact: true }).click();
  const auth = page.getByRole("dialog");
  await expect(auth.getByRole("button", { name: /商户端演示/ })).toBeVisible();
  await expect(auth.getByRole("button", { name: /学校管理方演示/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(auth).not.toBeVisible();
});

test("筛选默认收起，键盘展开后可设置并一键清除全部条件", async ({ page }) => {
  await page.goto("/");
  const count = await page.locator(".product-card").count();
  expect(count).toBeGreaterThan(0);
  const options = page.locator(".product-filter-options");
  const summary = options.locator("summary");
  await expect(page.getByLabel("商品排序", { exact: true })).not.toBeVisible();
  await summary.focus(); await page.keyboard.press("Enter");
  await page.getByLabel("商品排序", { exact: true }).selectOption("price-up");
  await page.getByLabel("仅看有库存", { exact: true }).check();
  await summary.click();
  await expect(summary).toHaveAttribute("data-active", "true");
  await page.getByRole("button", { name: "叶菜类", exact: true }).click();
  await page.getByLabel("搜索蔬菜或农场", { exact: true }).fill("no-such-vegetable");
  await expect(page.locator(".product-card")).toHaveCount(0);
  await page.getByRole("button", { name: "清除筛选", exact: true }).click();
  await expect(page.locator(".product-card")).toHaveCount(count);
  await expect(page.getByLabel("搜索蔬菜或农场", { exact: true })).toHaveValue("");
  await expect(summary).toHaveAttribute("data-active", "false");
  await summary.click();
  await expect(page.getByLabel("商品排序", { exact: true })).toHaveValue("recommended");
  await expect(page.getByLabel("仅看有库存", { exact: true })).not.toBeChecked();
});

test("帮助页按需展开，常见问题一次只打开一项，食品援助支持键盘和英文", async ({ page }) => {
  await page.goto("/help");
  const questions = page.locator(".help-faqs details");
  await expect(questions).toHaveCount(4);
  await expect(page.locator(".simple-help details[open]")).toHaveCount(0);
  await questions.nth(0).locator("summary").click();
  await expect(questions.nth(0).locator("p")).toBeVisible();
  await questions.nth(1).locator("summary").click();
  await expect(questions.nth(0).locator("p")).not.toBeVisible();
  await expect(questions.nth(1).locator("p")).toBeVisible();
  const aid = page.locator(".help-resource-disclosure");
  await aid.locator("summary").focus(); await page.keyboard.press("Enter");
  await expect(aid.getByRole("heading", { name: "Market Bucks 项目", exact: true })).toBeVisible();
  await expect(aid.getByRole("heading", { name: "一份新鲜，也可以多一种购买方式。", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Switch to English", exact: true }).click();
  await expect(page.locator(".simple-help")).not.toContainText(/[\u4e00-\u9fff]/);
});

for (const width of [320, 390, 768, 1440]) {
  test(`${width}px 中英文访客导航、帮助和筛选可操作且不溢出`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    for (const language of ["zh", "en"]) {
      if (language === "en") await page.getByRole("button", { name: "Switch to English", exact: true }).click();
      const nav = page.locator(width <= 760 ? ".mobile-site-nav" : ".visitor-primary-nav");
      await expect(nav.getByRole("link")).toHaveCount(3);
      for (const link of await nav.getByRole("link").all()) await expect(link).toBeInViewport();
      await expect(page.locator(".visitor-account")).toBeInViewport();
      await expect(page.locator(".visitor-help-link")).toBeInViewport();
      await expect(page.locator(".visitor-help-link")).toHaveAccessibleName(language === "zh" ? "帮助" : "Help");
      await page.locator(".product-filter-options > summary").click();
      await expect(page.locator(".product-filter-panel select")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const panel = await page.locator(".product-filter-panel").boundingBox();
      expect(panel!.x).toBeGreaterThanOrEqual(0);
      expect(panel!.x + panel!.width).toBeLessThanOrEqual(width);
      await page.locator(".product-filter-options > summary").click();
      // Return to the header before checking the next language's fixed navigation.
      await page.locator(".visitor-header").scrollIntoViewIfNeeded();
    }
  });
}
