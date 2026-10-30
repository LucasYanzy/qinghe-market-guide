import { expect, type Page } from '@playwright/test';
import { test } from "./isolated";
async function login(page: Page, role = 'admin') {
  expect((await page.request.post('/api/auth/login', { data: { email: `${role}@qinghe.demo`, password: 'MarketDemo2026!' } })).ok()).toBe(true);
}
async function newMarket(page: Page) {
  await login(page);
  const result = await page.request.post('/api/admin/markets', { data: { name: `Service desk ${test.info().testId.slice(-8)}`, subtitle: '', address: 'Campus service desk', latitude: 40.5, longitude: -74.45, hours: 'By published session', description: '', community: '', coverage_radius_km: 1, active: true, preorders_enabled: true } });
  expect(result.ok()).toBe(true); return result.json();
}
test('工作人员可登记无账号商户、代录商品并开放未来的实际自提场次', async ({ page }) => {
  const market = await newMarket(page), today = (await (await page.request.get('/api/config')).json()).today;
  const date = new Date(Date.parse(`${today}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
  await page.goto(`/admin/operations?market=${market.id}`);
  await page.getByLabel('工作日期', { exact: true }).fill(date);
  await page.getByRole('tab', { name: '代办商户与商品', exact: true }).click();
  const vendor = page.getByRole('form', { name: '登记代办商户', exact: true });
  await vendor.getByLabel('商户名称', { exact: true }).fill('Assisted UI farm');
  await vendor.getByRole('button', { name: '登记并入驻市场', exact: true }).click();
  const product = page.getByRole('form', { name: '代录商品', exact: true });
  await expect(product.getByRole('combobox', { name: '供货商户', exact: true })).toContainText('Assisted UI farm');
  await product.getByRole('combobox', { name: '供货商户', exact: true }).selectOption({ label: 'Assisted UI farm' });
  await product.getByLabel('商品名称', { exact: true }).fill('Assisted UI greens');
  await product.getByLabel('单价（USD）', { exact: true }).fill('4.50');
  await product.getByLabel('可预购数量', { exact: true }).fill('12');
  await product.getByRole('button', { name: '代商户上架', exact: true }).click();
  await expect(page.getByText('Assisted UI greens', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '开市与接单', exact: true }).click();
  const session = page.getByRole('form', { name: '建立开市场次', exact: true });
  await session.getByLabel('开始时间', { exact: true }).fill('09:00');
  await session.getByLabel('结束时间', { exact: true }).fill('10:00');
  await session.getByLabel('当日接单截止时间', { exact: true }).fill('08:00');
  await session.getByLabel('每个自提时段（分钟）', { exact: true }).fill('30');
  await session.getByLabel('每时段最多订单', { exact: true }).fill('1');
  await session.getByRole('button', { name: '保存场次草稿', exact: true }).click();
  await page.getByRole('button', { name: '开放接单', exact: true }).click();
  await expect(page.locator('.ops-session')).toContainText('接单中');
  await login(page, 'client'); await page.goto('/');
  await page.getByLabel('选择自提日期', { exact: true }).fill(date);
  await page.getByRole('button', { name: '将Assisted UI greens加入购物袋', exact: true }).click();
  await page.getByRole('button', { name: /^购物袋/ }).click();
  await expect(page.getByRole('combobox', { name: '选择自提时段', exact: true })).toContainText('09:00–09:30');
  await page.getByRole('button', { name: '确认预购', exact: true }).click();
  const placed = page.locator('.order-card').filter({ hasText: 'Assisted UI greens' });
  await expect(placed.locator('.customer-pickup-code strong')).toHaveText(/^\d{6}$/);
  await expect(placed.locator('.order-pickup')).toContainText(date);
});

test('服务台核对取货码与现场金额后交付，清单与操作日志可追溯', async ({ page }) => {
  const market = await newMarket(page), today = (await (await page.request.get('/api/config')).json()).today;
  const v = await (await page.request.post('/api/admin/assisted-vendors', { data: { name: 'Pickup UI farm', marketId: market.id } })).json();
  const p = await (await page.request.post('/api/admin/operations/products', { data: { marketId: market.id, vendorId: v.id, name: 'Pickup UI greens', date: today, priceCents: 450, stock: 10, unit: '把', category: '叶菜类' } })).json();
  await login(page, 'client');
  const order = await (await page.request.post('/api/orders', { data: { items: [{ productId: p.id, quantity: 2 }], pickupSlot: '10:00–12:00' } })).json();
  await login(page); await page.goto(`/admin/operations?market=${market.id}`);
  await page.locator('.ops-order-row').filter({ hasText: order.id }).click();
  await page.getByRole('button', { name: '已与商户核对，确认备货', exact: true }).click();
  await expect(page.locator('.ops-packing')).toContainText('Pickup UI greens');
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator('.ops-packing')).toBeVisible();
  await expect(page.getByRole('navigation', { name: '主导航', exact: true })).toBeHidden();
  const packingBox = await page.locator('.ops-packing').boundingBox();
  expect(packingBox?.y).toBeGreaterThanOrEqual(0);
  expect(packingBox?.y).toBeLessThan(100);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('packing-list.png') });
  await page.emulateMedia({ media: 'screen' });
  await page.locator('.ops-order-row').filter({ hasText: order.id }).click();
  await page.getByRole('button', { name: '已收全额现金', exact: true }).click();
  await page.getByLabel('6 位取货码', { exact: true }).fill('000000');
  await page.getByRole('button', { name: '登记交付与现场收款', exact: true }).click();
  await expect(page.getByRole('alert').first()).toContainText('取货码不匹配');
  await page.getByLabel('6 位取货码', { exact: true }).fill(order.pickup_code);
  await page.getByRole('button', { name: '登记交付与现场收款', exact: true }).click();
  await page.getByRole('button', { name: '1 已交付', exact: true }).click();
  await page.locator('.ops-order-row').filter({ hasText: order.id }).click();
  await expect(page.getByRole('region', { name: '订单处理详情', exact: true })).toContainText('$9.00');
  await page.getByText('查看操作交接记录', { exact: true }).click();
  await expect(page.locator('.ops-history')).toContainText('核验交付并登记现场收款');
  await page.reload(); await page.getByRole('button', { name: '1 已交付', exact: true }).click();
  await page.locator('.ops-order-row').filter({ hasText: order.id }).click();
  await expect(page.locator('.ops-detail')).toContainText('现场收款登记');
  await expect(page.getByRole('region', { name: '当天现场收款汇总', exact: true })).toContainText('$9.00');
});
for (const width of [320, 390]) test(`现场工作台在 ${width}px 支持大按钮表单和英语`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 }); await login(page); await page.goto('/admin/operations');
  for (const name of ['订单与交付', '开市与接单', '代办商户与商品']) {
    await page.getByRole('tab', { name, exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole('button', { name: 'Switch to English', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Assisted vendors & products', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
