import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { ADMIN_STATE } from './helpers';

/** WCAG rules that must hold on every public page. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const PUBLIC_PAGES: { name: string; path: string }[] = [
  { name: 'صفحه اصلی', path: '/' },
  { name: 'فروشگاه', path: '/shop' },
  { name: 'صفحه محصول', path: '/iphone/iphone-17-pro-max' },
  { name: 'خرید قسطی', path: '/installments' },
  { name: 'خرید گوشی با چک', path: '/installments/cheque' },
  { name: 'خرید آیفون با سفته', path: '/installments/safte' },
  { name: 'مجله', path: '/mag' },
  { name: 'مقالهٔ مجله', path: '/mag/buy-iphone-with-sayad-cheque' },
  { name: 'سبد خرید', path: '/cart' },
  { name: 'ورود', path: '/login' },
  { name: 'قوانین و مقررات', path: '/terms' },
  { name: 'تماس با ما', path: '/contact' },
];

test.describe('دسترس‌پذیری (WCAG 2.1 AA)', () => {
  for (const page_ of PUBLIC_PAGES) {
    test(`${page_.name} خطای دسترس‌پذیری ندارد`, async ({ page }) => {
      await page.goto(page_.path, { waitUntil: 'load' });
      await page.waitForTimeout(500);

      const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      const violations = results.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.length,
        help: violation.help,
      }));

      expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
      // the page must declare Persian and RTL for screen readers
      await expect(page.locator('html')).toHaveAttribute('lang', 'fa');
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    });
  }

  test('صفحه ورود پنل مدیریت خطای دسترس‌پذیری ندارد', async ({ page }) => {
    await page.goto('/admin/login', { waitUntil: 'load' });
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(
      results.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
      JSON.stringify(results.violations, null, 2),
    ).toEqual([]);
  });
});

test.describe('دسترس‌پذیری استوری‌های صفحهٔ اصلی', () => {
  // less motion: every slide is fully drawn (no fade) when axe measures its contrast
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('استوری باز، با متن، رقم و بنر، خطای دسترس‌پذیری ندارد', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    const row = page.getByRole('region', { name: 'استوری‌های خرید قسطی' });
    const check = async (label: string) => {
      await page.waitForTimeout(300);
      const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      expect(
        results.violations.map((v) => ({ story: label, id: v.id, impact: v.impact, nodes: v.nodes.length })),
        JSON.stringify({ label, violations: results.violations }, null, 2),
      ).toEqual([]);
    };

    // the row itself, closed
    await check('ردیف استوری‌ها');

    await row.getByRole('button', { name: /^استوری آیفون قسطی/ }).click();
    const hub = page.getByRole('dialog', { name: 'استوری آیفون قسطی' });
    await expect(hub.getByRole('heading', { name: 'آیفونت را قسطی بخر' })).toBeVisible();
    await check('آیفون قسطی ۱');
    await page.keyboard.press('ArrowLeft');
    await expect(hub.getByRole('heading', { name: 'قسط ماهانه‌ات را همین حالا ببین' })).toBeVisible();
    await check('آیفون قسطی ۲');
    await page.keyboard.press('Escape');
    await expect(hub).toBeHidden();

    await row.getByRole('button', { name: /^استوری اسنپ‌پی/ }).click();
    const service = page.getByRole('dialog', { name: 'استوری اسنپ‌پی' });
    await expect(service.getByRole('img', { name: 'خرید قسطی آیفون با اسنپ‌پی' })).toBeVisible();
    await check('اسنپ‌پی');
  });
});

test.describe('دسترس‌پذیری پنل با نشست مدیر', () => {
  test.use({ storageState: ADMIN_STATE });

  test('صفحه‌های پنل خطای دسترس‌پذیری ندارند', async ({ page }) => {
    for (const path of [
      '/admin',
      '/admin/orders',
      '/admin/inventory',
      '/admin/options',
      '/admin/credit-requests',
      '/admin/articles',
      '/admin/articles/new',
      '/admin/settings?tab=alerts',
      '/admin/settings?tab=ledger',
      '/admin/orders/new',
      '/admin/installments',
      '/admin/installments?tab=cheques',
      '/admin/installments?tab=contracts',
      '/admin/installments/new',
      '/admin/devices',
      '/admin/pricing',
      '/admin/reports',
    ]) {
      await page.goto(path, { waitUntil: 'load' });
      await page.waitForTimeout(400);
      const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      expect(
        results.violations.map((v) => ({ page: path, id: v.id, impact: v.impact, nodes: v.nodes.length })),
        JSON.stringify({ path, violations: results.violations }, null, 2),
      ).toEqual([]);
    }
  });
});
