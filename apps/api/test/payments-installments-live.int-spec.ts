import { defaultAddress, loginAdmin, loginWithProfile, type Actor } from './utils/actors';
import { resetDb, stockOf } from './utils/db';
import { startCheckout } from './utils/payments';
import { closeTestApp, createTestApp, type TestContext } from './utils/test-app';
import { OrdersService } from '../src/modules/orders/orders.service';
import {
  FakeAzkiVam,
  FakeBajet,
  FakeDigipay,
  FakeSnappPay,
  FakeTara,
  interceptInstallmentApis,
} from './utils/fake-installments';

const AZKI_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';

const LIVE_ENV: Record<string, string> = {
  ALLOW_MOCK_PAYMENTS: 'false',
  PAYMENT_SNAPPAY_DRIVER: 'live',
  SNAPPAY_BASE_URL: 'https://snapppay.example',
  SNAPPAY_CLIENT_ID: 'iphoneha',
  SNAPPAY_CLIENT_SECRET: 'secret',
  SNAPPAY_USERNAME: 'iphoneha-purchase',
  SNAPPAY_PASSWORD: 'pw',
  PAYMENT_DIGIPAY_DRIVER: 'live',
  DIGIPAY_BASE_URL: 'https://digipay.example/digipay/api',
  DIGIPAY_CLIENT_ID: 'cid',
  DIGIPAY_CLIENT_SECRET: 'csecret',
  DIGIPAY_USERNAME: 'iphoneha-upg',
  DIGIPAY_PASSWORD: 'pw',
  PAYMENT_AZKIVAM_DRIVER: 'live',
  AZKIVAM_BASE_URL: 'https://azki.example',
  AZKIVAM_MERCHANT_ID: '12345',
  AZKIVAM_API_KEY: AZKI_KEY,
  PAYMENT_TARA_DRIVER: 'live',
  TARA_BASE_URL: 'https://pay.tara.example/pay',
  TARA_USERNAME: 'iphoneha-tara',
  TARA_PASSWORD: 'tara-pw',
  TARA_SERVICE_ID: '4410',
  TARA_GROUP_CODE: '12',
  PAYMENT_BOJET_DRIVER: 'live',
  BAJET_BASE_URL: 'https://jetpay.bajet.example',
  BAJET_USERNAME: 'iphoneha-bajet',
  BAJET_PASSWORD: 'bajet-pw',
  BAJET_TERMINAL_ID: '880011',
};

describe('Installment services connected for real', () => {
  let ctx: TestContext;
  let snapp: FakeSnappPay;
  let digipay: FakeDigipay;
  let azki: FakeAzkiVam;
  let tara: FakeTara;
  let bajet: FakeBajet;
  let actor: Actor;
  let addressId: string;
  let shippingMethodId: string;
  let variantId: string;

  beforeAll(async () => {
    Object.assign(process.env, LIVE_ENV);
    interceptInstallmentApis(
      {
        snapp: ['snapppay.example'],
        digipay: ['digipay.example'],
        azki: ['azki.example'],
        tara: ['pay.tara.example'],
        bajet: ['jetpay.bajet.example'],
      },
      () => ({ snapp, digipay, azki, tara, bajet }),
    );
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(ctx);
    jest.restoreAllMocks();
    for (const key of Object.keys(LIVE_ENV)) delete process.env[key];
  });

  beforeEach(async () => {
    snapp = new FakeSnappPay();
    digipay = new FakeDigipay();
    azki = new FakeAzkiVam();
    tara = new FakeTara();
    bajet = new FakeBajet();
    await resetDb(ctx.prisma, ctx.redis);
    actor = await loginWithProfile(ctx, '09124440888');
    addressId = await defaultAddress(actor);
    const methods = await ctx.http().get('/api/shipping/methods?province=تهران&subtotal=0').expect(200);
    shippingMethodId = methods.body.find((m: { available: boolean }) => m.available).id;
    const detail = await ctx.http().get('/api/products/iphone-17').expect(200);
    variantId = detail.body.variants.find((v: { availableStock: number }) => v.availableStock >= 5).id;
  });

  const checkout = async (paymentMethod: 'SNAPPAY' | 'TARA' | 'DIGIPAY' | 'BOJET' | 'AZKIVAM') => {
    await actor.agent
      .post('/api/cart')
      .set('x-csrf-token', actor.csrf)
      .send({ variantId, quantity: 1 })
      .expect(201);
    const response = await startCheckout(actor, { addressId, shippingMethodId, paymentMethod }).expect(201);
    const payment = await ctx.prisma.payment.findFirstOrThrow({ where: { orderId: response.body.order.id } });
    return {
      order: response.body.order as { id: string; orderNumber: string; total: number },
      payment,
      response: response.body,
    };
  };
  const orderStatus = async (id: string) =>
    (await ctx.prisma.order.findUniqueOrThrow({ where: { id } })).status;
  /** The default terms of a service cap its credit (Bajet: 100M Toman); the test phone costs more. */
  const liftCeiling = async (method: string) => {
    const admin = await loginAdmin(ctx, '09120000000');
    const settings = await admin.agent.get('/api/admin/settings').expect(200);
    const payments = settings.body.payments as {
      disabledMethods: string[];
      installmentTerms: { method: string; maxCredit: number }[];
    };
    await admin.agent
      .patch('/api/admin/settings/payments')
      .set('x-csrf-token', admin.csrf)
      .send({
        disabledMethods: payments.disabledMethods,
        installmentTerms: payments.installmentTerms.map((t) =>
          t.method === method ? { ...t, maxCredit: 0 } : t,
        ),
      })
      .expect(200);
  };

  it('offers exactly the services that are connected, and says so on the storefront', async () => {
    const { body } = await ctx.http().get('/api/payments/methods?amount=50000000').expect(200);
    expect(body.map((m: { method: string }) => m.method)).toEqual([
      'SNAPPAY',
      'TARA',
      'DIGIPAY',
      'BOJET',
      'AZKIVAM',
    ]);
    expect(snapp.calls).toContain('GET /offer/v1/eligible');

    const config = await ctx.http().get('/api/storefront/config').expect(200);
    expect(config.body.installments.map((t: { method: string }) => t.method)).toEqual([
      'SNAPPAY',
      'TARA',
      'DIGIPAY',
      'BOJET',
      'AZKIVAM',
    ]);
  });

  it('SnappPay: the customer comes back by POST and the order is paid only after verify and settle', async () => {
    const before = await stockOf(ctx.prisma, variantId);
    const { order, payment, response } = await checkout('SNAPPAY');
    expect(payment.provider).toBe('snappay-live');
    expect(response.payment.redirectUrl).toBe(
      `https://payment.snapppay.example/?paymentToken=${payment.providerRef}`,
    );
    const opened = snapp.payments.get(payment.providerRef!)!;
    expect(opened.amount).toBe(Number(payment.amount) * 10);

    snapp.pay(payment.providerRef!);
    const back = await ctx
      .http()
      .post(`/api/payments/callback/snappay-live/${payment.id}`)
      .type('form')
      .send({ transactionId: opened.transactionId, state: 'OK', amount: String(opened.amount) })
      .expect(302);
    expect(back.headers.location).toContain(`/checkout/result?order=${order.orderNumber}&status=success`);

    expect(opened.status).toBe('SETTLE');
    const stored = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(stored).toMatchObject({ status: 'SUCCEEDED', trackingCode: opened.transactionId });
    expect(await orderStatus(order.id)).toBe('PAID');
    expect(await stockOf(ctx.prisma, variantId)).toMatchObject({
      stock: before.stock - 1,
      reserved: 0,
      sold: 1,
    });
  });

  it('SnappPay: a customer who paid but never came back is captured before the order would expire', async () => {
    const { order, payment } = await checkout('SNAPPAY');
    snapp.pay(payment.providerRef!);
    await ctx.prisma.order.update({
      where: { id: order.id },
      data: { reservationExpiresAt: new Date(Date.now() - 60_000) },
    });

    expect(await ctx.app.get(OrdersService).expireOrder(order.id)).toBe('PAID');
    expect(snapp.payments.get(payment.providerRef!)!.status).toBe('SETTLE');
  });

  it('SnappPay: FAILED from the customer cancels the order and frees the stock', async () => {
    const before = await stockOf(ctx.prisma, variantId);
    const { order, payment } = await checkout('SNAPPAY');
    const opened = snapp.payments.get(payment.providerRef!)!;
    await ctx
      .http()
      .post(`/api/payments/callback/snappay-live/${payment.id}`)
      .type('form')
      .send({ transactionId: opened.transactionId, state: 'FAILED', amount: String(opened.amount) })
      .expect(302);
    expect(await orderStatus(order.id)).toBe('CANCELLED');
    expect(await stockOf(ctx.prisma, variantId)).toMatchObject({ stock: before.stock, reserved: 0 });
    expect(snapp.calls).not.toContain('POST /payment/v1/verify');
  });

  it('DigiPay: verifies with the callback’s tracking code, and reports the delivery when the admin marks it delivered', async () => {
    const { order, payment, response } = await checkout('DIGIPAY');
    expect(response.payment.redirectUrl).toBe(
      `https://web.digipay.example/web-pay/tgs/${payment.providerRef}`,
    );
    const trackingCode = digipay.pay(payment.id);

    const back = await ctx
      .http()
      .post(`/api/payments/callback/digipay-live/${payment.id}`)
      .type('form')
      .send({
        amount: String(Number(payment.amount) * 10),
        providerId: payment.id,
        trackingCode,
        result: 'SUCCESS',
        type: '5',
        isCredit: 'true',
      })
      .expect(302);
    expect(back.headers.location).toContain('status=success');
    const stored = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(stored.status).toBe('SUCCEEDED');
    expect(stored.trackingCode).toBe(trackingCode);
    expect(stored.meta).toMatchObject({ providerId: payment.id, trackingCode, type: 5 });

    const admin = await loginAdmin(ctx, '09120000000');
    for (const status of ['PROCESSING', 'READY_TO_SHIP', 'SHIPPED', 'DELIVERED']) {
      await admin.agent
        .patch(`/api/admin/orders/${order.id}`)
        .set('x-csrf-token', admin.csrf)
        .send({ status })
        .expect(200);
    }
    expect(digipay.delivered).toEqual([
      expect.objectContaining({
        type: '5',
        invoiceNumber: order.orderNumber,
        trackingCode,
        products: [expect.any(String)],
      }),
    ]);
    const logged = await ctx.prisma.paymentTransaction.findFirst({
      where: { paymentId: payment.id, type: 'DELIVERY' },
    });
    expect(logged?.success).toBe(true);
  });

  it('DigiPay: when verify is «unknown», the kept callback lets the result page finish it later', async () => {
    const { order, payment } = await checkout('DIGIPAY');
    const trackingCode = digipay.pay(payment.id);
    digipay.unknownOnce = true;

    const back = await ctx
      .http()
      .post(`/api/payments/callback/digipay-live/${payment.id}`)
      .type('form')
      .send({
        amount: String(Number(payment.amount) * 10),
        providerId: payment.id,
        trackingCode,
        result: 'SUCCESS',
        type: '13',
      })
      .expect(302);
    expect(back.headers.location).not.toContain('status=success');
    expect(await orderStatus(order.id)).toBe('PAYMENT_PENDING');

    const result = await actor.agent.get(`/api/payments/result/${order.orderNumber}`).expect(200);
    expect(result.body).toMatchObject({ success: true, orderStatus: 'PAID', trackingCode });
  });

  it('DigiPay: never accepts another purchase’s tracking code', async () => {
    const first = await checkout('DIGIPAY');
    const paidCode = digipay.pay(first.payment.id);
    await ctx
      .http()
      .post(`/api/payments/callback/digipay-live/${first.payment.id}`)
      .type('form')
      .send({ providerId: first.payment.id, trackingCode: paidCode, result: 'SUCCESS', type: '5' })
      .expect(302);
    expect(await orderStatus(first.order.id)).toBe('PAID');

    const second = await checkout('DIGIPAY');
    // replayed with the second order's providerId but the first order's tracking code
    await ctx
      .http()
      .post(`/api/payments/callback/digipay-live/${second.payment.id}`)
      .type('form')
      .send({ providerId: second.payment.id, trackingCode: paidCode, result: 'SUCCESS', type: '5' })
      .expect(302);
    expect(await orderStatus(second.order.id)).toBe('PAYMENT_PENDING');
    expect((await ctx.prisma.payment.findUniqueOrThrow({ where: { id: second.payment.id } })).status).toBe(
      'PENDING',
    );
  });

  it('AzkiVam: signed requests, a GET callback, and the ticket verified', async () => {
    const { order, payment, response } = await checkout('AZKIVAM');
    expect(response.payment.redirectUrl).toBe(
      `https://panel.azki.example/payment/?ticketId=${payment.providerRef}`,
    );
    expect(azki.tickets.get(payment.providerRef!)!.amount).toBe(Number(payment.amount) * 10);

    azki.pay(payment.providerRef!);
    const back = await ctx
      .http()
      .get(`/api/payments/callback/azkivam-live/${payment.id}?status=Done&ticketId=${payment.providerRef}`)
      .expect(302);
    expect(back.headers.location).toContain('status=success');
    expect(azki.tickets.get(payment.providerRef!)!.status).toBe(2);
    expect(await orderStatus(order.id)).toBe('PAID');
  });

  it('Tara: the customer is posted into Tara by our bridge page, comes back by POST, and the order is paid after purchaseVerify', async () => {
    const before = await stockOf(ctx.prisma, variantId);
    const { order, payment, response } = await checkout('TARA');
    expect(payment.provider).toBe('tara-live');
    // Tara is entered with a form, not a link: the customer goes to our bridge first
    expect(response.payment.redirectUrl).toBe(`http://localhost:3000/api/payments/go/${payment.id}`);
    const opened = tara.tokens.get(payment.providerRef!)!;
    expect(opened.amount).toBe(Number(payment.amount) * 10);
    expect(opened.mobile).toBe('09124440888');
    // the invoice adds up to the amount, every phone in the contract's group
    expect(opened.invoice.reduce((sum, line) => sum + Number(line.fee) * Number(line.count), 0)).toBe(
      opened.amount,
    );
    expect(opened.invoice[0]).toMatchObject({ unit: 5, group: '12', groupTitle: 'موبایل' });
    expect(payment.meta).toMatchObject({ customerIp: expect.any(String) });

    const bridge = await ctx.http().get(`/api/payments/go/${payment.id}`).expect(200);
    expect(bridge.headers['content-type']).toContain('text/html');
    expect(bridge.text).toContain('action="https://pay.tara.example/pay/api/ipgPurchase"');
    expect(bridge.text).toContain('name="username" value="iphoneha-tara"');
    expect(bridge.text).toContain(`name="token" value="${payment.providerRef}"`);
    expect(bridge.text).not.toContain('tara-pw');

    tara.pay(payment.providerRef!);
    const back = await ctx
      .http()
      .post(`/api/payments/callback/tara-live/${payment.id}`)
      .type('form')
      .send({
        token: payment.providerRef,
        result: '0',
        channelRefNumber: '140507051234',
        traceNumber: 'T9',
        description: 'OK',
      })
      .expect(302);
    expect(back.headers.location).toContain(`/checkout/result?order=${order.orderNumber}&status=success`);

    expect(opened.status).toBe('verified');
    const stored = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(stored.status).toBe('SUCCEEDED');
    expect(stored.trackingCode).toMatch(/^9\d{11}$/);
    expect(stored.meta).toMatchObject({ rrn: stored.trackingCode, channelRefNumber: '140507051234' });
    expect(await orderStatus(order.id)).toBe('PAID');
    expect(await stockOf(ctx.prisma, variantId)).toMatchObject({
      stock: before.stock - 1,
      reserved: 0,
      sold: 1,
    });

    // the bridge is gone once the payment is done
    await ctx.http().get(`/api/payments/go/${payment.id}`).expect(410);
  });

  it('Tara: a callback with result ≠ 0 for our token cancels the order without asking Tara; another token is ignored', async () => {
    const before = await stockOf(ctx.prisma, variantId);
    const first = await checkout('TARA');
    await ctx
      .http()
      .post(`/api/payments/callback/tara-live/${first.payment.id}`)
      .type('form')
      .send({ token: 'SOMEBODYELSESTOKEN', result: '0', channelRefNumber: '1' })
      .expect(302);
    expect(await orderStatus(first.order.id)).toBe('PAYMENT_PENDING');

    await ctx
      .http()
      .post(`/api/payments/callback/tara-live/${first.payment.id}`)
      .type('form')
      .send({ token: first.payment.providerRef, result: '2', description: 'انصراف کاربر' })
      .expect(302);
    expect(await orderStatus(first.order.id)).toBe('CANCELLED');
    expect(await stockOf(ctx.prisma, variantId)).toMatchObject({ stock: before.stock, reserved: 0 });
    expect(tara.calls).not.toContain('POST /api/purchaseVerify');
  });

  it('Tara: when verify gets no readable answer, the kept callback lets the result page finish it; an expired token signs in again', async () => {
    const { order, payment } = await checkout('TARA');
    tara.pay(payment.providerRef!);
    tara.failVerifyOnce = true;
    const back = await ctx
      .http()
      .post(`/api/payments/callback/tara-live/${payment.id}`)
      .type('form')
      .send({ token: payment.providerRef, result: '0', channelRefNumber: '77' })
      .expect(302);
    expect(back.headers.location).not.toContain('status=success');
    expect(await orderStatus(order.id)).toBe('PAYMENT_PENDING');
    expect((await ctx.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe(
      'PENDING',
    );

    // the access token kept by the client (from this or an earlier test) is refused once: a fresh sign-in, then verify
    tara.expireTokenOnce = true;
    const signIns = () => tara.calls.filter((call) => call === 'POST /api/v2/authenticate').length;
    const before = signIns();
    const result = await actor.agent.get(`/api/payments/result/${order.orderNumber}`).expect(200);
    expect(result.body).toMatchObject({ success: true, orderStatus: 'PAID' });
    expect(signIns()).toBe(before + 1);
    expect(tara.calls.slice(-2)).toEqual(['POST /api/v2/authenticate', 'POST /api/purchaseVerify']);
  });

  it('Tara: cancelling a paid order leaves the refund to the Tara panel', async () => {
    const { order, payment } = await checkout('TARA');
    tara.pay(payment.providerRef!);
    await ctx
      .http()
      .post(`/api/payments/callback/tara-live/${payment.id}`)
      .type('form')
      .send({ token: payment.providerRef, result: '0' })
      .expect(302);
    const admin = await loginAdmin(ctx, '09120000000');
    await admin.agent
      .patch(`/api/admin/orders/${order.id}`)
      .set('x-csrf-token', admin.csrf)
      .send({ status: 'CANCELLED', note: 'انصراف مشتری' })
      .expect(200);
    const stored = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(stored.status).toBe('REFUND_PENDING');
    expect(stored.failureReason).toContain('پنل پذیرندگی تارا');
  });

  it('Bajet: a GET back with hints, then inquiry and verify on our own reference, and the credit/cash split kept', async () => {
    await liftCeiling('BOJET');
    const { order, payment, response } = await checkout('BOJET');
    expect(payment.provider).toBe('bojet-live');
    expect(response.payment.redirectUrl).toBe(
      `https://jetpay.bajet.example/fa/login?id=${payment.providerRef}&lang=fa`,
    );
    const opened = bajet.orders.get(payment.providerRef!)!;
    expect(opened).toMatchObject({
      amount: Number(payment.amount) * 10,
      mobile: '09124440888',
      orderId: `${order.orderNumber}-${payment.id.slice(-6)}`,
    });

    bajet.pay(payment.providerRef!, opened.amount - 20_000_000);
    const back = await ctx
      .http()
      .get(
        `/api/payments/callback/bojet-live/${payment.id}?id=${payment.providerRef}&orderId=${opened.orderId}&status=true`,
      )
      .expect(302);
    expect(back.headers.location).toContain('status=success');
    expect(opened.status).toBe('VERIFIED');
    const stored = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(stored).toMatchObject({ status: 'SUCCEEDED', trackingCode: payment.providerRef });
    expect(stored.meta).toMatchObject({ creditAmount: opened.amount - 20_000_000, cashAmount: 20_000_000 });
    expect(await orderStatus(order.id)).toBe('PAID');
    expect(bajet.calls).toEqual(['POST token', 'POST order', 'POST inquiry', 'POST verify']);
  });

  it('Bajet: the hints in the query cannot pay for another reference, and a paid customer who never came back is captured in time', async () => {
    await liftCeiling('BOJET');
    const first = await checkout('BOJET');
    const second = await checkout('BOJET');
    bajet.pay(first.payment.providerRef!);
    // the second order's callback carrying the first (paid) reference: decided on the second's own reference
    await ctx
      .http()
      .get(
        `/api/payments/callback/bojet-live/${second.payment.id}?id=${first.payment.providerRef}&status=true`,
      )
      .expect(302);
    expect(await orderStatus(second.order.id)).toBe('PAYMENT_PENDING');
    expect(bajet.orders.get(first.payment.providerRef!)!.status).toBe('SUCCESS');

    await ctx.prisma.order.update({
      where: { id: first.order.id },
      data: { reservationExpiresAt: new Date(Date.now() - 60_000) },
    });
    expect(await ctx.app.get(OrdersService).expireOrder(first.order.id)).toBe('PAID');
    expect(bajet.orders.get(first.payment.providerRef!)!.status).toBe('VERIFIED');
  });

  it('Bajet: the customer coming back with a «no» while Bajet still says pending ends the attempt; a failed one is failed', async () => {
    await liftCeiling('BOJET');
    const before = await stockOf(ctx.prisma, variantId);
    const first = await checkout('BOJET');
    await ctx
      .http()
      .get(
        `/api/payments/callback/bojet-live/${first.payment.id}?id=${first.payment.providerRef}&status=false`,
      )
      .expect(302);
    expect(await orderStatus(first.order.id)).toBe('CANCELLED');
    expect(bajet.calls).not.toContain('POST verify');

    const second = await checkout('BOJET');
    bajet.fail(second.payment.providerRef!);
    await ctx
      .http()
      .get(`/api/payments/callback/bojet-live/${second.payment.id}?id=${second.payment.providerRef}`)
      .expect(302);
    expect(await orderStatus(second.order.id)).toBe('CANCELLED');
    expect(await stockOf(ctx.prisma, variantId)).toMatchObject({ stock: before.stock, reserved: 0 });
  });
});
