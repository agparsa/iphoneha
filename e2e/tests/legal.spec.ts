import { expect, test } from '@playwright/test';
import { API_URL } from './helpers';

test.describe('صفحه‌های قانونی و اعتماد', () => {
  test('پاورقی به قوانین، حریم خصوصی، درباره ما و تماس لینک دارد', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('footer');
    for (const [label, path] of [
      ['درباره ما', '/about'],
      ['تماس با ما', '/contact'],
      ['قوانین و مقررات', '/terms'],
      ['حریم خصوصی', '/privacy'],
    ] as const) {
      await expect(footer.getByRole('link', { name: label })).toHaveAttribute('href', path);
    }
  });

  test('قوانین همان مهلت بازگشت و گارانتی تنظیمات فروشگاه را می‌گوید', async ({ page, request }) => {
    const config = (await (await request.get(`${API_URL}/api/storefront/config`)).json()) as {
      store: { returnDays: number; warrantyMonths: number; phone: string };
    };
    await page.goto('/terms');
    await expect(page.getByRole('heading', { level: 1, name: 'قوانین و مقررات' })).toBeVisible();
    const days = config.store.returnDays.toLocaleString('fa-IR');
    await expect(page.locator('#returns')).toContainText(`تا ${days} روز`);
    if (config.store.warrantyMonths > 0) {
      await expect(page.locator('#warranty')).toContainText(
        `${config.store.warrantyMonths.toLocaleString('fa-IR')} ماه`,
      );
    }
    await expect(page.locator('#complaints')).toContainText(config.store.phone);
  });

  test('حریم خصوصی، درباره ما و تماس با ما باز می‌شوند و ایندکس‌پذیرند', async ({ page }) => {
    for (const [path, heading] of [
      ['/privacy', 'حریم خصوصی'],
      ['/about', /درباره/],
      ['/contact', 'تماس با ما'],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`${path}$`));
      const robots = page.locator('meta[name="robots"]');
      if ((await robots.count()) > 0) await expect(robots.first()).not.toHaveAttribute('content', /noindex/);
    }
  });
});
