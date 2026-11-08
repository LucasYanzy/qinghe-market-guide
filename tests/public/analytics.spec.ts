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
  await mix.getByRole('button', { name: 'QR Code (WIC & FMNP)', exact: true }).hover();
  await expect(mix.locator('.distribution-center')).toContainText('QR Code');
  await expect(mix.locator('.tender-inspector')).toContainText('WIC');
  await expect(mix.getByRole('button', { name: 'Match', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(mix.locator('.distribution-center')).toContainText('Match');
  await mix.getByRole('button', { name: 'Bars', exact: true }).click();
  await expect(mix.locator('.distribution-center')).toHaveCount(0);
  await expect(mix.locator('.tender-inspector')).toContainText('Match records matching benefits');
  await mix.getByRole('button', { name: 'Next category', exact: true }).click();
  await expect(mix.getByRole('button', { name: 'Cash', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await mix.getByRole('button', { name: 'Previous category', exact: true }).click();
  await expect(mix.getByRole('button', { name: 'Match', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await mix.getByRole('button', { name: 'Donut', exact: true }).click();
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
  await categories.locator('.distribution-option').first().hover();
  await expect(page.locator('.inventory-category-selection')).toContainText('Fresh fruit');
  await expect(categories.getByRole('button', { name: 'Fresh fruit', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await categories.getByRole('button', { name: 'Donut', exact: true }).hover();
  await expect(categories.locator('.distribution-center')).toContainText('Fresh fruit');
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
  await mix.getByRole('button', { name: 'Match', exact: true }).click();
  await page.mouse.move(0, 0);
  await mix.scrollIntoViewIfNeeded();
  await mix.screenshot({ path: test.info().outputPath('payment-donut-desktop.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 1000 });
  await mix.scrollIntoViewIfNeeded();
  await mix.screenshot({ path: test.info().outputPath('payment-donut-mobile.png'), animations: 'disabled' });
  await page.getByRole('button', { name: '切换为中文', exact: true }).click();
  await expect(page.getByRole('group', { name: '付款分类占比图', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '数据演示', exact: true })).toContainText('历史样本已载入');
});

test('completed pickups and cancellations recalculate live metrics and period changes without reloading', async ({ page }) => {
  await page.clock.install();
  await page.goto('./admin/');
  await page.getByRole('button', { name: 'Load historical sample', exact: true }).click();
  await expect(page.locator('.analytics-stat-primary > strong')).not.toHaveText('$0.00');
  const before = await api(page, '/admin/overview');
  const checkMetrics = async (data: typeof before) => {
    const current = data.analytics.current, previous = data.analytics.previous;
    for (const [label, key, currency] of [
      ['Completed order value', 'revenueCents', true], ['Platform preorders', 'orders', false],
      ['Participating customers', 'participants', false], ['Average completed order value', 'averageOrderCents', true],
    ] as const) {
      const stat = page.locator('.analytics-stat').filter({ has: page.locator('.analytics-stat-label').getByText(label, { exact: true }) });
      await expect(stat.locator(':scope > strong')).toHaveText(currency ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(current[key] / 100) : String(current[key]));
      const delta = (current[key] - previous[key]) / previous[key] * 100;
      await expect(stat.locator('.analytics-delta')).toContainText(`${Math.abs(delta).toFixed(1)}%`);
      await expect(stat.locator('.analytics-delta')).toHaveClass(delta < 0 ? /down/ : /^(?!.*down)/);
    }
  };
  await checkMetrics(before);
  const states = page.getByRole('group', { name: 'Order status shares', exact: true });
  await states.getByRole('button', { name: 'Cancelled', exact: true }).click();
  const slider = page.getByRole('slider', { name: 'Select trend date', exact: true });
  await slider.focus(); await slider.press('Home');

  // Change the demo API's role without remounting the admin UI, as if another device performed the work.
  await api(page, '/demo/role', 'POST', { role: 'client' });
  const products = await api(page, '/products');
  const orders = [];
  for (let i = 0; i < 2; i++) orders.push(await api(page, '/orders', 'POST', { items: [{ productId: products[0].id, quantity: 1 }], pickupSlot: '10:00–12:00' }));
  await api(page, '/demo/role', 'POST', { role: 'admin' });
  await page.clock.runFor(30100);
  const pending = await api(page, '/admin/overview');
  expect(pending.summary.orders).toBe(before.summary.orders + 2);
  expect(pending.summary.revenueCents).toBe(before.summary.revenueCents);
  await checkMetrics(pending);

  await api(page, '/demo/role', 'POST', { role: 'retailer' });
  await api(page, `/orders/${orders[0].id}/status`, 'PATCH', { status: 'confirmed' });
  await api(page, `/orders/${orders[0].id}/pickup`, 'POST', { pickupCode: orders[0].pickup_code, cashCents: orders[0].total_cents, cardCents: 0, snapCents: 0 });
  await api(page, `/orders/${orders[1].id}/status`, 'PATCH', { status: 'cancelled' });
  await api(page, '/demo/role', 'POST', { role: 'admin' });
  await page.clock.runFor(30100);
  const completed = await api(page, '/admin/overview');
  expect(completed.summary.revenueCents).toBe(before.summary.revenueCents + orders[0].total_cents);
  expect(completed.summary.participants).toBe(before.summary.participants + 1);
  expect(completed.summary.cancelled).toBe(before.summary.cancelled + 1);
  await checkMetrics(completed);
  await expect(states.getByRole('button', { name: 'Cancelled', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(states.locator('.distribution-selection-value')).toContainText(String(completed.summary.cancelled));
  await expect(slider).toHaveValue('0');
  await page.getByRole('button', { name: 'Next data point', exact: true }).click();
  await expect(slider).toHaveValue('1');
  await page.getByRole('button', { name: 'Latest record', exact: true }).click();
  await expect(slider).toHaveValue(await slider.getAttribute('max') as string);
  await expect(page.getByRole('button', { name: 'Next data point', exact: true })).toBeDisabled();
});

test('touch users can browse and clear categories in bars mode without hover or motion', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, hasTouch: true, isMobile: true, viewport: { width: 320, height: 740 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  try {
    await page.goto('./admin/');
    await page.getByRole('button', { name: 'Load historical sample', exact: true }).tap();
    await expect(page.locator('.analytics-stat-primary > strong')).not.toHaveText('$0.00');
    await page.getByRole('tab', { name: 'Products & inventory', exact: true }).tap();
    const chart = page.getByRole('group', { name: 'Product category shares', exact: true });
    await chart.getByRole('button', { name: 'Bars', exact: true }).tap();
    await chart.getByRole('button', { name: 'Previous category', exact: true }).tap();
    await expect(chart.locator('.distribution-option').last()).toHaveAttribute('aria-pressed', 'true');
    await chart.getByRole('button', { name: 'Next category', exact: true }).tap();
    await expect(chart.locator('.distribution-option').first()).toHaveAttribute('aria-pressed', 'true');
    await chart.getByRole('button', { name: 'Fresh fruit', exact: true }).tap();
    await expect(chart.locator('.distribution-selection-value')).toContainText('Fresh fruit');
    await expect(chart.locator('[data-preview=true]')).toHaveCount(0);
    await expect(page.locator('.inventory-category-selection')).toContainText('Fresh fruit');
    await chart.getByRole('button', { name: 'Clear selection', exact: true }).tap();
    await expect(page.locator('.inventory-category-selection')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await context.close(); }
});
