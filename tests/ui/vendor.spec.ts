import {
  expect,
  test as base,
  type APIRequestContext,
  type Page,
  type Playwright,
} from "@playwright/test";

type AuthState = Awaited<ReturnType<APIRequestContext["storageState"]>>;
async function authenticate(
  playwright: Playwright,
  baseURL: string | undefined,
  email: string,
) {
  const request = await playwright.request.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  try {
    const response = await request.post("/api/auth/login", {
      data: { email, password: "MarketDemo2026!" },
    });
    expect(response.ok()).toBe(true);
    return await request.storageState();
  } finally {
    await request.dispose();
  }
}
// Reuse role-specific sessions; every test still has its own browser context.
// Starting from an empty state prevents account switches from retiring another role's session.
const test = base.extend<
  {},
  { vendorState: AuthState; customerState: AuthState }
>({
  vendorState: [
    async ({ playwright }, use, info) => {
      await use(
        await authenticate(
          playwright,
          info.project.use.baseURL,
          "retailer@qinghe.demo",
        ),
      );
    },
    { scope: "worker" },
  ],
  customerState: [
    async ({ playwright }, use, info) => {
      await use(
        await authenticate(
          playwright,
          info.project.use.baseURL,
          "client@qinghe.demo",
        ),
      );
    },
    { scope: "worker" },
  ],
  storageState: async ({ vendorState }, use) => {
    await use(vendorState);
  },
});

async function signIn(page: Page, path = "/retailer") {
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

async function reserveProduct(
  browser: import("@playwright/test").Browser,
  baseURL: string | undefined,
  productId: number,
  customerState: AuthState,
) {
  const customer = await browser.newContext({
    baseURL,
    storageState: customerState,
  });
  try {
    const config = await (await customer.request.get("/api/config")).json();
    const response = await customer.request.post("/api/orders", {
      data: {
        items: [{ productId, quantity: 1 }],
        pickupSlot: config.pickupSlots[0],
      },
    });
    expect(response.status()).toBe(201);
    return response.json();
  } finally {
    await customer.close();
  }
}

for (const kind of ["dashboard", "inventory", "orders"] as const) {
  test(`${kind} 首次加载显示占位，刷新失败保留内容并可恢复`, async ({
    page,
    browser,
    baseURL,
    customerState,
  }) => {
    await signIn(page, "/about");
    const product = await createProduct(page);
    if (kind === "orders") {
      const order = await reserveProduct(
        browser,
        baseURL,
        product.id,
        customerState,
      );
      expect(
        (
          await page.request.patch(`/api/orders/${order.id}/status`, {
            data: { status: "confirmed" },
          })
        ).ok(),
      ).toBe(true);
      await reserveProduct(browser, baseURL, product.id, customerState);
    }
    const endpoint =
      kind === "dashboard"
        ? "retailer/dashboard"
        : kind === "inventory"
          ? "retailer/products"
          : "orders";
    const path =
      kind === "dashboard"
        ? "/retailer"
        : `${kind === "inventory" ? "/retailer/inventory" : "/orders"}?search=${encodeURIComponent(product.name)}`;
    let mode: "hold" | "fail" | "ok" = "hold";
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(`**/api/${endpoint}`, async (route) => {
      if (mode === "hold") await held;
      if (mode === "fail")
        await route.fulfill({
          status: 503,
          json: { error: "服务器暂时无法完成请求，请重试。" },
        });
      else await route.continue();
    });
    try {
      await page.goto(path);
      await expect(page.locator(".vendor-skeleton")).toBeVisible();
      await expect(
        page.locator(
          ".vendor-metrics, .vendor-inventory-counts, .vendor-order-grid",
        ),
      ).toHaveCount(0);
    } finally {
      mode = "ok";
      release();
    }
    const feedback = page.locator(".vendor-data-feedback");
    await expect(feedback).toContainText("已读取最新数据");
    await expect(feedback.locator("time")).toHaveAttribute("datetime", /T/);
    const content = page.locator(
      kind === "dashboard"
        ? ".vendor-metrics"
        : kind === "inventory"
          ? ".vendor-table tbody"
          : ".vendor-order-grid",
    );
    await expect(content).toBeVisible();
    const before = await content.innerText();
    if (kind === "inventory")
      await page.getByRole("checkbox", { name: "选择本页商品" }).check();
    mode = "fail";
    await page.getByRole("button", { name: "刷新数据", exact: true }).click();
    await expect(feedback).toHaveAttribute("role", "alert");
    await expect(feedback).toContainText("显示上次读取的数据");
    await expect(content).toHaveText(before, { useInnerText: true });
    if (kind === "inventory") {
      await expect(page.getByLabel("搜索库存商品")).toHaveValue(product.name);
      await expect(
        page.getByRole("button", { name: "编辑", exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole("button", { name: `调整 ${product.name} 库存` }),
      ).toBeDisabled();
      await expect(
        page.getByRole("button", { name: "批量下架", exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole("checkbox", { name: "选择本页商品" }),
      ).toBeChecked();
    } else if (kind === "orders") {
      await expect(
        page.getByRole("button", { name: "确认预购", exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole("button", { name: "确认已自提并收款", exact: true }),
      ).toBeDisabled();
      await page.getByRole("button", { name: "备货清单", exact: true }).click();
      await expect(
        page.getByRole("region", { name: "备货清单" }),
      ).toContainText(product.name);
    }
    mode = "ok";
    await feedback.getByRole("button", { name: "重新加载" }).click();
    await expect(feedback).toContainText("已读取最新数据");
    await expect(feedback).toHaveAttribute("role", "status");
    if (kind === "inventory")
      await expect(
        page.getByRole("button", { name: "编辑", exact: true }),
      ).toBeEnabled();
    if (kind === "orders")
      await expect(
        page.getByRole("button", { name: "备货清单", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Switch to English" }).click();
    await expect(feedback).toContainText("Data is up to date");
  });
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
  await expect(page.getByLabel("搜索库存商品")).toHaveValue(product.name);
  await page
    .getByRole("combobox", { name: "排序", exact: true })
    .selectOption("stock");
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "排序", exact: true }),
  ).toHaveValue("stock");
  await page
    .getByRole("navigation", { name: "主导航" })
    .getByRole("link", { name: "商品与库存", exact: true })
    .click();
  await expect(page.getByLabel("搜索库存商品")).toHaveValue("");
  await page.goBack();
  await expect(page.getByLabel("搜索库存商品")).toHaveValue(product.name);
});

test("图表日期和自提安排直达对应订单筛选", async ({ page }) => {
  await signIn(page);
  const config = await (await page.request.get("/api/config")).json();
  const chart = page.getByRole("region", { name: "近七天预购金额" });
  await expect(chart.getByRole("button")).toHaveCount(7);
  await chart.getByRole("button").last().click();
  await expect(page.getByLabel("自提日期", { exact: true })).toHaveValue(
    config.today,
  );
  await page.reload();
  await expect(page.getByLabel("自提日期", { exact: true })).toHaveValue(
    config.today,
  );
  await page.goBack();
  await page
    .getByRole("region", { name: "今日自提安排" })
    .getByRole("button")
    .first()
    .click();
  await expect(
    page.getByRole("combobox", { name: "自提时段", exact: true }),
  ).toHaveValue(config.pickupSlots[0]);
  await expect(
    page
      .getByRole("group", { name: "订单状态筛选" })
      .getByRole("button", { name: /^待履约/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Switch to English" }).click();
  await expect(
    page.getByRole("combobox", { name: "Order sorting" }),
  ).toHaveValue("priority");
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("Pickup date", { exact: true })).toHaveValue("");
  await expect(
    page.getByRole("combobox", { name: "Pickup time", exact: true }),
  ).toHaveValue("");
});

test("快捷补货遇到预购扣减时重新核对库存", async ({
  page,
  browser,
  baseURL,
  customerState,
}) => {
  await signIn(page);
  const product = await createProduct(page, { stock: 10 });
  await page.goto(
    `/retailer/inventory?search=${encodeURIComponent(product.name)}`,
  );
  await page.getByRole("button", { name: `调整 ${product.name} 库存` }).click();
  const modal = page.getByRole("dialog", { name: "调整可预购库存" });
  await expect(modal.getByRole("button", { name: "确认调整" })).toBeDisabled();
  await modal.getByRole("button", { name: "+10 把", exact: true }).click();
  await expect(modal.getByRole("status")).toContainText("+10 把");
  await reserveProduct(browser, baseURL, product.id, customerState);
  await modal.getByRole("button", { name: "确认调整" }).click();
  await expect(modal.getByRole("alert")).toContainText("库存已变化");
  await modal.getByRole("button", { name: "读取最新库存" }).click();
  await expect(modal.getByLabel("调整后的可预购数量")).toHaveValue("9");
  await modal.getByRole("button", { name: "+5 把", exact: true }).click();
  await modal.getByRole("button", { name: "确认调整" }).click();
  await expect(modal).not.toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: product.name }),
  ).toContainText("14 把");
});

test("编辑冲突读取失败可重试，保留商品草稿", async ({
  page,
  browser,
  baseURL,
  customerState,
}) => {
  await signIn(page);
  const product = await createProduct(page);
  await page.goto(`/retailer/inventory?product=${product.id}`);
  const modal = page.getByRole("dialog", { name: "编辑这份新鲜" });
  const updatedName = `${product.name} 已修改`;
  await modal.getByLabel("商品名称", { exact: true }).fill(updatedName);
  await modal.getByLabel("售价（USD）").fill("5.75");
  await reserveProduct(browser, baseURL, product.id, customerState);
  await modal.getByRole("button", { name: "保存商品" }).click();
  await expect(modal.getByRole("alert")).toContainText("库存已变化");
  await page.route("**/api/retailer/products", (route) =>
    route.fulfill({ status: 503, json: { error: "保存失败，请重试" } }),
  );
  await modal.getByRole("button", { name: "读取最新库存" }).click();
  await expect(modal.getByRole("alert")).toHaveText("保存失败，请重试");
  await page.unroute("**/api/retailer/products");
  await modal.getByRole("button", { name: "读取最新库存" }).click();
  await expect(modal.getByLabel("可预购库存", { exact: true })).toHaveValue(
    "3",
  );
  await expect(modal.getByLabel("商品名称", { exact: true })).toHaveValue(
    updatedName,
  );
  await expect(modal.getByLabel("售价（USD）")).toHaveValue("5.75");
  await modal.getByRole("button", { name: "保存商品" }).click();
  await expect(modal).not.toBeVisible();
  await page.getByLabel("搜索库存商品").fill(updatedName);
  await expect(
    page.getByRole("row").filter({ hasText: updatedName }),
  ).toContainText("3 把");
});

test("确认订单离开待办队列后可从反馈定位", async ({
  page,
  browser,
  baseURL,
  customerState,
}) => {
  await signIn(page);
  const product = await createProduct(page);
  const order = await reserveProduct(
    browser,
    baseURL,
    product.id,
    customerState,
  );
  await page.goto(`/orders?status=pending&search=${order.id}`);
  await page.getByRole("button", { name: "确认预购", exact: true }).click();
  await expect(page.locator(".vendor-order")).toHaveCount(0);
  await page.getByRole("button", { name: "查看此订单", exact: true }).click();
  await expect(page.locator(".vendor-order .status-badge")).toHaveText(
    "待自提",
  );
  await expect(page.getByLabel("搜索预购订单")).toHaveValue(order.id);
  await expect(page).toHaveURL(/status=confirmed/);
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
  await editor
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption("根茎类");
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
  customerState,
}) => {
  await signIn(page);
  const product = await createProduct(page, { stock: 10 });
  const customer = await browser.newContext({
    baseURL,
    storageState: customerState,
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
    for (const path of [
      "/retailer",
      "/retailer/inventory",
      "/orders",
      "/orders?view=prep",
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.locator(".vendor-data-feedback")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
    await page.getByRole("button", { name: "Switch to English" }).click();
    for (const path of [
      "/retailer",
      "/retailer/inventory",
      "/orders",
      "/orders?view=prep",
    ]) {
      await page.goto(path);
      await expect(page.locator(".vendor-data-feedback")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
    await page.getByRole("button", { name: "切换为中文" }).click();
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

test("库存多选批量下架失败可重试，筛选变化清除选择", async ({ page }) => {
  await signIn(page);
  const prefix = `批量菜 ${Date.now()}`;
  const first = await createProduct(page, { name: `${prefix} A` });
  await createProduct(page, { name: `${prefix} B` });
  await page.goto(`/retailer/inventory?search=${encodeURIComponent(prefix)}`);
  await page.getByRole("checkbox", { name: "选择本页商品" }).check();
  await expect(page.locator(".vendor-selection-bar")).toContainText(
    "已选 2 款",
  );
  await page
    .getByRole("checkbox", { name: `选择 ${first.name}`, exact: true })
    .uncheck();
  await expect(
    page.getByRole("checkbox", { name: "选择本页商品" }),
  ).toBeChecked({ indeterminate: true });
  await page.getByRole("checkbox", { name: "选择本页商品" }).check();
  await page.getByRole("button", { name: "批量下架", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "批量下架这些商品？" });
  await expect(modal).toContainText(first.name);
  await page.route("**/api/retailer/products/visibility", (route) =>
    route.fulfill({ status: 503, json: { error: "保存失败，请重试" } }),
  );
  await modal.getByRole("button", { name: "确认批量下架" }).click();
  await expect(modal.getByRole("alert")).toHaveText("保存失败，请重试");
  await page.unroute("**/api/retailer/products/visibility");
  await modal.getByRole("button", { name: "确认批量下架" }).click();
  await expect(modal).not.toBeVisible();
  await expect(page.locator(".vendor-table tbody .status-badge")).toHaveText([
    "已下架",
    "已下架",
  ]);
  await expect(page.locator(".vendor-selection-bar")).toContainText(
    "已选 0 款",
  );
  await page.getByRole("checkbox", { name: "选择本页商品" }).check();
  await page.getByLabel("搜索库存商品").fill(first.name);
  await expect(page.locator(".vendor-selection-bar")).toContainText(
    "已选 0 款",
  );
  const stored = await (
    await page.request.get("/api/retailer/products")
  ).json();
  expect(stored.find((p: { id: number }) => p.id === first.id)).toMatchObject({
    stock: 4,
    price_cents: 425,
    active: 0,
  });
});

test("备货按时段汇总已确认快照，排除其他状态并保留备注", async ({
  page,
  browser,
  baseURL,
  customerState,
}) => {
  await signIn(page);
  const product = await createProduct(page, { stock: 30 });
  const customer = await browser.newContext({
    baseURL,
    storageState: customerState,
  });
  try {
    const config = await (await page.request.get("/api/config")).json();
    const make = async (quantity: number, status: string) => {
      const response = await customer.request.post("/api/orders", {
        data: {
          items: [{ productId: product.id, quantity }],
          pickupSlot: config.pickupSlots[0],
          note: "分装好，谢谢",
        },
      });
      expect(response.status()).toBe(201);
      const order = await response.json();
      if (status !== "pending") {
        expect(
          (
            await page.request.patch(`/api/orders/${order.id}/status`, {
              data: {
                status: status === "cancelled" ? "cancelled" : "confirmed",
              },
            })
          ).ok(),
        ).toBe(true);
        if (status === "completed")
          expect(
            (
              await page.request.patch(`/api/orders/${order.id}/status`, {
                data: { status: "completed" },
              })
            ).ok(),
          ).toBe(true);
      }
      return order;
    };
    await make(2, "confirmed");
    await make(3, "confirmed");
    await make(4, "pending");
    await make(6, "cancelled");
    await make(7, "completed");
    const stored = (
      await (await page.request.get("/api/retailer/products")).json()
    ).find((p: { id: number }) => p.id === product.id);
    expect(
      (
        await page.request.put(`/api/retailer/products/${product.id}`, {
          data: {
            ...stored,
            unit: "个",
            organic: !!stored.organic,
            active: !!stored.active,
            expected_stock: stored.stock,
          },
        })
      ).ok(),
    ).toBe(true);
    await make(1, "confirmed");
    await page.goto(`/orders?search=${encodeURIComponent(product.name)}`);
    await page
      .getByRole("group", { name: "订单显示方式" })
      .getByRole("button", { name: "备货清单", exact: true })
      .click();
    const board = page.getByRole("region", { name: "备货清单" });
    await expect(board.locator(".vendor-prep-items")).toContainText("5把");
    await expect(board).toContainText("3 笔待自提");
    await expect(board.locator(".vendor-prep-items")).toContainText("1个");
    await expect(board).toContainText("分装好，谢谢");
    await page.reload();
    await expect(board).toBeVisible();
    await page.getByRole("button", { name: "查看时段订单" }).click();
    await expect(page.locator(".vendor-order")).toHaveCount(3);
    await expect(page.getByLabel("自提日期", { exact: true })).toHaveValue(
      config.today,
    );
    await expect(
      page.locator(".vendor-order-progress [aria-current=step]"),
    ).toHaveText(["2备货与待自提", "2备货与待自提", "2备货与待自提"]);
    await page.getByRole("button", { name: "查看往日未履约" }).click();
    await expect(page.locator(".vendor-order")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "查看往日未履约" }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "今天自提", exact: true }).click();
    await expect(page.getByLabel("自提日期", { exact: true })).toHaveValue(
      config.today,
    );
    await expect(
      page.getByRole("button", { name: "查看往日未履约" }),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".vendor-order")).toHaveCount(3);
  } finally {
    await customer.close();
  }
});
