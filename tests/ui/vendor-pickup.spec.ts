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
    expect((await page.request.patch(`/api/orders/${order.id}/status`, { data: { status: 'completed' } })).status()).toBe(409);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await form.getByRole('button', { name: english ? 'Full amount received in cash' : '已收全额现金', exact: true }).click();
    await input.fill(code === '000000' ? '111111' : '000000');
    const submit = form.getByRole('button', { name: english ? 'Record pickup and on-site payment' : '登记交付与现场收款', exact: true });
    await submit.click();
    await expect(form.getByRole('alert')).toContainText(english ? 'Pickup code does not match' : '取货码不匹配');
    await expect(card.locator('.status-badge')).toHaveText(english ? 'Awaiting pickup' : '待到场自提');
    await input.fill(code); await submit.click();
    await expect(card.locator('.status-badge')).toHaveText(english ? 'Completed' : '已完成');
    await expect(form).toHaveCount(0);
    await page.reload();
    await expect(card.locator('.status-badge')).toHaveText(english ? 'Completed' : '已完成');
    await login(page, 'client'); await page.reload();
    await expect(card.locator('.status-badge')).toHaveText(english ? 'Completed' : '已完成');
    await expect(card.locator('.customer-pickup-code')).toHaveCount(0);
  });
}
