import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { ADMIN_STATE, API_URL, csrfFrom, loginCustomer, uniquePhone } from './helpers';

const fa = (n: number) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!);
const money = (n: number) =>
  n
    .toLocaleString('en-US')
    .replace(/,/g, '٬')
    .replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!);

function isoPlus(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

test.describe('دفترچهٔ اقساط مشتری', () => {
  test('قراردادی که فروشگاه برای موبایل مشتری نوشته، در حسابش دفترچه می‌شود و چاپ می‌شود', async ({
    page,
    browser,
  }) => {
    const phone = uniquePhone();

    // the store writes a promissory-note contract for this mobile, before the customer has an account
    const staff = await browser.newContext({ storageState: ADMIN_STATE });
    const csrf = await csrfFrom(staff);
    const amounts = [11_000_000, 11_000_000, 11_250_000];
    const created = await staff.request.post(`${API_URL}/api/admin/ledger/contracts`, {
      headers: { 'x-csrf-token': csrf },
      data: {
        method: 'SAFTE',
        customer: { name: 'خریدار دفترچه', phone },
        itemDescription: 'آیفون ۱۶ ۱۲۸ گیگابایت مشکی',
        cashPrice: 40_000_000,
        downPayment: 10_000_000,
        downPaymentChannel: 'CASH',
        monthlyFeePercent: 3.5,
        contractDate: isoPlus(0),
        installments: amounts.map((amount, i) => ({ dueDate: isoPlus(30 * (i + 1)), amount })),
        saftes: [{ serial: String(Date.now()).slice(-8), amount: 50_000_000, electronic: true }],
        notifyCustomer: false,
      },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const contract = (await created.json()) as { number: number };
    await staff.close();

    await loginCustomer(page, phone);
    if (page.url().includes('/login')) {
      await page.getByLabel('نام', { exact: true }).fill('خریدار');
      await page.getByLabel('نام خانوادگی').fill('دفترچه');
      await page.getByRole('button', { name: 'ذخیره و ادامه' }).click();
      await page.waitForURL('**/account', { timeout: 20_000 });
    }

    await page.getByRole('link', { name: 'دفترچهٔ اقساط' }).first().click();
    await expect(page).toHaveURL(/\/account\/installments$/);
    const card = page.locator(`a[href="/account/installments/${contract.number}"]`);
    await expect(card).toContainText(`قرارداد ${fa(contract.number)}`);
    await expect(card).toContainText('سفته');
    await expect(card.getByRole('progressbar', { name: 'پیشرفت پرداخت' })).toBeVisible();

    await card.click();
    await expect(
      page.getByRole('heading', { name: `دفترچهٔ اقساط — قرارداد ${fa(contract.number)}` }),
    ).toBeVisible();
    const table = page.getByRole('table');
    await expect(table.locator('tbody tr')).toHaveCount(3);
    await expect(table.locator('tbody tr').nth(2)).toContainText(money(11_250_000));
    await expect(table.locator('tfoot')).toContainText(money(33_250_000));
    // the figures as the contract wrote them: 10M down, 30M financed, 3.25M fee, 43.25M in all
    await expect(page.getByText('کارمزد (۳٫۵٪ در ماه × ۳ ماه)')).toBeVisible();
    await expect(page.getByText(money(43_250_000)).first()).toBeVisible();
    await expect(page.getByText(`قسط ۱ — سررسید`)).toBeVisible();

    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 15_000 });
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);

    // fits a phone: no sideways scroll
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(390);
    await page.setViewportSize({ width: 1366, height: 900 });

    await page.goto(`/print/installments/${contract.number}`);
    await expect(page.getByRole('heading', { level: 1, name: 'دفترچهٔ اقساط' })).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(3);

    // no booklet for a number that is not theirs
    // (the account pages stream, so the answer is the «not found» page rather than a 404 status)
    await page.goto('/account/installments/999999');
    await expect(page.getByRole('heading', { name: 'صفحه‌ای که دنبالش بودی پیدا نشد' })).toBeVisible();
  });
});
