import { expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { test } from './isolated';
import { tenderChannels } from '../../server/tenders.mjs';

async function login(page: Page, role = 'admin') {
  expect((await page.request.post('/api/auth/login', { data: { email: `${role}@qinghe.demo`, password: 'MarketDemo2026!' } })).ok()).toBe(true);
}
async function sessionFixture(page: Page) {
  await login(page);
  const today = (await (await page.request.get('/api/config')).json()).today;
  const response = await page.request.post('/api/admin/sessions', { data: { marketId: 1, date: today, startsAt: '09:00', endsAt: '13:00', cutoff: '08:00', slotMinutes: 30, capacity: 10 } });
  expect(response.ok()).toBe(true);
  const session = await response.json();
  expect((await page.request.put(`/api/admin/sessions/${session.id}/vendors`, { data: { vendorId: 2, status: 'checked_in', version: 0 } })).ok()).toBe(true);
  return session;
}

test('八类收款可填报、核对、排序与导出，Match 不重复加到成交额', async ({ page }) => {
  await sessionFixture(page);
  await page.goto('/admin/community');
  await page.getByRole('tab', { name: '现场销售填报', exact: true }).click();
  await page.getByRole('combobox', { name: '已签到商户', exact: true }).selectOption('2');
  await page.getByLabel('总销售额（USD）', { exact: true }).fill('36');
  await page.getByLabel('交易笔数', { exact: true }).fill('8');
  await page.getByRole('checkbox', { name: '按付款与补助分类填报', exact: true }).check();
  await expect(page.locator('.sales-tender-fields input')).toHaveCount(8);
  expect(await page.getByLabel('总销售额（USD）', { exact: true }).evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);
  for (let i = 0; i < tenderChannels.length; i++) await page.getByLabel(tenderChannels[i].label, { exact: true }).fill(String(i + 1));
  await expect(page.locator('.sales-tender-balance')).toContainText('待分配金额 $0.00');
  await page.getByRole('button', { name: '保存销售填报', exact: true }).click();
  await page.getByText('查看收款分类', { exact: true }).click();
  await expect(page.locator('.sales-tender-details')).toContainText('$8.00');
  await page.goto('/admin?view=business');
  const mix = page.getByRole('region', { name: '付款与补助结构', exact: true });
  await expect(mix.locator('.distribution-option')).toHaveCount(8);
  await expect(mix.locator('.tender-coverage')).toContainText('已分类销售额 $36.00');
  await mix.getByRole('button', { name: 'Match', exact: true }).click();
  await expect(mix.locator('.tender-inspector')).toContainText('$8.00');
  await expect(mix.locator('.tender-inspector')).toContainText('22.2%');
  await mix.getByRole('button', { name: '按金额排序', exact: true }).click();
  await expect(mix.locator('.distribution-option').first()).toHaveAttribute('aria-label', 'Match');
  await page.getByLabel('选择导出报表', { exact: true }).selectOption('business');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 CSV', exact: true }).click();
  const csv = await readFile((await (await download).path())!, 'utf8');
  expect(csv).toContain('"商户申报收款分类 · QR Code (WIC & FMNP)","7"');
  expect(csv).toContain('"商户申报销售额","36"');
  expect(csv).toContain('"商户申报收款分类 · Match","8"');
  await page.getByRole('button', { name: 'Switch to English', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Payments & benefits mix', exact: true })).toContainText('Share of classified sales');
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 850 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test('商户可保存分类并重新编辑，未分类历史记录不会显示成零', async ({ page }) => {
  const session = await sessionFixture(page);
  expect((await page.request.post('/api/admin/sales-reports', { data: { sessionId: session.id, vendorId: 2, grossCents: 500, transactions: 1, note: 'Legacy total', version: 0 } })).ok()).toBe(true);
  await page.goto('/admin?view=business');
  const mix = page.getByRole('region', { name: '付款与补助结构', exact: true });
  await expect(mix.locator('.tender-coverage')).toContainText('未分类销售额 $5.00');
  await expect(mix.getByRole('button', { name: 'Cash', exact: true })).toContainText('—');
  await login(page, 'retailer');
  await page.goto('/vendor');
  await page.getByRole('tab', { name: '我的出摊', exact: true }).click();
  await expect(page.getByLabel('总销售额（USD）', { exact: true })).toHaveValue('5');
  await expect(page.getByLabel('备注', { exact: true })).toHaveValue('Legacy total');
  await page.getByRole('checkbox', { name: '按付款与补助分类填报', exact: true }).check();
  await page.getByLabel('Cash', { exact: true }).fill('5');
  await page.getByRole('button', { name: '保存销售填报', exact: true }).click();
  await expect(page.getByLabel('Cash', { exact: true })).toHaveValue('5');
  await page.reload();
  await page.getByRole('tab', { name: '我的出摊', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: '按付款与补助分类填报', exact: true })).toBeChecked();
  await expect(page.getByLabel('Cash', { exact: true })).toHaveValue('5');
  await page.setViewportSize({ width: 320, height: 850 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('环图区分尚未填报、显式零金额和零分母，键盘可查看零订单状态', async ({ page }) => {
  const session = await sessionFixture(page);
  await page.goto('/admin');
  const status = page.getByRole('group', { name: '订单状态占比图', exact: true });
  await expect(status.locator('.distribution-center strong')).toHaveText('0');
  await expect(status.locator('.recharts-pie-sector')).toHaveCount(0);
  await status.getByRole('button', { name: '已完成', exact: true }).press('Home');
  await status.getByRole('button', { name: '待商户确认', exact: true }).press('ArrowRight');
  await expect(status.getByRole('button', { name: '待到场自提', exact: true })).toBeFocused();
  await expect(page.locator('.distribution-readout')).toContainText('取货码核验');
  await page.getByRole('tab', { name: '经营与覆盖', exact: true }).click();
  const mix = page.getByRole('region', { name: '付款与补助结构', exact: true });
  await expect(mix.locator('.distribution-empty')).toContainText('金额未知');
  await expect(mix.locator('.distribution-center strong')).toHaveText('—');
  const tenders = Object.fromEntries(tenderChannels.map(c => [c.key, 0]));
  expect((await page.request.post('/api/admin/sales-reports', { data: { sessionId: session.id, vendorId: 2, grossCents: 0, transactions: 0, note: 'Explicit zero', version: 0, tenders } })).ok()).toBe(true);
  await page.getByRole('button', { name: '刷新管理数据', exact: true }).click();
  await expect(mix.locator('.distribution-center strong')).toHaveText('$0.00');
  await expect(mix.locator('.distribution-empty')).toContainText('当前分类合计为零');
  await expect(mix.locator('.recharts-pie-sector')).toHaveCount(0);
  await expect(mix.locator('.distribution-option').filter({ hasText: /NaN|Infinity|100\.0%/ })).toHaveCount(0);
});
