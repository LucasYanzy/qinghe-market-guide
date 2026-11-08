import { test, expect, type Page } from '@playwright/test';

async function api(page: Page, path: string, method = 'GET', body?: unknown) {
  return page.evaluate(async ({ path, method, body }) => {
    const response = await fetch(`/api${path}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
    return response.json();
  }, { path, method, body });
}
async function role(page: Page, name: string) {
  await page.locator('.interactive-demo-toolbar').getByRole('button', { name, exact: true }).click();
}

test('opt-in history stays consistent across roles, reloads, new orders and independent tabs', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await expect(page.locator('.product-card')).toHaveCount(38);
  const products = await api(page, '/products');
  const order = await api(page, '/orders', 'POST', { items: [{ productId: products[0].id, quantity: 1 }], pickupSlot: '10:00–12:00', note: 'Interactive order survives loading' });
  const afterOrder = await api(page, '/products');
  await role(page, 'University');
  await page.getByRole('button', { name: 'Load historical sample', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Demo data', exact: true })).toContainText('Historical sample loaded');
  await expect(page.locator('.analytics-stat-primary > strong')).not.toHaveText('$0.00');
  const loaded = await api(page, '/admin/overview');
  const status = (await api(page, '/demo/analytics')).sample;
  expect(status.sessions).toBe(24);
  expect(loaded.summary.orders).toBeGreaterThan(1);
  await api(page, '/demo/analytics', 'POST', {});
  expect((await api(page, '/admin/overview')).summary.orders).toBe(loaded.summary.orders);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Load historical sample', exact: true })).toHaveCount(0);
  const another = await context.newPage();
  await another.goto('./admin/');
  await expect(another.getByRole('button', { name: 'Load historical sample', exact: true })).toBeVisible();
  await another.close();
  await role(page, 'Vendor');
  expect((await api(page, '/retailer/analytics?range=30')).products.length).toBeGreaterThan(5);
  expect(await api(page, '/products')).toEqual(afterOrder);
  await api(page, `/orders/${order.id}/status`, 'PATCH', { status: 'confirmed' });
  // A vendor confirmation still cannot bypass code verification.
  const blocked = await page.evaluate(async id => (await fetch(`/api/orders/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'completed' }) })).status, order.id);
  expect(blocked).toBe(409);
  await api(page, `/orders/${order.id}/pickup`, 'POST', { pickupCode: order.pickup_code, cashCents: order.total_cents, cardCents: 0, snapCents: 0 });
  await role(page, 'University');
  await expect(page.locator('.analytics-stat-primary > strong')).toHaveText(`$${((loaded.summary.revenueCents + order.total_cents) / 100).toFixed(2)}`);
  expect((await api(page, '/admin/overview')).summary.completed).toBe(loaded.summary.completed + 1);
  await role(page, 'Customer');
  const own = await api(page, '/orders');
  expect(own).toHaveLength(1);
  expect(own[0].id).toBe(order.id);
  expect(own[0].status).toBe('completed');
  expect(errors).toEqual([]);
});

test('donut segments, keyboard legends, sorting and category filtering share one selection', async ({ page }) => {
  await page.goto('./admin/');
  await page.getByRole('button', { name: 'Load historical sample', exact: true }).click();
  await expect(page.locator('.analytics-stat-primary > strong')).not.toHaveText('$0.00');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('.analytics-primary-grid').screenshot({ path: test.info().outputPath('fulfillment-donut-desktop.png'), animations: 'disabled' });
  const fulfillment = page.getByRole('group', { name: 'Order status shares', exact: true });
  await fulfillment.locator('.recharts-pie-sector').last().click();
  await expect(fulfillment.getByRole('button', { name: 'Cancelled', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await fulfillment.getByRole('button', { name: 'Cancelled', exact: true }).press('Home');
  await expect(fulfillment.getByRole('button', { name: 'Awaiting confirmation', exact: true })).toBeFocused();
  await page.getByRole('tab', { name: 'Business & coverage', exact: true }).click();
  const mix = page.getByRole('region', { name: 'Payments & benefits mix', exact: true });
  await mix.getByRole('button', { name: 'Match', exact: true }).click();
  await expect(mix.locator('.tender-inspector')).toContainText('Match records matching benefits');
  const center = await mix.locator('.distribution-center').innerText();
  const color = await mix.getByRole('button', { name: 'Match', exact: true }).locator('i').getAttribute('style');
  await mix.getByRole('button', { name: 'Sort by amount', exact: true }).click();
  expect(await mix.locator('.distribution-center').innerText()).toBe(center);
  await expect(mix.getByRole('button', { name: 'Match', exact: true }).locator('i')).toHaveAttribute('style', color!);
  await mix.getByRole('button', { name: 'Match', exact: true }).press('Home');
  await expect(mix.locator('.distribution-option').first()).toBeFocused();
  await page.getByRole('tab', { name: 'Products & inventory', exact: true }).click();
  const categories = page.getByRole('group', { name: 'Product category shares', exact: true });
  await categories.getByRole('button', { name: 'Fresh fruit', exact: true }).click();
  await expect(page.locator('.inventory-category-selection')).toContainText('Fresh fruit');
  await expect(categories.locator('.distribution-center')).toContainText('10');
  await categories.getByRole('button', { name: 'Fresh fruit', exact: true }).press('Home');
  await categories.locator('.distribution-option').first().press('Home');
  await expect(categories.locator('.distribution-option').first()).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Show all categories', exact: true }).click();
  await expect(page.locator('.inventory-category-selection')).toHaveCount(0);
  await expect(categories.locator('.distribution-center')).toContainText('38');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const view of ['Overview', 'Products & inventory', 'Business & coverage']) {
      await page.getByRole('tab', { name: view, exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
  await mix.scrollIntoViewIfNeeded();
  await mix.screenshot({ path: test.info().outputPath('payment-donut-desktop.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 1000 });
  await mix.scrollIntoViewIfNeeded();
  await mix.screenshot({ path: test.info().outputPath('payment-donut-mobile.png'), animations: 'disabled' });
  await page.getByRole('button', { name: '切换为中文', exact: true }).click();
  await expect(page.getByRole('group', { name: '付款分类占比图', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '数据演示', exact: true })).toContainText('历史样本已载入');
});
