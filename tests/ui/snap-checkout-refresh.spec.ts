import { expect, type Page, type APIRequestContext } from '@playwright/test';
import { test } from './isolated';

const credentials = (role: string) => ({ email: `${role}@qinghe.demo`, password: 'MarketDemo2026!' });
async function prepare(page: Page, admin: APIRequestContext, vendorAccepted = false) {
  expect((await admin.post('/api/auth/login', { data: credentials('admin') })).ok()).toBe(true);
  const today = (await (await admin.get('/api/config')).json()).today;
  const policy = { snap_status: 'accepted', snap_verified_on: today, snap_note: 'Verified test participation' };
  expect((await admin.put('/api/admin/markets/1/snap', { data: { ...policy, snap_model: 'vendor_terminal' } })).ok()).toBe(true);
  if (vendorAccepted) expect((await admin.put('/api/admin/markets/1/vendors/2/snap', { data: policy })).ok()).toBe(true);
  expect((await page.request.post('/api/auth/login', { data: credentials('retailer') })).ok()).toBe(true);
  const product = (await (await page.request.get('/api/retailer/products')).json()).find((p: { id: number }) => p.id === 1);
  expect((await page.request.put('/api/retailer/products/1', { data: { ...product, active: true, organic: !!product.organic, snap_eligibility: 'eligible' } })).ok()).toBe(true);
  expect((await page.request.post('/api/auth/login', { data: credentials('client') })).ok()).toBe(true);
  await page.goto('/');
  await page.getByRole('button', { name: '将藤熟番茄加入购物袋', exact: true }).click();
  await page.getByRole('button', { name: /^购物袋/ }).click();
  const bag = page.getByRole('dialog', { name: '我的新鲜购物袋', exact: true });
  await bag.getByRole('button', { name: '切换付款偏好', exact: true }).click();
  await bag.getByRole('radio', { name: 'SNAP/EBT', exact: true }).check();
  return { bag, policy };
}

test('食品合资格但商户未确认时说明具体原因，确认后重新核对即可下单', async ({ page, playwright, baseURL }) => {
  const admin = await playwright.request.newContext({ baseURL });
  try {
    const { bag, policy } = await prepare(page, admin);
    await expect(bag.locator('.snap-food-eligible')).toBeVisible();
    await expect(bag.getByRole('button', { name: '确认预购', exact: true })).toBeDisabled();
    await expect(bag.locator('.cart-checkout-status')).toContainText('商户尚未确认接受 SNAP/EBT。');
    await expect(bag.locator('.snap-checkout')).toContainText('商户尚未确认接受 SNAP/EBT。');
    await bag.getByRole('textbox').fill('保留我的购物袋');
    expect((await admin.put('/api/admin/markets/1/vendors/2/snap', { data: policy })).ok()).toBe(true);
    await bag.getByRole('button', { name: '重新核对', exact: true }).click();
    await expect(bag.getByRole('button', { name: '确认预购', exact: true })).toBeEnabled();
    await bag.getByRole('button', { name: '确认预购', exact: true }).click();
    await bag.getByRole('button', { name: '确认并提交预购', exact: true }).click();
    await expect(page).toHaveURL('/orders');
    await expect(page.locator('.order-note')).toContainText('保留我的购物袋');
    const [order] = await (await page.request.get('/api/orders')).json();
    expect(order.payment_method).toBe('snap_ebt');
  } finally { await admin.dispose(); }
});

test('购物袋不变时，切回页面会重新核对刚确认的 SNAP 状态', async ({ page, playwright, baseURL }) => {
  const admin = await playwright.request.newContext({ baseURL });
  try {
    const { bag, policy } = await prepare(page, admin);
    await expect(bag.getByRole('button', { name: '确认预购', exact: true })).toBeDisabled();
    expect((await admin.put('/api/admin/markets/1/vendors/2/snap', { data: policy })).ok()).toBe(true);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(bag.getByRole('button', { name: '确认预购', exact: true })).toBeEnabled();
    await expect(bag.locator('.snap-split')).toContainText('$3.50');
  } finally { await admin.dispose(); }
});

for (const width of [320, 1280]) {
  test(`英文 ${width}px 显示 SNAP 阻塞原因，可切回常规付款保留草稿`, async ({ page, playwright, baseURL }) => {
    await page.setViewportSize({ width, height: 900 });
    const admin = await playwright.request.newContext({ baseURL });
    try {
      const { bag } = await prepare(page, admin);
      await bag.getByRole('textbox').fill('Keep this note');
      await bag.getByLabel('关闭弹窗').click();
      await page.getByRole('button', { name: 'Switch to English', exact: true }).click();
      await page.getByRole('button', { name: /^Shopping bag/ }).click();
      const englishBag = page.getByRole('dialog', { name: 'My shopping bag', exact: true });
      const submit = englishBag.getByRole('button', { name: 'Place preorder', exact: true });
      await expect(submit).toBeDisabled();
      await submit.scrollIntoViewIfNeeded();
      await expect(englishBag.locator('.cart-checkout-status')).toBeInViewport();
      await expect(englishBag.locator('.cart-checkout-status')).toHaveText('The vendor has not confirmed SNAP/EBT acceptance.');
      const statusBounds = await englishBag.locator('.cart-checkout-status').boundingBox();
      const buttonBounds = await submit.boundingBox();
      expect(statusBounds!.y + statusBounds!.height).toBeLessThanOrEqual(buttonBounds!.y);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: test.info().outputPath(`snap-blocked-${width}.png`) });
      await englishBag.getByRole('button', { name: 'Use standard payment at pickup', exact: true }).click();
      await expect(submit).toBeEnabled();
      await expect(englishBag.getByRole('textbox')).toHaveValue('Keep this note');
      await submit.click();
      await englishBag.getByRole('button', { name: 'Confirm and submit preorder', exact: true }).click();
      await expect(page).toHaveURL('/orders');
      const [order] = await (await page.request.get('/api/orders')).json();
      expect(order.payment_method).toBe('pay_at_pickup');
    } finally { await admin.dispose(); }
  });
}

test('SNAP 预估失败不显示为可用，重新核对恢复后可提交且保留付款偏好', async ({ page, playwright, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const admin = await playwright.request.newContext({ baseURL });
  try {
    const { bag } = await prepare(page, admin, true);
    const submit = bag.getByRole('button', { name: '确认预购', exact: true });
    await expect(submit).toBeEnabled();
    await page.route('**/api/checkout/quote', route => route.fulfill({ status: 503, json: { error: 'Try again later' } }));
    await bag.getByRole('button', { name: '重新核对', exact: true }).click();
    await expect(submit).toBeDisabled();
    await expect(bag.locator('.cart-checkout-status')).toContainText('暂时无法核对 SNAP/EBT');
    await page.unroute('**/api/checkout/quote');
    await bag.getByRole('button', { name: '重新核对', exact: true }).click();
    await expect(submit).toBeEnabled();
    await expect(bag.locator('.payment-current strong')).toHaveText('SNAP/EBT');
    await submit.click();
    await expect(page.locator('.toast')).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('snap-ready.png'), animations: 'disabled' });
    await bag.getByRole('button', { name: '确认并提交预购', exact: true }).click();
    await expect(page).toHaveURL('/orders');
  } finally { await admin.dispose(); }
});
