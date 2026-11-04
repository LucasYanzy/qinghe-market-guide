import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

async function login(api: APIRequestContext) {
  expect((await api.post('/api/auth/login', { data: { email: 'admin@qinghe.demo', password: 'MarketDemo2026!' } })).ok()).toBe(true);
}
async function market(api: APIRequestContext) {
  const response = await api.post('/api/admin/markets', { data: { name: `Profile ${test.info().testId}`, subtitle: '', address: 'Campus', latitude: 40.5, longitude: -74.45, hours: 'Published sessions', description: '', community: '', coverage_radius_km: 1, active: true, preorders_enabled: true } });
  expect(response.ok()).toBe(true); return response.json();
}
async function approvedVendor(api: APIRequestContext, admin: APIRequestContext, marketId: number) {
  const response = await api.post('/api/auth/register', { data: { name: 'Private applicant', email: `profile-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`, password: 'ProfilePassword42' } });
  expect(response.ok()).toBe(true); const { user } = await response.json();
  const application = await api.post('/api/vendor/applications', { data: { marketId, businessName: 'Original Orchard', contactName: 'Private contact', phone: '555-PRIVATE', description: 'PRIVATE qualification details' } });
  expect(application.ok()).toBe(true);
  expect((await admin.patch(`/api/admin/applications/${(await application.json()).id}`, { data: { status: 'approved', note: 'Initial approval', version: 0 } })).ok()).toBe(true);
  return user;
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('English vendor profile changes are reviewed by staff and only approved public introductions reach the roster', async ({ page, browser, baseURL }) => {
  const staff = await browser.newContext({ baseURL }); await login(staff.request); const m = await market(staff.request);
  const user = await approvedVendor(page.request, staff.request, m.id);
  const date = (await (await staff.request.get('/api/config')).json()).today;
  const session = await staff.request.post('/api/admin/sessions', { data: { marketId: m.id, date, startsAt: '00:00', endsAt: '23:59', cutoff: '23:59', slotMinutes: 60, capacity: 10 } });
  expect(session.ok()).toBe(true); const s = await session.json();
  expect((await staff.request.patch(`/api/admin/sessions/${s.id}`, { data: { status: 'open', version: 0 } })).ok()).toBe(true);
  expect((await staff.request.put(`/api/admin/sessions/${s.id}/vendors`, { data: { vendorId: user.id, status: 'confirmed', booth: 'A8', version: 0 } })).ok()).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/vendor');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByRole('tab', { name: 'My vendor profile', exact: true }).click();
  const form = page.getByRole('form', { name: 'Request a profile change', exact: true });
  await form.getByLabel('Vendor name', { exact: true }).fill('Reviewed Orchard');
  await form.getByLabel('Public business introduction', { exact: true }).fill('Apples & honey. <script>window.profileXss=true</script>');
  await form.getByLabel('Contact person (optional)', { exact: true }).fill('New private contact');
  await form.getByRole('button', { name: 'Submit profile change', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Profile change history' })).toContainText('Awaiting review');
  await expect(page.getByRole('region', { name: 'Current approved profile' })).toContainText('Original Orchard');
  await expect(form.getByRole('button', { name: 'Submit profile change' })).toBeDisabled(); await noOverflow(page);
  let directory = await (await page.request.get(`/api/session-directory?date=${date}`)).json();
  expect(directory.find((row: { id: number }) => row.id === s.id).vendors[0].description).toBe('');
  const changeId = (await (await page.request.get('/api/vendor/profile')).json()).requests[0].id;
  const staffPage = await staff.newPage(); await staffPage.goto('/notifications');
  await staffPage.locator('.workflow-cards article').filter({ hasText: `Vendor profile change ${changeId} is awaiting review.` }).getByRole('link', { name: 'View related records', exact: true }).click();
  await expect(staffPage.getByRole('tab', { name: 'Vendor profiles and changes', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(staffPage.getByRole('combobox', { name: 'Select vendor profile', exact: true })).toHaveValue(String(user.id));
  const history = staffPage.getByRole('region', { name: 'Profile change history' });
  await expect(history).toContainText('Reviewed Orchard'); await expect(history).toContainText('New private contact');
  await history.getByLabel('Review notes', { exact: true }).fill('Verified with the merchant');
  await history.getByRole('button', { name: 'Save profile review', exact: true }).click();
  await expect(staffPage.getByRole('region', { name: 'Current approved profile' })).toContainText('Reviewed Orchard');
  await expect(history).toContainText('Verified with the merchant');
  await staffPage.setViewportSize({ width: 1440, height: 1000 }); await noOverflow(staffPage);
  await staffPage.screenshot({ path: 'output/vendor-profiles-20261031/staff-desktop-en.png', fullPage: true });
  await page.goto('/notifications');
  await page.locator('.workflow-cards article').filter({ hasText: `Vendor profile change ${changeId} has been reviewed.` }).getByRole('link', { name: 'View related records', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'My vendor profile', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('region', { name: 'Current approved profile' })).toContainText('Reviewed Orchard');
  await page.screenshot({ path: 'output/vendor-profiles-20261031/vendor-mobile-en.png', fullPage: true });
  await page.goto(`/?date=${date}&market=${m.id}`);
  const roster = page.locator('.public-vendor-list').filter({ hasText: 'Reviewed Orchard' });
  await expect(roster).toHaveCount(1); await roster.locator('summary').click();
  await expect(roster).toContainText('Apples & honey. <script>window.profileXss=true</script>');
  await expect(roster).not.toContainText('New private contact'); await expect(roster).not.toContainText('555-PRIVATE');
  expect(await page.evaluate(() => (window as unknown as { profileXss?: boolean }).profileXss)).toBeUndefined(); await noOverflow(page);
  directory = await (await page.request.get(`/api/session-directory?date=${date}`)).json();
  expect(JSON.stringify(directory)).not.toContain('PRIVATE qualification'); await staff.close();
});

test('vendor withdraws and resubmits, then receives a rejection without changing the approved profile', async ({ page, playwright, baseURL }) => {
  const admin = await playwright.request.newContext({ baseURL }); await login(admin); const m = await market(admin);
  await approvedVendor(page.request, admin, m.id); await page.goto('/vendor');
  await page.getByRole('tab', { name: 'My vendor profile', exact: true }).click();
  const form = page.getByRole('form', { name: 'Request a profile change', exact: true });
  await form.getByLabel('Vendor name', { exact: true }).fill('Withdraw this name');
  await form.getByRole('button', { name: 'Submit profile change', exact: true }).click();
  await page.getByRole('button', { name: 'Withdraw profile change', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Profile change history' })).toContainText('Withdrawn');
  await expect(form.getByRole('button', { name: 'Submit profile change' })).toBeEnabled();
  await form.getByLabel('Vendor name', { exact: true }).fill('Please reject this name');
  await form.getByRole('button', { name: 'Submit profile change', exact: true }).click();
  const request = (await (await page.request.get('/api/vendor/profile')).json()).requests[0];
  expect((await admin.patch(`/api/admin/vendor-profile-requests/${request.id}`, { data: { status: 'rejected', note: 'Clarify the business name', version: 0 } })).ok()).toBe(true);
  await page.reload(); await page.getByRole('tab', { name: 'My vendor profile', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Profile change history' })).toContainText('Clarify the business name');
  await expect(page.getByRole('region', { name: 'Current approved profile' })).toContainText('Original Orchard');
  await page.getByRole('button', { name: '切换为中文', exact: true }).click();
  await expect(page.getByRole('tab', { name: '我的商户档案', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.setViewportSize({ width: 320, height: 844 }); await noOverflow(page); await admin.dispose();
});

test('staff assists a vendor with profile changes at a selected market in English and Chinese', async ({ page }) => {
  await login(page.request); const m = await market(page.request);
  const response = await page.request.post('/api/admin/assisted-vendors', { data: { name: 'Assisted profile vendor', marketId: m.id } });
  expect(response.ok()).toBe(true);
  await page.goto(`/admin/community?market=${m.id}`);
  await page.getByRole('tab', { name: 'Vendor profiles and changes', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Select vendor profile', exact: true })).toContainText('Assisted profile vendor');
  const form = page.getByRole('form', { name: 'Submit a profile change for this vendor', exact: true });
  await form.getByLabel('Public business introduction', { exact: true }).fill('Fresh campus greens');
  await form.getByRole('button', { name: 'Submit profile change', exact: true }).click();
  const history = page.getByRole('region', { name: 'Profile change history' });
  await history.getByLabel('Review notes', { exact: true }).fill('Confirmed by phone');
  await history.getByRole('button', { name: 'Save profile review', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Current approved profile' })).toContainText('Fresh campus greens');
  await page.setViewportSize({ width: 320, height: 844 }); await noOverflow(page);
  await page.screenshot({ path: 'output/vendor-profiles-20261031/staff-mobile-en.png', fullPage: true });
  await page.getByRole('button', { name: '切换为中文', exact: true }).click();
  await expect(page.getByRole('region', { name: '当前生效档案' })).toContainText('Fresh campus greens'); await noOverflow(page);
});
