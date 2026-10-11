import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { ADMIN_STATE, resetThrottles, uniquePhone } from './helpers';

const PERSIAN = '۰۱۲۳۴۵۶۷۸۹';
const toPersian = (value: number) => String(value).replace(/\d/g, (digit) => PERSIAN[Number(digit)]!);

/** A request sent through the storefront API, like the form does. */
async function sendRequest(request: APIRequestContext): Promise<number> {
  await resetThrottles(request);
  const csrf = await request.get('/api/auth/csrf');
  const { csrfToken } = (await csrf.json()) as { csrfToken: string };
  const created = await request.post('/api/credit-requests', {
    data: {
      name: `خریدار ${Date.now().toString().slice(-6)}`,
      phone: uniquePhone(),
      method: 'CHEQUE',
      productSlug: 'iphone-17',
      source: '/installments/cheque',
    },
    headers: { 'x-csrf-token': csrfToken },
  });
  expect(created.status()).toBe(201);
  return ((await created.json()) as { number: number }).number;
}

async function saveAlerts(page: Page, mobiles: string[], paidOrders: boolean) {
  for (const [index, label] of ['موبایل ۱', 'موبایل ۲', 'موبایل ۳'].entries()) {
    await page.getByLabel(label).fill(mobiles[index] ?? '');
  }
  const paid = page.getByRole('checkbox', { name: /سفارشی پرداخت می‌شود/ });
  if ((await paid.getAttribute('aria-checked')) !== String(paidOrders)) await paid.click();
  await page.getByRole('button', { name: 'ذخیره هشدارها' }).click();
  await expect(page.getByText('تنظیمات ذخیره شد')).toBeVisible();
}

test.describe('پنل: هشدار درخواست و سفارش تازه', () => {
  test.use({ storageState: ADMIN_STATE });

  test('پنل باز درخواست تازه را اعلام می‌کند و عدد منو را به‌روز می‌کند', async ({ page, request }) => {
    await page.goto('/admin');
    const menu = page.getByRole('link', { name: /درخواست‌های اقساط/ });
    await expect(menu).toBeVisible();

    const number = await sendRequest(request);
    // the panel asks every minute, and at once when its tab comes back into view
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

    await expect(page.getByText('درخواست خرید قسطی تازه')).toBeVisible();
    await expect(page.getByText(`درخواست شمارهٔ ${toPersian(number)} منتظر تماس شماست.`)).toBeVisible();
    await expect(menu).toContainText(/[۱-۹]/);

    await page.getByRole('button', { name: 'مشاهده' }).click();
    await page.waitForURL('**/admin/credit-requests');
    await expect(page.getByRole('heading', { name: 'درخواست‌های خرید اقساطی', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'پیامک و ربات هشدار' })).toHaveAttribute(
      'href',
      '/admin/settings?tab=alerts',
    );
  });

  test('تنظیمات هشدار: گیرنده‌ها، خاموش کردن و پیام آزمایشی', async ({ page }) => {
    await page.goto('/admin/settings?tab=alerts');
    await expect(page.getByRole('tab', { name: 'هشدارها', selected: true })).toBeVisible();
    // on this machine SMS is only logged and no bot is set up
    await expect(page.getByText(/سرویس پیامک هنوز وصل نشده/)).toBeVisible();
    await expect(page.getByText(/ربات: وصل نیست/)).toBeVisible();

    await saveAlerts(page, ['۰۹۱۲۱۱۱۲۲۳۳', '0935 123 4567'], false);
    await page.reload();
    await expect(page.getByLabel('موبایل ۱')).toHaveValue('09121112233');
    await expect(page.getByLabel('موبایل ۲')).toHaveValue('09351234567');
    await expect(page.getByRole('checkbox', { name: /سفارشی پرداخت می‌شود/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await expect(page.getByText('09121112233، 09351234567')).toBeVisible();

    await page.getByLabel('موبایل ۳').fill('0912');
    await page.getByRole('button', { name: 'ذخیره هشدارها' }).click();
    await expect(page.getByText('شماره موبایل معتبر نیست')).toBeVisible();

    await page.getByRole('button', { name: 'فرستادن پیام آزمایشی' }).click();
    const results = page.getByRole('list').filter({ hasText: 'پیامک به' });
    await expect(results).toContainText('09121112233');
    await expect(results).toContainText('فرستاده شد');
    await expect(results).toContainText('ربات وصل نیست.');

    // back to the defaults, so the other suites see the shipped state
    await page.reload();
    await saveAlerts(page, [], true);
  });
});
