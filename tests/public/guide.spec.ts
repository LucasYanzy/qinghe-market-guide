import { test, expect, type Page } from "@playwright/test";

// These workflow cases intentionally cover Chinese; fresh-visit defaults are checked separately.
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    if (localStorage.getItem("qinghe-language") === null) localStorage.setItem("qinghe-language", "zh");
  });
});

const toolbar = (page: Page) => page.locator(".interactive-demo-toolbar");
const bag = (page: Page) => page.getByRole("dialog", { name: "我的新鲜购物袋", exact: true });
async function role(page: Page, name: string) {
  await toolbar(page).getByRole("button", { name, exact: true }).click();
  await expect(toolbar(page).getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
}

test("visitors use the real order and inventory workflow without an account or external API", async ({ page }) => {
  const apiRequests: string[] = [], errors: string[] = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await expect(toolbar(page).getByRole("button", { name: "顾客", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".product-card")).toHaveCount(8);
  await expect(page.getByRole("textbox", { name: /邮箱|密码/ })).toHaveCount(0);
  await page.getByRole("button", { name: "将藤熟番茄加入购物袋", exact: true }).click();
  await page.getByRole("button", { name: /^购物袋/ }).click();
  await bag(page).getByRole("textbox").fill("完整流程体验");
  await bag(page).getByRole("button", { name: "确认预购", exact: true }).click();
  await expect(bag(page).getByRole("heading", { name: "提交前确认预购", exact: true })).toBeVisible();
  await bag(page).getByRole("button", { name: "确认并提交预购", exact: true }).click();
  await expect(page).toHaveURL(/qinghe-market-guide\/orders$/);
  await expect(page.locator(".order-note")).toContainText("完整流程体验");
  const orderId = await page.locator(".order-card").first().getByText(/^QH-/).textContent();
  await role(page, "商户");
  await page.getByRole("navigation", { name: "主导航", exact: true }).getByRole("link", { name: "预购订单", exact: true }).click();
  const order = page.locator(".order-card").filter({ hasText: orderId!.trim() });
  await order.getByRole("button", { name: "确认预购", exact: true }).click();
  await expect(order.locator(".status-badge")).toHaveText("待到场自提");
  await role(page, "顾客");
  await page.getByRole("navigation", { name: "主导航", exact: true }).getByRole("link", { name: "我的预购", exact: true }).click();
  await expect(page.locator(".order-card").filter({ hasText: orderId!.trim() }).locator(".status-badge")).toHaveText("待到场自提");
  await page.reload();
  await expect(page.locator(".order-note")).toContainText("完整流程体验");
  const code = await page.locator('.customer-pickup-code strong').innerText();
  await role(page, "商户");
  await page.getByRole("navigation", { name: "主导航", exact: true }).getByRole("link", { name: "预购订单", exact: true }).click();
  const pickup = order.getByRole('form', { name: '取货核验与现场登记', exact: true });
  await expect(pickup).toBeVisible();
  await expect(pickup.getByLabel('6 位取货码', { exact: true })).toHaveValue('');
  await pickup.getByLabel('6 位取货码', { exact: true }).fill(code);
  await pickup.getByRole('button', { name: '已收全额现金', exact: true }).click();
  await pickup.getByRole('button', { name: '登记交付与现场收款', exact: true }).click();
  await expect(order.locator('.status-badge')).toHaveText('已完成');
  await role(page, "顾客");
  await page.getByRole("navigation", { name: "主导航", exact: true }).getByRole("link", { name: "我的预购", exact: true }).click();
  await expect(order.locator('.status-badge')).toHaveText('已完成');
  await page.reload();
  await expect(order.locator('.status-badge')).toHaveText('已完成');
  expect(apiRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test("vendor edits persist and school statistics reflect sample orders", async ({ page }) => {
  await page.goto("./");
  await role(page, "商户");
  await page.getByRole("navigation", { name: "主导航", exact: true }).getByRole("link", { name: "商品与库存", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: "藤熟番茄" });
  await row.getByRole("button", { name: /编辑/ }).click();
  const editor = page.getByRole("dialog");
  await editor.getByLabel("售价（USD）", { exact: true }).fill("4.50");
  await editor.getByRole("button", { name: "保存商品", exact: true }).click();
  await expect(editor).not.toBeVisible();
  await role(page, "顾客");
  await expect(page.locator(".product-card").filter({ hasText: "藤熟番茄" })).toContainText("$4.50");
  await page.getByRole("button", { name: "将藤熟番茄加入购物袋", exact: true }).click();
  await page.getByRole("button", { name: /^购物袋/ }).click();
  await bag(page).getByRole("button", { name: "确认预购", exact: true }).click();
  await expect(bag(page).getByRole("heading", { name: "提交前确认预购", exact: true })).toBeVisible();
  await bag(page).getByRole("button", { name: "确认并提交预购", exact: true }).click();
  await expect(page.locator(".order-card")).toHaveCount(1);
  await role(page, "学校");
  await expect(page.locator(".analytics-stat")).toHaveCount(8);
  await expect(page.locator(".analytics-stat").filter({ hasText: "全平台预购" }).locator(":scope > strong")).toHaveText("1");
  await expect(page.getByRole("button", { name: /登录|注册/ })).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".analytics-stat")).toHaveCount(8);
});

test("guide deep links, English and phone roles work in the interactive build", async ({ page }) => {
  await page.goto("markets/?date=2026-10-31");
  await expect(page.getByRole("region", { name: "开市日历", exact: true })).toBeVisible();
  await expect(page.getByLabel("选择出行日期", { exact: true })).toHaveValue("2026-10-31");
  await page.reload();
  await expect(page.getByLabel("选择出行日期", { exact: true })).toHaveValue("2026-10-31");
  await page.getByRole("button", { name: "Switch to English", exact: true }).click();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of ["Vendor", "University", "Customer"]) {
      await role(page, name);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(() => ({ width: document.documentElement.scrollWidth - innerWidth,
        elements: Array.from(document.querySelectorAll("body *")).filter(el => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 12).map(el => ({ tag: el.tagName, class: el.className, text: el.textContent?.slice(0, 70), right: el.getBoundingClientRect().right })) }));
      expect(overflow.width, `${width} ${name}: ${JSON.stringify(overflow.elements)}`).toBeLessThanOrEqual(1);
    }
  }
});

test("reset clears only this visitor's data and a new tab gets independent state", async ({ page, context }) => {
  await page.goto("./");
  await expect(page.locator(".product-card")).toHaveCount(8);
  await page.getByRole("button", { name: "将藤熟番茄加入购物袋", exact: true }).click();
  await page.getByRole("button", { name: /^购物袋/ }).click();
  await bag(page).getByRole("button", { name: "确认预购", exact: true }).click();
  await expect(bag(page).getByRole("heading", { name: "提交前确认预购", exact: true })).toBeVisible();
  await bag(page).getByRole("button", { name: "确认并提交预购", exact: true }).click();
  await expect(page.locator(".order-card")).toHaveCount(1);
  const another = await context.newPage();
  await another.goto("orders/");
  await expect(toolbar(another)).toBeVisible();
  await expect(another.locator(".order-card")).toHaveCount(0);
  await another.close();
  await toolbar(page).getByRole("button", { name: "重置", exact: true }).click();
  await page.getByRole("button", { name: "确认重置", exact: true }).click();
  await expect(page.locator(".product-card")).toHaveCount(8);
  await page.getByRole("navigation", { name: "主导航", exact: true }).getByRole("link", { name: "我的预购", exact: true }).click();
  await expect(page.locator(".order-card")).toHaveCount(0);
});

async function demoApi(page: Page, path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  return page.evaluate(async ({ path, method, body, headers }) => {
    const response = await fetch(`/api${path}`, { method, headers: { "Content-Type": "application/json", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, data: await response.json() };
  }, { path, method, body, headers });
}

test("the complete public app includes every customer, vendor and university page", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const path of ["", "markets/", "prices/", "help/", "about/", "orders/", "vendor/", "notifications/", "retailer/", "retailer/inventory/", "admin/", "admin/markets/", "admin/vendors/", "admin/impact/", "admin/community/", "admin/operations/", "admin/screen/"]) {
    await page.goto(`./${path}`);
    await expect(toolbar(page)).toBeVisible();
    await expect(page.locator(".boot-screen, .loading-panel, .page-loading")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: /登录|注册/ })).toHaveCount(0);
  }
  await expect(page.locator(".screen-kpis")).toBeVisible();
  await expect(page.getByRole("link", { name: "返回管理", exact: true })).toHaveAttribute("href", "/qinghe-market-guide/admin");
  await expect(page.getByRole("link", { name: "打开现场运营", exact: true })).toHaveAttribute("href", /^\/qinghe-market-guide\/admin\/operations\?/);
  await page.getByRole("link", { name: "打开现场运营", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "工作日期", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("school operations, idempotent booking, validation rollback and pickup work through the shared routes", async ({ page }) => {
  await page.goto("admin/operations/");
  await expect(toolbar(page).getByRole("button", { name: "学校", exact: true })).toHaveAttribute("aria-pressed", "true");
  const today = (await demoApi(page, "/config")).data.today;
  const date = new Date(Date.parse(`${today}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const created = await demoApi(page, "/admin/markets", "POST", {
    name: "Demo service desk", subtitle: "", address: "Sample campus road", latitude: 40.5, longitude: -74.45,
    hours: "Sample session", description: "", community: "", coverage_radius_km: 1, active: true, preorders_enabled: true,
  });
  expect(created.status).toBe(201);
  const marketId = created.data.id;
  const vendor = await demoApi(page, "/admin/assisted-vendors", "POST", { name: "Sample assisted farm", marketId });
  expect(vendor.status).toBe(201);
  const product = await demoApi(page, "/admin/operations/products", "POST", {
    marketId, vendorId: vendor.data.id, name: "Sample greens", unit: "把", priceCents: 450, stock: 10, date, category: "叶菜类",
  });
  expect(product.status).toBe(201);
  const session = await demoApi(page, "/admin/sessions", "POST", { marketId, date, startsAt: "09:00", endsAt: "10:00", cutoff: "08:00", slotMinutes: 30, capacity: 1 });
  expect(session.status).toBe(201);
  expect((await demoApi(page, `/admin/sessions/${session.data.id}`, "PATCH", { status: "open", version: 0 })).status).toBe(200);
  await demoApi(page, "/demo/role", "POST", { role: "client" });
  expect((await demoApi(page, "/admin/markets")).status).toBe(403);
  await page.goto(`./?date=${date}&market=${marketId}`);
  const sessionLink = page.getByRole("link", { name: "查看本场商品", exact: true });
  await expect(sessionLink).toHaveAttribute("href", `/qinghe-market-guide/?date=${date}&market=${marketId}#today-produce`);
  await sessionLink.click();
  await expect(page.locator(".product-card")).toHaveCount(1);
  const payload = { items: [{ productId: product.data.id, quantity: 2 }], pickupSlot: "09:00–09:30", note: "Shared services" };
  const first = await demoApi(page, "/orders", "POST", payload, { "Idempotency-Key": "browser-order-123" });
  expect(first.status, JSON.stringify(first.data)).toBe(201);
  const repeat = await demoApi(page, "/orders", "POST", payload, { "Idempotency-Key": "browser-order-123" });
  expect(repeat.data.id).toBe(first.data.id);
  expect((await demoApi(page, "/orders", "POST", payload)).status).toBe(409);
  const listed = await demoApi(page, `/products?date=${date}&marketId=${marketId}`);
  expect(listed.data[0].stock).toBe(8);
  await demoApi(page, "/demo/role", "POST", { role: "admin" });
  expect((await demoApi(page, `/admin/operations/orders/${first.data.id}`, "PATCH", { status: "confirmed" })).status).toBe(200);
  const receipt = { pickupCode: first.data.pickup_code, cashCents: 900, cardCents: 0, snapCents: 0, reference: "Sample receipt" };
  const wrongCode = first.data.pickup_code === "000000" ? "111111" : "000000";
  expect((await demoApi(page, `/admin/operations/orders/${first.data.id}/pickup`, "POST", { ...receipt, pickupCode: wrongCode })).status).toBe(400);
  expect((await demoApi(page, `/admin/operations/orders/${first.data.id}/pickup`, "POST", receipt)).status).toBe(409);
  await page.clock.setSystemTime(new Date(`${date}T16:00:00Z`));
  expect((await demoApi(page, `/admin/operations/orders/${first.data.id}/pickup`, "POST", { ...receipt, cashCents: 1 })).status).toBe(400);
  expect((await demoApi(page, `/admin/operations/orders/${first.data.id}/pickup`, "POST", receipt)).status).toBe(200);
  expect((await demoApi(page, `/admin/operations/orders/${first.data.id}/pickup`, "POST", receipt)).status).toBe(409);
  const operations = await demoApi(page, `/admin/operations?date=${date}&marketId=${marketId}`);
  expect(operations.data.orders[0].receipt.cash_cents).toBe(900);
  await page.reload();
  expect((await demoApi(page, `/admin/operations?date=${date}&marketId=${marketId}`)).data.orders[0].status).toBe("completed");
});

test("approved vendor applications preserve the same person's customer and vendor roles without login", async ({ page }) => {
  await page.goto("./");
  await expect(toolbar(page)).toBeVisible();
  const customer = (await demoApi(page, "/auth/me")).data.user;
  expect((await demoApi(page, "/auth/role", "POST", { role: "admin" })).status).toBe(403);
  const marketId = (await demoApi(page, "/markets")).data.find((market: { active: number }) => market.active).id;
  const application = await demoApi(page, "/vendor/applications", "POST", {
    marketId, businessName: "Demo applicant farm", contactName: "Sample farmer", phone: "", description: "Local sample produce",
  });
  expect(application.status).toBe(201);
  await demoApi(page, "/demo/role", "POST", { role: "admin" });
  expect((await demoApi(page, `/admin/applications/${application.data.id}`, "PATCH", { status: "approved", note: "Demo review", version: 0 })).status).toBe(200);
  await demoApi(page, "/demo/role", "POST", { role: "client" });
  const approved = (await demoApi(page, "/auth/me")).data.user;
  expect(approved.id).toBe(customer.id);
  expect(approved.roles.sort()).toEqual(["client", "retailer"]);
  const switched = await demoApi(page, "/auth/role", "POST", { role: "retailer" });
  expect(switched.status).toBe(200);
  expect(switched.data.user.id).toBe(customer.id);
  await page.goto("retailer/inventory/");
  await expect(toolbar(page).getByRole("button", { name: "商户", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect((await demoApi(page, "/auth/me")).data.user.id).toBe(customer.id);
  expect((await demoApi(page, "/auth/role", "POST", { role: "client" })).data.user.id).toBe(customer.id);
});
