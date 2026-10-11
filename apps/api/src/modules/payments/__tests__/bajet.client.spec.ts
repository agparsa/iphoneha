import { BajetClient, BajetError } from '../providers/installment/live/bajet.client';
import { fakeService, json, type Route } from './live-fetch';

const credentials = {
  baseUrl: 'https://jetpay.bajet.test',
  username: 'iphoneha-bajet',
  password: 'bajet-pw',
  terminalId: '880011',
};
const REF = 'BJ0000000001';
const ok = (result: unknown) => json({ status: 200, success: true, result });
const refused = (code: number, en: string, status = 400) =>
  json({ status, success: false, result: { error: { code, en } } }, status);

/** A Bajet with one transaction whose `finalStatus` the test moves along. */
function bajet(extra: Record<string, Route> = {}, finalStatus = 'PEND') {
  const tx = { finalStatus, amount: 1_205_000_000, credit: 1_005_000_000, orderId: 'IH100001-_pay_1' };
  const service = fakeService({
    'POST /api/v1/jetpay/token': (call) => {
      const body = call.body as { username: string; password: string; terminalId: string };
      if (
        body.username !== 'iphoneha-bajet' ||
        body.password !== 'bajet-pw' ||
        body.terminalId !== '880011'
      ) {
        return refused(1100006, 'invalid credentials', 401);
      }
      return ok({ token: 'jwt-1', expiresIn: 3600 });
    },
    'POST /api/v1/jetpay/order': () =>
      ok({ referenceId: REF, referUrl: `https://jetpay.bajet.test/fa/login?id=${REF}&lang=fa` }),
    'POST /api/v1/jetpay/inquiry': (call) => {
      const { referenceId } = call.body as { referenceId: string };
      if (referenceId !== REF) return refused(700001, 'transaction not found');
      const cash = tx.finalStatus === 'PEND' ? 0 : tx.amount - tx.credit;
      return ok({
        referenceId,
        orderId: tx.orderId,
        amount: tx.amount,
        finalStatus: tx.finalStatus,
        creditAmount: tx.credit,
        cashAmount: cash,
      });
    },
    'POST /api/v1/jetpay/verify': (call) => {
      const { referenceId } = call.body as { referenceId: string };
      if (tx.finalStatus !== 'SUCCESS') return refused(700007, `transaction is ${tx.finalStatus}`);
      tx.finalStatus = 'VERIFIED';
      return ok({
        referenceId,
        orderId: tx.orderId,
        creditAmount: tx.credit,
        cashAmount: tx.amount - tx.credit,
      });
    },
    ...extra,
  });
  return { service, tx, client: new BajetClient(credentials, service.impl) };
}

const context = {
  paymentId: 'cl_pay_1',
  orderId: 'ord_1',
  orderNumber: 'IH100001',
  amount: 120_500_000,
  customer: { name: 'مشتری', phone: '09121234567' },
  description: 'سفارش IH100001',
  callbackUrl: 'https://iphoneha.com/api/payments/callback/bojet-live/cl_pay_1',
  items: [{ title: 'آیفون ۱۷ پرو', quantity: 2, unitPrice: 60_000_000, sku: 'IPHONE-17-PRO-256-SILVER' }],
  shipping: 500_000,
  discount: 0,
};
const session = {
  context,
  plan: { downPayment: 0, months: 6, monthly: 0 },
  providerName: 'باجت',
  brandColor: '#5fa32a',
  providerCode: 'bojet-live',
};
const meta = { referenceId: REF, orderId: 'IH100001-_pay_1', amountRial: 1_205_000_000 };

describe('BajetClient', () => {
  it('signs in with the terminal, opens an order in Rial and sends the customer to Bajet’s page', async () => {
    const { client, service } = bajet();
    const created = await client.createSession(session);
    expect(service.trail()).toEqual(['POST /api/v1/jetpay/token', 'POST /api/v1/jetpay/order']);
    expect(service.calls[0]!.headers.authorization).toBeUndefined();
    expect(service.calls[1]!.headers.authorization).toBe('Bearer jwt-1');
    expect(service.calls[1]!.body).toEqual({
      orderId: 'IH100001-_pay_1',
      amount: 1_205_000_000,
      mobile: '09121234567',
      returnUrl: context.callbackUrl,
    });
    expect(created).toEqual({
      ref: REF,
      redirectUrl: `https://jetpay.bajet.test/fa/login?id=${REF}&lang=fa`,
      raw: { referenceId: REF, orderId: 'IH100001-_pay_1', amountRial: 1_205_000_000 },
    });

    // a basket only when Bajet has told us the phones' product type
    const typed = new BajetClient({ ...credentials, productType: 3 }, service.impl);
    await typed.createSession(session);
    expect((service.calls.at(-1)!.body as { basketItems: unknown }).basketItems).toEqual([
      { brand: 'Apple', productType: 3, count: 2 },
    ]);
  });

  it('refuses without an Iranian mobile, and reads Bajet’s error envelope', async () => {
    const { client, service } = bajet({
      'POST /api/v1/jetpay/order': () => refused(700003, 'invalid mobile'),
    });
    await expect(
      client.createSession({
        ...session,
        context: { ...context, customer: { name: 'x', phone: '02122223333' } },
      }),
    ).rejects.toThrow(/mobile/);
    expect(service.calls).toHaveLength(0);
    await expect(client.createSession(session)).rejects.toThrow(
      /order refused \(HTTP 400, code 700003\): invalid mobile/,
    );
    await expect(
      new BajetClient({ ...credentials, password: 'wrong' }, bajet().service.impl).probe(),
    ).rejects.toThrow(/token refused \(HTTP 401, code 1100006\)/);
    const wrongPage = bajet({
      'POST /api/v1/jetpay/order': () => ok({ referenceId: REF, referUrl: 'javascript:alert(1)' }),
    });
    await expect(wrongPage.client.createSession(session)).rejects.toThrow(/no https payment page/);
  });

  it('captures a SUCCESS transaction with inquiry then verify, checking reference, order and the credit/cash split', async () => {
    const { client, service, tx } = bajet({}, 'SUCCESS');
    const result = await client.verify({
      ref: REF,
      amount: 120_500_000,
      meta,
      callback: { id: REF, orderId: meta.orderId, status: 'true' },
    });
    expect(result).toMatchObject({
      status: 'SUCCESS',
      providerRef: REF,
      trackingCode: REF,
      raw: { finalStatus: 'VERIFIED' },
    });
    expect(result.meta).toMatchObject({ creditAmount: 1_005_000_000, cashAmount: 200_000_000 });
    expect(tx.finalStatus).toBe('VERIFIED');
    expect(service.trail()).toEqual([
      'POST /api/v1/jetpay/token',
      'POST /api/v1/jetpay/inquiry',
      'POST /api/v1/jetpay/verify',
    ]);
    expect(service.calls[1]!.body).toEqual({ referenceId: REF });

    // already ours: no second verify
    const again = await client.status({ ref: REF, amount: 120_500_000, meta });
    expect(again).toMatchObject({ status: 'SUCCESS', trackingCode: REF });
    expect(service.count('POST /api/v1/jetpay/verify')).toBe(1);
  });

  it('never trusts the query: the decision is Bajet’s status on our own reference', async () => {
    const pending = bajet({}, 'PEND');
    await expect(
      pending.client.verify({ ref: REF, amount: 120_500_000, meta, callback: { id: REF, status: 'true' } }),
    ).resolves.toMatchObject({
      status: 'PENDING',
    });
    expect(pending.service.count('POST /api/v1/jetpay/verify')).toBe(0);
    // our own reference back with a «no» while nothing is paid: the customer gave up
    await expect(
      pending.client.verify({ ref: REF, amount: 120_500_000, meta, callback: { id: REF, status: 'false' } }),
    ).resolves.toMatchObject({
      status: 'FAILED',
      failureReason: 'پرداخت در باجت انجام نشد',
    });
    // a «no» about another reference is not about us
    await expect(
      pending.client.verify({
        ref: REF,
        amount: 120_500_000,
        meta,
        callback: { id: 'OTHER', status: 'false' },
      }),
    ).resolves.toMatchObject({
      status: 'PENDING',
    });
    for (const finalStatus of ['FAILED', 'REVERSE', 'REFUND']) {
      const dead = bajet({}, finalStatus);
      await expect(dead.client.status({ ref: REF, amount: 120_500_000, meta })).resolves.toMatchObject({
        status: 'FAILED',
      });
    }
    const early = bajet({}, 'INIT');
    await expect(early.client.status({ ref: REF, amount: 120_500_000, meta })).resolves.toMatchObject({
      status: 'PENDING',
    });
  });

  it('leaves an answer about another order or amount, or a split that does not add up, to the staff', async () => {
    const other = bajet({}, 'SUCCESS');
    await expect(
      other.client.verify({ ref: REF, amount: 120_500_000, meta: { ...meta, orderId: 'IH999999-abc' } }),
    ).resolves.toMatchObject({
      status: 'PENDING',
      failureReason: 'پاسخ باجت با این سفارش یکی نیست',
    });
    expect(other.service.count('POST /api/v1/jetpay/verify')).toBe(0);
    const amount = bajet({}, 'SUCCESS');
    await expect(
      amount.client.verify({ ref: REF, amount: 120_500_000, meta: { ...meta, amountRial: 1 } }),
    ).resolves.toMatchObject({
      status: 'PENDING',
      failureReason: 'پاسخ باجت با این سفارش یکی نیست',
    });
    const split = bajet(
      {
        'POST /api/v1/jetpay/verify': () =>
          ok({ referenceId: REF, orderId: meta.orderId, creditAmount: 1_005_000_000, cashAmount: 1 }),
      },
      'SUCCESS',
    );
    await expect(split.client.verify({ ref: REF, amount: 120_500_000, meta })).resolves.toMatchObject({
      status: 'PENDING',
      failureReason: 'پاسخ تأیید باجت با این سفارش یکی نیست',
    });
  });

  it('signs in again after a 401, throws on a refused inquiry, and has no refund API', async () => {
    let expired = true;
    const { client, service } = bajet(
      {
        'POST /api/v1/jetpay/inquiry': () => {
          if (expired) {
            expired = false;
            return refused(1100007, 'token expired', 401);
          }
          return ok({
            referenceId: REF,
            orderId: meta.orderId,
            amount: 1_205_000_000,
            finalStatus: 'PEND',
            creditAmount: 0,
            cashAmount: 0,
          });
        },
      },
      'PEND',
    );
    await expect(client.status({ ref: REF, amount: 120_500_000, meta })).resolves.toMatchObject({
      status: 'PENDING',
    });
    expect(service.trail()).toEqual([
      'POST /api/v1/jetpay/token',
      'POST /api/v1/jetpay/inquiry',
      'POST /api/v1/jetpay/token',
      'POST /api/v1/jetpay/inquiry',
    ]);

    const unknown = bajet({ 'POST /api/v1/jetpay/inquiry': () => refused(700001, 'transaction not found') });
    await expect(unknown.client.status({ ref: REF, amount: 120_500_000, meta })).rejects.toThrow(BajetError);
    await expect(client.refund()).resolves.toMatchObject({
      status: 'MANUAL',
      message: expect.stringContaining('پنل پذیرندگی باجت'),
    });
    await expect(client.probe()).resolves.toEqual({
      status: 'OK',
      detail: 'Bajet accepted the sign-in for terminal 880011',
    });
  });
});
