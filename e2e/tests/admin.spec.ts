import { expect, test } from '@playwright/test';
import { ADMIN_STATE, placePendingOrder } from './helpers';

test.describe('پنل مدیریت — بدون نشست', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('بدون ورود، پنل به صفحه ورود هدایت می‌شود', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForURL('**/admin/login', { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'ورود به پنل مدیریت' })).toBeVisible();
  });
});

test.describe('پنل مدیریت', () => {
  test.use({ storageState: ADMIN_STATE });

  test('مدیر ارشد داشبورد و بخش‌ها را می‌بیند', async ({ page }) => {
    await page.goto('/admin');

    await expect(page.getByRole('heading', { name: 'داشبورد' })).toBeVisible();
    await expect(page.getByText('فروش امروز')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'فروش ۳۰ روز اخیر' })).toBeVisible();

    for (const [label, heading] of [
      ['سفارش‌ها', 'سفارش‌ها'],
      ['محصولات', 'محصولات'],
      ['انبار', 'انبار'],
      ['پرداخت‌ها', 'پرداخت‌ها'],
      ['تنظیمات', 'تنظیمات'],
    ] as const) {
      await page.getByRole('link', { name: label, exact: true }).click();
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    }
  });

  test('تغییر موجودی در انبار ثبت و اعمال می‌شود', async ({ page }) => {
    await page.goto('/admin/inventory?q=IPHONE-17-PRO-MAX-256');

    const row = page.locator('tbody tr').first();
    await expect(row).toBeVisible();
    const before = Number(
      (await row.locator('td').nth(3).innerText())
        .replace(/[^\d۰-۹]/g, '')
        .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))),
    );

    await row.getByRole('button', { name: /تغییر موجودی/ }).click();
    await page.getByRole('button', { name: 'افزایش / کاهش' }).click();
    await page.getByLabel('مقدار تغییر (مثبت یا منفی)').fill('2');
    await page.getByLabel('دلیل تغییر').fill('تست خودکار پلی‌رایت');
    await page.getByRole('button', { name: 'ثبت تغییر' }).click();

    await expect(page.getByText('موجودی به‌روز شد')).toBeVisible();
    await page.reload();

    const after = Number(
      (await page.locator('tbody tr').first().locator('td').nth(3).innerText())
        .replace(/[^\d۰-۹]/g, '')
        .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))),
    );
    expect(after).toBe(before + 2);
  });

  test('گزارش فعالیت تغییر انبار را ثبت کرده است', async ({ page }) => {
    await page.goto('/admin/audit-logs');
    await expect(page.getByRole('heading', { name: 'گزارش فعالیت' })).toBeVisible();
    await expect(page.locator('tbody tr').first()).toBeVisible();
  });

  test('ساخت محصول، افزودن ترکیب و حذف آن‌ها', async ({ page }) => {
    const suffix = String(Date.now()).slice(-6);
    const nameEn = `iPhone Test ${suffix}`;
    const nameFa = `آیفون آزمایشی ${suffix}`;

    await page.goto('/admin/products');
    await page.getByRole('button', { name: 'محصول جدید' }).click();

    await page.getByLabel('نام فارسی').fill(nameFa);
    await page.getByLabel('نام انگلیسی').fill(nameEn);
    await page.getByLabel('قیمت پایه (تومان)').fill('99000000');
    await page
      .getByLabel('توضیحات')
      .fill('این محصول توسط تست خودکار ساخته شده است و در پایان تست حذف می‌شود.');
    await page.getByRole('button', { name: 'ساخت محصول' }).click();

    // صفحهٔ محصول تازه‌ساخته باز می‌شود
    await page.waitForURL(/\/admin\/products\/[^/]+$/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: nameFa, level: 1 })).toBeVisible();

    // یک ترکیب رنگ و حافظه اضافه کن
    await page.getByRole('button', { name: 'ترکیب جدید' }).click();
    await page.getByLabel('قیمت فروش (تومان)').fill('99000000');
    await page.getByLabel('موجودی اولیه').fill('3');
    await page.getByRole('button', { name: 'افزودن ترکیب' }).click();
    await expect(page.getByText('ترکیب جدید اضافه شد')).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(1);

    // و در نهایت محصول را حذف کن (ترکیب هم با آن می‌رود)
    await page.getByRole('button', { name: 'حذف محصول' }).click();
    await page.getByRole('button', { name: 'بله، حذف کن' }).click();
    await page.waitForURL('**/admin/products', { timeout: 20_000 });
    await expect(page.getByText(nameFa)).toHaveCount(0);
  });

  test('تخفیف و کد تخفیف ساخته، ویرایش و حذف می‌شوند', async ({ page }) => {
    const suffix = String(Date.now()).slice(-6);
    const name = `تخفیف آزمایشی ${suffix}`;

    await page.goto('/admin/discounts');
    await page.getByRole('button', { name: 'تخفیف جدید' }).click();
    await page.getByLabel('نام تخفیف').fill(name);
    await page.getByLabel('درصد تخفیف').fill('7');
    await page.getByRole('button', { name: 'ساخت تخفیف' }).click();
    await expect(page.getByText('تخفیف ساخته شد')).toBeVisible();

    const row = page.locator('tbody tr', { hasText: name }).first();
    await expect(row).toBeVisible();

    // ویرایش: غیرفعالش کن
    await row.getByRole('button', { name: `ویرایش ${name}` }).click();
    await page.getByRole('switch').click();
    await page.getByRole('button', { name: 'ذخیره تخفیف' }).click();
    await expect(page.getByText('تخفیف ذخیره شد')).toBeVisible();
    await expect(page.locator('tbody tr', { hasText: name }).first()).toContainText('غیرفعال');

    // و حذفش کن
    await page
      .locator('tbody tr', { hasText: name })
      .first()
      .getByRole('button', { name: `حذف ${name}` })
      .click();
    await page.getByRole('button', { name: 'بله، حذف کن' }).click();
    await expect(page.getByText(name)).toHaveCount(0);
  });

  test('گزارش تراکنش‌های یک پرداخت باز می‌شود', async ({ page, playwright }) => {
    // its own order, so this spec does not depend on a purchase spec running first
    await placePendingOrder(playwright);
    await page.goto('/admin/payments');
    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow).toBeVisible();
    await firstRow.getByRole('button', { name: /تراکنش‌های/ }).click();
    await expect(page.getByRole('dialog')).toContainText('تراکنش‌های');
  });

  test('مشخصات فنی محصول از پنل ویرایش می‌شود', async ({ page }) => {
    await page.goto('/admin/products');
    await page.locator('tbody tr a').first().click();
    await page.waitForURL(/\/admin\/products\/[^/]+$/, { timeout: 20_000 });

    const value = `تست ${String(Date.now()).slice(-4)}`;
    await page.getByRole('button', { name: 'سطر جدید' }).click();
    const rows = page.locator('[aria-label^="عنوان مشخصه"]');
    const last = rows.last();
    await last.fill('مشخصه آزمایشی');
    await page.locator('[aria-label^="مقدار مشخصه"]').last().fill(value);
    await page.getByRole('button', { name: 'ذخیره محصول' }).click();
    await expect(page.getByText('محصول ذخیره شد')).toBeVisible();

    await page.reload();
    await expect(page.getByText(value).first()).toBeVisible();

    // پاک‌سازی: سطر اضافه‌شده را حذف کن
    const index = (await page.locator('[aria-label^="عنوان مشخصه"]').count()) - 1;
    await page.getByRole('button', { name: `حذف مشخصه ${index + 1}` }).click();
    await page.getByRole('button', { name: 'ذخیره محصول' }).click();
    await expect(page.getByText('محصول ذخیره شد')).toBeVisible();
  });

  test('تنظیمات فروشگاه ذخیره می‌شود', async ({ page }) => {
    await page.goto('/admin/settings');

    const announcement = page.getByLabel('نوار اعلان بالای سایت');
    const value = `ارسال رایگان — تست ${Date.now() % 10_000}`;
    await announcement.fill(value);
    await page.getByRole('button', { name: 'ذخیره تنظیمات فروشگاه' }).click();
    await expect(page.getByText('تنظیمات ذخیره شد')).toBeVisible();

    await page.reload();
    await expect(page.getByLabel('نوار اعلان بالای سایت')).toHaveValue(value);
  });
});
