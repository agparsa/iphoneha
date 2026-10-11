import { expect, test } from '@playwright/test';
import { ADMIN_STATE, API_URL, csrfFrom } from './helpers';

/*
 * Switches every credit service off and back on. The storefront caches its
 * settings for about a minute, so for a while after this spec pages can still
 * show either state — it runs in its own project, after every other spec.
 */
test.describe('بدون سرویس اقساطی آنلاین', () => {
  test.use({ storageState: ADMIN_STATE });

  // the storefront must not advertise a credit service that is switched off —
  // the same path production takes while every installment driver is a mock
  test('هیچ سرویس اقساطی تبلیغ نمی‌شود و خرید با چک و سفته جایش را می‌گیرد', async ({ page, request }) => {
    test.setTimeout(300_000);
    const csrf = await csrfFrom(page.context());
    const settings = await page.request.get(`${API_URL}/api/admin/settings`);
    const payments = ((await settings.json()) as { payments: { disabledMethods: string[] } }).payments;
    const all = ['SNAPPAY', 'TARA', 'DIGIPAY', 'NESIBA', 'BOJET', 'AZKIVAM'];

    const save = (disabledMethods: string[]) =>
      page.request.patch(`${API_URL}/api/admin/settings/payments`, {
        data: { ...payments, disabledMethods },
        headers: { 'x-csrf-token': csrf },
      });

    expect((await save(all)).status()).toBeLessThan(400);
    try {
      const config = (await (await request.get(`${API_URL}/api/storefront/config`)).json()) as {
        installments: unknown[];
      };
      expect(config.installments).toEqual([]);

      // the storefront caches its config and the page for a minute or so, so reload until it picks the
      // change up — checking the page itself: the loading skeleton has no services heading either
      await expect(async () => {
        await page.goto('/installments');
        await expect(
          page.getByRole('heading', { level: 1, name: 'خرید آیفون قسطی با چک و سفته' }),
        ).toBeVisible({
          timeout: 15_000,
        });
        await expect(page.getByRole('heading', { name: 'اقساط آنلاین با سرویس‌های اعتباری' })).toHaveCount(
          0,
          {
            timeout: 1_000,
          },
        );
        // no pill, banner or calculator plan for a service (a magazine teaser may still name them)
        await expect(page.getByRole('list', { name: 'روش‌های پرداخت اقساطی' })).not.toContainText(
          /اسنپ‌پی|ازکی‌وام/,
          { timeout: 1_000 },
        );
      }).toPass({ timeout: 150_000, intervals: [5_000] });
      await expect(page.getByRole('link', { name: /با اسنپ‌پی|با ازکی‌وام/ })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /اسنپ‌پی|ازکی‌وام/ })).toHaveCount(0);
      // the store's own plans are still offered, each with its page and the request form
      await expect(page.getByRole('link', { name: 'شرایط خرید گوشی با چک' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'شرایط خرید آیفون با سفته' })).toBeVisible();
      await expect(
        page.locator('#request').getByRole('button', { name: /ثبت درخواست خرید با/ }),
      ).toBeVisible();

      // the home page stories follow the same settings: the store's own plans stay, no service is left
      const stories = page.getByRole('region', { name: 'استوری‌های خرید قسطی' });
      await expect(async () => {
        await page.goto('/');
        await expect(stories.getByRole('button', { name: /^استوری چک صیادی/ })).toBeVisible({
          timeout: 15_000,
        });
        await expect(
          stories.getByRole('button', { name: /اسنپ‌پی|تارا|دیجی‌پی|نسیبا|باجت|ازکی‌وام/ }),
        ).toHaveCount(0, {
          timeout: 1_000,
        });
      }).toPass({ timeout: 150_000, intervals: [5_000] });
      await stories.getByRole('button', { name: /^استوری آیفون قسطی/ }).click();
      const hub = page.getByRole('dialog', { name: 'استوری آیفون قسطی' });
      await expect(hub.getByText(/^با چک صیادی و سفته؛/)).toBeVisible();
      await expect(hub).not.toContainText(/اسنپ‌پی|ازکی‌وام/);
      await page.keyboard.press('Escape');

      // the home page banners: the promissory-note plans stay, no credit service is advertised
      const banners = page.getByRole('region', { name: 'طرح‌های خرید قسطی' });
      await expect(banners.locator('a[href="/installments/safte"]')).toHaveCount(1);
      await expect(banners.locator('a[href="/installments/safte?plan=trade-in#request"]')).toHaveCount(1);
      await expect(banners.locator('a[href="/installments"], a[href*="service="]')).toHaveCount(0);
    } finally {
      expect((await save(payments.disabledMethods)).status()).toBeLessThan(400);
      // leave the storefront as it was for the specs that run after this one: the promissory-note
      // banners are there either way, the «any credit you have» banner only once the services are back
      await expect(async () => {
        await page.goto('/');
        await expect(
          page.getByRole('region', { name: 'طرح‌های خرید قسطی' }).locator('a[href="/installments"]'),
        ).toHaveCount(1, { timeout: 1_000 });
      }).toPass({ timeout: 130_000, intervals: [5_000] });
    }
  });
});
