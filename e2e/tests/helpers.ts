import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4000';

/** Where the admin session captured by `auth.setup.ts` is stored. */
export const ADMIN_STATE = 'tests/.auth/admin.json';

/** Reads the CSRF token a stored session carries, for API-only calls. */
export async function csrfFrom(context: {
  cookies: () => Promise<{ name: string; value: string }[]>;
}): Promise<string> {
  const cookies = await context.cookies();
  return cookies.find((cookie) => cookie.name === 'ih_csrf')?.value ?? '';
}

/** A unique Iranian mobile number per test run (11 digits), so suites never collide. */
export function uniquePhone(): string {
  const suffix = String(Math.floor(Math.random() * 9_000_000) + 1_000_000); // 7 digits
  return `0913${suffix}`;
}

/**
 * Clears the OTP cooldown and hourly budgets for a phone (dev-only endpoint), so
 * the suite can be re-run as often as needed without waiting an hour.
 */
export async function resetOtpLimits(request: APIRequestContext, phone: string): Promise<void> {
  const csrf = await request.get(`${API_URL}/api/auth/csrf`);
  const { csrfToken } = (await csrf.json()) as { csrfToken: string };
  await request.post(`${API_URL}/api/dev/reset-otp-limits`, {
    data: { phone },
    headers: { 'x-csrf-token': csrfToken },
    failOnStatusCode: false,
  });
}

/** Clears the per-visitor request throttles (dev-only endpoint), e.g. the instalment request form's. */
export async function resetThrottles(request: APIRequestContext): Promise<void> {
  const csrf = await request.get(`${API_URL}/api/auth/csrf`);
  const { csrfToken } = (await csrf.json()) as { csrfToken: string };
  await request.post(`${API_URL}/api/dev/reset-throttles`, {
    headers: { 'x-csrf-token': csrfToken },
    failOnStatusCode: false,
  });
}

/** Reads the OTP the API just issued (dev-only endpoint, disabled in production). */
export async function readOtp(request: APIRequestContext, phone: string): Promise<string> {
  const response = await request.get(`${API_URL}/api/dev/otp`, { params: { phone } });
  expect(response.ok(), `OTP for ${phone} should be readable in dev mode`).toBeTruthy();
  const body = (await response.json()) as { code: string };
  return body.code;
}

/** Signs a customer in through the real OTP screens. */
export async function loginCustomer(page: Page, phone: string): Promise<void> {
  await resetOtpLimits(page.request, phone);
  await page.goto('/login');
  await page.getByLabel('شماره موبایل').fill(phone);
  await page.getByRole('button', { name: 'ارسال کد تأیید' }).click();
  await expect(page.getByLabel('کد تأیید'), 'صفحه باید وارد مرحله کد تأیید شود').toBeVisible();

  const code = await readOtp(page.request, phone);
  await page.getByLabel('کد تأیید').fill(code);
  await page.waitForURL(/\/(account|login)/, { timeout: 20_000 });
}

/** Signs the seeded super-admin into the admin panel. */
export async function loginAdmin(page: Page, phone = '09120000000'): Promise<void> {
  await resetOtpLimits(page.request, phone);
  await page.goto('/admin/login');
  await page.getByLabel('شماره موبایل').fill(phone);
  await page.getByRole('button', { name: 'ارسال کد تأیید' }).click();
  await expect(page.getByLabel('کد تأیید'), 'صفحه باید وارد مرحله کد تأیید شود').toBeVisible();

  const code = await readOtp(page.request, phone);
  await page.getByLabel('کد تأیید').fill(code);
  await page.getByRole('button', { name: 'ورود به پنل' }).click();
  await page.waitForURL('**/admin', { timeout: 20_000 });
}

/** Completes the mock gateway page the sandbox providers redirect to. */
export async function completeMockPayment(
  page: Page,
  outcome: 'success' | 'failed' = 'success',
): Promise<void> {
  await expect(page.locator('body')).toContainText('پرداخت', { timeout: 20_000 });
  const label = outcome === 'success' ? 'پرداخت موفق' : 'پرداخت ناموفق';
  await page.getByRole('button', { name: label }).click();
  await page.waitForURL(/checkout\/result/, { timeout: 30_000 });
}

/**
 * Places a real order (payment pending, mock gateway) through the API with a
 * fresh customer, so admin specs never depend on another spec having bought
 * something first. Uses the cheapest-stocked variant with at least 2 units.
 */
export async function placePendingOrder(playwright: {
  request: { newContext: (options: { baseURL: string }) => Promise<APIRequestContext> };
}): Promise<{ orderNumber: string }> {
  const api = await playwright.request.newContext({ baseURL: API_URL });
  const phone = uniquePhone();
  await resetOtpLimits(api, phone);
  const { csrfToken } = (await (await api.get('/api/auth/csrf')).json()) as { csrfToken: string };
  const headers = { 'x-csrf-token': csrfToken };

  await api.post('/api/auth/send-otp', { data: { phone }, headers });
  await api.post('/api/auth/verify-otp', { data: { phone, code: await readOtp(api, phone) }, headers });
  await api.patch('/api/users/me', { data: { firstName: 'خریدار', lastName: 'آزمایشی' }, headers });

  const products = await api.get('/api/products', { params: { inStock: 'true', pageSize: 20 } });
  const { items } = (await products.json()) as {
    items: { variant: { id: string; availableStock: number } }[];
  };
  const variant = items.map((item) => item.variant).find((v) => v.availableStock >= 2);
  expect(variant, 'باید ترکیبی با موجودی کافی باشد').toBeTruthy();
  await api.post('/api/cart', { data: { variantId: variant!.id, quantity: 1 }, headers });

  const address = (await (
    await api.post('/api/users/me/addresses', {
      data: {
        recipientName: 'خریدار آزمایشی',
        mobile: phone,
        province: 'تهران',
        city: 'تهران',
        addressLine: 'خیابان آزادی، کوچه ۵، پلاک ۱۰',
        postalCode: '1234567890',
      },
      headers,
    })
  ).json()) as { id: string };
  const methods = (await (
    await api.get('/api/shipping/methods', { params: { province: 'تهران' } })
  ).json()) as {
    id: string;
    available: boolean;
  }[];

  // /api/checkout creates the order and its payment in one step
  const order = await api.post('/api/checkout', {
    data: {
      addressId: address.id,
      shippingMethodId: methods.find((m) => m.available)!.id,
      paymentMethod: 'ONLINE',
    },
    headers: { ...headers, 'idempotency-key': `e2e-admin-${Date.now()}` },
  });
  expect(order.status(), await order.text()).toBeLessThan(400);
  const body = (await order.json()) as { order: { orderNumber: string } };
  await api.dispose();
  return { orderNumber: body.order.orderNumber };
}
