import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
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
  await login(page);
  if (width === 1920) {
    const markets = await (await page.request.get('/api/admin/markets')).json();
    for (let i = markets.length; i < 5; i++) {
      expect((await page.request.post('/api/admin/markets', { data: { name: `Display test market ${i + 1} with a long campus and community name`, subtitle: '', address: 'Campus', latitude: 40.5, longitude: -74.4, hours: 'Actual sessions', description: '', community: '', coverage_radius_km: 1, active: true, preorders_enabled: true } })).ok()).toBe(true);
    }
  }
  await page.reload(); await expect(page.locator('.screen-kpis')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (width === 1920) {
    await expect(page.locator('.screen-market-card')).toHaveCount(4);
    await expect(page.locator('.screen-pagination')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
    const fit=await page.locator('.screen-markets').evaluate(el=>({height:el.clientHeight,scroll:el.scrollHeight,children:[...el.children].map(child=>({class:child.className,height:child.getBoundingClientRect().height,scroll:child.scrollHeight}))}));
    expect(fit.scroll<=fit.height+1,JSON.stringify(fit)).toBe(true);
    await page.getByRole('button', { name: '全屏展示', exact: true }).click();
    await expect(page.getByRole('button', { name: '退出全屏', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '退出全屏', exact: true }).click();
    await expect(page.getByRole('button', { name: '全屏展示', exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('screen-1920-zh.png'), fullPage: true });
  }
  await page.getByRole('button', { name: 'Switch to English', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'University Market Operations', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (width === 1920) {
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
    const fit=await page.locator('.screen-markets').evaluate(el=>({height:el.clientHeight,scroll:el.scrollHeight,children:[...el.children].map(child=>({class:child.className,height:child.getBoundingClientRect().height,scroll:child.scrollHeight}))}));
    expect(fit.scroll<=fit.height+1,JSON.stringify(fit)).toBe(true);
  }
  const allText = await page.locator('.school-screen').innerText(); expect(allText.replace('中文', '')).not.toMatch(/\p{Script=Han}/u);
  await page.screenshot({ path: test.info().outputPath(`screen-${width}.png`), fullPage: true });
  await page.getByRole('button', { name: 'Attendance & business', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Attendance and business metrics', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (width === 1920) expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  const businessText = await page.locator('.school-screen').innerText(); expect(businessText.replace('中文', '')).not.toMatch(/\p{Script=Han}/u);
  await page.screenshot({ path: test.info().outputPath(`screen-business-${width}-en.png`), fullPage: true });
  await page.getByRole('button', { name: '切换为中文', exact: true }).click();
  await expect(page.getByRole('heading', { name: '各市场出摊与经营', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (width === 1920) expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  await page.screenshot({ path: test.info().outputPath(`screen-business-${width}-zh.png`), fullPage: true });
});

test('经营视图展示零销售和部分收款，并可直达出摊、销售、费用及订单调整', async ({ page }) => {
  await login(page);
  const today = (await (await page.request.get('/api/config')).json()).today;
  const yesterday = new Date(Date.parse(`${today}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
  async function post(path: string, data: object) { const r = await page.request.post(`/api${path}`, { data }); expect(r.ok(), await r.text()).toBe(true); return r.json(); }
  const m = await post('/admin/markets', { name: 'Business screen campus', subtitle: '', address: 'Campus', latitude: 40.5, longitude: -74.4, hours: 'Sessions', description: '', community: '', coverage_radius_km: 1, active: true, preorders_enabled: true });
  const v = await post('/admin/assisted-vendors', { name: 'Business screen farm', marketId: m.id });
  const p = await post('/admin/operations/products', { marketId: m.id, vendorId: v.id, name: 'Business screen tomatoes', date: today, priceCents: 450, stock: 10, unit: '磅', category: '果实类' });
  const s = await post('/admin/sessions', { marketId: m.id, date: today, startsAt: '00:00', endsAt: '23:59', cutoff: '23:59', slotMinutes: 60, capacity: 10 });
  expect((await page.request.patch(`/api/admin/sessions/${s.id}`, { data: { status: 'open', version: 0 } })).ok()).toBe(true);
  const options = await (await page.request.get(`/api/checkout/options?marketId=${m.id}&date=${today}`)).json();
  await login(page, 'client');
  const order = await post('/orders', { items: [{ productId: p.id, quantity: 1 }], pickupSlot: options.slots[0].label, note: 'Private screen adjustment note' });
  await login(page);
  expect((await page.request.patch(`/api/admin/operations/orders/${order.id}`, { data: { status: 'confirmed', reason: '' } })).ok()).toBe(true);
  await post(`/orders/${order.id}/adjustment`, { items: [{ productId: p.id, quantity: 0.8 }], reason: 'Private measured weight', version: 0 });
  expect((await page.request.put(`/api/admin/sessions/${s.id}/vendors`, { data: { vendorId: v.id, status: 'checked_in', booth: 'A1', note: 'Private attendance', version: 0 } })).ok()).toBe(true);
  await post('/admin/sales-reports', { sessionId: s.id, vendorId: v.id, grossCents: 0, transactions: 0, note: 'Private sales note', version: 0 });
  const invoice = await post('/admin/invoices', { marketId: m.id, vendorId: v.id, description: 'Screen booth fee', amountCents: 1000, dueOn: yesterday });
  await post(`/admin/invoices/${invoice.id}/payments`, { amountCents: 300, reference: 'Private cash reference', version: 0 });
  const url = `/admin/screen?market=${m.id}&view=operations&range=7`;
  await page.goto(url);
  const kpi = (label: string) => page.locator('.screen-kpi').filter({ hasText: label }).locator('strong');
  await expect(kpi('已签到 / 应到摊次')).toHaveText('1 / 1');
  await expect(kpi('已签到但未填报销售')).toHaveText('0');
  await expect(kpi('已填报销售额')).toHaveText('$0.00');
  await expect(kpi('逾期市场费用')).toHaveText('$7.00');
  await expect(kpi('待顾客确认的调整')).toHaveText('1');
  await expect(page.locator('.school-screen')).not.toContainText('Private');
  await expect(page.getByRole('combobox', { name: '大屏趋势周期', exact: true })).toHaveCount(0);
  await page.reload(); await expect(page.getByRole('button', { name: '出摊与经营', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('link', { name: '核对出摊名单', exact: true }).click();
  await expect(page.getByRole('tab', { name: '出摊与停市', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('工作日期', { exact: true })).toHaveValue(today);
  await page.getByLabel('工作日期', { exact: true }).fill(yesterday); await page.reload();
  await expect(page.getByRole('tab', { name: '出摊与停市', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('工作日期', { exact: true })).toHaveValue(yesterday);
  await page.goto(url); await page.getByRole('link', { name: '代商户补填销售', exact: true }).click();
  await expect(page.getByRole('tab', { name: '现场销售填报', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('营业日期', { exact: true })).toHaveValue(today);
  await page.goto(url); await page.getByRole('link', { name: '核对市场费用', exact: true }).click();
  await expect(page.getByRole('tab', { name: '商户费用', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.workflow-cards')).toContainText('$7.00');
  await page.goto(url); await page.locator('.screen-adjustment-worklist a').click();
  await expect(page.getByRole('combobox', { name: '订单处理状态', exact: true })).toHaveValue('adjustments');
  await expect(page.locator('.ops-order-row')).toHaveCount(1);
  await page.locator('.ops-order-row').click(); await expect(page.getByRole('region', { name: '订单处理详情', exact: true })).toContainText(order.id);
  await page.goto(url); await post('/admin/sales-reports', { sessionId: s.id, vendorId: v.id, grossCents: 12345, transactions: 9, note: '', version: 1 });
  await page.getByRole('button', { name: '立即刷新大屏', exact: true }).click(); await expect(kpi('已填报销售额')).toHaveText('$123.45');
  await page.setViewportSize({ width: 1920, height: 1080 });
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('screen-business-records-1920-zh.png'), fullPage: true });
});
