import { expect, test, type Page } from '@playwright/test';

// Scan rendered content as well as accessible labels and editable seed data.
// Personal names and the native Chinese language switch are intentionally preserved.
async function expectEnglish(page: Page) {
  await page.waitForLoadState('networkidle');
  const untranslated = await page.evaluate(() => {
    const found: string[] = [];
    const personal = new Set(['林同学', '林', '保留我的备注']);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const element = walker.currentNode.parentElement;
      const text = walker.currentNode.textContent?.trim() ?? '';
      if (!element || element.closest('[lang="zh-CN"], script, style, textarea') || !element.checkVisibility()) continue;
      if (/\p{Script=Han}/u.test(text) && !personal.has(text)) found.push(text);
    }
    for (const element of document.querySelectorAll('[aria-label], [placeholder], [title], input, textarea')) {
      if (element.closest('[lang="zh-CN"]') || !element.checkVisibility()) continue;
      for (const attribute of ['aria-label', 'placeholder', 'title']) {
        const value = element.getAttribute(attribute) ?? '';
        if (/\p{Script=Han}/u.test(value) && !personal.has(value)) found.push(`${attribute}: ${value}`);
      }
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        // Checkbox/radio values are wire identifiers, not rendered text.
        if (!['checkbox', 'radio', 'hidden'].includes(element.type) && /\p{Script=Han}/u.test(element.value) && !personal.has(element.value)) found.push(`value: ${element.value}`);
      }
    }
    return found;
  });
  expect(untranslated).toEqual([]);
}

async function english(page: Page, path = '/') {
  await page.goto(path);
  await page.getByRole('button', { name: 'Switch to English', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
}
async function login(page: Page, role: string) {
  expect((await page.request.post('/api/auth/login', { data: { email: `${role}@qinghe.demo`, password: 'MarketDemo2026!' } })).ok()).toBe(true);
}
async function visit(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.locator('details').evaluateAll((elements) => elements.forEach((element) => element.setAttribute('open', '')));
  await expectEnglish(page);
}

test('English covers all public routes, expanded help, prices, forecasts and protected entrances', async ({ page }) => {
  await english(page);
  for (const path of ['/', '/markets', '/prices', '/orders', '/about', '/help', '/retailer', '/retailer/inventory', '/no-such-page']) await visit(page, path);
  await page.goto('/prices');
  await page.getByRole('button', { name: 'Demo price trends & forecast', exact: true }).click();
  await expect(page.locator('.forecast-table tbody tr')).toHaveCount(7);
  await expectEnglish(page);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByRole('button', { name: '切换为中文', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
});

test('English product detail, bag, authentication, live notifications and API parameters are complete', async ({ page }) => {
  await english(page);
  await page.getByRole('textbox', { name: 'Search vegetables or farms', exact: true }).fill('TOMATO');
  await expect(page.locator('.product-card')).toHaveCount(1);
  await page.getByRole('button', { name: /^View Vine-ripened [Tt]omatoes$/, exact: true }).click();
  await expectEnglish(page);
  await page.getByRole('button', { name: 'Add to bag', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(/added to your bag/);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: /^Shopping bag/ }).click();
  await expectEnglish(page);
  await page.getByRole('button', { name: 'Sign in to preorder', exact: true }).click();
  await expectEnglish(page);
  await page.getByRole('button', { name: 'Create a customer account', exact: true }).click();
  await expectEnglish(page);
  await page.getByRole('dialog').getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: /Customer demo/ }).click();
  await page.route('**/api/orders', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await route.fulfill({ status: 409, json: { error: '藤熟番茄 库存不足，当前剩余 0 磅。', messageKey: '{product} 库存不足，当前剩余 {stock} {unit}。', values: { product: '藤熟番茄', stock: 0, unit: '磅' } } });
  });
  await page.getByRole('button', { name: 'Place preorder', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(/Not enough stock for Vine-ripened [Tt]omatoes\. Available: 0 lb\./);
  await expectEnglish(page);
});

test('English vendor pages and seeded product editor preserve original data when saved without edits', async ({ page }) => {
  await english(page, '/retailer');
  await page.getByRole('button', { name: 'Vendor sign in', exact: true }).click();
  await page.getByRole('button', { name: /Vendor demo/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Welcome back' })).toContainText('Green Acre Farm');
  await expectEnglish(page);
  for (const path of ['/retailer', '/retailer/inventory', '/orders']) await visit(page, path);
  const before = await (await page.request.get('/api/retailer/products')).json();
  await page.goto('/retailer/inventory');
  await page.getByRole('textbox', { name: /Search inventory/, exact: true }).fill('BROCCOLI');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expectEnglish(page);
  await page.getByRole('button', { name: 'Save product', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const after = await (await page.request.get('/api/retailer/products')).json();
  expect(after.map(({ id, name, description }: { id: number; name: string; description: string }) => ({ id, name, description }))).toEqual(before.map(({ id, name, description }: { id: number; name: string; description: string }) => ({ id, name, description })));
});

test('English vendor stock adjustments, bulk actions, order fulfillment and populated preparation list are complete', async ({ page, browser, baseURL }) => {
  const customer = await browser.newContext({ baseURL });
  await login(customer.pages()[0] ?? await customer.newPage(), 'client');
  const config = await (await customer.request.get('/api/config')).json();
  const products = await (await customer.request.get('/api/products')).json();
  const product = products.find((p: { stock: number }) => p.stock > 2);
  const response = await customer.request.post('/api/orders', { data: { items: [{ productId: product.id, quantity: 2 }], pickupSlot: config.pickupSlots[0] } });
  expect(response.status()).toBe(201);
  const order = await response.json();
  await login(page, 'retailer');
  await english(page, '/retailer/inventory');
  await page.getByRole('checkbox', { name: 'Select this page', exact: true }).check();
  await page.getByRole('button', { name: 'Unlist selected', exact: true }).click();
  await expectEnglish(page);
  await page.getByRole('button', { name: 'Back to selection', exact: true }).click();
  await page.getByRole('button', { name: /^Adjust stock for/ }).first().click();
  await expectEnglish(page);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.goto(`/orders?search=${order.id}`);
  await expectEnglish(page);
  await page.getByRole('button', { name: /^(Confirm|Accept) preorder$/, exact: true }).click();
  await page.goto(`/orders?view=prep&search=${order.id}`);
  await expect(page.locator('.vendor-prep-items')).toBeVisible();
  await expectEnglish(page);
  await page.goto(`/orders?search=${order.id}`);
  await page.getByRole('button', { name: 'Confirm pickup & payment', exact: true }).click();
  await expectEnglish(page);
  await page.getByRole('button', { name: 'Back to order', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel order', exact: true }).click();
  await expectEnglish(page);
  await customer.close();
});
for (const width of [320, 390]) {
  test(`English vendor and customer routes fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await english(page);
    for (const path of ['/', '/markets', '/help']) await visit(page, path);
    await login(page, 'retailer');
    for (const path of ['/retailer', '/retailer/inventory', '/orders', '/orders?view=prep']) {
      await visit(page, path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
}
