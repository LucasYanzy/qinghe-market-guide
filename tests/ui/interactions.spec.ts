import { expect, test, type Page } from "@playwright/test";

const cartTitle = "我的新鲜购物袋";
async function openCart(page: Page, quantity = 1) {
  await page.goto("/");
  for (let i = 0; i < quantity; i++) {
    await page
      .getByRole("button", { name: "将藤熟番茄加入购物袋", exact: true })
      .click();
  }
  await page.getByRole("button", { name: /^购物袋/ }).click();
  return page.getByRole("dialog", { name: cartTitle });
}

test("顾客登录后恢复自提信息，明确确认后才创建订单", async ({ page }) => {
  let submissions = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/orders") && request.method() === "POST")
      submissions++;
  });
  const cart = await openCart(page, 2);
  const slot = await cart.getByLabel("选择自提时段").selectOption({ index: 1 });
  await cart.getByRole("textbox").fill("请帮我留一份，谢谢");
  await cart.getByRole("button", { name: "登录后预购" }).click();
  await page.getByRole("button", { name: /顾客端演示/ }).click();
  await expect(cart).toBeVisible();
  await expect(cart.getByLabel("选择自提时段")).toHaveValue(slot[0]);
  await expect(cart.getByRole("textbox")).toHaveValue("请帮我留一份，谢谢");
  expect(submissions).toBe(0);
  await cart.getByRole("button", { name: "确认预购", exact: true }).click();
  await expect(cart).not.toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "我的预购",
  );
  await expect(page.getByText("备注：请帮我留一份，谢谢")).toBeVisible();
  expect(submissions).toBe(1);
});

test("取消登录仍返回购物袋，关闭再打开也保留备注", async ({ page }) => {
  const cart = await openCart(page);
  await cart.getByRole("textbox").fill("暂时不登录");
  await cart.getByRole("button", { name: "登录后预购" }).click();
  await expect(
    page.getByRole("dialog", { name: "你好，欢迎来到青禾" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(cart).toBeVisible();
  await expect(cart.getByRole("textbox")).toHaveValue("暂时不登录");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /^购物袋/ })).toBeFocused();
  await page.getByRole("button", { name: /^购物袋/ }).click();
  await expect(cart.getByRole("textbox")).toHaveValue("暂时不登录");
});

test("提交时锁定内容和关闭操作，失败后保留输入并允许重试", async ({ page }) => {
  const cart = await openCart(page);
  await cart.getByRole("button", { name: "登录后预购" }).click();
  await page.getByRole("button", { name: /顾客端演示/ }).click();
  await expect(cart).toBeVisible();
  await cart.getByRole("textbox").fill("失败后也要保留");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/orders", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await gate;
    await route.fulfill({
      status: 503,
      json: { error: "市集暂时繁忙，请重试。" },
    });
  });
  await cart.getByRole("button", { name: "确认预购", exact: true }).click();
  await expect(cart).toHaveAttribute("aria-busy", "true");
  await expect(cart.getByRole("textbox")).toBeDisabled();
  await expect(cart.getByLabel("关闭弹窗")).toBeDisabled();
  await expect(cart.getByLabel("减少藤熟番茄")).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Tab");
  await expect(cart).toBeFocused();
  await page.locator(".modal-backdrop").click({ position: { x: 2, y: 2 } });
  await expect(cart).toBeVisible();
  release();
  await expect(cart.getByRole("alert")).toHaveText("市集暂时繁忙，请重试。");
  await expect(cart.getByRole("textbox")).toBeEnabled();
  await expect(cart.getByRole("textbox")).toHaveValue("失败后也要保留");
  await page.unroute("**/api/orders");
  await cart.getByRole("button", { name: "确认预购", exact: true }).click();
  await expect(cart).not.toBeVisible();
  await expect(page.getByText("备注：失败后也要保留")).toBeVisible();
});

test("库存降低时提供明确提示和一键修正", async ({ page }) => {
  const cart = await openCart(page, 2);
  await page.route("**/api/products", async (route) => {
    const response = await route.fetch();
    const products = await response.json();
    await route.fulfill({
      json: products.map((p: { name: string }) =>
        p.name === "藤熟番茄" ? { ...p, stock: 1 } : p,
      ),
    });
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(cart.getByText("当前仅剩 1 磅")).toBeVisible();
  await expect(cart.getByRole("button", { name: "登录后预购" })).toBeDisabled();
  await cart.getByRole("button", { name: "调整至可购数量" }).click();
  await expect(cart.getByRole("button", { name: "登录后预购" })).toBeEnabled();
  await expect(cart.getByLabel("增加藤熟番茄")).toBeDisabled();
});

test("已下架商品可移除，不阻塞后续浏览", async ({ page }) => {
  const cart = await openCart(page);
  await page.route("**/api/products", (route) => route.fulfill({ json: [] }));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(cart.getByText("商品已下架，请移除后继续预购。")).toBeVisible();
  await cart.getByRole("button", { name: "移除", exact: true }).click();
  await expect(
    cart.getByRole("heading", { name: "购物袋在等一份新鲜" }),
  ).toBeVisible();
});

test("键盘焦点留在弹窗内，输入时不跳转，关闭后回到触发按钮", async ({
  page,
}) => {
  const cart = await openCart(page);
  const note = cart.getByRole("textbox");
  await note.fill("键盘操作");
  await expect(note).toBeFocused();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(note).toBeFocused();
  await cart.getByLabel("关闭弹窗").focus();
  await page.keyboard.press("Shift+Tab");
  await expect(cart.getByRole("button", { name: "登录后预购" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(cart.getByLabel("关闭弹窗")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /^购物袋/ })).toBeFocused();
});

test("从我的预购登录后继续查看订单", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "我的预购", exact: true }).click();
  await page.getByRole("button", { name: "登录 / 注册", exact: true }).click();
  await page.getByRole("button", { name: /顾客端演示/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "我的预购",
  );
  await expect(
    page.getByRole("link", { name: "我的预购", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

test("手机购物袋可操作且没有横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const cart = await openCart(page);
  await cart.getByRole("textbox").fill("手机预购");
  await expect(
    cart.getByRole("button", { name: "登录后预购" }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("登录等待时不能切换角色或关闭，失败后保留邮箱", async ({ page }) => {
  const cart = await openCart(page);
  await cart.getByRole("button", { name: "登录后预购" }).click();
  const auth = page.getByRole("dialog", { name: "你好，欢迎来到青禾" });
  await auth.getByLabel("邮箱地址").fill("client@qinghe.demo");
  await auth.getByLabel("密码", { exact: true }).fill("incorrect-password");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/auth/login", async (route) => {
    await gate;
    await route.fulfill({ status: 401, json: { error: "邮箱或密码不正确" } });
  });
  await auth.getByRole("button", { name: "登录", exact: true }).click();
  await expect(auth.getByLabel("邮箱地址")).toBeDisabled();
  await expect(auth.getByRole("button", { name: /商户端演示/ })).toBeDisabled();
  await expect(
    auth.getByRole("button", { name: "注册顾客账号" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(auth).toBeVisible();
  release();
  await expect(auth.getByRole("alert")).toHaveText("邮箱或密码不正确");
  await expect(auth.getByLabel("邮箱地址")).toHaveValue("client@qinghe.demo");
  await expect(auth.getByLabel("邮箱地址")).toBeEnabled();
});

test("商户保存期间锁定编辑弹窗，保存结果可重新读取", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "商户入口", exact: true }).click();
  await page.getByRole("button", { name: /商户端演示/ }).click();
  await page.getByRole("link", { name: "商品与库存", exact: true }).click();
  await page.getByRole("button", { name: "编辑", exact: true }).first().click();
  const editor = page.getByRole("dialog", { name: "编辑这份新鲜" });
  await editor.getByLabel("关于这份新鲜").fill("商户交互测试：当季采收");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/retailer/products/*", async (route) => {
    if (route.request().method() === "PUT") await gate;
    await route.continue();
  });
  await editor.getByRole("button", { name: "保存商品" }).click();
  await expect(editor.getByLabel("商品名称")).toBeDisabled();
  await expect(editor.getByLabel("关闭弹窗")).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(editor).toBeVisible();
  release();
  await expect(editor).not.toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "商品已保存" })).toBeVisible();
  await page.getByRole("button", { name: "编辑", exact: true }).first().click();
  await expect(editor.getByLabel("关于这份新鲜")).toHaveValue(
    "商户交互测试：当季采收",
  );
});

test("订单取消等待时不能关闭或重复操作，完成后显示取消状态", async ({
  page,
}) => {
  await page.request.post("/api/auth/login", {
    data: { email: "client@qinghe.demo", password: "MarketDemo2026!" },
  });
  const products = await (await page.request.get("/api/products")).json();
  const config = await (await page.request.get("/api/config")).json();
  const response = await page.request.post("/api/orders", {
    data: {
      items: [{ productId: products[0].id, quantity: 1 }],
      pickupSlot: config.pickupSlots[0],
      note: "取消交互测试",
    },
  });
  expect(response.ok()).toBe(true);
  const order = await response.json();
  await page.goto("/");
  await page.getByRole("link", { name: "我的预购", exact: true }).click();
  const card = page.locator(".order-card").filter({ hasText: order.id });
  await card.getByRole("button", { name: "取消订单", exact: true }).click();
  const cancel = page.getByRole("dialog", { name: "取消这份预购？" });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/orders/${order.id}/status`, async (route) => {
    await gate;
    await route.continue();
  });
  await cancel.getByRole("button", { name: "确认取消" }).click();
  await expect(cancel.getByRole("button", { name: "保留订单" })).toBeDisabled();
  await expect(
    cancel.getByRole("button", { name: "正在取消…" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(cancel).toBeVisible();
  release();
  await expect(cancel).not.toBeVisible();
  await expect(card.locator(".status-badge")).toHaveText("已取消");
});
