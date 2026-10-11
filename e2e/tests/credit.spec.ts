import { expect, test, type Page } from '@playwright/test';
import { ADMIN_STATE, resetThrottles, uniquePhone } from './helpers';

/** Every JSON-LD block on the page, flattened. */
async function structuredData(page: Page): Promise<Record<string, unknown>[]> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks.flatMap((block) => {
    const parsed: unknown = JSON.parse(block);
    return Array.isArray(parsed)
      ? (parsed as Record<string, unknown>[])
      : [parsed as Record<string, unknown>];
  });
}

const LANDINGS = [
  { path: '/installments', h1: 'خرید آیفون قسطی با چک و سفته', keyword: 'آیفون قسطی' },
  { path: '/installments/cheque', h1: 'خرید گوشی با چک صیادی', keyword: 'خرید گوشی با چک' },
  { path: '/installments/safte', h1: 'خرید آیفون با سفته', keyword: 'خرید آیفون با سفته' },
];

test.describe('صفحه‌های خرید قسطی', () => {
  for (const landing of LANDINGS) {
    test(`${landing.path}: تیتر، عنوان، کانونیکال و داده‌های ساخت‌یافته`, async ({ page }) => {
      await page.goto(landing.path);

      await expect(page.getByRole('heading', { level: 1 })).toHaveText(landing.h1);
      await expect(page.locator('h1')).toHaveCount(1);
      expect(await page.title()).toContain(landing.keyword);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        new RegExp(`${landing.path}$`),
      );
      const description = await page.locator('meta[name="description"]').getAttribute('content');
      expect(description?.length ?? 0).toBeGreaterThan(80);
      await expect(page.locator('meta[property="og:image"]').first()).toHaveAttribute(
        'content',
        /\/covers\/.+\.jpg$/,
      );

      const data = await structuredData(page);
      const types = data.map((item) => item['@type']);
      expect(types).toEqual(expect.arrayContaining(['BreadcrumbList', 'FAQPage', 'ItemList']));

      // the FAQ answers are in the page itself, not only in the markup
      const faq = data.find((item) => item['@type'] === 'FAQPage') as {
        mainEntity: { name: string; acceptedAnswer: { text: string } }[];
      };
      const first = faq.mainEntity[0]!;
      await expect(page.getByRole('heading', { name: first.name, level: 3 })).toBeVisible();
      await expect(page.getByText(first.acceptedAnswer.text, { exact: true })).toBeAttached();

      // every model on sale is priced, with a way to ask for it
      await expect(page.getByRole('table', { name: /قیمت نقد و اقساطی/ })).toBeVisible();
      await expect(page.getByRole('link', { name: /درخواست خرید قسطی آیفون ۱۷ پرو مکس/ })).toBeVisible();
    });
  }

  test('صفحهٔ اصلی خرید قسطی به صفحه‌های چک و سفته لینک می‌دهد', async ({ page }) => {
    await page.goto('/installments');
    const main = page.locator('main');
    await expect(main.getByRole('link', { name: 'شرایط خرید گوشی با چک' })).toHaveAttribute(
      'href',
      '/installments/cheque',
    );
    await expect(main.getByRole('link', { name: 'شرایط خرید آیفون با سفته' })).toHaveAttribute(
      'href',
      '/installments/safte',
    );
    // and so does every page, from the footer
    const footer = page.locator('footer');
    await expect(footer.getByRole('link', { name: 'آیفون قسطی' })).toHaveAttribute('href', '/installments');
    await expect(footer.getByRole('link', { name: 'خرید گوشی با چک' })).toHaveAttribute(
      'href',
      '/installments/cheque',
    );
    await expect(footer.getByRole('link', { name: 'خرید آیفون با سفته' })).toHaveAttribute(
      'href',
      '/installments/safte',
    );
  });

  test('صفحهٔ محصول مستقیم به فرم خرید با چک همان مدل می‌رود', async ({ page }) => {
    await page.goto('/iphone/iphone-17-pro-max');
    const section = page.locator('#installments');
    await expect(section.getByRole('heading', { name: 'خرید قسطی آیفون ۱۷ پرو مکس' })).toBeVisible();
    const link = section.getByRole('link', { name: /خرید گوشی با چک/ }).first();
    await expect(link).toHaveAttribute('href', '/installments/cheque?model=iphone-17-pro-max#request');

    await link.click();
    await page.waitForURL('**/installments/cheque?model=iphone-17-pro-max#request');
    // the request form opens on that model
    await expect(page.locator('#request').getByRole('combobox', { name: 'مدل آیفون' })).toContainText(
      'آیفون ۱۷ پرو مکس',
    );
  });

  test('فرم درخواست خرید با چک ثبت می‌شود و شمارهٔ پیگیری می‌دهد', async ({ page }) => {
    await resetThrottles(page.request);
    await page.goto('/installments/cheque');
    const form = page.locator('#request');

    // a mistyped number is caught before anything is stored
    await form.getByLabel('نام و نام خانوادگی').fill('مشتری آزمایشی');
    await form.getByLabel('شماره موبایل').fill('0912');
    await form.getByRole('button', { name: /ثبت درخواست خرید با/ }).click();
    await expect(form.getByText('شماره موبایل معتبر نیست')).toBeVisible();

    await form.getByLabel('شماره موبایل').fill(uniquePhone());
    await form.getByRole('combobox', { name: 'مدل آیفون' }).click();
    await page.getByRole('option', { name: 'آیفون ۱۷ پرو مکس' }).click();
    await form.getByLabel('شهر (اختیاری)').fill('شیراز');
    await form.getByRole('button', { name: /ثبت درخواست خرید با چک صیادی/ }).click();

    await expect(form.getByText('درخواستت ثبت شد')).toBeVisible();
    await expect(form.getByText(/شمارهٔ پیگیری/)).toBeVisible();
  });

  test('sitemap صفحه‌های قسطی و مجله را دارد', async ({ request }) => {
    const xml = await (await request.get('/sitemap.xml')).text();
    for (const path of ['/installments', '/installments/cheque', '/installments/safte', '/mag']) {
      expect(xml).toContain(`${path}</loc>`);
    }
    expect(xml).toContain('/mag/buy-iphone-with-sayad-cheque</loc>');
    expect(xml).toMatch(/<image:loc>https?:\/\/[^<]+\/covers\/[^<]+\.jpg<\/image:loc>/);
  });
});

test.describe('مجله', () => {
  test('فهرست مقاله‌ها و صفحهٔ مقاله با داده‌های ساخت‌یافته', async ({ page }) => {
    await page.goto('/mag');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('مجلهٔ آیفونی‌ها');
    const card = page.getByRole('link', { name: 'خرید آیفون با چک صیادی؛ شرایط، مدارک و مراحل' });
    await expect(card).toBeVisible();
    await card.click();

    await page.waitForURL('**/mag/buy-iphone-with-sayad-cheque');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'خرید آیفون با چک صیادی؛ شرایط، مدارک و مراحل',
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      /\/mag\/buy-iphone-with-sayad-cheque$/,
    );
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article');

    const data = await structuredData(page);
    const article = data.find((item) => item['@type'] === 'BlogPosting') as
      Record<string, unknown> | undefined;
    expect(article?.headline).toBe('خرید آیفون با چک صیادی؛ شرایط، مدارک و مراحل');
    expect(String(article?.datePublished)).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // the table of contents jumps to the sections, and the text links to the store's pages
    const toc = page.getByRole('navigation', { name: 'فهرست مطالب' });
    await expect(toc.getByRole('link')).not.toHaveCount(0);
    const firstEntry = toc.getByRole('link').first();
    const target = (await firstEntry.getAttribute('href'))!;
    await expect(page.locator(target)).toHaveCount(1);
    await expect(page.locator('.article-body a[href="/installments/cheque"]').first()).toBeAttached();
  });

  test('مقالهٔ ناموجود صفحهٔ «پیدا نشد» است و ایندکس نمی‌شود', async ({ page }) => {
    // store pages stream behind a loading skeleton, so Next answers 200 with a
    // noindex tag instead of a 404 status — search engines skip it either way
    await page.goto('/mag/no-such-article');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('صفحه‌ای که دنبالش بودی پیدا نشد');
    await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
  });
});

test.describe('پنل: درخواست‌های اقساط و مجله', () => {
  test.use({ storageState: ADMIN_STATE });

  test('درخواست تازه در پنل دیده می‌شود و وضعیتش عوض می‌شود', async ({ page, request }) => {
    const name = `خریدار ${Date.now().toString().slice(-6)}`;
    await resetThrottles(request);
    // a request sent through the storefront API, like the form does
    const csrf = await request.get('/api/auth/csrf');
    const { csrfToken } = (await csrf.json()) as { csrfToken: string };
    const created = await request.post('/api/credit-requests', {
      data: {
        name,
        phone: uniquePhone(),
        method: 'SAFTE',
        productSlug: 'iphone-17-pro',
        source: '/installments/safte',
      },
      headers: { 'x-csrf-token': csrfToken },
    });
    expect(created.status()).toBe(201);

    await page.goto('/admin/credit-requests');
    await expect(page.getByRole('heading', { name: 'درخواست‌های خرید اقساطی', level: 1 })).toBeVisible();
    // the menu counts what is waiting for a call
    await expect(page.getByRole('link', { name: /درخواست‌های اقساط/ })).toContainText(/[۱-۹]/);

    const card = page.locator('article', { hasText: name });
    await expect(card).toContainText('سفته');
    await expect(card).toContainText('آیفون ۱۷ پرو');
    await card.getByRole('button', { name: 'تماس گرفته شد' }).click();
    await card.getByLabel('یادداشت داخلی (مشتری نمی‌بیند)').fill('مدارک را فردا می‌فرستد');
    await card.getByRole('button', { name: 'ذخیره' }).click();
    await expect(page.getByText(/به‌روز شد/)).toBeVisible();

    await page.goto('/admin/credit-requests?status=CONTACTED');
    await expect(page.locator('article', { hasText: name })).toContainText('آخرین تغییر وضعیت');
  });

  test('مقاله در پنل ساخته، منتشر و حذف می‌شود', async ({ page }) => {
    const slug = `e2e-article-${Date.now()}`;
    await page.goto('/admin/articles/new');
    await page.getByLabel('عنوان مقاله (تیتر اصلی صفحه)').fill('راهنمای آزمایشی خرید آیفون قسطی');
    await page.getByLabel('نشانی (لاتین)').fill(slug);
    await page.getByLabel('کلمهٔ کلیدی اصلی').fill('آیفون قسطی');
    await page
      .getByLabel(/^خلاصه/)
      .fill(
        'این خلاصهٔ یک مقالهٔ آزمایشی دربارهٔ آیفون قسطی است که زیر عنوان در نتیجهٔ جست‌وجو دیده می‌شود.',
      );
    await page
      .getByLabel('متن مقاله (Markdown)')
      .fill(
        `## آیفون قسطی چیست؟\n\n${'این متن آزمایشی است و به [صفحهٔ آیفون قسطی](/installments) لینک می‌دهد. '.repeat(6)}`,
      );
    await page.getByRole('button', { name: 'منتشرشده' }).click();
    await page.getByRole('button', { name: 'ساخت مقاله' }).click();
    await page.waitForURL(/\/admin\/articles\/(?!new)[^/]+$/);

    const live = await page.request.get(`/api/articles/${slug}`);
    expect(live.status()).toBe(200);

    await page.getByRole('button', { name: 'حذف مقاله' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'بله، حذف کن' }).click();
    await page.waitForURL('**/admin/articles');
    expect((await page.request.get(`/api/articles/${slug}`)).status()).toBe(404);
  });
});
