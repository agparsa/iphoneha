import { expect, test, type APIRequestContext } from '@playwright/test';
import { ADMIN_STATE, API_URL, csrfFrom, readOtp, resetOtpLimits, uniquePhone } from './helpers';

/**
 * دو خریدار هم‌زمان آخرین موجودی یک ترکیب را می‌خواهند؛ فقط یکی باید موفق شود.
 * این تست همان سناریوی «Concurrent Checkout» را از بیرون (HTTP) می‌سنجد.
 */
async function signIn(request: APIRequestContext): Promise<{ csrf: string; phone: string }> {
  const phone = uniquePhone();
  await resetOtpLimits(request, phone);
  const csrfResponse = await request.get(`${API_URL}/api/auth/csrf`);
  const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };

  await request.post(`${API_URL}/api/auth/send-otp`, {
    data: { phone },
    headers: { 'x-csrf-token': csrfToken },
  });
  const code = await readOtp(request, phone);
  await request.post(`${API_URL}/api/auth/verify-otp`, {
    data: { phone, code },
    headers: { 'x-csrf-token': csrfToken },
  });
  await request.patch(`${API_URL}/api/users/me`, {
    data: { firstName: 'خریدار', lastName: 'هم‌زمان' },
    headers: { 'x-csrf-token': csrfToken },
  });
  return { csrf: csrfToken, phone };
}

test('دو خریدار هم‌زمان نمی‌توانند آخرین موجودی را بخرند', async ({ playwright, request }) => {
  // یک ترکیب با موجودی محدود پیدا کن
  const products = await request.get(`${API_URL}/api/products`, {
    params: { inStock: 'true', pageSize: 20 },
  });
  const { items } = (await products.json()) as {
    items: { slug: string; variant: { id: string; availableStock: number } }[];
  };
  // کم‌موجودترین ترکیب را انتخاب کن تا بقیه تست‌ها بی‌کالا نمانند
  // (no more than a cart takes of one item, or the first order leaves some behind);
  // the card shows one colour, so every colour × capacity of each phone is looked at
  const candidates: { slug: string; variant: { id: string; availableStock: number } }[] = [];
  for (const item of items) {
    const list = await request.get(`${API_URL}/api/products/${item.slug}/variants`);
    const variants = (await list.json()) as { id: string; availableStock: number; active: boolean }[];
    for (const variant of variants) {
      if (variant.active && variant.availableStock > 0 && variant.availableStock <= 5)
        candidates.push({ slug: item.slug, variant });
    }
  }
  const target = candidates.sort((a, b) => a.variant.availableStock - b.variant.availableStock)[0];
  expect(target, 'باید حداقل یک ترکیب موجود باشد').toBeTruthy();

  const variantId = target!.variant.id;
  const available = target!.variant.availableStock;

  const buyers = await Promise.all([
    playwright.request.newContext({ baseURL: API_URL }),
    playwright.request.newContext({ baseURL: API_URL }),
  ]);

  const sessions = await Promise.all(buyers.map((buyer) => signIn(buyer)));

  // هر خریدار کل موجودی را در سبد می‌گذارد
  await Promise.all(
    buyers.map((buyer, index) =>
      buyer.post('/api/cart', {
        data: { variantId, quantity: available },
        headers: { 'x-csrf-token': sessions[index]!.csrf },
      }),
    ),
  );

  const addresses = await Promise.all(
    buyers.map((buyer, index) =>
      buyer
        .post('/api/users/me/addresses', {
          data: {
            recipientName: 'خریدار هم‌زمان',
            mobile: sessions[index]!.phone,
            province: 'تهران',
            city: 'تهران',
            addressLine: 'خیابان آزادی، کوچه ۵، پلاک ۱۰',
            postalCode: '1234567890',
          },
          headers: { 'x-csrf-token': sessions[index]!.csrf },
        })
        .then((response) => response.json() as Promise<{ id: string }>),
    ),
  );

  const shipping = await request.get(`${API_URL}/api/shipping/methods`, { params: { province: 'تهران' } });
  const methods = (await shipping.json()) as { id: string; available: boolean }[];
  const shippingMethodId = methods.find((method) => method.available)!.id;

  // هم‌زمان سفارش می‌دهند
  const results = await Promise.all(
    buyers.map((buyer, index) =>
      buyer.post('/api/orders', {
        data: {
          addressId: addresses[index]!.id,
          shippingMethodId,
          paymentMethod: 'ONLINE',
        },
        headers: {
          'x-csrf-token': sessions[index]!.csrf,
          'idempotency-key': `e2e-${Date.now()}-${index}`,
        },
      }),
    ),
  );

  const statuses = results.map((result) => result.status());
  const succeeded = statuses.filter((status) => status < 400).length;
  const failed = statuses.filter((status) => status >= 400).length;

  expect(succeeded, 'فقط یک سفارش باید ثبت شود').toBe(1);
  expect(failed, 'سفارش دوم باید به خاطر نبود موجودی رد شود').toBe(1);

  // موجودی قابل فروش صفر شده است
  const after = await request.get(`${API_URL}/api/products/${target!.slug}/variants`);
  const variants = (await after.json()) as { id: string; availableStock: number }[];
  expect(variants.find((variant) => variant.id === variantId)!.availableStock).toBe(0);

  // موجودی مصرف‌شده را برگردان تا اجرای بعدی هم همین شرایط را داشته باشد
  const adminApi = await playwright.request.newContext({ baseURL: API_URL, storageState: ADMIN_STATE });
  const csrf = await csrfFrom({ cookies: () => adminApi.storageState().then((state) => state.cookies) });
  const restore = await adminApi.post(`/api/admin/inventory/${variantId}/adjust`, {
    data: { mode: 'delta', value: available, reason: 'بازگردانی موجودی پس از تست هم‌زمانی' },
    headers: { 'x-csrf-token': csrf },
  });
  expect(restore.ok(), 'موجودی باید به حالت اول برگردد').toBeTruthy();

  await Promise.all([...buyers.map((buyer) => buyer.dispose()), adminApi.dispose()]);
});
