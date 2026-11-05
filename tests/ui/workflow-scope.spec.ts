import { expect } from '@playwright/test';
import { test } from './isolated';

test('切换场次后请求失败时不显示上一场次的商户或编辑表单', async ({ page }) => {
  expect((await page.request.post('/api/auth/login', { data: {
    email: 'admin@qinghe.demo', password: 'MarketDemo2026!',
  } })).ok()).toBe(true);
  const today = (await (await page.request.get('/api/config')).json()).today;
  await page.route('**/api/admin/operations?*', route => route.fulfill({ json: {
    sessions: [6101, 6102].map((id, i) => ({ id, market_id: 1, market_name: `Scope ${i + 1}`,
      date: today, starts_at: `${10 + i}:00`, ends_at: `${11 + i}:00`, status: 'open',
      cancelled: 0, notice: '', version: 0 })),
  } }));
  await page.route('**/api/admin/sessions/6101/vendors', route => route.fulfill({ json: [{
    session_id: 6101, retailer_id: 2, name: 'First session vendor', email: '',
    status: 'planned', booth: 'A1', note: '', version: 0,
  }] }));
  await page.route('**/api/admin/sessions/6102/vendors', route => route.fulfill({
    status: 503, json: { error: 'Scope request failed' },
  }));
  await page.goto('/admin/community');
  await page.getByRole('tab', { name: '出摊与停市', exact: true }).click();
  await expect(page.locator('.workflow-attendee')).toContainText('First session vendor');
  await page.getByRole('combobox', { name: '选择场次', exact: true }).selectOption('6102');
  await expect(page.getByRole('alert')).toContainText('Scope request failed');
  await expect(page.locator('.workflow-attendee')).toHaveCount(0);
  await expect(page.locator('.workflow-booths')).not.toContainText('First session vendor');
});
