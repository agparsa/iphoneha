import { anonymous, login } from './utils/actors';
import { resetDb, setStock } from './utils/db';
import { closeTestApp, createTestApp, type TestContext } from './utils/test-app';

describe('Cart', () => {
  let ctx: TestContext;
  let variantId: string;
  let outOfStockVariantId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await closeTestApp(ctx);
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma, ctx.redis);
    const detail = await ctx.http().get('/api/products/iphone-17').expect(200);
    variantId = detail.body.variants.find((v: { availableStock: number }) => v.availableStock >= 5).id;
    outOfStockVariantId = detail.body.variants.find(
      (v: { availableStock: number }) => v.availableStock === 0,
    ).id;
  });

  it('adds, updates and removes items for a guest', async () => {
    const guest = await anonymous(ctx);
    const added = await guest.agent
      .post('/api/cart')
      .set('x-csrf-token', guest.csrf)
      .send({ variantId, quantity: 2 })
      .expect(201);
    expect(added.body.items).toHaveLength(1);
    expect(added.body.summary.itemsCount).toBe(2);
    expect(added.body.summary.total).toBe(added.body.items[0].unitPrice * 2);

    const itemId = added.body.items[0].id;
    const updated = await guest.agent
      .patch(`/api/cart/items/${itemId}`)
      .set('x-csrf-token', guest.csrf)
      .send({ quantity: 3 })
      .expect(200);
    expect(updated.body.summary.itemsCount).toBe(3);

    const removed = await guest.agent
      .delete(`/api/cart/items/${itemId}`)
      .set('x-csrf-token', guest.csrf)
      .expect(200);
    expect(removed.body.items).toHaveLength(0);

    // The guest cart survives between requests thanks to the cookie.
    const fetched = await guest.agent.get('/api/cart').expect(200);
    expect(fetched.body.id).toBe(added.body.id);
  });

  it('refuses out-of-stock variants and caps the quantity', async () => {
    const guest = await anonymous(ctx);
    const outOfStock = await guest.agent
      .post('/api/cart')
      .set('x-csrf-token', guest.csrf)
      .send({ variantId: outOfStockVariantId, quantity: 1 })
      .expect(409);
    expect(outOfStock.body.code).toBe('OUT_OF_STOCK');

    await setStock(ctx.prisma, variantId, 2);
    const added = await guest.agent
      .post('/api/cart')
      .set('x-csrf-token', guest.csrf)
      .send({ variantId, quantity: 5 })
      .expect(201);
    expect(added.body.items[0].quantity).toBe(2);

    const tooMany = await guest.agent
      .patch(`/api/cart/items/${added.body.items[0].id}`)
      .set('x-csrf-token', guest.csrf)
      .send({ quantity: 3 })
      .expect(409);
    expect(tooMany.body.code).toBe('MAX_QUANTITY');
  });

  it('flags items that became unavailable after they were added', async () => {
    const guest = await anonymous(ctx);
    await guest.agent
      .post('/api/cart')
      .set('x-csrf-token', guest.csrf)
      .send({ variantId, quantity: 3 })
      .expect(201);
    await setStock(ctx.prisma, variantId, 1);

    const cart = await guest.agent.get('/api/cart').expect(200);
    expect(cart.body.issues.map((i: { code: string }) => i.code)).toContain('INSUFFICIENT_STOCK');
    expect(cart.body.items[0].isAvailable).toBe(false);
  });

  it('applies and removes a coupon', async () => {
    const actor = await login(ctx, '09122220001');
    await actor.agent
      .post('/api/cart')
      .set('x-csrf-token', actor.csrf)
      .send({ variantId, quantity: 1 })
      .expect(201);

    const applied = await actor.agent
      .post('/api/cart/coupon')
      .set('x-csrf-token', actor.csrf)
      .send({ code: 'welcome5' })
      .expect(201);
    expect(applied.body.couponCode).toBe('WELCOME5');
    expect(applied.body.summary.couponDiscount).toBe(3_000_000); // capped at 3M
    expect(applied.body.summary.total).toBe(applied.body.summary.subtotal - applied.body.summary.discount);

    const invalid = await actor.agent
      .post('/api/cart/coupon')
      .set('x-csrf-token', actor.csrf)
      .send({ code: 'NOPE123' })
      .expect(400);
    expect(invalid.body.code).toBe('INVALID_COUPON');

    const removed = await actor.agent.delete('/api/cart/coupon').set('x-csrf-token', actor.csrf).expect(200);
    expect(removed.body.couponCode).toBeNull();
  });

  it('merges the guest cart into the user cart on login', async () => {
    const guest = await anonymous(ctx);
    await guest.agent
      .post('/api/cart')
      .set('x-csrf-token', guest.csrf)
      .send({ variantId, quantity: 2 })
      .expect(201);

    const phone = '09122220002';
    await ctx.redis.del(`otp:cooldown:USER_LOGIN:${phone}`);
    await guest.agent.post('/api/auth/send-otp').set('x-csrf-token', guest.csrf).send({ phone }).expect(201);
    const code = (await ctx.redis.get(`dev:otp:${phone}`)) as string;
    await guest.agent
      .post('/api/auth/verify-otp')
      .set('x-csrf-token', guest.csrf)
      .send({ phone, code })
      .expect(201);

    const cart = await guest.agent.get('/api/cart').expect(200);
    expect(cart.body.items).toHaveLength(1);
    expect(cart.body.items[0].quantity).toBe(2);

    const carts = await ctx.prisma.cart.count();
    expect(carts).toBe(1);
  });
});
