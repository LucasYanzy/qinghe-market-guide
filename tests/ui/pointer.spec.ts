import { expect } from "@playwright/test";
import { test } from "./isolated";

const tomato = "将藤熟番茄加入购物袋";

test("鼠标快速加购立即更新数量，按下反馈不叠加也不拦截后续操作", async ({ page, context }) => {
  await page.goto("/");
  const add = page.getByRole("button", { name: tomato, exact: true });
  await add.scrollIntoViewIfNeeded();
  const session = await context.newCDPSession(page);
  await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const point = (await add.boundingBox())!;
  await page.mouse.move(point.x + point.width / 2, point.y + point.height / 2);
  await page.mouse.down();
  await expect(page.locator(".pointer-feedback")).toHaveCount(1);
  await page.mouse.up();
  for (let i = 0; i < 4; i++) {
    await add.click();
    expect(await page.locator(".pointer-feedback").count()).toBeLessThanOrEqual(1);
  }
  await expect(page.locator(".product-quantity")).toHaveText("5");
  await expect(page.locator(".pointer-feedback")).toHaveCount(0);
  await page.getByRole("button", { name: "打开购物袋，已选 5 件", exact: true }).click();
  const bag = page.getByRole("dialog", { name: "我的新鲜购物袋" });
  await bag.getByRole("button", { name: "减少藤熟番茄", exact: true }).click();
  await expect(bag.locator(".quantity-control")).toHaveText("4");
  await expect(bag.locator(".cart-total")).toContainText("$14.00");
  await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });
});

test("鼠标悬停时商品卡位置稳定，小按钮目标更容易点中", async ({ page }) => {
  await page.goto("/");
  const card = page.locator(".product-card").first();
  await card.scrollIntoViewIfNeeded();
  await card.evaluate(async (element) => {
    // Allow viewport observers to start entrance effects before measuring hover stability.
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    await Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => {})));
  });
  const before = await card.boundingBox();
  await card.hover();
  await expect(card).toHaveCSS("transform", "none");
  expect(await card.boundingBox()).toEqual(before);
  const add = card.getByRole("button", { name: tomato, exact: true });
  expect((await add.boundingBox())!.width).toBeGreaterThanOrEqual(38);
  await add.click();
  await expect(add).toHaveCSS("width", "34px");
});

test("弹窗遮罩只接受完整左键轻点，右键和拖出弹窗不会误关", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: tomato, exact: true }).click();
  await page.getByRole("button", { name: /^购物袋/ }).click();
  const bag = page.getByRole("dialog", { name: "我的新鲜购物袋" });
  const note = bag.getByRole("textbox");
  await note.fill("拖动选择文字后仍保留这份备注");
  await page.mouse.click(8, 8, { button: "right" });
  await expect(bag).toBeVisible();
  await page.mouse.move(8, 8);
  await page.mouse.down();
  await expect(bag).toBeVisible();
  await page.mouse.move(50, 8, { steps: 5 });
  await page.mouse.move(8, 8, { steps: 5 });
  await page.mouse.up();
  await expect(bag).toBeVisible();
  const field = (await note.boundingBox())!;
  await page.mouse.move(field.x + field.width / 2, field.y + field.height / 2);
  await page.mouse.down();
  await page.mouse.move(8, 8, { steps: 10 });
  await page.mouse.up();
  await expect(note).toHaveValue("拖动选择文字后仍保留这份备注");
  await expect(bag).toBeVisible();
  await page.mouse.click(8, 8);
  await expect(bag).not.toBeVisible();
  await expect(page.getByRole("button", { name: /^购物袋/ })).toBeFocused();
});

test("清除搜索后光标回到输入框，可直接输入下一次搜索", async ({ page }) => {
  await page.goto("/");
  const search = page.getByRole("textbox", { name: "搜索蔬菜或农场", exact: true });
  await search.fill("番茄");
  await page.locator(".search-field").getByRole("button", { name: "清除搜索", exact: true }).click();
  await expect(search).toBeFocused();
  await page.keyboard.type("carrot");
  await expect(page.locator(".product-card")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "彩虹胡萝卜", exact: true })).toBeVisible();
});

test("减少动态效果时鼠标移动和点击仍可操作，停用后立即清理跟随偏移", async ({ page }) => {
  await page.goto("/");
  const hero = page.locator(".hero");
  const rect = (await hero.boundingBox())!;
  await page.mouse.move(rect.x + rect.width * .8, rect.y + rect.height * .4);
  await expect.poll(() => hero.evaluate((element) => element.style.getPropertyValue("--art-x"))).not.toBe("");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => hero.evaluate((element) => element.style.getPropertyValue("--art-x"))).toBe("");
  const artwork = page.getByRole("button", { name: "查看藤熟番茄", exact: true });
  await artwork.hover();
  await expect(artwork.locator(".produce-art")).toHaveCSS("transform", "none");
  await page.getByRole("button", { name: tomato, exact: true }).click();
  await expect(page.locator(".product-quantity")).toHaveText("1");
  await expect(page.locator(".pointer-feedback, .cart-flight-dot")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === "running").length)).toBe(0);
});

test("缺少动画接口或使用键盘时均可直接加购", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Element.prototype, "animate", { value: undefined, configurable: true });
  });
  await page.goto("/");
  const add = page.getByRole("button", { name: tomato, exact: true });
  await add.click();
  await add.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".product-quantity")).toHaveText("2");
  await expect(page.locator(".pointer-feedback")).toHaveCount(0);
});

test("触屏点击不生成鼠标光波，手机商品操作无横向溢出", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, hasTouch: true, isMobile: true, viewport: { width: 320, height: 844 } });
  const page = await context.newPage();
  try {
    await page.goto("/");
    await page.getByRole("button", { name: tomato, exact: true }).tap();
    await expect(page.locator(".product-quantity")).toHaveText("1");
    await expect(page.locator(".pointer-feedback")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {
    await context.close();
  }
});
