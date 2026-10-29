import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, path = "/retailer") {
  await page.request.post("/api/auth/login", {
    data: { email: "retailer@qinghe.demo", password: "MarketDemo2026!" },
  });
  await page.goto(path);
}
async function createProduct(
  page: Page,
  overrides: Record<string, unknown> = {},
) {
  const config = await (await page.request.get("/api/config")).json();
  const response = await page.request.post("/api/retailer/products", {
    data: {
      name: `测试蔬菜 ${Date.now()}`,
      category: "叶菜类",
      art: "lettuce",
      unit: "把",
      price_cents: 425,
      stock: 4,
      description: "新鲜采收",
      organic: true,
      active: true,
      available_date: config.today,
      ...overrides,
    },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

test("经营待办直达筛选后的库存，刷新保留筛选", async ({ page }) => {
  await signIn(page);
  const product = await createProduct(page, { available_date: "2020-01-01" });
  await page.reload();
  await page.getByRole("button", { name: /核对售卖日期/ }).click();
  await expect(page).toHaveURL(/status=off-date/);
  await expect(
    page
      .getByRole("group", { name: "库存状态筛选" })
      .getByRole("button", { name: /非今日售卖/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("textbox", { name: "搜索库存商品" }).fill(product.name);
  await expect(
    page.getByRole("row").filter({ hasText: product.name }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page
      .getByRole("group", { name: "库存状态筛选" })
      .getByRole("button", { name: /非今日售卖/ }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("编辑商品有预览、未保存保护和失败重试，保存后顾客端同步", async ({
  page,
}) => {
  await signIn(page, "/retailer/inventory?new=1");
  const editor = page.getByRole("dialog", { name: "上架一份新鲜" });
  const name = `新鲜试吃菜 ${Date.now()}`;
  await editor.getByLabel("商品名称", { exact: true }).fill(name);
  await editor.getByLabel("售价（USD）").fill("6.25");
  await editor.getByLabel("可预购库存", { exact: true }).fill("7");
  await expect(editor.locator(".vendor-product-preview")).toContainText(name);
  await expect(editor.locator(".vendor-product-preview")).toContainText(
    "$6.25",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "继续编辑" }).click();
  await expect(editor.getByLabel("商品名称", { exact: true })).toHaveValue(
    name,
  );
  await page.route("**/api/retailer/products", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 503, json: { error: "保存失败，请重试" } })
      : route.continue(),
  );
  await editor.getByRole("button", { name: "保存商品" }).click();
  await expect(editor.getByRole("alert")).toHaveText("保存失败，请重试");
  await expect(editor.getByLabel("商品名称", { exact: true })).toHaveValue(
    name,
  );
  await page.unroute("**/api/retailer/products");
  await editor.getByRole("button", { name: "保存商品" }).click();
  await expect(editor).not.toBeVisible();
  await page.getByLabel("搜索库存商品").fill(name);
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toContainText("$6.25");
  await page.reload();
  await page.getByLabel("搜索库存商品").fill(name);
  await expect(row).toContainText("7 磅");
  const products = await (await page.request.get("/api/products")).json();
  expect(products.find((p: { name: string }) => p.name === name)).toMatchObject(
    { price_cents: 625, stock: 7 },
  );
});

test("上下架只改变展示状态并保留库存，英文编辑提交有效分类", async ({
  page,
}) => {
  await signIn(page);
  const product = await createProduct(page);
  await page.goto("/retailer/inventory");
  await page.getByLabel("搜索库存商品").fill(product.name);
  await page.getByRole("button", { name: `下架 ${product.name}` }).click();
  await page.getByRole("button", { name: "确认下架", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: product.name });
  await expect(row).toContainText("已下架");
  let stored = await (await page.request.get("/api/retailer/products")).json();
  expect(stored.find((p: { id: number }) => p.id === product.id)).toMatchObject(
    { stock: 4, active: 0 },
  );
  await page.getByRole("button", { name: `上架 ${product.name}` }).click();
  await expect(row).toContainText("今日在售");
  await page.getByRole("button", { name: "Switch to English" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Products & inventory",
  );
  await expect(page).toHaveTitle(/Products & inventory/);
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit product" });
  await editor.getByRole("combobox", { name: "Category", exact: true }).selectOption("根茎类");
  await editor.getByRole("button", { name: "Save product" }).click();
  await expect(editor).not.toBeVisible();
  stored = await (await page.request.get("/api/retailer/products")).json();
  expect(stored.find((p: { id: number }) => p.id === product.id)).toMatchObject(
    { category: "根茎类", stock: 4 },
  );
});

test("订单搜索、确认、自提收款和取消履约正确", async ({
  page,
  browser,
  baseURL,
}) => {
  await signIn(page);
  const product = await createProduct(page, { stock: 10 });
  const customer = await browser.newContext({ baseURL });
  await customer.request.post("/api/auth/login", {
    data: { email: "client@qinghe.demo", password: "MarketDemo2026!" },
  });
  const config = await (await customer.request.get("/api/config")).json();
  const order = await (
    await customer.request.post("/api/orders", {
      data: {
        items: [{ productId: product.id, quantity: 2 }],
        pickupSlot: config.pickupSlots[0],
        note: "请预留，谢谢",
      },
    })
  ).json();
  await page.goto("/orders");
  await page.getByLabel("搜索预购订单").fill(order.id);
  await expect(page.locator(".vendor-order")).toHaveCount(1);
  await page.getByRole("button", { name: "确认预购", exact: true }).click();
  await expect(page.locator(".vendor-order .status-badge")).toHaveText(
    "待自提",
  );
  await page
    .getByRole("button", { name: "确认已自提并收款", exact: true })
    .click();
  let modal = page.getByRole("dialog");
  await expect(modal).toContainText("$8.50");
  await page.getByRole("button", { name: "返回订单" }).click();
  await expect(page.locator(".vendor-order .status-badge")).toHaveText(
    "待自提",
  );
  await page
    .getByRole("button", { name: "确认已自提并收款", exact: true })
    .click();
  await page.getByRole("button", { name: "确认完成", exact: true }).click();
  await expect(page.locator(".vendor-order .status-badge")).toHaveText(
    "已完成",
  );
  const cancelled = await (
    await customer.request.post("/api/orders", {
      data: {
        items: [{ productId: product.id, quantity: 1 }],
        pickupSlot: config.pickupSlots[0],
      },
    })
  ).json();
  await page.reload();
  await page.getByLabel("搜索预购订单").fill(cancelled.id);
  await page.getByRole("button", { name: "取消订单", exact: true }).click();
  modal = page.getByRole("dialog");
  await modal.getByRole("button", { name: "确认取消", exact: true }).click();
  await expect(page.locator(".vendor-order .status-badge")).toHaveText(
    "已取消",
  );
  const stored = await (
    await page.request.get("/api/retailer/products")
  ).json();
  expect(stored.find((p: { id: number }) => p.id === product.id).stock).toBe(8);
  await customer.close();
});

for (const width of [320, 390]) {
  test(`商户 ${width}px 页面可用且无横向溢出`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await signIn(page);
    for (const path of ["/retailer", "/retailer/inventory", "/orders"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.locator(".loading-panel")).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
    await page.goto("/retailer/inventory?new=1");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByLabel("商品名称", { exact: true }).fill("手机上架");
    await page.getByLabel("售价（USD）").fill("3");
    await expect(page.getByRole("button", { name: "保存商品" })).toBeEnabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}
