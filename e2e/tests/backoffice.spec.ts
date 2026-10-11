import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ADMIN_STATE, API_URL, uniquePhone } from './helpers';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const fa = (n: number) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!);

/** A Luhn-valid IMEI, different on every run. */
function imei(seed: number): string {
  const body = `35${String(Date.now()).slice(-9)}${String(seed).padStart(3, '0')}`.slice(0, 14);
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let d = Number(body[i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return body + String((10 - (sum % 10)) % 10);
}

/** 16 digits, different on every run. */
const sayad = (seed: number) => `${String(Date.now()).slice(-13)}${String(seed).padStart(3, '0')}`;

async function axe(page: Page, path: string) {
  // a toast fading in or out is measured half-transparent; scan the settled page
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 15_000 });
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(
    results.violations.map((v) => ({ page: path, id: v.id, impact: v.impact, nodes: v.nodes.length })),
    JSON.stringify({ path, violations: results.violations }, null, 2),
  ).toEqual([]);
}

interface PricingRow {
  variantId: string;
  productName: string;
  storageLabel: string;
  colorName: string;
  price: number;
  available: number;
  active: boolean;
}

/** A priced colour × capacity with stock to sell, read with the admin's session. */
async function pickVariant(page: Page, skip: string[] = []): Promise<PricingRow> {
  const response = await page.request.get(`${API_URL}/api/admin/pricing`);
  expect(response.ok()).toBeTruthy();
  const rows = (await response.json()) as PricingRow[];
  const row = rows.find((r) => r.active && r.price > 0 && r.available >= 2 && !skip.includes(r.variantId));
  expect(row, 'the seeded catalogue has a priced variant in stock').toBeTruthy();
  return row!;
}

test.describe('پنل — IMEI، فروش حضوری و تلفنی، دفتر اقساط', () => {
  test.use({ storageState: ADMIN_STATE });

  test('ورود گوشی با IMEI، فروش حضوری همان گوشی و فاکتور', async ({ page }) => {
    const variant = await pickVariant(page);
    const [first, second] = [imei(1), imei(2)];

    await page.goto('/admin/devices');
    await page.getByRole('button', { name: 'ورود کالا با IMEI' }).click();
    const dialog = page.getByRole('dialog', { name: 'ورود کالا با IMEI' });
    await dialog.getByLabel('مدل، حافظه و رنگ').selectOption(variant.variantId);
    await dialog.getByLabel('IMEIها').fill(`${first}\n${second}, F2LTEST${String(Date.now()).slice(-4)}`);
    await dialog.getByLabel('قیمت خرید هر گوشی (تومان، اختیاری)').fill('80000000');
    await dialog.getByRole('button', { name: /ثبت ۲ گوشی/ }).click();
    await expect(page.getByText(/۲ گوشی ثبت شد/)).toBeVisible();

    await page.goto(`/admin/devices?q=${first}`);
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody tr').first()).toContainText('در انبار');

    const phone = uniquePhone();
    await page.goto('/admin/orders/new');
    await page.getByLabel('موبایل').fill(phone);
    await page.getByLabel('نام', { exact: true }).fill('رضا');
    await page.getByLabel('نام خانوادگی').fill('آزمایشی');
    await page.getByLabel(`کالای ${fa(1)}`).selectOption(variant.variantId);
    await page.getByText(first, { exact: true }).click();
    await expect(page.getByText(/IMEI گوشی‌هایی که تحویل می‌شود \(۱ از ۱\)/)).toBeVisible();
    await page.getByRole('button', { name: 'ثبت سفارش' }).click();

    await page.waitForURL(/\/admin\/orders\/(?!new)[^/]+$/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1, name: /سفارش IH/ })).toBeVisible();
    await expect(page.getByText('تحویل‌شده').first()).toBeVisible();
    await expect(page.getByRole('link', { name: first })).toBeVisible();
    await axe(page, 'order detail');

    const orderId = page.url().split('/').pop()!;
    await page.goto(`/admin/print/invoice/${orderId}`);
    await expect(page.getByRole('heading', { name: 'فاکتور فروش' })).toBeVisible();
    await expect(page.getByText(first)).toBeVisible();

    // the phone left on the order; the other one is still on the shelf
    await page.goto(`/admin/devices?q=${first}`);
    await expect(page.locator('tbody tr').first()).toContainText('فروخته‌شده');

    // the customer's page, with a note from the staff
    await page.goto(`/admin/users/${phone}`);
    await expect(page.getByRole('heading', { level: 1, name: 'رضا آزمایشی' })).toBeVisible();
    await page.getByLabel('یادداشت تازه').fill('برای گوشی بعدی تماس بگیرید');
    await page.getByRole('button', { name: 'افزودن یادداشت' }).click();
    await expect(page.getByText('برای گوشی بعدی تماس بگیرید')).toBeVisible();
    await axe(page, 'customer profile');
  });

  test('فروش تلفنی با چک صیادی، پرداخت قسط و وصول چک در دفتر اقساط', async ({ page }) => {
    const variant = await pickVariant(page);
    const phone = uniquePhone();

    await page.goto('/admin/orders/new');
    await page
      .getByRole('radiogroup', { name: 'منبع سفارش' })
      .getByText('سفارش تلفنی', { exact: true })
      .click();
    await page.getByLabel('موبایل').fill(phone);
    await page.getByLabel('نام', { exact: true }).fill('مریم');
    await page.getByLabel('نام خانوادگی').fill('اقساطی');
    await page.getByLabel(`کالای ${fa(1)}`).selectOption(variant.variantId);

    await page.getByRole('radiogroup', { name: 'تحویل' }).getByText('ارسال', { exact: true }).click();
    await page.getByLabel('نام گیرنده').fill('مریم اقساطی');
    await page.getByLabel('شهر').fill('تهران');
    await page.getByLabel('نشانی کامل').fill('خیابان آزمایشی، کوچهٔ دوم، پلاک ۱۲');
    await page.getByLabel('کد پستی').fill('1234567890');

    await page
      .getByRole('radiogroup', { name: 'روش پرداخت' })
      .getByText('اقساط با چک صیادی', { exact: true })
      .click();
    await page.getByLabel('تعداد اقساط').fill('3');
    await page.getByLabel('کارمزد ماهانه (٪)').fill('4');
    await page.getByRole('button', { name: 'ساخت جدول اقساط' }).click();
    await expect(page.getByLabel(`مبلغ قسط ${3}`)).toBeVisible();

    const sayadFields = page.getByLabel('شناسهٔ صیادی (۱۶ رقم)');
    await expect(sayadFields).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      await sayadFields.nth(i).fill(sayad(i + 1));
      await page.getByLabel('بانک').nth(i).fill('ملت');
    }
    await axe(page, 'new order with a cheque contract');
    await page.getByRole('button', { name: 'ثبت سفارش' }).click();

    await page.waitForURL(/\/admin\/orders\/(?!new)[^/]+$/, { timeout: 30_000 });
    await page.getByRole('link', { name: 'دفتر اقساط این قرارداد' }).click();
    await expect(page.getByRole('heading', { level: 1, name: /قرارداد .* — مریم اقساطی/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'جدول اقساط' })).toBeVisible();

    // the first instalment paid in cash at the counter
    await page.getByRole('button', { name: 'ثبت پرداخت قسط 1' }).click();
    const payment = page.getByRole('dialog', { name: `پرداخت قسط ${fa(1)}` });
    await payment.getByRole('button', { name: 'ثبت پرداخت' }).click();
    await expect(page.getByText(/پرداخت .* ثبت شد/)).toBeVisible();
    await expect(page.locator('tbody tr').first()).toContainText('پرداخت‌شده');

    // the second cheque cleared at the bank pays the second instalment
    const cheques = page.getByRole('button', { name: /^وضعیت چک/ });
    await cheques.nth(1).click();
    const chequeDialog = page.getByRole('dialog');
    await chequeDialog.getByText('وصول شد').click();
    await chequeDialog.getByRole('button', { name: 'ثبت' }).click();
    await expect(page.getByText('وضعیت چک به‌روز شد')).toBeVisible();
    await expect(page.locator('tbody tr').nth(1)).toContainText('پرداخت‌شده');
    await axe(page, 'contract');

    const contractId = page.url().split('/').pop()!;
    await page.goto(`/admin/print/contract/${contractId}`);
    await expect(page.getByRole('heading', { name: 'قرارداد فروش اقساطی' })).toBeVisible();
    await expect(page.getByText('مریم اقساطی').first()).toBeVisible();

    await page.goto('/admin/installments?tab=contracts');
    await expect(page.getByText('مریم اقساطی').first()).toBeVisible();
  });

  test('جدول قیمت: پیش‌نمایش تغییر گروهی بدون ذخیره', async ({ page }) => {
    await page.goto('/admin/pricing');
    await expect(page.getByRole('heading', { level: 1, name: 'قیمت‌ها' })).toBeVisible();
    const group = page.getByRole('checkbox', { name: /^انتخاب همهٔ / }).first();
    await group.check();
    const bar = page.getByRole('region', { name: 'تغییر گروهی قیمت' });
    await expect(bar).toBeVisible();
    await bar.getByRole('button', { name: 'پیش‌نمایش' }).click();
    await expect(bar.getByRole('table')).toBeVisible();
    await expect(bar.getByRole('button', { name: /^اعمال/ })).toBeVisible();
    await bar.getByRole('button', { name: 'بستن پیش‌نمایش' }).click();
    await expect(bar.getByRole('table')).toBeHidden();
  });

  test('گزارش فروش امروز و خروجی اکسل', async ({ page }) => {
    await page.goto('/admin/reports');
    await page.getByRole('button', { name: 'امروز' }).click();
    await page.waitForURL(/from=/);
    await expect(page.getByText('فروش', { exact: true }).first()).toBeVisible();
    const href = await page.getByRole('link', { name: 'اکسل سفارش‌ها' }).getAttribute('href');
    const file = await page.request.get(new URL(href!, page.url()).toString());
    expect(file.status()).toBe(200);
    expect(file.headers()['content-type']).toContain('spreadsheetml');
    expect((await file.body()).subarray(0, 2).toString()).toBe('PK');
  });
});
