import { defaultAddress, loginWithProfile, type Actor } from './utils/actors';
import { resetDb, setStock, stockOf } from './utils/db';
import { completeMockPayment, startCheckout } from './utils/payments';
import { closeTestApp, createTestApp, type TestContext } from './utils/test-app';
import { OrdersService } from '../src/modules/orders/orders.service';

describe('Payments', () => {
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
    actor = await loginWithProfile(ctx, '09124440001');
    addressId = await defaultAddress(actor);
    const methods = await ctx.http().get('/api/shipping/methods?province=تهران&subtotal=0').expect(200);
    shippingMethodId = methods.body.find((m: { available: boolean }) => m.available).id;
    const detail = await ctx.http().get('/api/products/iphone-17').expect(200);
    variantId = detail.body.variants.find((v: { availableStock: number }) => v.availableStock >= 5).id;
  });

  const checkout = async (quantity = 1, paymentMethod = 'ONLINE') => {
    await actor.agent
      .post('/api/cart')
      .set('x-csrf-token', actor.csrf)
      .send({ variantId, quantity })
      .expect(201);
    const response = await startCheckout(actor, { addressId, shippingMethodId, paymentMethod }).expect(201);
    const payment = await ctx.prisma.payment.findFirstOrThrow({
      where: { orderId: response.body.order.id },
      orderBy: { createdAt: 'desc' },
    });
    return { order: response.body.order, payment };
  };

  it('marks the order paid and turns the reservation into a sale', async () => {
    const before = await stockOf(ctx.prisma, variantId);
    const { order, payment } = await checkout(2);

    await completeMockPayment(ctx, actor, payment.providerRef as string, 'SUCCESS');

    const stored = await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(stored.status).toBe('PAID');
    expect(stored.paidAt).toBeTruthy();

    const stock = await stockOf(ctx.prisma, variantId);
    expect(stock.stock).toBe(before.stock - 2);
    expect(stock.reserved).toBe(0);
    expect(stock.sold).toBe(2);

    const movements = await ctx.prisma.inventoryMovement.findMany({ where: { orderId: order.id } });
    expect(movements.map((m) => m.type).sort()).toEqual(['RESERVE', 'SALE']);

    const result = await actor.agent.get(`/api/payments/result/${order.orderNumber}`).expect(200);
    expect(result.body).toMatchObject({ success: true, paymentStatus: 'SUCCEEDED' });
  });

  it('processes a duplicate callback exactly once', async () => {
    const before = await stockOf(ctx.prisma, variantId);
    const { order, payment } = await checkout(1);

    await completeMockPayment(ctx, actor, payment.providerRef as string, 'SUCCESS');
    await completeMockPayment(ctx, actor, payment.providerRef as string, 'SUCCESS');
    await actor.agent
      .post('/api/payments/verify')
      .set('x-csrf-token', actor.csrf)
      .send({ paymentId: payment.id })
      .expect(201);

    const stock = await stockOf(ctx.prisma, variantId);
    expect(stock.stock).toBe(before.stock - 1);
    expect(stock.sold).toBe(1);

    const sales = await ctx.prisma.inventoryMovement.count({ where: { orderId: order.id, type: 'SALE' } });
    expect(sales).toBe(1);

    const payments = await ctx.prisma.payment.findMany({ where: { orderId: order.id, status: 'SUCCEEDED' } });
    expect(payments).toHaveLength(1);
  });

  it('cancels the order and frees the stock when the payment fails', async () => {
    const before = await stockOf(ctx.prisma, variantId);
    const { order, payment } = await checkout(2);

    await completeMockPayment(ctx, actor, payment.providerRef as string, 'FAILED');

    const stored = await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(stored.status).toBe('CANCELLED');

    const stock = await stockOf(ctx.prisma, variantId);
    expect(stock).toMatchObject({ stock: before.stock, reserved: 0, sold: 0 });

    const stored_payment = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(stored_payment.status).toBe('FAILED');
  });

  it('treats a cancelled payment the same way', async () => {
    const { order, payment } = await checkout(1);
    await completeMockPayment(ctx, actor, payment.providerRef as string, 'CANCELLED');
    const stored = await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(stored.status).toBe('CANCELLED');
    expect(stored.cancelReason).toContain('لغو');
  });

  it('honours a payment that arrives after the order expired, when stock allows', async () => {
    const before = await stockOf(ctx.prisma, variantId);
    const { order, payment } = await checkout(1);

    await ctx.prisma.order.update({
      where: { id: order.id },
      data: { reservationExpiresAt: new Date(Date.now() - 60_000) },
    });
    const orders = ctx.app.get(OrdersService);
    await orders.expireOrder(order.id);
    expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('CANCELLED');

    await completeMockPayment(ctx, actor, payment.providerRef as string, 'SUCCESS');

    const stored = await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(stored.status).toBe('PAID');
    const stock = await stockOf(ctx.prisma, variantId);
    expect(stock.stock).toBe(before.stock - 1);
  });

  it('refunds a late payment when the stock is gone', async () => {
    const { order, payment } = await checkout(1);
    await ctx.prisma.order.update({
      where: { id: order.id },
      data: { reservationExpiresAt: new Date(Date.now() - 60_000) },
    });
    await ctx.app.get(OrdersService).expireOrder(order.id);

    // Someone else took the remaining stock in the meantime.
    await setStock(ctx.prisma, variantId, 0);

    await completeMockPayment(ctx, actor, payment.providerRef as string, 'SUCCESS');

    const stored = await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(stored.status).toBe('CANCELLED');
    const storedPayment = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(['REFUNDED', 'REFUND_PENDING']).toContain(storedPayment.status);
  });

  it('recovers a paid order whose callback never arrived', async () => {
    const { order, payment } = await checkout(1);

    // The customer paid at the gateway but the browser never came back.
    await ctx
      .http()
      .post(`/api/payments/mock/${payment.providerRef}/complete`)
      .type('form')
      .send({ result: 'SUCCESS' })
      .expect(302);

    await ctx.prisma.order.update({
      where: { id: order.id },
      data: { reservationExpiresAt: new Date(Date.now() - 60_000) },
    });

    const result = await ctx.app.get(OrdersService).expireOrder(order.id);
    expect(result).toBe('PAID');
    const stored = await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(stored.status).toBe('PAID');
  });

  it('reuses the open gateway session when the customer retries', async () => {
    const { order, payment } = await checkout(1);
    const again = await actor.agent
      .post('/api/payments/create')
      .set('x-csrf-token', actor.csrf)
      .send({ orderId: order.id })
      .expect(201);
    expect(again.body.payment.id).toBe(payment.id);
    expect(await ctx.prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
  });

  it('refuses an installment method above its credit ceiling', async () => {
    await actor.agent
      .post('/api/cart')
      .set('x-csrf-token', actor.csrf)
      .send({ variantId, quantity: 2 })
      .expect(201);
    const response = await startCheckout(actor, {
      addressId,
      shippingMethodId,
      paymentMethod: 'BOJET',
    }).expect(400);
    expect(response.body.code).toBe('PAYMENT_NOT_ELIGIBLE');
    expect(await ctx.prisma.order.count()).toBe(0);
  });

  it('pays with an installment provider through its own gateway page', async () => {
    const { order, payment } = await checkout(1, 'SNAPPAY');
    expect(payment.provider).toBe('snappay-mock');

    const page = await ctx.http().get(`/api/payments/mock/${payment.providerRef}`).expect(200);
    expect(page.text).toContain('اسنپ‌پی');
    expect(page.text).toContain('پیش‌پرداخت');

    await completeMockPayment(ctx, actor, payment.providerRef as string, 'SUCCESS');
    const stored = await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(stored.status).toBe('PAID');
    expect(stored.paymentMethod).toBe('SNAPPAY');
  });

  it('keeps a full transaction log for every payment', async () => {
    const { payment } = await checkout(1);
    await completeMockPayment(ctx, actor, payment.providerRef as string, 'SUCCESS');
    const transactions = await ctx.prisma.paymentTransaction.findMany({ where: { paymentId: payment.id } });
    const types = transactions.map((t) => t.type);
    expect(types).toContain('CREATE');
    expect(types).toContain('CALLBACK');
    expect(types).toContain('VERIFY');
  });
});
