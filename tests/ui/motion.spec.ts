import { expect, test } from "@playwright/test";

test("商品卡片增减与购物袋同步，归零后可重新添加", async ({ page }) => {
  await page.goto("/");
  const card = page.locator(".product-card").filter({ hasText: "藤熟番茄" });
  const add = card.getByRole("button", { name: "将藤熟番茄加入购物袋", exact: true });
  await add.click();
  await add.click();
  await expect(card.locator(".product-quantity")).toContainText("2");
  await page.getByRole("button", { name: /^购物袋/ }).click();
  const cart = page.getByRole("dialog", { name: "我的新鲜购物袋" });
  await expect(cart.locator(".quantity-control")).toContainText("2");
  await page.keyboard.press("Escape");
  await expect(cart).not.toBeVisible();
  await card.getByRole("button", { name: "减少藤熟番茄", exact: true }).click();
  await card.getByRole("button", { name: "减少藤熟番茄", exact: true }).click();
  await expect(page.getByRole("button", { name: /^购物袋/ })).toContainText("0");
  await expect(card.locator(".product-quantity")).toHaveCount(0);
  await expect(add).toBeFocused();
  await add.click();
  await expect(card.locator(".product-quantity")).toContainText("1");
});

test("组合筛选可逐项撤销，重置同时恢复排序、搜索和库存条件", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".product-card").first()).toBeVisible();
  const allCount = await page.locator(".product-card").count();
  await page.getByRole("button", { name: "根茎类", exact: true }).click();
  await page.getByRole("textbox", { name: "搜索蔬菜或农场" }).fill("土豆");
  await page.getByRole("checkbox", { name: "仅看有库存" }).check();
  await page.getByLabel("商品排序").selectOption("price-down");
  const filters = page.getByRole("group", { name: "当前筛选条件" });
  await expect(page.locator(".product-card")).toHaveCount(1);
  await expect(filters.locator(".filter-chip")).toHaveCount(4);
  await filters.getByRole("button", { name: "清除搜索", exact: true }).click();
  await expect(page.locator(".product-card")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "根茎类", exact: true })).toHaveAttribute("aria-pressed", "true");
  await filters.getByRole("button", { name: "重置全部", exact: true }).click();
  await expect(page.locator(".product-card")).toHaveCount(allCount);
  await expect(filters).not.toBeVisible();
  await expect(page.getByLabel("商品排序")).toHaveValue("recommended");
  await expect(page.getByRole("checkbox", { name: "仅看有库存" })).not.toBeChecked();
});

test("滚动购物袋入口保留自提草稿，返回顶部恢复浏览起点", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "将藤熟番茄加入购物袋", exact: true }).click();
  const dock = page.getByRole("button", { name: "打开购物袋，已选 1 件", exact: true });
  await expect(dock).toBeInViewport();
  await expect(dock).toContainText("$3.50");
  await dock.click();
  const cart = page.getByRole("dialog", { name: "我的新鲜购物袋" });
  await cart.getByRole("textbox").fill("购物袋快捷入口测试");
  await page.keyboard.press("Escape");
  await expect(cart).not.toBeVisible();
  await dock.click();
  await expect(cart.getByRole("textbox")).toHaveValue("购物袋快捷入口测试");
  await page.keyboard.press("Escape");
  await expect(cart).not.toBeVisible();
  await page.getByRole("button", { name: "返回顶部", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
  await expect(dock).not.toBeVisible();
});

test("手机菜单锁定背景和焦点，Esc 后恢复页面与触发按钮", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "打开导航", exact: true });
  await trigger.click();
  const menu = page.getByRole("dialog", { name: "主导航", exact: true });
  await expect(menu).toBeVisible();
  await expect(page.locator(".main-shell")).toHaveAttribute("inert", "");
  await expect(page.locator(".mobile-site-nav")).toHaveAttribute("inert", "");
  const close = menu.getByRole("button", { name: "关闭导航", exact: true });
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(menu.getByRole("button", { name: "登录", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(page.locator(".main-shell")).not.toHaveAttribute("inert");
  await trigger.click();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator(".main-shell")).not.toHaveAttribute("inert");
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("");
});

test("减少动态效果时可完成筛选和加购，切页后内容始终可见", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "果实类", exact: true }).click();
  await expect(page.locator(".product-card")).toHaveCount(3);
  await page.getByRole("button", { name: "将藤熟番茄加入购物袋", exact: true }).click();
  await expect(page.getByRole("button", { name: /^购物袋/ })).toContainText("1");
  expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length)).toBe(0);
  await page.getByRole("navigation", { name: "主导航", exact: true }).getByRole("link", { name: "关于青禾", exact: true }).click();
  await expect(page.getByRole("heading", { name: "三步，把新鲜带回家。", exact: true })).toBeVisible();
  await expect(page.locator(".about-intro")).toHaveCSS("opacity", "1");
});

test("新增筛选及购物袋交互显示英文", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Switch to English", exact: true }).click();
  await page.getByRole("checkbox", { name: "In stock only", exact: true }).check();
  await expect(page.getByRole("group", { name: "Active filters", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reset all", exact: true }).click();
  await page.getByRole("button", { name: "将藤熟番茄加入购物袋", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open shopping bag, 1 items selected", exact: true })).toContainText("Your fresh picks");
  await expect(page.getByRole("status")).toContainText("added to your bag");
});
