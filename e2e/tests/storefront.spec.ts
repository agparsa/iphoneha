import { expect, test, type Page } from '@playwright/test';

test.describe('فروشگاه', () => {
  test('صفحه اصلی بخش‌های اصلی را نشان می‌دهد', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'خرید آیفون آکبند و اصل؛ نقد و قسطی با چک و سفته',
    );
    await expect(page.getByText('جدیدترین آیفون‌ها')).toBeVisible();
    await expect(page.getByText('محبوب‌ترین آیفون‌ها')).toBeVisible();
    await expect(page.getByText('آیفونت را قسطی بخر')).toBeVisible();

    // هیرو باید قیمت و قسط ماهانه داشته باشد
    // (برچسب «شروع قیمت» در جدول مقایسه هم می‌آید، پس هیرو را جدا می‌گیریم)
    const hero = page.locator('section[aria-roledescription="carousel"]');
    await expect(hero.getByText('شروع قیمت')).toBeVisible();
    await expect(page.getByText('قسطی از ماهانه').first()).toBeVisible();

    // بخش‌های تازه صفحه اصلی
    await expect(page.getByText('مقایسه مدل‌ها')).toBeVisible();
    await expect(page.getByText('امتیاز خریداران')).toBeVisible();
  });

  test('بنرهای خرید قسطی صفحهٔ اصلی فقط طرح‌هایی را نشان می‌دهند که فعال‌اند', async ({ page }) => {
    await page.goto('/');
    const banners = page.getByRole('region', { name: 'طرح‌های خرید قسطی' });
    // the store's own promissory-note plans: twelve months, and trading an old iPhone in
    await expect(banners.locator('a[href="/installments/safte"]')).toHaveCount(1);
    await expect(banners.locator('a[href="/installments/safte?plan=trade-in#request"]')).toHaveCount(1);
    // every credit service is on here, so one banner names all five instead of one each
    await expect(banners.locator('a[href="/installments"]')).toHaveCount(1);
    await expect(banners.locator('a[href*="service="]')).toHaveCount(0);
    // the banner showing is a real picture with the artwork's words as its text
    await expect(banners.getByRole('img', { name: /فقط با سفته/ })).toBeVisible();

    // the trade-in banner opens the promissory-note form with the plan already written in
    await page.goto('/installments/safte?plan=trade-in#request');
    await expect(page.locator('#credit-note')).toHaveValue(/^طرح تعویض آیفون قدیمی با جدید/);
    await expect(page.getByText(/^طرح تعویض: مدل و وضعیت آیفون فعلی‌ات را بنویس/)).toBeVisible();
    // without the plan in the address the note starts empty
    await page.goto('/installments/safte#request');
    await expect(page.locator('#credit-note')).toHaveValue('');
  });

  test('جست‌وجو کاربر را به فهرست فیلترشده می‌برد', async ({ page }) => {
    await page.goto('/shop?q=' + encodeURIComponent('آیفون ۱۷ پرو مکس'));
    await expect(page.getByRole('heading', { level: 1 })).toContainText('نتایج جست‌وجو');
    await expect(page.locator('article').first()).toContainText('آیفون ۱۷ پرو مکس');
  });

  test('فیلتر حافظه فقط ترکیب‌های همان حافظه را نشان می‌دهد', async ({ page }) => {
    await page.goto('/shop?storage=1024');
    const cards = page.locator('article');
    await expect(cards.first()).toBeVisible();
    const count = await cards.count();
    for (let index = 0; index < count; index += 1) {
      await expect(cards.nth(index)).toContainText('۱ ترابایت');
    }
  });

  test('صفحه محصول با تغییر حافظه قیمت را به‌روز می‌کند', async ({ page }) => {
    await page.goto('/iphone/iphone-17-pro-max');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('آیفون ۱۷ پرو مکس');
    await expect(page.getByText('انتخاب رنگ')).toBeVisible();

    const price = page.getByTestId('product-price');
    const sku = page.getByTestId('variant-sku');
    await expect(price).toBeVisible();

    const priceBefore = await price.getAttribute('data-price');
    const skuBefore = await sku.innerText();

    // حافظه دیگری را انتخاب کن (اولین گزینه‌ای که فعال است و انتخاب فعلی نیست)
    const storages = page.getByRole('button', { name: /گیگابایت|ترابایت/ });
    const count = await storages.count();
    for (let index = 0; index < count; index += 1) {
      const option = storages.nth(index);
      if (await option.isDisabled()) continue;
      if ((await option.getAttribute('aria-pressed')) === 'true') continue;
      await option.click();
      break;
    }

    await expect.poll(async () => price.getAttribute('data-price')).not.toBe(priceBefore);
    await expect(sku).not.toHaveText(skuBefore);

    // انتخاب در آدرس صفحه هم منعکس می‌شود
    await expect.poll(() => page.url()).toContain('storage=');
  });

  test('انتخاب رنگ تصویر و کد کالا را عوض می‌کند', async ({ page }) => {
    await page.goto('/iphone/iphone-17-pro-max');
    const sku = page.getByTestId('variant-sku');
    const skuBefore = await sku.innerText();

    const swatches = page
      .getByRole('button', { name: /^(?!افزودن|خرید).*$/ })
      .locator('css=[style*="background-color"]');
    await page.locator('button[aria-pressed="false"]>> css=span[style*="background-color"]').first().click();

    await expect(sku).not.toHaveText(skuBefore);
    expect(await swatches.count()).toBeGreaterThan(0);
  });

  test('علاقه‌مندی‌ها در همین مرورگر ذخیره و حذف می‌شود', async ({ page }) => {
    await page.goto('/iphone/iphone-17-pro');

    const heart = page.getByRole('button', { name: /به علاقه‌مندی‌ها$/ }).first();
    await heart.click();
    await expect(page.getByRole('button', { name: /از علاقه‌مندی‌ها$/ }).first()).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.goto('/wishlist');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('علاقه‌مندی‌ها');
    const saved = page.locator('article').first();
    await expect(saved).toContainText('آیفون ۱۷ پرو');

    // حذف از فهرست، فهرست خالی می‌شود
    await saved.getByRole('button', { name: /از علاقه‌مندی‌ها$/ }).click();
    await expect(page.getByText('هنوز چیزی ذخیره نکرده‌ای')).toBeVisible();
  });

  test('افزودن به سبد، سبد خرید را به‌روز می‌کند', async ({ page }) => {
    await page.goto('/iphone/iphone-17-pro');
    await page.getByTestId('add-to-cart').click();

    // سبد کناری باز می‌شود و شمارنده هدر به‌روز می‌شود
    await expect(page.getByRole('dialog').getByText('مبلغ قابل پرداخت')).toBeVisible();

    await page.goto('/cart');
    await expect(page.getByRole('heading', { name: 'سبد خرید' })).toBeVisible();
    await expect(page.getByText('مبلغ قابل پرداخت')).toBeVisible();
    await expect(page.getByRole('link', { name: 'ادامه و تکمیل خرید' })).toBeVisible();
  });
});

test.describe('استوری‌های صفحهٔ اصلی', () => {
  const storyRow = (page: Page) => page.getByRole('region', { name: 'استوری‌های خرید قسطی' });

  test.describe('با حرکت کم', () => {
    // بدون زمان‌سنج: اسلاید فقط با لمس یا کلید عوض می‌شود
    test.use({ contextOptions: { reducedMotion: 'reduce' } });

    test('استوری چک باز می‌شود، ورق می‌خورد، به فرم درخواست می‌برد و دیده‌شده می‌ماند', async ({ page }) => {
      await page.goto('/');
      const row = storyRow(page);
      await expect(row.getByRole('button').first()).toHaveAccessibleName(/^استوری آیفون قسطی/);

      await row.getByRole('button', { name: /^استوری چک صیادی/ }).click();
      const story = page.getByRole('dialog', { name: 'استوری چک صیادی' });
      await expect(story.getByRole('heading', { name: 'خرید آیفون با چک صیادی' })).toBeVisible();
      // بدون زمان‌سنج دکمهٔ توقف هم لازم نیست
      await expect(story.getByRole('button', { name: 'توقف' })).toHaveCount(0);

      // صفحه راست‌به‌چپ است: جلو رفتن با فلش چپ
      await page.keyboard.press('ArrowLeft');
      await expect(story.getByRole('heading', { name: 'مراحل خرید با چک' })).toBeVisible();
      await page.keyboard.press('ArrowRight');
      await expect(story.getByRole('heading', { name: 'خرید آیفون با چک صیادی' })).toBeVisible();
      await page.keyboard.press('ArrowLeft');

      await story.getByRole('link', { name: 'ثبت درخواست' }).click();
      await expect(page).toHaveURL(/\/installments\/cheque#request$/);
      await expect(story).toBeHidden();

      // حلقهٔ استوری دیده‌شده دیگر «تازه» نیست
      await page.goto('/');
      await expect(
        storyRow(page).getByRole('button', { name: 'استوری چک صیادی', exact: true }),
      ).toBeVisible();
      await expect(storyRow(page).getByRole('button', { name: 'استوری سفته، تازه' })).toBeVisible();
    });

    test('Escape استوری را می‌بندد', async ({ page }) => {
      await page.goto('/');
      await storyRow(page)
        .getByRole('button', { name: /^استوری سفته/ })
        .click();
      const story = page.getByRole('dialog', { name: 'استوری سفته' });
      await expect(story.getByRole('heading', { name: 'خرید آیفون با سفته' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(story).toBeHidden();
      await expect(page).toHaveURL(/\/$/);
    });
  });

  test('استوری اسنپ‌پی بنر خودش را نشان می‌دهد، خودش ورق می‌خورد و ماشین‌حساب را با اسنپ‌پی باز می‌کند', async ({
    page,
  }) => {
    await page.goto('/');
    await storyRow(page)
      .getByRole('button', { name: /^استوری اسنپ‌پی/ })
      .click();
    const story = page.getByRole('dialog', { name: 'استوری اسنپ‌پی' });
    const banner = story.getByRole('img', { name: 'خرید قسطی آیفون با اسنپ‌پی' });
    await expect(banner).toBeVisible();

    // اسلاید بنر بعد از چند ثانیه خودش به شرایط می‌رود
    const terms = story.getByRole('heading', { name: 'شرایط اسنپ‌پی' });
    await expect(terms).toBeVisible({ timeout: 15_000 });
    await story.getByRole('button', { name: 'توقف' }).click();
    await expect(story.getByRole('button', { name: 'ادامهٔ پخش' })).toBeVisible();

    // لمس یک‌سوم راست به اسلاید قبل برمی‌گردد
    const stage = story.locator('.story-stage');
    const box = (await stage.boundingBox())!;
    await page.mouse.click(box.x + box.width - 24, box.y + box.height / 2);
    await expect(banner).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(terms).toBeVisible();

    await story.getByRole('link', { name: 'محاسبهٔ قسط با اسنپ‌پی' }).click();
    await expect(page).toHaveURL(/\/installments\?service=snappay#calculator$/);
    await expect(page.locator('#calculator').getByRole('button', { name: /اسنپ‌پی/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
