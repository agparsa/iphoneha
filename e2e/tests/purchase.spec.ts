import { expect, test } from '@playwright/test';
import { API_URL, completeMockPayment, loginCustomer, uniquePhone } from './helpers';

test.describe('خرید کامل', () => {
  test('از انتخاب محصول تا پرداخت موفق و ثبت سفارش', async ({ page, request }) => {
    const phone = uniquePhone();

    // 1) محصول را انتخاب و به سبد اضافه کن
    await page.goto('/iphone/iphone-17-pro-max');
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByRole('dialog').getByText('مبلغ قابل پرداخت')).toBeVisible();
    await page.keyboard.press('Escape');

    // 2) ورود با شماره موبایل و کد یک‌بارمصرف
    await loginCustomer(page, phone);

    // پروفایل را تکمیل کن (کاربر جدید)
    if (page.url().includes('/login')) {
      await page.getByLabel('نام', { exact: true }).fill('آزمون');
      await page.getByLabel('نام خانوادگی').fill('پلی‌رایت');
      await page.getByRole('button', { name: 'ذخیره و ادامه' }).click();
      await page.waitForURL('**/account', { timeout: 20_000 });
    }

    // 3) تسویه حساب
    await page.goto('/checkout');
    await page.getByRole('button', { name: 'تأیید و ادامه' }).click(); // سبد خرید
    await page.getByRole('button', { name: 'ادامه' }).click(); // ورود (کاربر واردشده)

    // 4) آدرس جدید
    await page.getByLabel('نام و نام خانوادگی گیرنده').fill('آزمون پلی‌رایت');
    await page.getByLabel('شماره موبایل گیرنده').fill(phone);
    await page.getByLabel('استان').click();
    await page.getByRole('option', { name: 'تهران', exact: true }).click();
    await page.getByLabel('شهر').fill('تهران');
    await page.getByLabel('نشانی کامل').fill('خیابان ولیعصر، برج نگین، طبقه ۷، واحد ۳');
    await page.getByLabel('کد پستی').fill('1234567890');
    await page.getByRole('button', { name: 'ذخیره و ادامه' }).click();

    // 5) روش ارسال
    await expect(page.getByRole('heading', { name: /روش ارسال/ })).toBeVisible();
    await page.getByRole('button', { name: 'تأیید روش ارسال' }).click();

    // 6) روش پرداخت — پرداخت آنلاین
    await expect(page.getByRole('heading', { name: /روش پرداخت/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /پرداخت نقدی/ })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('radio', { name: 'پرداخت آنلاین' }).click();
    await page.getByRole('button', { name: 'ادامه با پرداخت آنلاین' }).click();

    // 7) بازبینی و ثبت سفارش
    await expect(page.getByRole('heading', { name: /بازبینی و ثبت سفارش/ })).toBeVisible();
    await page.getByRole('button', { name: 'ثبت سفارش و پرداخت' }).click();

    // درگاه ماک
    await completeMockPayment(page, 'success');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('پرداخت با موفقیت انجام شد');
    const orderNumber = await page.locator('dd').first().innerText();
    expect(orderNumber).toMatch(/IH\d+/);

    // سفارش در حساب کاربر دیده می‌شود (شماره سفارش هم در کارت و هم در لینک آن است)
    await page.goto('/account/orders');
    await expect(page.getByText(orderNumber).first()).toBeVisible();

    // و API همان وضعیت پرداخت‌شده را گزارش می‌کند
    const result = await request.get(`${API_URL}/api/payments/result/${orderNumber}`, {
      headers: { cookie: (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ') },
    });
    expect(result.ok()).toBeTruthy();
    const body = (await result.json()) as { success: boolean; orderStatus: string };
    expect(body.success).toBe(true);
    expect(['PAID', 'PROCESSING']).toContain(body.orderStatus);
  });

  test('پرداخت ناموفق سفارش را لغو و موجودی را آزاد می‌کند', async ({ page, request }) => {
    const phone = uniquePhone();

    // موجودی قابل فروش پیش از سفارش
    const before = await request.get(`${API_URL}/api/products/iphone-17/variants`);
    const beforeVariants = (await before.json()) as { id: string; sku: string; availableStock: number }[];

    await page.goto('/iphone/iphone-17');
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByRole('dialog').getByText('مبلغ قابل پرداخت')).toBeVisible();
    await page.keyboard.press('Escape');
    const sku = await page.getByTestId('variant-sku').innerText();
    const reserved = beforeVariants.find((variant) => variant.sku === sku)!;

    await loginCustomer(page, phone);
    if (page.url().includes('/login')) {
      await page.getByLabel('نام', { exact: true }).fill('آزمون');
      await page.getByLabel('نام خانوادگی').fill('ناموفق');
      await page.getByRole('button', { name: 'ذخیره و ادامه' }).click();
      await page.waitForURL('**/account', { timeout: 20_000 });
    }

    await page.goto('/checkout');
    await page.getByRole('button', { name: 'تأیید و ادامه' }).click();
    await page.getByRole('button', { name: 'ادامه' }).click();

    await page.getByLabel('نام و نام خانوادگی گیرنده').fill('آزمون ناموفق');
    await page.getByLabel('شماره موبایل گیرنده').fill(phone);
    await page.getByLabel('استان').click();
    await page.getByRole('option', { name: 'اصفهان', exact: true }).click();
    await page.getByLabel('شهر').fill('اصفهان');
    await page.getByLabel('نشانی کامل').fill('خیابان چهارباغ بالا، کوچه ۱۲، پلاک ۵');
    await page.getByLabel('کد پستی').fill('8134567890');
    await page.getByRole('button', { name: 'ذخیره و ادامه' }).click();

    await page.getByRole('button', { name: 'تأیید روش ارسال' }).click();
    await page.getByRole('radio', { name: 'پرداخت آنلاین' }).click();
    await page.getByRole('button', { name: 'ادامه با پرداخت آنلاین' }).click();
    await page.getByRole('button', { name: 'ثبت سفارش و پرداخت' }).click();

    await completeMockPayment(page, 'failed');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('پرداخت ناموفق بود');

    // سفارش لغو می‌شود (طبق سیاست: آزادسازی رزرو با شکست پرداخت)
    await page.goto('/account/orders');
    await page.locator('a[href^="/account/orders/"]').first().click();
    await expect(page.getByText('لغوشده').first()).toBeVisible();

    // و موجودی قابل فروش دوباره آزاد شده است
    await expect
      .poll(
        async () => {
          const after = await request.get(`${API_URL}/api/products/iphone-17/variants`);
          const variants = (await after.json()) as { id: string; availableStock: number }[];
          return variants.find((variant) => variant.id === reserved.id)!.availableStock;
        },
        { timeout: 15_000 },
      )
      .toBe(reserved.availableStock);
  });

  test('در پرداخت، خرید قسطی را انتخاب می‌کند و با اسنپ‌پی سفارش را کامل می‌کند', async ({ page }) => {
    const phone = uniquePhone();

    await page.goto('/iphone/iphone-17');
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByRole('dialog').getByText('مبلغ قابل پرداخت')).toBeVisible();
    await page.keyboard.press('Escape');

    await loginCustomer(page, phone);
    if (page.url().includes('/login')) {
      await page.getByLabel('نام', { exact: true }).fill('آزمون');
      await page.getByLabel('نام خانوادگی').fill('قسطی');
      await page.getByRole('button', { name: 'ذخیره و ادامه' }).click();
      await page.waitForURL('**/account', { timeout: 20_000 });
    }

    await page.goto('/checkout');
    await page.getByRole('button', { name: 'تأیید و ادامه' }).click();
    await page.getByRole('button', { name: 'ادامه' }).click();
    await page.getByLabel('نام و نام خانوادگی گیرنده').fill('آزمون قسطی');
    await page.getByLabel('شماره موبایل گیرنده').fill(phone);
    await page.getByLabel('استان').click();
    await page.getByRole('option', { name: 'تهران', exact: true }).click();
    await page.getByLabel('شهر').fill('تهران');
    await page.getByLabel('نشانی کامل').fill('خیابان انقلاب، کوچه ۸، پلاک ۲');
    await page.getByLabel('کد پستی').fill('1234567890');
    await page.getByRole('button', { name: 'ذخیره و ادامه' }).click();
    await page.getByRole('button', { name: 'تأیید روش ارسال' }).click();

    // two ways to pay; cash is the default and instalments say how low a month can go
    const cash = page.getByRole('button', { name: /پرداخت نقدی/ });
    const credit = page.getByRole('button', { name: /خرید قسطی/ });
    await expect(cash).toHaveAttribute('aria-pressed', 'true');
    await expect(credit).toContainText(/ماهانه از/);
    await credit.click();
    await expect(credit).toHaveAttribute('aria-pressed', 'true');

    // every connected service is a card, one is picked, and the lowest instalment is marked
    const services = page.getByRole('radiogroup', { name: 'سرویس خرید قسطی' });
    await expect(services.getByRole('radio')).not.toHaveCount(0);
    await expect(services.getByRole('radio', { checked: true })).toHaveCount(1);
    await expect(services.getByText('کمترین قسط')).toHaveCount(1);
    // the store's own cheque and promissory-note plans are one link away
    const paymentStep = page.locator('section', { has: page.getByRole('heading', { name: /روش پرداخت/ }) });
    await expect(paymentStep.getByRole('link', { name: 'خرید گوشی با چک' })).toHaveAttribute(
      'href',
      '/installments/cheque#request',
    );

    await services.getByRole('radio', { name: 'اسنپ‌پی' }).click();
    const detail = page.getByRole('region', { name: 'جزئیات خرید با اسنپ‌پی' });
    await expect(detail).toContainText('پیش‌پرداخت');
    await expect(detail).toContainText(/قسط ماهانه/);
    await expect(detail).toContainText('بعد از «ادامه» چه می‌شود؟');

    await page.getByRole('button', { name: 'ادامه با اسنپ‌پی' }).click();
    await expect(page.getByRole('heading', { name: /بازبینی و ثبت سفارش/ })).toBeVisible();
    await expect(page.getByText('خرید قسطی با اسنپ‌پی')).toBeVisible();
    await expect(page.locator('aside')).toContainText('قسطی با اسنپ‌پی');

    // going back to cash and returning keeps the choice whole
    await page.getByRole('button', { name: 'پرداخت', exact: true }).click(); // the stepper
    await cash.click();
    await expect(page.getByRole('button', { name: 'ادامه با پرداخت آنلاین' })).toBeEnabled();
    await credit.click();
    await services.getByRole('radio', { name: 'اسنپ‌پی' }).click();
    await page.getByRole('button', { name: 'ادامه با اسنپ‌پی' }).click();

    await page.getByRole('button', { name: 'ثبت سفارش و رفتن به اسنپ‌پی' }).click();
    await completeMockPayment(page, 'success');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('پرداخت با موفقیت انجام شد');
  });
});
