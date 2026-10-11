import { defaultAddress, loginWithProfile, type Actor } from './utils/actors';
import { resetDb, setStock, stockOf } from './utils/db';
import { startCheckout } from './utils/payments';
import { closeTestApp, createTestApp, type TestContext } from './utils/test-app';
import { OrdersService } from '../src/modules/orders/orders.service';

describe('Checkout & reservations', () => {
  let ctx: TestContext;
  let actor: Actor;
  let addressId: string;
  let shippingMethodId: string;
  let variantId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await closeTestApp(ctx);
  });

  beforeEach(async () => {
    await resetDb(ctx.prisma, ctx.redis);
    actor = await loginWithProfile(ctx, '09123330001');
    addressId = await defaultAddress(actor);
    const methods = await ctx.http().get('/api/shipping/methods?province=تهران&subtotal=0').expect(200);
    shippingMethodId = methods.body.find((m: { available: boolean }) => m.available).id;
    const detail = await ctx.http().get('/api/products/iphone-17').expect(200);
    variantId = detail.body.variants.find((v: { availableStock: number }) => v.availableStock >= 5).id;
  });

  const addToCart = (quantity = 1) =>
    actor.agent.post('/api/cart').set('x-csrf-token', actor.csrf).send({ variantId, quantity }).expect(201);

  it('quotes the order before payment', async () => {
    await addToCart(2);
    const quote = await actor.agent
      .post('/api/checkout/quote')
      .set('x-csrf-token', actor.csrf)
      .send({ addressId })
      .expect(201);

    expect(quote.body.cart.items).toHaveLength(1);
    expect(quote.body.shippingMethods.length).toBeGreaterThan(0);
    expect(quote.body.summary.total).toBe(
      quote.body.summary.subtotal - quote.body.summary.discount + (quote.body.summary.shipping ?? 0),
    );
    expect(quote.body.paymentMethods.some((m: { method: string }) => m.method === 'ONLINE')).toBe(true);
  });

  it('creates the order, reserves stock and empties the cart', async () => {
    await addToCart(2);
    const before = await stockOf(ctx.prisma, variantId);

    const response = await startCheckout(actor, { addressId, shippingMethodId }).expect(201);
    expect(response.body.order.orderNumber).toMatch(/^IH\d{6}$/);
    expect(response.body.order.status).toBe('PAYMENT_PENDING');
    expect(response.body.payment.redirectUrl).toContain('/payments/mock/');

    const after = await stockOf(ctx.prisma, variantId);
    expect(after.stock).toBe(before.stock);
    expect(after.reserved).toBe(before.reserved + 2);
    expect(after.available).toBe(before.available - 2);

    const cart = await actor.agent.get('/api/cart').expect(200);
    expect(cart.body.items).toHaveLength(0);

    const order = await actor.agent.get(`/api/orders/${response.body.order.orderNumber}`).expect(200);
    expect(order.body.items[0].quantity).toBe(2);
    expect(order.body.shippingAddress.city).toBe('تهران');
    expect(order.body.reservationExpiresAt).toBeTruthy();
  });

  it('never creates two orders for the same Idempotency-Key', async () => {
    await addToCart(1);
    const key = 'fixed-key-123456';
    const first = await startCheckout(actor, { addressId, shippingMethodId }, key).expect(201);
    const second = await startCheckout(actor, { addressId, shippingMethodId }, key).expect(201);

    expect(second.body.order.orderNumber).toBe(first.body.order.orderNumber);
    expect(await ctx.prisma.order.count()).toBe(1);
    const reserved = await stockOf(ctx.prisma, variantId);
    expect(reserved.reserved).toBe(1);
  });

  it('rejects a checkout without an Idempotency-Key', async () => {
    await addToCart(1);
    const response = await actor.agent
      .post('/api/checkout')
      .set('x-csrf-token', actor.csrf)
      .send({ addressId, shippingMethodId, paymentMethod: 'ONLINE' })
      .expect(400);
    expect(response.body.code).toBe('IDEMPOTENCY_REQUIRED');
  });

  it('refuses to check out an empty cart', async () => {
    const response = await startCheckout(actor, { addressId, shippingMethodId }).expect(400);
    expect(response.body.code).toBe('EMPTY_CART');
  });

  it('fails cleanly when stock disappears between adding and paying', async () => {
    await addToCart(3);
    await setStock(ctx.prisma, variantId, 1);

    const response = await startCheckout(actor, { addressId, shippingMethodId }).expect(409);
    expect(response.body.code).toBe('CART_NOT_READY');
    expect(await ctx.prisma.order.count()).toBe(0);
    const stock = await stockOf(ctx.prisma, variantId);
    expect(stock.reserved).toBe(0);
  });

  it('consumes the coupon once and releases it when the order is cancelled', async () => {
    await addToCart(1);
    await actor.agent
      .post('/api/cart/coupon')
      .set('x-csrf-token', actor.csrf)
      .send({ code: 'WELCOME5' })
      .expect(201);

    const response = await startCheckout(actor, { addressId, shippingMethodId }).expect(201);
    const coupon = await ctx.prisma.coupon.findUniqueOrThrow({ where: { code: 'WELCOME5' } });
    expect(coupon.usedCount).toBe(1);

    await actor.agent
      .post(`/api/orders/${response.body.order.id}/cancel`)
      .set('x-csrf-token', actor.csrf)
      .expect(201);

    const afterCancel = await ctx.prisma.coupon.findUniqueOrThrow({ where: { code: 'WELCOME5' } });
    expect(afterCancel.usedCount).toBe(0);
    const stock = await stockOf(ctx.prisma, variantId);
    expect(stock.reserved).toBe(0);
  });

  it('lets the customer cancel an unpaid order and releases the reservation', async () => {
    await addToCart(2);
    const before = await stockOf(ctx.prisma, variantId);
    const created = await startCheckout(actor, { addressId, shippingMethodId }).expect(201);

    const cancelled = await actor.agent
      .post(`/api/orders/${created.body.order.id}/cancel`)
      .set('x-csrf-token', actor.csrf)
      .expect(201);
    expect(cancelled.body.status).toBe('CANCELLED');

    const stock = await stockOf(ctx.prisma, variantId);
    expect(stock.reserved).toBe(0);
    expect(stock.stock).toBe(before.stock);
  });

  it('releases the reservation when the payment window expires', async () => {
    await addToCart(2);
    const created = await startCheckout(actor, { addressId, shippingMethodId }).expect(201);
    const orderId = created.body.order.id;

    await ctx.prisma.order.update({
      where: { id: orderId },
      data: { reservationExpiresAt: new Date(Date.now() - 60_000) },
    });
    await ctx.prisma.inventoryReservation.updateMany({
      where: { orderId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const orders = ctx.app.get(OrdersService);
    const result = await orders.expireOrder(orderId);
    expect(result).toBe('CANCELLED');

    const order = await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe('CANCELLED');
    expect(order.cancelReason).toContain('مهلت');
    const stock = await stockOf(ctx.prisma, variantId);
    expect(stock.reserved).toBe(0);

    const payments = await ctx.prisma.payment.findMany({ where: { orderId } });
    expect(payments.every((p) => p.status === 'EXPIRED')).toBe(true);

    // Expiring twice is harmless.
    expect(await orders.expireOrder(orderId)).toBe('SKIPPED');
  });

  it('only lets a customer see their own orders', async () => {
    await addToCart(1);
    const created = await startCheckout(actor, { addressId, shippingMethodId }).expect(201);

    const other = await loginWithProfile(ctx, '09123330002');
    await other.agent.get(`/api/orders/${created.body.order.orderNumber}`).expect(404);
    await other.agent
      .post(`/api/orders/${created.body.order.id}/cancel`)
      .set('x-csrf-token', other.csrf)
      .expect(404);
  });
});
