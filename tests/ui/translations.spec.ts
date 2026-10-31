import { expect, type Page } from '@playwright/test';
import { test } from "./isolated";

async function expectEnglish(page: Page) {
  const untranslated = await page.evaluate(() => {
    const found: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const element = walker.currentNode.parentElement;
      const text = walker.currentNode.textContent?.trim() ?? '';
      // Native language choice and original customer content are intentional.
      if (!element || element.closest('[lang="zh-CN"], .order-note, textarea, script, style') || !element.checkVisibility()) continue;
      if (/\p{Script=Han}/u.test(text) && !['林同学', '林', '保留我的备注', '商户交互测试：当季采收'].includes(text)) found.push(text);
    }
    for (const element of document.querySelectorAll('[aria-label], [placeholder], [title], input, textarea')) {
      if (element.closest('[lang="zh-CN"]') || !element.checkVisibility()) continue;
      for (const attribute of ['aria-label', 'placeholder', 'title']) {
        const value = element.getAttribute(attribute) ?? '';
        if (/\p{Script=Han}/u.test(value) && !['林同学'].includes(value)) found.push(`${attribute}: ${value}`);
      }
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        if (!['checkbox', 'radio', 'hidden'].includes(element.type) && /\p{Script=Han}/u.test(element.value) && !['林同学', '保留我的备注', '商户交互测试：当季采收'].includes(element.value)) found.push(`value: ${element.value}`);
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

async function login(page: Page, role: 'client' | 'retailer') {
  const response = await page.request.post('/api/auth/login', {
    data: { email: `${role}@qinghe.demo`, password: 'MarketDemo2026!' },
  });
  expect(response.ok()).toBe(true);
}

test('English covers every public page, FAQs, navigation, metadata, and reloads', async ({ page }) => {
  await english(page);
  const nav = page.getByRole('navigation', { name: 'Main navigation', exact: true });
  await expect(nav.getByRole('link', { name: 'Shop the market', exact: true })).toBeVisible();
  for (const [path, heading] of [
    ['/', 'Good food, every day.'],
    ['/markets', 'Markets & directions'],
    ['/prices', 'Prices & trends'],
    ['/orders', 'My preorders'],
    ['/about', 'About Qinghe'],
    ['/help', 'Help & food assistance'],
    ['/retailer', 'Dashboard'],
    ['/retailer/inventory', 'Products & inventory'],
    ['/no-such-page', 'Page not found'],
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(heading);
    await expect(page).toHaveTitle(/Qinghe Rutgers Community Farmers Market/);
    await page.locator('details').evaluateAll((elements) => elements.forEach((element) => element.setAttribute('open', '')));
    await expectEnglish(page);
  }
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /^Rutgers farmers market dates, hours, addresses, directions, and calendar planning\.$/);
  await page.getByRole('button', { name: '切换为中文', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page).toHaveTitle(/页面未找到 · 青禾/);
  await page.goto('/help');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('帮助与食品援助');
  await page.locator('.help-resource-disclosure > summary').click();
  await expect(page.getByRole('heading', { name: '食品援助站与流动食品援助站', exact: true })).toBeVisible();
});

test('English product search, details, cart, sign-in, live notifications, orders, and errors work', async ({ page }) => {
  await english(page);
  await page.getByRole('textbox', { name: 'Search vegetables or farms', exact: true }).fill('TOMATO');
  await expect(page.locator('.product-card')).toHaveCount(1);
  await page.getByRole('button', { name: '切换为中文', exact: true }).click();
  await expect(page.locator('.product-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Switch to English', exact: true }).click();
  await page.getByRole('button', { name: 'View Vine-ripened Tomatoes', exact: true }).click();
  await expectEnglish(page);
  await page.getByRole('button', { name: 'Add to bag', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Vine-ripened Tomatoes added to your bag');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'About this produce', exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: /^Shopping bag/ }).click();
  await page.getByRole('textbox', { name: 'Note for the farm', exact: false }).fill('保留我的备注');
  await expectEnglish(page);
  await page.getByRole('button', { name: 'Sign in to preorder', exact: true }).click();
  await expectEnglish(page);
  await page.getByRole('button', { name: 'Create a customer account', exact: true }).click();
  await expectEnglish(page);
  await page.getByRole('dialog').getByRole('button', { name: 'Sign in', exact: true }).click();
  const auth = page.getByRole('dialog');
  await auth.getByLabel('Email address').fill('wrong@example.com');
  await auth.getByLabel('Password', { exact: true }).fill('wrong-password');
  await auth.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(auth.getByRole('alert')).toHaveText('Incorrect email or password.');
  await auth.getByRole('button', { name: /Customer demo/ }).click();
  await expect(page.getByRole('dialog', { name: 'My shopping bag', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Note for the farm', exact: false })).toHaveValue('保留我的备注');
  await page.route('**/api/orders', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await route.fulfill({ status: 409, json: {
      error: '藤熟番茄 库存不足，当前剩余 0 磅。',
      messageKey: '{product} 库存不足，当前剩余 {stock} {unit}。',
      values: { product: '藤熟番茄', stock: 0, unit: '磅' },
    } });
  });
  await page.getByRole('button', { name: 'Place preorder', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Not enough stock for Vine-ripened Tomatoes. Available: 0 lb.');
  await expectEnglish(page);
  await page.unroute('**/api/orders');
  await page.getByRole('button', { name: 'Place preorder', exact: true }).click();
  await expect(page).toHaveURL('/orders');
  await expect(page.locator('.order-card').first()).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Preorder placed · QH-');
  await expect(page.locator('.order-note').filter({ hasText: '保留我的备注' })).toHaveText('Note: 保留我的备注');
  await expectEnglish(page);
  await page.getByRole('button', { name: 'Cancel order', exact: true }).first().click();
  await expectEnglish(page);
  await page.getByRole('button', { name: 'Confirm cancellation', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Order canceled. Reserved stock has been released.');
  await page.getByRole('button', { name: '切换为中文', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('订单已取消，库存已归还');
});

test('English archive preserves source units and uncertainty, and forecasts translate chart and model text', async ({ page }) => {
  await english(page, '/prices');
  await expect(page.getByRole('cell', { name: 'each (meaning unconfirmed)', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: /It is unclear whether each means one pepper/ })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search historical price records', exact: true }).fill('radish');
  await expect(page.locator('.reference-table tbody tr')).toHaveCount(1);
  await expect(page.locator('.reference-table tbody tr')).toContainText('Red Radishes');
  await expectEnglish(page);
  await page.getByRole('button', { name: 'Demo price trends & forecast', exact: true }).click();
  await expect(page.locator('.forecast-note')).toContainText('Linear regression using the latest 28 days');
  await expect(page.locator('.forecast-table tbody tr')).toHaveCount(7);
  await expectEnglish(page);
  await page.locator('.recharts-wrapper').hover();
  await expectEnglish(page);
});

test('English vendor pages, inventory search, product editor, and order actions are translated', async ({ page }) => {
  await login(page, 'client');
  const products = await (await page.request.get('/api/products')).json();
  const product = products.find((product: { stock: number }) => product.stock > 0);
  const { pickupSlots } = await (await page.request.get('/api/config')).json();
  const response = await page.request.post('/api/orders', {
    data: { items: [{ productId: product.id, quantity: 1 }], pickupSlot: pickupSlots[0] },
  });
  expect(response.status()).toBe(201);
  const order = await response.json();
  await login(page, 'retailer');
  await english(page, '/retailer');
  await expect(page.locator('.stat-grid')).toBeVisible();
  await expectEnglish(page);
  await page.goto('/retailer/inventory');
  await page.getByRole('textbox', { name: 'Search inventory', exact: true }).fill('BROCCOLI');
  await expect(page.locator('.inventory-panel tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Pricing unit', exact: true })).toHaveValue('颗');
  const originalDescription = await page.getByRole('textbox', { name: 'Product description', exact: true }).inputValue();
  await expectEnglish(page);
  await page.getByRole('button', { name: 'Save product', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Product updated.');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Product description', exact: true })).toHaveValue(originalDescription);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'List a new product', exact: true }).click();
  await expectEnglish(page);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.goto('/orders');
  await expect(page.locator('.order-tabs')).toBeVisible();
  await expectEnglish(page);
  const card = page.locator('.order-card').filter({ hasText: order.id });
  await expect(card.locator('.status-badge')).toHaveText('Awaiting confirmation');
  await card.getByRole('button', { name: 'Accept preorder', exact: true }).click();
  await expect(card.locator('.status-badge')).toHaveText('Awaiting pickup');
  await page.getByRole('button', { name: '切换为中文', exact: true }).click();
  await expect(card.locator('.status-badge')).toHaveText('待到场自提');
  await expect(card.getByRole('button', { name: '确认已自提并收款', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Switch to English', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Confirm pickup & payment', exact: true })).toBeVisible();
  await expectEnglish(page);
});

for (const width of [320, 390]) {
  test(`English mobile navigation and language switching fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await english(page);
    const nav = page.getByRole('navigation', { name: 'Mobile navigation', exact: true });
    await nav.getByRole('link', { name: 'Markets & directions', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Markets & directions');
    await page.locator('.visitor-header').getByRole('link', { name: 'Help', exact: true }).click();
    await expectEnglish(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: '切换为中文', exact: true })).toBeInViewport();
    await login(page, 'retailer');
    for (const path of ['/retailer', '/retailer/inventory']) {
      await page.goto(path);
      await expect(page.getByRole('button', { name: 'Switch account', exact: true })).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  });
}
