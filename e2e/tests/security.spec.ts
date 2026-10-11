import { expect, test } from '@playwright/test';
import { readOtp, resetOtpLimits, uniquePhone } from './helpers';

/**
 * What the browser gets from the site itself: the protective headers on every
 * page, and a sign-in that cannot be steered to another site.
 */
test.describe('امنیت سایت', () => {
  test('هر صفحه با هدرهای محافظ می‌آید و در سایت دیگری قاب نمی‌شود', async ({ request }) => {
    for (const path of ['/', '/iphone/iphone-17', '/login', '/admin/login', '/installments']) {
      const response = await request.get(path);
      expect(response.status(), path).toBeLessThan(400);
      const headers = response.headers();
      expect(headers['content-security-policy'], path).toContain("default-src 'self'");
      expect(headers['content-security-policy'], path).toContain("object-src 'none'");
      expect(headers['content-security-policy'], path).toContain("frame-ancestors 'self'");
      expect(headers['x-frame-options'], path).toBe('SAMEORIGIN');
      expect(headers['x-content-type-options'], path).toBe('nosniff');
      expect(headers['referrer-policy'], path).toBe('strict-origin-when-cross-origin');
      expect(headers['x-powered-by'], path).toBeUndefined();
    }
  });

  test('ورود با next بیرونی، مشتری را روی همین سایت نگه می‌دارد', async ({ page }) => {
    const phone = uniquePhone();
    await resetOtpLimits(page.request, phone);
    await page.goto('/login?next=https://evil.example/phish');
    await page.getByLabel('شماره موبایل').fill(phone);
    await page.getByRole('button', { name: 'ارسال کد تأیید' }).click();
    await expect(page.getByLabel('کد تأیید')).toBeVisible();
    const origin = new URL(page.url()).origin;
    await page.getByLabel('کد تأیید').fill(await readOtp(page.request, phone));
    // a first login asks for the name, then lands on the account page — never on the other site
    await page.getByLabel('نام', { exact: true }).fill('مشتری');
    await page.getByLabel('نام خانوادگی').fill('آزمایشی');
    await page.getByRole('button', { name: 'ذخیره و ادامه' }).click();
    await page.waitForURL(/\/account/, { timeout: 20_000 });
    expect(new URL(page.url()).origin).toBe(origin);
    expect(page.url()).not.toContain('evil.example');

    // and a protocol-relative one is treated the same
    await page.goto('/login?next=//evil.example/');
    await expect(page.getByLabel('شماره موبایل')).toBeVisible();
  });

  test('صفحهٔ محصول به مرورگر اجازهٔ اسکریپت بیرونی نمی‌دهد', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (message) => {
      if (message.text().includes('Content Security Policy')) violations.push(message.text());
    });
    await page.goto('/iphone/iphone-17');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // the page itself must not trip over its own policy
    expect(violations.filter((v) => !v.includes('evil.example'))).toEqual([]);
    // an injected script tag from another origin is refused by the policy, not merely unreachable
    const blockedUri = await page.evaluate(
      () =>
        new Promise<string | null>((resolve) => {
          document.addEventListener('securitypolicyviolation', (event) => resolve(event.blockedURI), {
            once: true,
          });
          const script = document.createElement('script');
          script.src = 'https://evil.example/x.js';
          document.head.appendChild(script);
          setTimeout(() => resolve(null), 3000);
        }),
    );
    expect(blockedUri).toContain('evil.example');
  });
});
