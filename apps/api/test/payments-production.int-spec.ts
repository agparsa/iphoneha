import { defaultAddress, loginWithProfile } from './utils/actors';
import { resetDb, stockOf } from './utils/db';
import { startCheckout } from './utils/payments';
import { closeTestApp, createTestApp, type TestContext } from './utils/test-app';

const ALL_METHODS = ['ONLINE', 'SNAPPAY', 'TARA', 'DIGIPAY', 'NESIBA', 'BOJET', 'AZKIVAM'];

/**
 * The live store: the mock gateway approves payments without money, so where
 * mocks are not allowed (production) nothing backed by it may be offered,
 * advertised or reachable — including through direct API calls.
 */
describe('Payments where mock payments are not allowed', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    process.env.ALLOW_MOCK_PAYMENTS = 'false';
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await closeTestApp(ctx);
    delete process.env.ALLOW_MOCK_PAYMENTS;
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma, ctx.redis);
  });

  it('offers no mock-backed payment method', async () => {
    const { body } = await ctx.http().get('/api/payments/methods?amount=50000000').expect(200);
    expect(body).toEqual([]);
    const terms = await ctx.http().get('/api/payments/installment-terms').expect(200);
    expect(terms.body).toEqual([]);
  });

  it('advertises no installment service anywhere on the storefront', async () => {
    const config = await ctx.http().get('/api/storefront/config').expect(200);
    expect(config.body.installments).toEqual([]);
    expect(config.body.disabledMethods).toEqual(expect.arrayContaining(ALL_METHODS));

    const home = await ctx.http().get('/api/storefront/home').expect(200);
    expect(home.body.stats.installmentServices).toBe(0);
    for (const card of [...home.body.featured, ...home.body.discounted]) {
      expect(card.monthlyFrom ?? null).toBeNull();
    }
  });

  it('serves no mock gateway page', async () => {
    await ctx.http().get('/api/payments/mock/some-token').expect(404);
    await ctx
      .http()
      .post('/api/payments/mock/some-token/complete')
      .type('form')
      .send({ result: 'SUCCESS' })
      .expect(404);
  });

  it('refuses a checkout with a mock-backed method before any order or reservation exists', async () => {
    const actor = await loginWithProfile(ctx, '09123330999');
    const addressId = await defaultAddress(actor);
    const methods = await ctx.http().get('/api/shipping/methods?province=تهران&subtotal=0').expect(200);
    const shippingMethodId = methods.body.find((m: { available: boolean }) => m.available).id;
    const detail = await ctx.http().get('/api/products/iphone-17').expect(200);
    const variant = detail.body.variants.find((v: { availableStock: number }) => v.availableStock > 0);
    await actor.agent
      .post('/api/cart')
      .set('x-csrf-token', actor.csrf)
      .send({ variantId: variant.id, quantity: 1 });

    const response = await startCheckout(actor, {
      addressId,
      shippingMethodId,
      paymentMethod: 'ONLINE',
    }).expect(400);
    expect(response.body.code).toBe('PAYMENT_METHOD_DISABLED');

    expect(await ctx.prisma.order.count()).toBe(0);
    expect((await stockOf(ctx.prisma, variant.id)).reserved).toBe(0);
  });
});
