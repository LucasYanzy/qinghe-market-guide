import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';

async function openBag(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '将藤熟番茄加入购物袋', exact: true }).click();
  await page.getByRole('button', { name: /^购物袋/ }).click();
  return page.getByRole('dialog', { name: '我的新鲜购物袋', exact: true });
}

test('普通预购无需展开选填项，手机端持续展示合计并能完成提交', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const bag = await openBag(page);
  await expect(bag.getByRole('textbox')).not.toBeVisible();
  await expect(bag.getByLabel('现场付款方式', { exact: true })).not.toBeVisible();
  await expect(bag.getByLabel('选择自提时段')).toBeVisible();
  const footer = bag.locator('.cart-checkout-footer');
  await expect(footer).toContainText('$3.50');
  await expect(footer).toBeInViewport();
  await expect(bag.getByRole('button', { name: '登录后预购', exact: true })).toBeInViewport();
  await bag.getByRole('button', { name: '登录后预购', exact: true }).click();
  await page.getByRole('button', { name: /顾客端演示/ }).click();
  await expect(bag.getByRole('textbox')).not.toBeVisible();
  const submitted = page.waitForRequest(request => request.url().endsWith('/api/orders') && request.method() === 'POST');
  await bag.getByRole('button', { name: '确认预购', exact: true }).click();
  expect((await submitted).postDataJSON()).toMatchObject({ paymentMethod: 'pay_at_pickup', note: '' });
  await expect(page).toHaveURL(/\/orders$/);
});

test('备注支持键盘展开，收起后仍保存，重新打开购物袋可直接核对', async ({ page }) => {
  const bag = await openBag(page);
  const toggle = bag.getByRole('button', { name: '添加备注（选填）', exact: true });
  await toggle.focus(); await page.keyboard.press('Enter');
  await bag.getByRole('textbox').fill('请保留这条备注');
  const review = bag.getByRole('button', { name: '查看或修改备注', exact: true });
  await review.click();
  await expect(bag.getByRole('textbox')).not.toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^购物袋/ }).click();
  await expect(bag.getByRole('textbox')).toHaveValue('请保留这条备注');
  await expect(review).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Switch to English', exact: true }).click();
  await page.getByRole('button', { name: /^Shopping bag/ }).click();
  const englishBag = page.getByRole('dialog', { name: 'My shopping bag', exact: true });
  await expect(englishBag.getByRole('button', { name: 'Review or edit note', exact: true })).toBeVisible();
  await expect(englishBag.locator('.cart-checkout-body > fieldset > .helper-text')).toContainText('Pay at pickup.');
});

test('已选 SNAP 刷新后展开核对，预估失效时可直接改回普通现场付款', async ({ page }) => {
  await page.route('**/api/checkout/quote', route => route.fulfill({ json: {
    snapAvailable: true, eligibleCents: 350, otherCents: 0, unknownCents: 0, totalCents: 350,
    snapModel: 'market_tokens', marketVerifiedOn: '2026-11-04', vendorVerifiedOn: '2026-11-04',
    instructions: 'Demo service desk', items: [],
  } }));
  const bag = await openBag(page);
  await expect(bag.getByText('本次可预约现场 SNAP/EBT 付款', { exact: true })).toBeVisible();
  await bag.getByRole('button', { name: 'SNAP / EBT 付款选项', exact: true }).click();
  await bag.getByLabel('现场付款方式', { exact: true }).selectOption('snap_ebt');
  await expect(bag.locator('.snap-split')).toContainText('$3.50');
  await page.reload();
  await page.getByRole('button', { name: /^购物袋/ }).click();
  await expect(bag.getByRole('button', { name: 'SNAP / EBT 付款选项', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await expect(bag.getByLabel('现场付款方式', { exact: true })).toHaveValue('snap_ebt');
  await page.unroute('**/api/checkout/quote');
  await page.route('**/api/checkout/quote', route => route.fulfill({ status: 503, json: { error: 'Quote unavailable' } }));
  await page.reload();
  await page.getByRole('button', { name: /^购物袋/ }).click();
  await expect(bag.getByRole('button', { name: '重新核对', exact: true })).toBeVisible();
  await expect(bag.getByRole('button', { name: '登录后预购', exact: true })).toBeDisabled();
  await bag.getByLabel('现场付款方式', { exact: true }).selectOption('pay_at_pickup');
  await expect(bag.getByRole('button', { name: '登录后预购', exact: true })).toBeEnabled();
  await expect(bag.locator('.checkout-payment-summary')).toContainText('到场付款');
});

test('矮窗口提交失败会定位到错误原因，输入与提交入口仍可继续使用', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.request.post('/api/auth/login', { data: { email: 'client@qinghe.demo', password: 'MarketDemo2026!' } });
  const bag = await openBag(page);
  await bag.getByRole('button', { name: '添加备注（选填）', exact: true }).click();
  await bag.getByRole('textbox').fill('保留失败时的输入');
  await page.route('**/api/orders', route => route.request().method() === 'POST'
    ? route.fulfill({ status: 503, json: { error: '市集暂时繁忙，请重试。' } }) : route.continue());
  await bag.getByRole('button', { name: '确认预购', exact: true }).click();
  const error = bag.getByRole('alert');
  await expect(error).toHaveText('市集暂时繁忙，请重试。');
  await expect(error).toBeFocused();
  await expect(error).toBeInViewport();
  await expect(bag.getByRole('textbox')).toHaveValue('保留失败时的输入');
  await expect(bag.locator('.cart-checkout-footer').getByRole('button')).toBeEnabled();
  await expect(bag.locator('.cart-checkout-footer').getByRole('button')).toBeInViewport();
});

for (const viewport of [{ width: 320, height: 568 }, { width: 826, height: 465 }]) {
  test(`${viewport.width}×${viewport.height} 矮窗口内容独立滚动，合计和提交不遮挡输入`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openBag(page);
    for (const english of [false, true]) {
      if (english) {
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'Switch to English', exact: true }).click();
        await page.getByRole('button', { name: /^Shopping bag/ }).click();
      }
      const bag = page.getByRole('dialog');
      const footer = bag.locator('.cart-checkout-footer');
      await expect(footer.getByRole('button')).toBeInViewport();
      await bag.getByRole('button', { name: english ? 'Add a note (optional)' : '添加备注（选填）', exact: true }).click();
      const note = bag.getByRole('textbox');
      await note.fill('Short-window note');
      await expect(footer.getByRole('button')).toBeInViewport();
      const geometry = await bag.evaluate(element => {
        const body = element.querySelector('.cart-checkout-body')!.getBoundingClientRect();
        const footer = element.querySelector('.cart-checkout-footer')!.getBoundingClientRect();
        const input = element.querySelector('textarea')!.getBoundingClientRect();
        const dialog = element.getBoundingClientRect();
        return { separated: body.bottom <= footer.top + 1, inside: footer.bottom <= dialog.bottom,
          inputVisible: input.top >= body.top - 1 && input.bottom <= body.bottom + 1,
          noOuterScroll: element.scrollHeight <= element.clientHeight + 1 };
      });
      expect(geometry).toEqual({ separated: true, inside: true, inputVisible: true, noOuterScroll: true });
      if (!english) await note.fill('');
    }
  });
}
