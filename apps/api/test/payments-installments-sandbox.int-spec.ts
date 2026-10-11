import { defaultAddress, loginAdmin, loginWithProfile, type Actor } from './utils/actors';
import { resetDb } from './utils/db';
import { startCheckout } from './utils/payments';
import { closeTestApp, createTestApp, type TestContext } from './utils/test-app';
import { FakeAzkiVam, FakeDigipay, FakeSnappPay, interceptInstallmentApis } from './utils/fake-installments';

/** SnapPay's own test environment — the address `sandbox` uses when none is set. */
const SNAPP_STAGING = 'fms-gateway-staging.apps.public.okd4.teh-1.snappcloud.io';
const OWNER = '09120000000'; // an active admin in the test database

/**
 * Production as it is while a service's test keys are being tried: no mock
 * payments; SnapPay on its test environment; AzkiVam switched to `live` but
 * pointed at a test address by mistake; Tara switched to `sandbox` without the
 * test address Tara would have to hand out (it publishes none).
 */
const SANDBOX_ENV: Record<string, string> = {
  ALLOW_MOCK_PAYMENTS: 'false',
  PAYMENT_SNAPPAY_DRIVER: 'sandbox',
  SNAPPAY_CLIENT_ID: 'iphoneha',
  SNAPPAY_CLIENT_SECRET: 'staging-client-secret-7f3a',
  SNAPPAY_USERNAME: 'iphoneha-purchase',
  SNAPPAY_PASSWORD: 'staging-password-91c2',
  PAYMENT_TARA_DRIVER: 'sandbox',
  TARA_USERNAME: 'iphoneha-tara',
  TARA_PASSWORD: 'tara-test-password-55d1',
  TARA_SERVICE_ID: '4410',
  PAYMENT_AZKIVAM_DRIVER: 'live',
  AZKIVAM_BASE_URL: 'https://sandbox.azkivam.example',
  AZKIVAM_MERCHANT_ID: '12345',
  AZKIVAM_API_KEY: '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff',
};

describe('An installment service on its test environment, in production', () => {
  let ctx: TestContext;
  let snapp: FakeSnappPay;
  let digipay: FakeDigipay;
  let azki: FakeAzkiVam;
  let shippingMethodId: string;
  let variantId: string;

  beforeAll(async () => {
    Object.assign(process.env, SANDBOX_ENV);
    interceptInstallmentApis(
      { snapp: [SNAPP_STAGING], digipay: [], azki: ['sandbox.azkivam.example'] },
      () => ({ snapp, digipay, azki }),
    );
    ctx = await createTestApp();
  });

  afterAll(async () => {
    // the other suites log in as this admin
    await ctx.prisma.adminUser.update({ where: { phone: OWNER }, data: { isActive: true } });
    await closeTestApp(ctx);
    jest.restoreAllMocks();
    for (const key of Object.keys(SANDBOX_ENV)) delete process.env[key];
  });

  beforeEach(async () => {
    snapp = new FakeSnappPay();
    digipay = new FakeDigipay();
    azki = new FakeAzkiVam();
    await resetDb(ctx.prisma, ctx.redis);
    await ctx.prisma.adminUser.update({ where: { phone: OWNER }, data: { isActive: true } });
    const methods = await ctx.http().get('/api/shipping/methods?province=تهران&subtotal=0').expect(200);
    shippingMethodId = methods.body.find((m: { available: boolean }) => m.available).id;
    const detail = await ctx.http().get('/api/products/iphone-17').expect(200);
    variantId = detail.body.variants.find((v: { availableStock: number }) => v.availableStock >= 5).id;
  });

  /** A signed-in buyer with one phone in the cart, at the payment step. */
  const buyer = async (phone: string) => {
    const actor = await loginWithProfile(ctx, phone);
    const addressId = await defaultAddress(actor);
    await actor.agent
      .post('/api/cart')
      .set('x-csrf-token', actor.csrf)
      .send({ variantId, quantity: 1 })
      .expect(201);
    const quote = await actor.agent
      .post('/api/checkout/quote')
      .set('x-csrf-token', actor.csrf)
      .send({ addressId })
      .expect(201);
    return {
      actor,
      addressId,
      offered: quote.body.paymentMethods as { method: string; name: string; tagline: string }[],
    };
  };
  const pay = (actor: Actor, addressId: string, paymentMethod: string) =>
    startCheckout(actor, { addressId, shippingMethodId, paymentMethod });

  it('is never shown to customers, never advertised, and refused when asked for directly', async () => {
    expect((await ctx.http().get('/api/payments/methods?amount=50000000').expect(200)).body).toEqual([]);
    const config = await ctx.http().get('/api/storefront/config').expect(200);
    expect(config.body.installments).toEqual([]);

    const { actor, addressId, offered } = await buyer('09124440888');
    expect(offered).toEqual([]);
    const refused = await pay(actor, addressId, 'SNAPPAY').expect(400);
    expect(refused.body.code).toBe('PAYMENT_METHOD_DISABLED');
    expect(snapp.calls).toEqual([]); // SnapPay was never even asked
  });

  it('is offered to the staff, marked as a test, and runs end to end on the test environment', async () => {
    const { actor, addressId, offered } = await buyer(OWNER);
    // AzkiVam is `live` on a test address: offered to nobody, staff included
    expect(offered).toEqual([
      expect.objectContaining({
        method: 'SNAPPAY',
        name: 'اسنپ‌پی (آزمایشی)',
        tagline: expect.stringContaining('آزمایشی'),
      }),
    ]);

    const response = await pay(actor, addressId, 'SNAPPAY').expect(201);
    const payment = await ctx.prisma.payment.findFirstOrThrow({ where: { orderId: response.body.order.id } });
    expect(payment.provider).toBe('snappay-sandbox');
    expect(response.body.payment.redirectUrl).toBe(
      `https://payment.snapppay.example/?paymentToken=${payment.providerRef}`,
    );

    const opened = snapp.payments.get(payment.providerRef!)!;
    snapp.pay(payment.providerRef!);
    const back = await ctx
      .http()
      .post(`/api/payments/callback/snappay-sandbox/${payment.id}`)
      .type('form')
      .send({ transactionId: opened.transactionId, state: 'OK', amount: String(opened.amount) })
      .expect(302);
    expect(back.headers.location).toContain('status=success');
    expect(opened.status).toBe('SETTLE');
    expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: payment.orderId } })).status).toBe(
      'PAID',
    );
    expect(azki.tickets.size).toBe(0);
  });

  it('tells the panel how each method is connected, without a single key', async () => {
    const admin = await loginAdmin(ctx, OWNER);
    const { body } = await admin.agent.get('/api/admin/payment-connections').expect(200);
    const state = Object.fromEntries(body.map((c: { method: string; state: string }) => [c.method, c.state]));
    expect(state).toEqual({
      ONLINE: 'OFF',
      SNAPPAY: 'TEST',
      TARA: 'INCOMPLETE',
      DIGIPAY: 'OFF',
      NESIBA: 'OFF',
      BOJET: 'OFF',
      AZKIVAM: 'INCOMPLETE',
    });
    expect(body.find((c: { method: string }) => c.method === 'SNAPPAY').detail).toBe(
      `https://${SNAPP_STAGING}`,
    );
    expect(body.find((c: { method: string }) => c.method === 'AZKIVAM').detail).toMatch(
      /^AZKIVAM_BASE_URL \(a test address/,
    );
    expect(body.find((c: { method: string }) => c.method === 'TARA').detail).toMatch(
      /^TARA_BASE_URL \(this service has no public test environment/,
    );
    const text = JSON.stringify(body);
    for (const secret of [
      SANDBOX_ENV.SNAPPAY_CLIENT_SECRET,
      SANDBOX_ENV.SNAPPAY_PASSWORD,
      SANDBOX_ENV.TARA_PASSWORD,
      SANDBOX_ENV.AZKIVAM_API_KEY,
    ]) {
      expect(text).not.toContain(`"${secret}"`);
      expect(text).not.toContain(secret!.slice(0, 16));
    }
  });

  it('is no longer offered once that admin is deactivated', async () => {
    await ctx.prisma.adminUser.update({ where: { phone: OWNER }, data: { isActive: false } });
    const { actor, addressId, offered } = await buyer(OWNER);
    expect(offered).toEqual([]);
    await pay(actor, addressId, 'SNAPPAY').expect(400);
  });
});
