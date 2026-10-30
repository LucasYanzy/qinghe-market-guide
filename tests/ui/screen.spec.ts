import { expect, test, type Page } from '@playwright/test';
async function login(page: Page, role = 'admin') { expect((await page.request.post('/api/auth/login', { data: { email: `${role}@qinghe.demo`, password: 'MarketDemo2026!' } })).ok()).toBe(true); }

test('管理大屏按市场展示真实指标，可刷新、恢复和直达待办及场次', async ({ page }) => {
  await login(page); const today = (await (await page.request.get('/api/config')).json()).today;
  const created = await page.request.post('/api/admin/markets', { data: { name: 'Screen UI market', subtitle: '', address: 'Campus', latitude: 40.5, longitude: -74.4, hours: 'Actual sessions', description: '', community: '', coverage_radius_km: 1, active: true, preorders_enabled: true } });
  const market = await created.json();
  const vendor = await (await page.request.post('/api/admin/assisted-vendors', { data: { name: 'Screen farm', marketId: market.id } })).json();
  const product = await (await page.request.post('/api/admin/operations/products', { data: { marketId: market.id, vendorId: vendor.id, name: 'Screen greens', date: today, priceCents: 450, stock: 10, unit: '把', category: '叶菜类' } })).json();
  await login(page, 'client');
  expect((await page.request.post('/api/orders', { data: { items: [{ productId: product.id, quantity: 2 }], pickupSlot: '10:00–12:00', note: 'Never show this private note' } })).ok()).toBe(true);
  await login(page); await page.goto(`/admin/screen?market=${market.id}&range=7`);
  await expect(page.getByRole('heading', { name: '学校市场管理大屏', exact: true })).toBeVisible();
  await expect(page.locator('.screen-kpi').filter({ hasText: '今日预购' }).locator('strong')).toHaveText('1');
  await expect(page.locator('.screen-worklist')).toContainText('Screen UI market');
  await expect(page.locator('.school-screen')).not.toContainText('Never show this private note');
  await page.getByRole('button', { name: '暂停刷新', exact: true }).click();
  await expect(page.getByRole('button', { name: '恢复刷新', exact: true })).toHaveAttribute('aria-pressed', 'true');
  let fail = true;
  await page.route('**/api/admin/screen?*', async (route) => { if (fail) await route.fulfill({ status: 503, json: { error: '暂时繁忙' } }); else await route.continue(); });
  await page.getByRole('button', { name: '立即刷新大屏', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('最近成功更新的数据');
  await expect(page.locator('.screen-kpi').filter({ hasText: '今日预购' }).locator('strong')).toHaveText('1');
  fail = false; await page.getByRole('button', { name: '立即刷新大屏', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('combobox', { name: '大屏趋势周期', exact: true }).selectOption('90');
  await expect(page).toHaveURL(/range=90/); await page.reload();
  await expect(page.getByRole('combobox', { name: '大屏市场范围', exact: true })).toHaveValue(String(market.id));
  await page.locator('.screen-worklist a').click();
  await expect(page).toHaveURL(new RegExp(`/admin/operations\\?market=${market.id}&date=${today}`));
  await expect(page.getByRole('textbox', { name: '工作日期', exact: true })).toHaveValue(today);
  await expect(page.locator('.ops-order-row')).toContainText('Screen farm');
  const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
  expect((await page.request.post('/api/admin/sessions', { data: { marketId: market.id, date: tomorrow, startsAt: '09:00', endsAt: '12:00', cutoff: '08:00', slotMinutes: 30, capacity: 10 } })).ok()).toBe(true);
  await page.goto(`/admin/screen?market=${market.id}`);
  await page.locator('.screen-session-list a').click();
  await expect(page.getByRole('tab', { name: '开市与接单', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('textbox', { name: '工作日期', exact: true })).toHaveValue(tomorrow);
});

test('大屏自动刷新可暂停且暂停期间不再请求', async ({ page }) => {
  await login(page); await page.clock.install(); await page.goto('/admin/screen');
  await expect(page.locator('.screen-kpis')).toBeVisible();
  let calls = 0; page.on('request', (request) => { if (request.url().includes('/api/admin/screen?')) calls++; });
  await page.clock.runFor(30050); await expect.poll(() => calls).toBe(1);
  await expect(page.getByRole('button', { name: '立即刷新大屏', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '暂停刷新', exact: true }).click(); const before = calls;
  await page.clock.runFor(61000); expect(calls).toBe(before);
});

for (const width of [390, 1920]) test(`大屏 ${width}px 中英文布局与权限`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 1920 ? 1080 : 844 });
  await page.goto('/admin/screen'); await expect(page.getByRole('button', { name: '学校管理方登录', exact: true })).toBeVisible();
  await login(page); await page.reload(); await expect(page.locator('.screen-kpis')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Switch to English', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'University Market Operations', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const allText = await page.locator('.school-screen').innerText(); expect(allText.replace('中文', '')).not.toMatch(/\p{Script=Han}/u);
  await page.screenshot({ path: test.info().outputPath(`screen-${width}.png`), fullPage: true });
});
