import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./isolated";

async function openBag(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "将藤熟番茄加入购物袋", exact: true }).click();
  await page.getByRole("button", { name: /^购物袋/ }).click();
  return page.getByRole("dialog", { name: "我的新鲜购物袋", exact: true });
}
async function press(page: Page, button: Locator) {
  await button.hover();
  await page.mouse.down();
}
async function freeze(page: Page) {
  await page.clock.install({ time: new Date("2030-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2030-01-01T00:00:01Z"));
}

test("付款加号有进度，700ms 切换一次，松开不展开选项且不改变数量", async ({ page }) => {
  const bag = await openBag(page);
  const plus = bag.getByRole("button", { name: "切换付款偏好", exact: true });
  await plus.hover();
  await freeze(page);
  await press(page, plus);
  await page.clock.runFor(699);
  await expect(bag.locator(".payment-hold")).toHaveClass(/is-holding/);
  await expect(bag.locator(".payment-current strong")).toHaveText("常规到场付款");
  await expect(bag.locator(".payment-instruction")).toContainText("松开可取消");
  await page.clock.runFor(1);
  await expect(bag.locator(".payment-current strong")).toHaveText("SNAP/EBT");
  await page.clock.runFor(2100);
  await page.mouse.up();
  await expect(plus).toHaveAttribute("aria-expanded", "false");
  await expect(bag.locator(".quantity-control")).toHaveText("1");
  await expect(bag.locator(".cart-total")).toContainText("$3.50");
  await expect(bag.locator(".payment-current strong")).toHaveText("SNAP/EBT");
  await press(page, plus);
  await page.clock.runFor(700);
  await page.mouse.up();
  await expect(bag.locator(".payment-current strong")).toHaveText("常规到场付款");
});

for (const action of ["leave", "wheel", "blur", "close"] as const) {
  test(`付款长按中 ${action} 会取消，之后可直接选择`, async ({ page }) => {
    let bag = await openBag(page);
    const plus = bag.getByRole("button", { name: "切换付款偏好", exact: true });
    await plus.hover();
    await freeze(page);
    await press(page, plus);
    await page.clock.runFor(400);
    if (action === "leave") await page.mouse.move(8, 8);
    if (action === "wheel") await page.mouse.wheel(0, 25);
    if (action === "blur") await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    if (action === "close") { await page.keyboard.press("Escape"); await page.clock.runFor(200); }
    await expect(page.locator(".payment-hold.is-holding")).toHaveCount(0);
    await page.clock.runFor(1000);
    await page.mouse.up();
    if (action === "close") {
      await page.getByRole("button", { name: /^购物袋/ }).click();
      bag = page.getByRole("dialog", { name: "我的新鲜购物袋", exact: true });
    }
    await expect(bag.locator(".payment-current strong")).toHaveText("常规到场付款");
    await plus.click();
    await bag.getByRole("radio", { name: "SNAP/EBT", exact: true }).check();
    await expect(bag.locator(".payment-current strong")).toHaveText("SNAP/EBT");
  });
}

test("键盘可选付款偏好，刷新和登录后保留，订单对顾客与商户可见", async ({ page }) => {
  // SNAP orders still require verified market/vendor acceptance and eligible food.
  expect((await page.request.post("/api/auth/login", { data: { email: "admin@qinghe.demo", password: "MarketDemo2026!" } })).ok()).toBe(true);
  const today = (await (await page.request.get("/api/config")).json()).today;
  const product = (await (await page.request.get("/api/products")).json()).find((p: { name: string }) => p.name === "藤熟番茄");
  const policy = { snap_status: "accepted", snap_verified_on: today, snap_note: "Test only: demo vendor terminal." };
  expect((await page.request.put(`/api/admin/markets/${product.market_id}/snap`, { data: { ...policy, snap_model: "vendor_terminal" } })).ok()).toBe(true);
  expect((await page.request.put(`/api/admin/markets/${product.market_id}/vendors/${product.retailer_id}/snap`, { data: policy })).ok()).toBe(true);
  expect((await page.request.post("/api/auth/login", { data: { email: "retailer@qinghe.demo", password: "MarketDemo2026!" } })).ok()).toBe(true);
  expect((await page.request.put(`/api/retailer/products/${product.id}`, { data: { ...product, active: true, organic: !!product.organic, snap_eligibility: "eligible" } })).ok()).toBe(true);
  await page.request.post("/api/auth/logout");
  const bag = await openBag(page);
  const plus = bag.getByRole("button", { name: "切换付款偏好", exact: true });
  await plus.focus();
  await page.keyboard.press("Enter");
  await expect(bag.getByRole("radio", { name: "常规到场付款", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(bag.locator(".payment-current strong")).toHaveText("SNAP/EBT");
  await expect(plus).toBeFocused();
  await page.reload();
  await page.getByRole("button", { name: /^购物袋/ }).click();
  await expect(bag.locator(".payment-current strong")).toHaveText("SNAP/EBT");
  await bag.getByRole("button", { name: "登录后预购" }).click();
  await page.getByRole("button", { name: /顾客端演示/ }).click();
  await expect(bag.locator(".payment-current strong")).toHaveText("SNAP/EBT");
  await bag.getByRole("button", { name: "确认预购", exact: true }).click();
  await expect(page.locator(".order-payment")).toContainText("付款偏好：SNAP/EBT");
  const orders = await (await page.request.get("/api/orders")).json();
  expect(orders[0].payment_method).toBe("snap_ebt");
  await page.request.post("/api/auth/login", { data: { email: "retailer@qinghe.demo", password: "MarketDemo2026!" } });
  await page.reload();
  await expect(page.locator(".order-payment")).toContainText("到场完成付款");
});

test("320px 触屏和减少动态效果下能直接选择，英文说明完整且无溢出", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, hasTouch: true, isMobile: true, viewport: { width: 320, height: 844 }, reducedMotion: "reduce" });
  await context.addInitScript(() => localStorage.setItem("qinghe-language", "zh"));
  const page = await context.newPage();
  try {
    const bag = await openBag(page);
    await bag.getByLabel("关闭弹窗").tap();
    await page.getByRole("button", { name: "Switch to English", exact: true }).tap();
    await page.getByRole("button", { name: /^Shopping bag/ }).tap();
    const englishBag = page.getByRole("dialog", { name: "My shopping bag", exact: true });
    await englishBag.getByRole("button", { name: "Switch payment preference", exact: true }).tap();
    await englishBag.getByRole("radio", { name: "SNAP/EBT", exact: true }).tap();
    await expect(englishBag.locator(".payment-current strong")).toHaveText("SNAP/EBT");
    await expect(englishBag.locator(".payment-explanation")).toContainText("EBT card number, or PIN");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await context.close(); }
});

test("触屏长按切换一次，手指移出会取消，减少动态效果不播放进度动画", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  await context.addInitScript(() => localStorage.setItem("qinghe-language", "zh"));
  const page = await context.newPage();
  try {
    const bag = await openBag(page);
    const plus = bag.getByRole("button", { name: "切换付款偏好", exact: true });
    await plus.scrollIntoViewIfNeeded();
    const box = (await plus.boundingBox())!;
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const touch = await context.newCDPSession(page);
    await freeze(page);
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
    await page.clock.runFor(700);
    await expect(bag.locator(".payment-current strong")).toHaveText("SNAP/EBT");
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(plus).toHaveAttribute("aria-expanded", "false");
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
    await page.clock.runFor(300);
    expect(await bag.locator(".payment-hold-ring circle").evaluate((circle) => getComputedStyle(circle).animationName)).toBe("none");
    await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: point.x - 70, y: point.y }] });
    await page.clock.runFor(1000);
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(bag.locator(".payment-current strong")).toHaveText("SNAP/EBT");
    await expect(bag.locator(".payment-hold.is-holding")).toHaveCount(0);
  } finally { await context.close(); }
});
