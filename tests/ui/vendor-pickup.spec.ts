import { expect, type Page } from '@playwright/test';
import { test } from './isolated';

async function login(page: Page, role: string) {
  expect((await page.request.post('/api/auth/login', { data: {
    email: `${role}@qinghe.demo`, password: 'MarketDemo2026!',
  } })).ok()).toBe(true);
}

for (const [width, english] of [[320, false], [1280, true]] as const) {
  test(`普通预购由买家提供取货码，商户核验后完成 ${width}px ${english ? 'EN' : 'ZH'}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page, 'client');
    const created = await page.request.post('/api/orders', { data: {
      items: [{ productId: 1, quantity: 1 }], pickupSlot: '10:00–12:00',
    } });
    expect(created.status()).toBe(201);
    const order = await created.json();
    expect(order.market_session_id).toBeNull();
    await page.goto('/orders');
    if (english) await page.getByRole('button', { name: 'Switch to English', exact: true }).click();
    const card = page.locator('.order-card').filter({ hasText: order.id });
    const code = await card.locator('.customer-pickup-code strong').innerText();
    expect(code).toBe(order.pickup_code);
    await login(page, 'retailer'); await page.reload();
    const sellerOrders = await (await page.request.get('/api/orders')).json();
    expect(sellerOrders.find((row: { id: string }) => row.id === order.id).pickup_code).toBeUndefined();
    await expect(card.locator('.customer-pickup-code')).toHaveCount(0);
    await card.getByRole('button', { name: english ? 'Accept preorder' : '确认预购', exact: true }).click();
    const form = card.getByRole('form', { name: english ? 'Pickup verification and payment record' : '取货核验与现场登记', exact: true });
    await expect(form).toBeVisible();
    const input = form.getByLabel(english ? '6-digit pickup code' : '6 位取货码', { exact: true });
    await expect(input).toHaveValue('');
    const submit = form.getByRole('button', { name: english ? 'Verify & complete pickup' : '核验并完成交付', exact: true });
    await expect(submit).toBeDisabled();
    await input.fill('12 34 56');
    await expect(input).toHaveValue('123456');
    await expect(submit).toBeDisabled();
    expect((await page.request.patch(`/api/orders/${order.id}/status`, { data: { status: 'completed' } })).status()).toBe(409);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await form.getByRole('button', { name: english ? 'Full amount received in cash' : '已收全额现金', exact: true }).click();
    await expect(form.getByRole('button', { name: english ? 'Full amount received in cash' : '已收全额现金', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: test.info().outputPath(`handover-${width}.png`), fullPage: true });
    await input.fill(code === '000000' ? '111111' : '000000');
    await submit.click();
    await expect(form.getByRole('alert')).toContainText(english ? 'Pickup code does not match' : '取货码不匹配');
    await expect(card.locator('.status-badge')).toHaveText(english ? 'Awaiting pickup' : '待到场自提');
    await input.fill(code); await submit.click();
    await expect(card.locator('.status-badge')).toHaveText(english ? 'Completed' : '已完成');
    await expect(card.locator('.order-handover-done')).toContainText(english ? 'Pickup verified & completed' : '已核验交付');
    await expect(form).toHaveCount(0);
    await page.reload();
    await expect(card.locator('.status-badge')).toHaveText(english ? 'Completed' : '已完成');
    await expect(card.locator('.order-handover-done')).toContainText(english ? 'Cash $3.50' : '现金 $3.50');
    await login(page, 'client'); await page.reload();
    await expect(card.locator('.status-badge')).toHaveText(english ? 'Completed' : '已完成');
    await expect(card.locator('.customer-pickup-code')).toHaveCount(0);
  });
}

test('拆分 SNAP 收款保留金额与小票，提交锁定并在失败后可重试', async ({ page }) => {
  await login(page, 'admin');
  const today = (await (await page.request.get('/api/config')).json()).today;
  const policy = { snap_status: 'accepted', snap_verified_on: today, snap_note: 'Test confirmation' };
  expect((await page.request.put('/api/admin/markets/1/snap', { data: { ...policy, snap_model: 'vendor_terminal' } })).ok()).toBe(true);
  expect((await page.request.put('/api/admin/markets/1/vendors/2/snap', { data: policy })).ok()).toBe(true);
  await login(page, 'retailer');
  const product = (await (await page.request.get('/api/retailer/products')).json())[0];
  expect((await page.request.put(`/api/retailer/products/${product.id}`, { data: {
    ...product, organic: !!product.organic, active: !!product.active, snap_eligibility: 'eligible',
  } })).ok()).toBe(true);
  await login(page, 'client');
  const order = await (await page.request.post('/api/orders', { data: {
    items: [{ productId: product.id, quantity: 1 }], pickupSlot: '10:00–12:00', paymentMethod: 'snap_ebt',
  } })).json();
  await login(page, 'retailer');
  expect((await page.request.patch(`/api/orders/${order.id}/status`, { data: { status: 'confirmed' } })).ok()).toBe(true);
  await page.goto('/orders');
  const form = page.getByRole('form', { name: '取货核验与现场登记', exact: true });
  await form.getByLabel('6 位取货码', { exact: true }).fill(order.pickup_code);
  await form.locator('summary').click();
  await form.getByLabel('现金 USD', { exact: true }).fill('1.00');
  await form.getByLabel('SNAP / EBT USD', { exact: true }).fill(((order.total_cents - 100) / 100).toFixed(2));
  const submit = form.getByRole('button', { name: '核验并完成交付', exact: true });
  await expect(submit).toBeDisabled();
  await form.getByLabel('现场小票参考号（SNAP 必填）', { exact: true }).fill('Terminal receipt');
  await expect(submit).toBeEnabled();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const path = `**/api/orders/${order.id}/pickup`;
  await page.route(path, async route => { await gate; await route.fulfill({ status: 503, json: { error: '暂时繁忙' } }); });
  await submit.click();
  await expect(form.getByLabel('6 位取货码', { exact: true })).toBeDisabled();
  await expect(submit).toBeDisabled();
  release();
  await expect(form.getByRole('alert')).toContainText('暂时繁忙');
  await expect(form.getByLabel('现金 USD', { exact: true })).toHaveValue('1.00');
  await expect(form.getByLabel('现场小票参考号（SNAP 必填）', { exact: true })).toHaveValue('Terminal receipt');
  await page.unroute(path);
  await submit.click();
  await expect(page.locator('.order-card .status-badge')).toHaveText('已完成');
  const saved = (await (await page.request.get('/api/orders')).json()).find((row: { id: string }) => row.id === order.id);
  expect(saved.receipt.cash_cents).toBe(100);
  expect(saved.receipt.snap_cents).toBe(order.total_cents - 100);
  expect(saved.receipt.reference).toBe('Terminal receipt');
});
