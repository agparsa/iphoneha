import { defaultAddress, loginAdmin, loginWithProfile, type Actor } from './utils/actors';
import { resetDb, stockOf } from './utils/db';
import { completeMockPayment, startCheckout } from './utils/payments';
import { closeTestApp, createTestApp, type TestContext } from './utils/test-app';

describe('Admin API', () => {
  let ctx: TestContext;
  let superAdmin: Actor;
  let warehouse: Actor;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await closeTestApp(ctx);
  });

  beforeEach(async () => {
    await resetDb(ctx.prisma, ctx.redis);
    superAdmin = await loginAdmin(ctx, '09120000000');
    warehouse = await loginAdmin(ctx, '09120000001');
  });

  it('requires an admin session', async () => {
    await ctx.http().get('/api/admin/products').expect(401);
    await ctx.http().get('/api/admin/dashboard').expect(401);
  });

  it('enforces permissions per role', async () => {
    await warehouse.agent.get('/api/admin/products').expect(200); // products.read
    await warehouse.agent
      .post('/api/admin/products')
      .set('x-csrf-token', warehouse.csrf)
      .send({ slug: 'nope', name: 'x', nameEn: 'x' })
      .expect(403);
    await warehouse.agent.get('/api/admin/users').expect(403); // users.read
    await warehouse.agent.get('/api/admin/admins').expect(403); // admins.manage
    await superAdmin.agent.get('/api/admin/users').expect(200);
  });

  it('creates a product with a variant and publishes it to the storefront', async () => {
    const colors = await superAdmin.agent.get('/api/admin/colors').expect(200);
    const storages = await superAdmin.agent.get('/api/admin/storages').expect(200);

    const product = await superAdmin.agent
      .post('/api/admin/products')
      .set('x-csrf-token', superAdmin.csrf)
      .send({
        slug: 'iphone-test-pro',
        name: 'آیفون تست پرو',
        nameEn: 'iPhone Test Pro',
        model: 'iPhone Test Pro',
        series: 'iPhone Test',
        releaseYear: 2026,
        description: 'محصول آزمایشی برای تست پنل مدیریت و فروشگاه.',
        warranty: '۱۸ ماه گارانتی',
        registryStatus: 'REGISTERED',
        basePrice: 100_000_000,
        specs: [{ key: 'نمایشگر', value: '۶.۳ اینچ' }],
      })
      .expect(201);

    const variant = await superAdmin.agent
      .post(`/api/admin/products/${product.body.id}/variants`)
      .set('x-csrf-token', superAdmin.csrf)
      .send({
        colorId: colors.body[0].id,
        storageId: storages.body[1].id,
        sku: 'TEST-PRO-256-BLK',
        price: 100_000_000,
        compareAtPrice: 110_000_000,
        shippingTime: 'ONE_TO_TWO_DAYS',
        stock: 4,
      })
      .expect(201);

    expect(variant.body.discountPercent).toBe(9);
    expect(variant.body.availableStock).toBe(4);

    const storefront = await ctx.http().get('/api/products/iphone-test-pro').expect(200);
    expect(storefront.body.variants).toHaveLength(1);
    expect(storefront.body.variants[0].discountPercent).toBe(9);

    const audit = await superAdmin.agent.get('/api/admin/audit-logs?entityType=Product').expect(200);
    expect(audit.body.items.some((log: { action: string }) => log.action === 'product.create')).toBe(true);
  });

  it('rejects a compareAtPrice below the sale price', async () => {
    const products = await superAdmin.agent.get('/api/admin/products?pageSize=1').expect(200);
    const detail = await superAdmin.agent.get(`/api/admin/products/${products.body.items[0].id}`).expect(200);
    const response = await superAdmin.agent
      .patch(`/api/admin/variants/${detail.body.variants[0].id}`)
      .set('x-csrf-token', superAdmin.csrf)
      .send({ price: 100_000_000, compareAtPrice: 90_000_000 })
      .expect(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('adjusts inventory and records the movement', async () => {
    const variants = await warehouse.agent.get('/api/admin/variants?pageSize=1').expect(200);
    const variantId = variants.body.items[0].id;

    const adjusted = await warehouse.agent
      .post(`/api/admin/inventory/${variantId}/adjust`)
      .set('x-csrf-token', warehouse.csrf)
      .send({ mode: 'set', value: 12, reason: 'شمارش انبار' })
      .expect(201);
    expect(adjusted.body.stock).toBe(12);

    const delta = await warehouse.agent
      .post(`/api/admin/inventory/${variantId}/adjust`)
      .set('x-csrf-token', warehouse.csrf)
      .send({ mode: 'delta', value: -2, reason: 'مرجوعی معیوب' })
      .expect(201);
    expect(delta.body.stock).toBe(10);

    const movements = await warehouse.agent.get(`/api/admin/inventory/${variantId}/movements`).expect(200);
    expect(movements.body.items.length).toBeGreaterThanOrEqual(2);
  });

  it('refuses to drop stock below what is reserved', async () => {
    const customer = await loginWithProfile(ctx, '09126660001');
    const addressId = await defaultAddress(customer);
    const methods = await ctx.http().get('/api/shipping/methods?province=تهران&subtotal=0').expect(200);
    const detail = await ctx.http().get('/api/products/iphone-17').expect(200);
    const variant = detail.body.variants.find((v: { availableStock: number }) => v.availableStock >= 5);

    await customer.agent
      .post('/api/cart')
      .set('x-csrf-token', customer.csrf)
      .send({ variantId: variant.id, quantity: 3 })
      .expect(201);
    await startCheckout(customer, {
      addressId,
      shippingMethodId: methods.body.find((m: { available: boolean }) => m.available).id,
    }).expect(201);

    const response = await warehouse.agent
      .post(`/api/admin/inventory/${variant.id}/adjust`)
      .set('x-csrf-token', warehouse.csrf)
      .send({ mode: 'set', value: 1, reason: 'اصلاح' })
      .expect(400);
    expect(response.body.code).toBe('STOCK_BELOW_RESERVED');
  });

  it('moves a paid order through fulfilment and blocks illegal jumps', async () => {
    const customer = await loginWithProfile(ctx, '09126660002');
    const addressId = await defaultAddress(customer);
    const methods = await ctx.http().get('/api/shipping/methods?province=تهران&subtotal=0').expect(200);
    const detail = await ctx.http().get('/api/products/iphone-17').expect(200);
    const variant = detail.body.variants.find((v: { availableStock: number }) => v.availableStock >= 5);

    await customer.agent
      .post('/api/cart')
      .set('x-csrf-token', customer.csrf)
      .send({ variantId: variant.id, quantity: 1 })
      .expect(201);
    const checkout = await startCheckout(customer, {
      addressId,
      shippingMethodId: methods.body.find((m: { available: boolean }) => m.available).id,
    }).expect(201);
    const payment = await ctx.prisma.payment.findFirstOrThrow({ where: { orderId: checkout.body.order.id } });
    await completeMockPayment(ctx, customer, payment.providerRef as string, 'SUCCESS');

    const orderId = checkout.body.order.id;
    const illegal = await superAdmin.agent
      .patch(`/api/admin/orders/${orderId}`)
      .set('x-csrf-token', superAdmin.csrf)
      .send({ status: 'DELIVERED' })
      .expect(409);
    expect(illegal.body.code).toBe('INVALID_TRANSITION');

    for (const status of ['PROCESSING', 'READY_TO_SHIP', 'SHIPPED', 'DELIVERED']) {
      const response = await superAdmin.agent
        .patch(`/api/admin/orders/${orderId}`)
        .set('x-csrf-token', superAdmin.csrf)
        .send({ status, trackingCode: status === 'SHIPPED' ? 'TRK-123' : undefined })
        .expect(200);
      expect(response.body.status).toBe(status);
    }

    const order = await superAdmin.agent.get(`/api/admin/orders/${orderId}`).expect(200);
    expect(order.body.history.map((h: { toStatus: string }) => h.toStatus)).toEqual([
      'PENDING',
      'PAID',
      'PROCESSING',
      'READY_TO_SHIP',
      'SHIPPED',
      'DELIVERED',
    ]);
    expect(order.body.trackingCode).toBe('TRK-123');
  });

  it('refunds and restocks when an admin cancels a paid order', async () => {
    const customer = await loginWithProfile(ctx, '09126660003');
    const addressId = await defaultAddress(customer);
    const methods = await ctx.http().get('/api/shipping/methods?province=تهران&subtotal=0').expect(200);
    const detail = await ctx.http().get('/api/products/iphone-17').expect(200);
    const variant = detail.body.variants.find((v: { availableStock: number }) => v.availableStock >= 5);
    const before = await stockOf(ctx.prisma, variant.id);

    await customer.agent
      .post('/api/cart')
      .set('x-csrf-token', customer.csrf)
      .send({ variantId: variant.id, quantity: 2 })
      .expect(201);
    const checkout = await startCheckout(customer, {
      addressId,
      shippingMethodId: methods.body.find((m: { available: boolean }) => m.available).id,
    }).expect(201);
    const payment = await ctx.prisma.payment.findFirstOrThrow({ where: { orderId: checkout.body.order.id } });
    await completeMockPayment(ctx, customer, payment.providerRef as string, 'SUCCESS');

    // The warehouse role may not cancel a paid order (no refund permission).
    await warehouse.agent
      .patch(`/api/admin/orders/${checkout.body.order.id}`)
      .set('x-csrf-token', warehouse.csrf)
      .send({ status: 'CANCELLED', note: 'تست' })
      .expect(403);

    await superAdmin.agent
      .patch(`/api/admin/orders/${checkout.body.order.id}`)
      .set('x-csrf-token', superAdmin.csrf)
      .send({ status: 'CANCELLED', note: 'انصراف مشتری' })
      .expect(200);

    const stock = await stockOf(ctx.prisma, variant.id);
    expect(stock.stock).toBe(before.stock);
    expect(stock.sold).toBe(0);
    const refunded = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(['REFUNDED', 'REFUND_PENDING']).toContain(refunded.status);
  });

  it('shows dashboard figures and low stock', async () => {
    const response = await superAdmin.agent.get('/api/admin/dashboard').expect(200);
    expect(response.body).toMatchObject({
      today: expect.any(Object),
      last30Days: expect.any(Object),
      ordersByStatus: expect.any(Array),
      lowStock: expect.any(Array),
    });
    expect(
      response.body.lowStock.every(
        (row: { available: number; threshold: number }) => row.available <= row.threshold,
      ),
    ).toBe(true);
  });

  it('blocks a customer and ends their sessions', async () => {
    const customer = await loginWithProfile(ctx, '09126660004');
    const users = await superAdmin.agent.get('/api/admin/users?q=09126660004').expect(200);
    const userId = users.body.items[0].id;

    await superAdmin.agent
      .patch(`/api/admin/users/${userId}`)
      .set('x-csrf-token', superAdmin.csrf)
      .send({ isActive: false })
      .expect(200);

    await customer.agent.get('/api/users/me').expect(401);
  });

  it('manages coupons and shipping methods', async () => {
    const discounts = await superAdmin.agent.get('/api/admin/discounts').expect(200);
    expect(discounts.body.items.length).toBeGreaterThan(0);

    const coupon = await superAdmin.agent
      .post('/api/admin/coupons')
      .set('x-csrf-token', superAdmin.csrf)
      .send({ code: 'TEST10', discountId: discounts.body.items[0].id, perUserLimit: 2 })
      .expect(201);
    expect(coupon.body.code).toBe('TEST10');

    const shipping = await superAdmin.agent
      .post('/api/admin/shipping-methods')
      .set('x-csrf-token', superAdmin.csrf)
      .send({
        code: 'test-courier',
        name: 'پیک آزمایشی',
        calculator: 'flat',
        baseCost: 90_000,
        etaLabel: 'یک روز',
        allowedProvinces: [],
      })
      .expect(201);
    expect(shipping.body.code).toBe('test-courier');

    const list = await ctx.http().get('/api/shipping/methods?province=تهران&subtotal=0').expect(200);
    expect(list.body.some((m: { code: string }) => m.code === 'test-courier')).toBe(true);
  });

  it('updates store settings', async () => {
    const settings = await superAdmin.agent.get('/api/admin/settings').expect(200);
    expect(settings.body.store.name).toBe('آیفونی‌ها');

    const updated = await superAdmin.agent
      .patch('/api/admin/settings/store')
      .set('x-csrf-token', superAdmin.csrf)
      .send({ ...settings.body.store, announcement: 'ارسال رایگان تا پایان هفته' })
      .expect(200);
    expect(updated.body.announcement).toBe('ارسال رایگان تا پایان هفته');

    const invalid = await superAdmin.agent
      .patch('/api/admin/settings/store')
      .set('x-csrf-token', superAdmin.csrf)
      .send({ name: '' })
      .expect(400);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');
  });
});
