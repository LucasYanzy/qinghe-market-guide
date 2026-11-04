import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { readFile } from 'node:fs/promises';

// Scan rendered content as well as accessible labels and editable seed data.
// Personal names and the native Chinese language switch are intentionally preserved.
async function expectEnglish(page: Page) {
  await expect(page.locator('.boot-screen, .loading-panel')).toHaveCount(0);
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
  await expect(page.locator('.boot-screen, .loading-panel')).toHaveCount(0);
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
  await page.getByRole('button', { name: 'Add a note (optional)', exact: true }).click();
  await page.getByRole('button', { name: 'SNAP / EBT options', exact: true }).click();
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
  await login(page, 'retailer');
  await english(page, '/retailer');
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

test('English covers every university page, market forms, vendor assignments, SNAP settings and map labels', async ({ page }) => {
  await login(page, 'admin');
  const config = await (await page.request.get('/api/config')).json();
  const created = await page.request.post('/api/admin/markets', { data: {
    name: 'College Avenue · 演示市场', community: 'College Avenue', subtitle: '多市场管理演示',
    address: '126 College Ave, New Brunswick, NJ', latitude: 40.502, longitude: -74.452,
    hours: '演示时段 10:00–16:00 ET；非官方营业安排',
    description: '仅用于多市场功能演示。坐标与服务范围为演示设置，不代表已核实运营地点或覆盖区域。',
    coverage_radius_km: 1.5, active: true, preorders_enabled: true,
  } });
  expect(created.status()).toBe(201);
  const market = await created.json();
  expect((await page.request.put(`/api/admin/markets/${market.id}/vendors`, { data: { vendorIds: [2] } })).ok()).toBe(true);
  const originalNote = '合成演示：展示现场 EBT 办理流程，不代表真实市场授权或接受。';
  expect((await page.request.put(`/api/admin/markets/${market.id}/snap`, { data: {
    snap_status: 'accepted', snap_model: 'vendor_terminal', snap_verified_on: config.today, snap_note: originalNote,
  } })).ok()).toBe(true);
  await login(page, 'retailer');
  expect((await page.request.post('/api/retailer/products', { data: {
    market_id: market.id, name: '藤熟番茄 · 校园演示', description: '多市场流程演示商品，不代表真实供应或报价。',
    category: '果实类', art: 'tomato', unit: '磅', price_cents: 350, stock: 20,
    organic: true, active: true, available_date: config.today,
  } })).status()).toBe(201);
  await login(page, 'admin');
  await english(page, '/admin');
  for (const label of ['Overview', 'Markets & vendors', 'Products & inventory', 'SNAP & access']) {
    await page.getByRole('tab', { name: label, exact: false }).click();
    await expectEnglish(page);
  }
  await page.getByRole('combobox', { name: 'Reporting period', exact: true }).selectOption('custom');
  await expectEnglish(page);
  await visit(page, '/admin/screen');
  for (const path of ['/admin', '/admin/markets', '/admin/vendors', '/admin/impact']) await visit(page, path);
  await page.getByRole('button', { name: 'Top view', exact: true }).click();
  await expectEnglish(page);
  await page.goto('/admin/markets');
  await page.locator('.market-card-main').first().click();
  await expectEnglish(page);
  await page.getByRole('tab', { name: /Assigned vendors/ }).click();
  await expectEnglish(page);
  await page.getByRole('tab', { name: 'SNAP / EBT', exact: true }).click();
  await expectEnglish(page);
  await page.goto(`/admin/markets?market=${market.id}`);
  await page.getByRole('tab', { name: 'SNAP / EBT', exact: true }).click();
  await expectEnglish(page);
  await page.getByRole('button', { name: 'Save SNAP/EBT settings', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('SNAP/EBT settings saved');
  await page.getByRole('button', { name: '切换为中文', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('SNAP/EBT 设置已保存');
  await page.getByRole('button', { name: 'Switch to English', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('SNAP/EBT settings saved');
  const saved = await (await page.request.get('/api/admin/overview')).json();
  expect(saved.markets.find((item: { id: number }) => item.id === market.id).snap_note).toBe(originalNote);
  await page.getByRole('button', { name: 'Add market', exact: true }).click();
  await expectEnglish(page);
});

test('English reports and chart tooltips translate seeded labels and preserve recorded amounts', async ({ page }) => {
  await login(page, 'client');
  const products = await (await page.request.get('/api/products')).json();
  const broccoli = products.find((item: { name: string }) => item.name === '田园西兰花');
  const response = await page.request.post('/api/orders', { data: {
    items: [{ productId: broccoli.id, quantity: 2 }], pickupSlot: '10:00–12:00',
  } });
  expect(response.status()).toBe(201);
  const order = await response.json();
  await login(page, 'retailer');
  for (const status of ['confirmed', 'completed']) expect((await page.request.patch(`/api/orders/${order.id}/status`, { data: { status } })).ok()).toBe(true);
  await login(page, 'admin');
  await english(page, '/admin?market=1');
  const chart = page.locator('.analytics-chart');
  for (const metric of ['Preorders & completions', 'Completed value', 'SNAP intentions']) {
    await page.getByRole('button', { name: metric, exact: true }).click();
    await chart.locator('.recharts-surface').hover();
    await expect(chart.locator('.recharts-tooltip-wrapper')).toBeVisible();
    await expectEnglish(page);
  }
  for (const kind of ['summary', 'daily', 'markets', 'vendors', 'products', 'slots', 'snap']) {
    await page.getByLabel('Choose report to export', { exact: true }).selectOption(kind);
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
    const download = await downloadEvent;
    const csv = await readFile((await download.path())!, 'utf8');
    expect(csv).toContain('University operations report');
    expect(csv).not.toMatch(/\p{Script=Han}/u);
    expect(download.suggestedFilename()).toContain(`qinghe-${kind}-1-`);
    if (kind === 'products') {
      expect(csv).toContain('"Farm-fresh Broccoli","Rutgers Gardens Community Market","Green Acre Farm","1","2","heads","5.6"');
    }
  }
  await page.getByRole('tab', { name: /Products & inventory/, exact: false }).click();
  await expectEnglish(page);
});

test('existing date validation messages update when the interface language changes', async ({ page }) => {
  await login(page, 'admin');
  await page.goto('/admin');
  await page.getByRole('combobox', { name: '统计周期', exact: true }).selectOption('custom');
  await page.getByLabel('开始日期', { exact: true }).fill('2020-01-01');
  await page.getByRole('button', { name: '应用日期范围', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('自定义统计最多支持 366 天。');
  await page.getByRole('button', { name: 'Switch to English', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Custom reports support up to 366 days.');
  await expectEnglish(page);
  await page.getByRole('button', { name: '切换为中文', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('自定义统计最多支持 366 天。');
});

test.describe('English with a Chinese browser and a different device time zone', () => {
  test.use({ locale: 'zh-TW', timezoneId: 'Asia/Taipei' });

  test('dashboard timestamps follow the selected English language and market time zone', async ({ page }) => {
    await login(page, 'admin');
    const overviewResponse = page.waitForResponse((response) => response.url().includes('/api/admin/overview?') && response.ok());
    await english(page, '/admin');
    const overview = await (await overviewResponse).json();
    const expectedTime = new Date(overview.updatedAt).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' });
    await expect(page.locator('.analytics-period-detail')).toContainText(`Updated ${expectedTime} ET`);
    await expectEnglish(page);
    await visit(page, '/admin/screen');
  });

  test('service desk, vendor orders and printed lists translate analytics seed records and keep personal notes', async ({ page }) => {
    const signup = await page.request.post('/api/auth/register', { data: {
      name: '统计样本顾客 01', email: `english-sample-${test.info().testId.slice(-8)}@example.test`, password: 'MarketDemo2026!',
    } });
    expect(signup.status()).toBe(201);
    const products = await (await page.request.get('/api/products')).json();
    const broccoli = products.find((item: { name: string }) => item.name === '田园西兰花');
    const placed = await page.request.post('/api/orders', { data: {
      items: [{ productId: broccoli.id, quantity: 2 }], pickupSlot: '10:00–12:00', note: '合成统计演示，无真实购买或支付。',
    } });
    expect(placed.status()).toBe(201);
    const order = await placed.json();
    expect((await page.request.post('/api/orders', { data: {
      items: [{ productId: broccoli.id, quantity: 1 }], pickupSlot: '10:00–12:00', note: '保留我的备注',
    } })).status()).toBe(201);
    await login(page, 'retailer');
    await english(page, '/orders');
    const vendorOrder = page.locator('.order-card').filter({ hasText: order.id });
    await expect(vendorOrder).toContainText('Analytics sample customer 01');
    await expect(vendorOrder).toContainText('Synthetic analytics demo; no actual purchase or payment.');
    await expect(page.locator('.order-note').filter({ hasText: '保留我的备注' })).toHaveCount(1);
    await expectEnglish(page);
    await login(page, 'admin');
    await visit(page, '/admin/operations?market=1');
    await page.getByRole('textbox', { name: 'Search service desk orders', exact: true }).fill('Analytics sample customer');
    const row = page.locator('.ops-order-row').filter({ hasText: order.id });
    await expect(row).toBeVisible();
    await row.click();
    await expect(page.locator('.ops-detail')).toContainText('2 heads');
    await page.locator('.ops-history summary').click();
    expect((await page.locator('.ops-history div > span').allTextContents()).join(' ')).not.toMatch(/\p{Script=Han}/u);
    await expectEnglish(page);
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.ops-packing')).toBeVisible();
    await expect(page.locator('.ops-packing')).toContainText('Analytics sample customer 01');
    await expect(page.locator('.ops-packing')).toContainText('Synthetic analytics demo; no actual purchase or payment.');
    await expect(page.locator('.ops-packing')).toContainText('2 heads');
    await expect(page.locator('.ops-packing')).toContainText(/Printed at\s+\d{1,2}\/\d{1,2}\/\d{4}.*[AP]M ET/);
    await expectEnglish(page);
    await page.emulateMedia({ media: 'screen' });
    for (const name of ['Sessions & booking', 'Assisted vendors & products']) {
      await page.getByRole('tab', { name, exact: true }).click();
      await expectEnglish(page);
    }
    await page.getByRole('tab', { name: 'Orders & pickup', exact: true }).click();
    await page.locator('.ops-order-row').filter({ hasText: order.id }).click();
    await page.getByRole('button', { name: 'Stock checked — confirm preparation', exact: true }).click();
    await page.locator('.ops-order-row').filter({ hasText: order.id }).click();
    await page.getByRole('button', { name: 'Full amount received in cash', exact: true }).click();
    await page.getByLabel('6-digit pickup code', { exact: true }).fill(order.pickup_code === '000000' ? '111111' : '000000');
    await page.getByRole('button', { name: 'Record pickup and on-site payment', exact: true }).click();
    await expect(page.getByRole('alert').first()).toContainText("Pickup code does not match. Check the customer's order.");
    await expectEnglish(page);
  });
});

for (const width of [320, 390]) {
  test(`All English roles fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await english(page);
    for (const [role, paths] of [['client', ['/', '/markets', '/help', '/orders']], ['retailer', ['/retailer', '/retailer/inventory']], ['admin', ['/admin', '/admin/markets', '/admin/vendors', '/admin/impact', '/admin/operations']]] as const) {
      await login(page, role);
      for (const path of paths) {
        await visit(page, path);
        const overflow = await page.evaluate(() => [...document.body.querySelectorAll('*')].filter((element) => {
          const rect = element.getBoundingClientRect();
          return element.checkVisibility() && rect.right > innerWidth + 1 && rect.width > 0 && !element.closest('svg, .school-table-wrap');
        }).map((element) => `${element.tagName}.${element.className}: ${Math.round(element.getBoundingClientRect().right)}`).slice(0, 12));
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path}: ${overflow.join(', ')}`).toBe(true);
      }
    }
  });
}
