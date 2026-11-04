import { test, expect } from '@playwright/test';

test('fresh visitors see English even with a Chinese browser locale', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'language', { get: () => 'zh-CN' }));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Good food, every day.');
  await expect(page.getByRole('button', { name: 'Switch to English', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveTitle(/Qinghe Rutgers Community Farmers Market/);
});

test('explicit Chinese and English choices persist across reload and navigation', async ({ page }) => {
  await page.goto('/vendor');
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Vendor services');
  await page.getByRole('button', { name: '切换为中文', exact: true }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('商户服务');
  await page.getByRole('button', { name: 'Switch to English', exact: true }).click();
  await page.goto('/notifications');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Notifications');
});

test('invalid or unavailable saved preferences fall back to English and switching still works', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('qinghe-language', 'invalid'));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
  });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByRole('button', { name: '切换为中文', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
});
