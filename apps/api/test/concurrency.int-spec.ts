import { defaultAddress, loginWithProfile, type Actor } from './utils/actors';
import { resetDb, setStock, stockOf } from './utils/db';
import { startCheckout } from './utils/payments';
import { closeTestApp, createTestApp, type TestContext } from './utils/test-app';

/**
 * The scenario the whole reservation design exists for: two customers racing
 * for the last unit. Exactly one order may be created.
 */
describe('Concurrent checkout', () => {
  let ctx: TestContext;
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
    const methods = await ctx.http().get('/api/shipping/methods?province=تهران&subtotal=0').expect(200);
    shippingMethodId = methods.body.find((m: { available: boolean }) => m.available).id;
    const detail = await ctx.http().get('/api/products/iphone-17').expect(200);
    variantId = detail.body.variants.find((v: { availableStock: number }) => v.availableStock >= 5).id;
  });

  async function shopper(phone: string, quantity: number): Promise<{ actor: Actor; addressId: string }> {
    const actor = await loginWithProfile(ctx, phone);
    const addressId = await defaultAddress(actor);
    await actor.agent
      .post('/api/cart')
      .set('x-csrf-token', actor.csrf)
      .send({ variantId, quantity })
      .expect(201);
    return { actor, addressId };
  }

  it('lets only one of two simultaneous buyers take the last unit', async () => {
    await setStock(ctx.prisma, variantId, 1);
    const [first, second] = await Promise.all([shopper('09125550001', 1), shopper('09125550002', 1)]);

    const results = await Promise.all([
      startCheckout(first.actor, { addressId: first.addressId, shippingMethodId }),
      startCheckout(second.actor, { addressId: second.addressId, shippingMethodId }),
    ]);

    const created = results.filter((r) => r.status === 201);
    const rejected = results.filter((r) => r.status !== 201);
    expect(created).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.body.code).toMatch(/INSUFFICIENT_STOCK|CART_NOT_READY/);

    const stock = await stockOf(ctx.prisma, variantId);
    expect(stock.reserved).toBe(1);
    expect(stock.available).toBe(0);
    expect(await ctx.prisma.order.count()).toBe(1);
  });

  it('keeps the reservation consistent with five racing buyers and three units', async () => {
    await setStock(ctx.prisma, variantId, 3);
    const shoppers = await Promise.all(
      ['09125550011', '09125550012', '09125550013', '09125550014', '09125550015'].map((phone) =>
        shopper(phone, 1),
      ),
    );

    const results = await Promise.all(
      shoppers.map((s) => startCheckout(s.actor, { addressId: s.addressId, shippingMethodId })),
    );

    const created = results.filter((r) => r.status === 201);
    expect(created).toHaveLength(3);

    const stock = await stockOf(ctx.prisma, variantId);
    expect(stock.reserved).toBe(3);
    expect(stock.available).toBe(0);
    expect(await ctx.prisma.order.count()).toBe(3);

    const reservations = await ctx.prisma.inventoryReservation.aggregate({
      where: { status: 'ACTIVE' },
      _sum: { quantity: true },
    });
    expect(reservations._sum.quantity).toBe(3);
  });

  it('rejects a parallel double-submit from the same customer', async () => {
    await setStock(ctx.prisma, variantId, 5);
    const { actor, addressId } = await shopper('09125550021', 2);

    const [a, b] = await Promise.all([
      startCheckout(actor, { addressId, shippingMethodId }, 'double-submit-1'),
      startCheckout(actor, { addressId, shippingMethodId }, 'double-submit-2'),
    ]);

    const created = [a, b].filter((r) => r.status === 201);
    expect(created).toHaveLength(1);
    expect(await ctx.prisma.order.count()).toBe(1);
    const stock = await stockOf(ctx.prisma, variantId);
    expect(stock.reserved).toBe(2);
  });

  it('never lets the database go below zero available stock', async () => {
    await setStock(ctx.prisma, variantId, 2);
    const shoppers = await Promise.all(
      ['09125550031', '09125550032', '09125550033'].map((phone) => shopper(phone, 2)),
    );
    await Promise.all(
      shoppers.map((s) => startCheckout(s.actor, { addressId: s.addressId, shippingMethodId })),
    );

    const inventory = await ctx.prisma.inventory.findUniqueOrThrow({ where: { variantId } });
    expect(inventory.reserved).toBeLessThanOrEqual(inventory.stock);
    expect(inventory.reserved).toBe(2);
  });
});
