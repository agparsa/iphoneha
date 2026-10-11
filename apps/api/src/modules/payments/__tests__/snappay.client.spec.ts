import { SnappPayClient, SnappPayError } from '../providers/installment/live/snappay.client';
import { ServiceUnreachableError } from '../providers/installment/live/http';
import { fakeService, json, unreachable, type Route } from './live-fetch';

const BASE = 'https://snapppay.test';
const credentials = {
  baseUrl: BASE,
  clientId: 'iphoneha',
  clientSecret: 's3cret&x',
  username: 'iphoneha-purchase',
  password: 'p@ss',
  commissionType: 100,
};

const ok = (response: unknown) => json({ successful: true, response });
const refused = (errorCode: number, status: number, message = 'خطا') =>
  json({ successful: false, errorData: { errorCode, message, data: null } }, status);

/** A SnappPay with one transaction whose status the test moves along. */
function snapp(extra: Record<string, Route> = {}, start = 'registered') {
  const state = { status: start, amount: undefined as number | undefined };
  const service = fakeService({
    'POST /api/online/v1/oauth/token': () =>
      json({ access_token: 'tok-1', token_type: 'bearer', expires_in: 3600, scope: 'online-merchant' }),
    'POST /api/online/payment/v1/token': (call) => {
      state.amount = (call.body as { amount: number }).amount;
      return ok({ paymentToken: 'PT-1', paymentPageUrl: 'https://payment.snapppay.ir/?paymentToken=PT-1' });
    },
    'GET /api/online/payment/v1/status': () =>
      ok({ transactionId: '123456789', status: state.status, amount: state.amount }),
    'POST /api/online/payment/v1/verify': () => {
      state.status = 'VERIFY';
      return ok({ transactionId: '123456789' });
    },
    'POST /api/online/payment/v1/settle': () => {
      state.status = 'SETTLE';
      return ok({ transactionId: '123456789' });
    },
    'POST /api/online/payment/v1/revert': () => {
      state.status = 'REVERT';
      return ok({ transactionId: '123456789' });
    },
    'POST /api/online/payment/v1/cancel': () => {
      state.status = 'CANCEL';
      return ok({ transactionId: '123456789' });
    },
    'GET /api/online/offer/v1/eligible': () =>
      ok({ eligible: true, title_message: 'پرداخت قسطی با اسنپ‌پی', description: '۴ قسط بدون کارمزد' }),
    ...extra,
  });
  return { service, state, client: new SnappPayClient(credentials, service.impl) };
}

const context = {
  paymentId: 'pay_1',
  orderId: 'ord_1',
  orderNumber: 'IH100001',
  // 2 × 60,000,000 + shipping 500,000 − coupon 1,000,000
  amount: 119_500_000,
  customer: { name: 'مشتری', phone: '۰۹۱۲۱۲۳۴۵۶۷' },
  description: 'سفارش IH100001',
  callbackUrl: 'https://iphoneha.com/api/payments/callback/snappay-live/pay_1',
  items: [{ title: 'آیفون ۱۷ پرو ۲۵۶', quantity: 2, unitPrice: 60_000_000, sku: 'IPHONE-17-PRO-256-SILVER' }],
  shipping: 500_000,
  discount: 1_000_000,
};
const session = {
  context,
  plan: { downPayment: 0, months: 4, monthly: 0 },
  providerName: 'اسنپ‌پی',
  brandColor: '#1e8ef0',
  providerCode: 'snappay-live',
};
const meta = { transactionId: '123456789', paymentToken: 'PT-1', amountRial: 1_195_000_000 };

describe('SnappPayClient', () => {
  it('signs in once with the password grant and reuses the token', async () => {
    const { client, service } = snapp();
    await client.eligibility(50_000_000);
    await client.eligibility(60_000_000);

    expect(service.count('POST /api/online/v1/oauth/token')).toBe(1);
    const signIn = service.calls[0]!;
    expect(signIn.headers.authorization).toBe(`Basic ${Buffer.from('iphoneha:s3cret&x').toString('base64')}`);
    expect(signIn.headers['content-type']).toBe('application/x-www-form-urlencoded');
    expect(signIn.body).toEqual({
      grant_type: 'password',
      scope: 'online-merchant',
      username: 'iphoneha-purchase',
      password: 'p@ss',
    });
    expect(service.calls[1]!.headers.authorization).toBe('Bearer tok-1');
  });

  it('asks eligibility in Rial and keeps SnappPay’s own words', async () => {
    const { client, service } = snapp();
    const answer = await client.eligibility(50_000_000);
    expect(answer).toEqual({
      eligible: true,
      title: 'پرداخت قسطی با اسنپ‌پی',
      description: '۴ قسط بدون کارمزد',
    });
    expect(service.calls[1]!.query.get('amount')).toBe('500000000');
    await client.eligibility(50_000_000);
    expect(service.count('GET /api/online/offer/v1/eligible')).toBe(1); // cached a minute
  });

  it('opens a payment in Rial with a basket that adds up and a +98 mobile', async () => {
    const { client, service } = snapp();
    const created = await client.createSession(session);

    expect(created).toMatchObject({
      ref: 'PT-1',
      redirectUrl: 'https://payment.snapppay.ir/?paymentToken=PT-1',
    });
    const body = service.calls[1]!.body as {
      amount: number;
      discountAmount: number;
      mobile: string;
      transactionId: string;
      returnURL: string;
      paymentMethodTypeDto: string;
      cartList: {
        cartId: number;
        totalAmount: number;
        shippingAmount: number;
        cartItems: { amount: number; count: number; commissionType: number }[];
      }[];
    };
    expect(body.amount).toBe(1_195_000_000);
    expect(body.discountAmount).toBe(10_000_000);
    expect(body.mobile).toBe('+989121234567');
    expect(body.transactionId).toMatch(/^[1-9]\d{8}$/);
    expect(body.returnURL).toBe(context.callbackUrl);
    expect(body.paymentMethodTypeDto).toBe('INSTALLMENT');
    const cart = body.cartList[0]!;
    expect(cart.cartId).toBe(Number(body.transactionId));
    expect(cart.cartItems).toEqual([
      expect.objectContaining({ amount: 600_000_000, count: 2, commissionType: 100 }),
    ]);
    expect(cart.shippingAmount).toBe(5_000_000);
    // Σ(amount × count) + shipping = totalAmount; totalAmount − discount = amount
    expect(cart.totalAmount).toBe(1_205_000_000);
    expect(cart.totalAmount - body.discountAmount).toBe(body.amount);
    expect(created.raw).toEqual({
      transactionId: body.transactionId,
      paymentToken: 'PT-1',
      amountRial: 1_195_000_000,
    });
  });

  it('opens again with a fresh transaction id when SnappPay says the id was used', async () => {
    let first = true;
    const { client, service } = snapp({
      'POST /api/online/payment/v1/token': () => {
        if (first) {
          first = false;
          return refused(1009, 409, 'duplicated');
        }
        return ok({ paymentToken: 'PT-2', paymentPageUrl: 'https://payment.snapppay.ir/?paymentToken=PT-2' });
      },
    });
    const created = await client.createSession(session);
    expect(created.ref).toBe('PT-2');
    const ids = service.calls
      .filter((c) => c.path === '/api/online/payment/v1/token')
      .map((c) => (c.body as { transactionId: string }).transactionId);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('captures a paid transaction: verify, then settle', async () => {
    const { client, service, state } = snapp({}, 'PENDING');
    state.amount = 1_195_000_000;
    const result = await client.verify({
      ref: 'PT-1',
      amount: 119_500_000,
      callback: { transactionId: '123456789', state: 'OK' },
      meta,
    });

    expect(result).toMatchObject({ status: 'SUCCESS', providerRef: 'PT-1', trackingCode: '123456789' });
    expect(service.trail().slice(1)).toEqual([
      'GET /api/online/payment/v1/status',
      'POST /api/online/payment/v1/verify',
      'POST /api/online/payment/v1/settle',
    ]);
    expect(service.calls[2]!.body).toEqual({ paymentToken: 'PT-1' });
  });

  it('only settles what an earlier call verified, and does nothing to a settled one', async () => {
    const verified = snapp({}, 'VERIFY');
    expect((await verified.client.verify({ ref: 'PT-1', amount: 119_500_000, meta })).status).toBe('SUCCESS');
    expect(verified.service.count('POST /api/online/payment/v1/verify')).toBe(0);
    expect(verified.service.count('POST /api/online/payment/v1/settle')).toBe(1);

    const settled = snapp({}, 'SETTLE');
    expect((await settled.client.status({ ref: 'PT-1', amount: 119_500_000, meta })).status).toBe('SUCCESS');
    expect(settled.service.trail().slice(1)).toEqual(['GET /api/online/payment/v1/status']);
  });

  it('never captures on the callback’s word: FAILED from our transaction ends it unpaid', async () => {
    const { client, service } = snapp({}, 'registered');
    const result = await client.verify({
      ref: 'PT-1',
      amount: 119_500_000,
      callback: { transactionId: '123456789', state: 'FAILED' },
      meta,
    });
    expect(result.status).toBe('FAILED');
    expect(service.count('POST /api/online/payment/v1/verify')).toBe(0);

    // a FAILED claimed for another transaction is ignored: still waiting
    const other = snapp({}, 'registered');
    const ignored = await other.client.verify({
      ref: 'PT-1',
      amount: 119_500_000,
      callback: { transactionId: '999999999', state: 'FAILED' },
      meta,
    });
    expect(ignored.status).toBe('PENDING');
  });

  it('captures even when the browser said FAILED, if SnappPay holds the first instalment', async () => {
    const { client } = snapp({}, 'PENDING');
    const result = await client.verify({
      ref: 'PT-1',
      amount: 119_500_000,
      callback: { transactionId: '123456789', state: 'FAILED' },
      meta,
    });
    expect(result.status).toBe('SUCCESS');
  });

  it('refuses to capture an amount that is not the order’s', async () => {
    const { client, service, state } = snapp({}, 'PENDING');
    state.amount = 1_000;
    const result = await client.verify({ ref: 'PT-1', amount: 119_500_000, meta });
    expect(result.status).toBe('PENDING');
    expect(service.count('POST /api/online/payment/v1/verify')).toBe(0);
  });

  it('reports reverted and cancelled transactions as failed', async () => {
    for (const status of ['REVERT', 'CANCEL']) {
      const { client } = snapp({}, status);
      expect((await client.verify({ ref: 'PT-1', amount: 119_500_000, meta })).status).toBe('FAILED');
    }
  });

  it('looks again after 1011 (verified meanwhile) and settles', async () => {
    const { client, service, state } = snapp(
      {
        'POST /api/online/payment/v1/verify': () => {
          state.status = 'VERIFY';
          return refused(1011, 400, 'invalid status');
        },
      },
      'PENDING',
    );
    const result = await client.verify({ ref: 'PT-1', amount: 119_500_000, meta });
    expect(result.status).toBe('SUCCESS');
    expect(service.count('GET /api/online/payment/v1/status')).toBe(2);
    expect(service.count('POST /api/online/payment/v1/settle')).toBe(1);
  });

  it('counts a payment as captured even when settle fails (SnappPay settles at night)', async () => {
    const { client } = snapp({ 'POST /api/online/payment/v1/settle': () => refused(1000, 500) }, 'PENDING');
    expect((await client.verify({ ref: 'PT-1', amount: 119_500_000, meta })).status).toBe('SUCCESS');
  });

  it('signs in again once when the token is rejected', async () => {
    let rejected = false;
    const { client, service } = snapp({
      'GET /api/online/payment/v1/status': () => {
        if (!rejected) {
          rejected = true;
          return refused(1003, 401, 'invalid token');
        }
        return ok({ status: 'SETTLE' });
      },
    });
    expect((await client.status({ ref: 'PT-1', amount: 119_500_000, meta })).status).toBe('SUCCESS');
    expect(service.count('POST /api/online/v1/oauth/token')).toBe(2);
  });

  it('gives the whole amount back the way the state allows', async () => {
    const cases: [string, string[]][] = [
      ['PENDING', ['POST /api/online/payment/v1/revert']],
      ['VERIFY', ['POST /api/online/payment/v1/settle', 'POST /api/online/payment/v1/cancel']],
      ['SETTLE', ['POST /api/online/payment/v1/cancel']],
      ['REVERT', []],
    ];
    for (const [status, calls] of cases) {
      const { client, service } = snapp({}, status);
      const result = await client.refund({ ref: 'PT-1', amount: 119_500_000, paidAmount: 119_500_000, meta });
      expect(result.status).toBe('REFUNDED');
      expect(service.trail().filter((t) => !t.includes('oauth') && !t.includes('/status'))).toEqual(calls);
    }
    const partial = snapp({}, 'SETTLE');
    expect(
      (await partial.client.refund({ ref: 'PT-1', amount: 1_000, paidAmount: 119_500_000, meta })).status,
    ).toBe('MANUAL');
    expect(partial.service.calls).toHaveLength(0);
  });

  it('says plainly when SnappPay cannot be reached or refuses the keys', async () => {
    const down = snapp({ 'POST /api/online/v1/oauth/token': () => unreachable() });
    await expect(down.client.eligibility(10_000_000)).rejects.toBeInstanceOf(ServiceUnreachableError);

    const wrong = snapp({ 'POST /api/online/v1/oauth/token': () => json({ error: 'unauthorized' }, 401) });
    await expect(wrong.client.eligibility(10_000_000)).rejects.toThrow(
      /sign-in refused \(HTTP 401\): unauthorized/,
    );

    const blocked = snapp({
      'POST /api/online/v1/oauth/token': () => new Response('RBA: Access Denied', { status: 403 }),
    });
    await expect(blocked.client.eligibility(10_000_000)).rejects.toThrow(/HTTP 403\): RBA: Access Denied/);
  });

  it('proves the keys from the server with a fresh sign-in and an eligibility question', async () => {
    const { client, service } = snapp();
    await client.eligibility(50_000_000); // a cached answer must not stand in for the check
    const result = await client.probe();
    expect(result).toEqual({
      status: 'OK',
      detail:
        'SnapPay accepted the keys and answered: eligible («پرداخت قسطی با اسنپ‌پی») for 50,000,000 Toman',
    });
    expect(service.count('POST /api/online/v1/oauth/token')).toBe(2);
    expect(service.count('GET /api/online/offer/v1/eligible')).toBe(2);
    expect(service.calls.at(-1)!.query.get('amount')).toBe('500000000');

    const wrong = snapp({ 'POST /api/online/v1/oauth/token': () => json({ error: 'invalid_client' }, 401) });
    await expect(wrong.client.probe()).rejects.toThrow(/sign-in refused \(HTTP 401\)/);
  });

  it('explains a return URL SnappPay does not know', async () => {
    const { client } = snapp({
      'POST /api/online/payment/v1/token': () => refused(1051, 403, 'invalid return url'),
    });
    const error = await client.createSession(session).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SnappPayError);
    expect((error as Error).message).toContain('آدرس بازگشت');
  });
});
