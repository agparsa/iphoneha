import { DigipayClient, type DigipayCredentials } from '../providers/installment/live/digipay.client';
import { fakeService, json, type Route } from './live-fetch';

const BASE = 'https://digipay.test/digipay/api';
const credentials: DigipayCredentials = {
  baseUrl: BASE,
  clientId: 'cid',
  clientSecret: 'csecret',
  username: 'iphoneha-upg',
  password: 'pw',
  ticketType: 11,
  verifyStyle: 'body',
};

const success = { title: 'SUCCESS', status: 0, message: 'عملیات با موفقیت انجام شد', level: 'INFO' };
const failure = (status: number, message = 'خطا') => ({
  result: { title: 'ERROR', status, message, level: 'WARN' },
});

function digipay(extra: Record<string, Route> = {}, overrides: Partial<DigipayCredentials> = {}) {
  const service = fakeService({
    'POST /digipay/api/oauth/token': () =>
      json({ access_token: 'dp-token', token_type: 'bearer', expires_in: 3599 }),
    'POST /digipay/api/tickets/business': () =>
      json({
        result: success,
        ticket: 'v2:abc',
        redirectUrl: 'https://uatweb.mydigipay.info/web-pay/tgs/v2:abc',
      }),
    'POST /digipay/api/purchases/verify': (call) =>
      json({
        result: success,
        trackingCode: (call.body as { trackingCode: string }).trackingCode,
        providerId: 'pay_1',
        amount: 1_195_000_000,
        fpName: 'DIGIPAY',
        paymentGateway: 4,
      }),
    'POST /digipay/api/refunds': () => json({ result: success, trackingCode: '571000000098' }),
    'POST /digipay/api/purchases/deliver': () => json({ result: success }),
    ...extra,
  });
  return { service, client: new DigipayClient({ ...credentials, ...overrides }, service.impl) };
}

const context = {
  paymentId: 'pay_1',
  orderId: 'ord_1',
  orderNumber: 'IH100001',
  amount: 119_500_000,
  customer: { name: 'مشتری', phone: '+989121234567' },
  description: 'سفارش IH100001',
  callbackUrl: 'https://iphoneha.com/api/payments/callback/digipay-live/pay_1',
  items: [{ title: 'آیفون ۱۷ پرو', quantity: 2, unitPrice: 60_000_000, sku: 'IPHONE-17-PRO-256-SILVER' }],
};
const session = {
  context,
  plan: { downPayment: 0, months: 4, monthly: 0 },
  providerName: 'دیجی‌پی',
  brandColor: '#2b6fe6',
  providerCode: 'digipay-live',
};
const meta = { providerId: 'pay_1', ticket: 'v2:abc', amountRial: 1_195_000_000 };
const paid = {
  amount: '1195000000',
  providerId: 'pay_1',
  trackingCode: '5239470511667728782510',
  result: 'SUCCESS',
  type: '5',
};

describe('DigipayClient', () => {
  it('signs in with a multipart password grant and opens a UPG ticket in Rial', async () => {
    const { client, service } = digipay();
    const created = await client.createSession(session);

    expect(created).toEqual({
      ref: 'v2:abc',
      redirectUrl: 'https://uatweb.mydigipay.info/web-pay/tgs/v2:abc',
      raw: { providerId: 'pay_1', ticket: 'v2:abc', amountRial: 1_195_000_000 },
    });
    const [signIn, ticket] = service.calls;
    expect(signIn!.headers.authorization).toBe(`Basic ${Buffer.from('cid:csecret').toString('base64')}`);
    expect(signIn!.rawBody).toBeInstanceOf(FormData);
    expect(signIn!.body).toEqual({ username: 'iphoneha-upg', password: 'pw', grant_type: 'password' });

    expect(ticket!.query.get('type')).toBe('11');
    expect(ticket!.headers).toMatchObject({
      authorization: 'Bearer dp-token',
      agent: 'WEB',
      'digipay-version': '2022-02-02',
    });
    expect(ticket!.body).toEqual({
      amount: 1_195_000_000,
      cellNumber: '09121234567',
      providerId: 'pay_1',
      callbackUrl: context.callbackUrl,
      basketDetailsDto: {
        basketId: 'IH100001-pay_1',
        items: [
          {
            sellerId: 'iphoneha-upg',
            supplierId: 'iphoneha-upg',
            productCode: 'IPHONE-17-PRO-256-SILVER',
            brand: 'Apple',
            productType: 1,
            count: 2,
            categoryId: 'mobile',
          },
        ],
      },
    });
  });

  it('verifies with the callback’s tracking code and type, and keeps them for refunds and delivery', async () => {
    const { client, service } = digipay();
    const result = await client.verify({ ref: 'v2:abc', amount: 119_500_000, callback: paid, meta });

    expect(result).toMatchObject({
      status: 'SUCCESS',
      trackingCode: '5239470511667728782510',
      meta: { trackingCode: '5239470511667728782510', type: 5 },
    });
    const verify = service.calls.at(-1)!;
    expect(verify.path).toBe('/digipay/api/purchases/verify');
    expect(verify.query.get('type')).toBe('5');
    expect(verify.body).toEqual({ trackingCode: '5239470511667728782510', providerId: 'pay_1' });
  });

  it('can verify the older way, with the tracking code in the path', async () => {
    const { client, service } = digipay(
      {
        'POST /digipay/api/purchases/verify/5239470511667728782510': () =>
          json({
            result: success,
            providerId: 'pay_1',
            amount: 1_195_000_000,
            trackingCode: '5239470511667728782510',
          }),
      },
      { verifyStyle: 'path' },
    );
    expect((await client.verify({ ref: 'v2:abc', amount: 119_500_000, callback: paid, meta })).status).toBe(
      'SUCCESS',
    );
    expect(service.calls.at(-1)!.rawBody).toBeNull();
  });

  it('takes a FAILURE from the callback as unpaid, without asking', async () => {
    const { client, service } = digipay();
    const result = await client.verify({
      ref: 'v2:abc',
      amount: 119_500_000,
      callback: { ...paid, result: 'FAILURE' },
      meta,
    });
    expect(result.status).toBe('FAILED');
    expect(service.calls).toHaveLength(0);
  });

  it('never acts on a callback naming another purchase, nor accepts an answer for another one', async () => {
    const other = digipay();
    const forged = await other.client.verify({
      ref: 'v2:abc',
      amount: 119_500_000,
      callback: { ...paid, providerId: 'pay_2' },
      meta,
    });
    expect(forged.status).toBe('PENDING');
    expect(other.service.calls).toHaveLength(0);

    // a tracking code of a real purchase of the same merchant, for another providerId or amount
    for (const answer of [
      { providerId: 'pay_2', amount: 1_195_000_000 },
      { providerId: 'pay_1', amount: 10 },
    ]) {
      const { client } = digipay({
        'POST /digipay/api/purchases/verify': () =>
          json({ result: success, trackingCode: paid.trackingCode, ...answer }),
      });
      expect((await client.verify({ ref: 'v2:abc', amount: 119_500_000, callback: paid, meta })).status).toBe(
        'PENDING',
      );
    }
  });

  it('settles a verify window that passed as unpaid, but keeps «unknown» pending', async () => {
    const expired = digipay({
      'POST /digipay/api/purchases/verify': () => json(failure(9009, 'مهلت تأیید گذشته'), 422),
    });
    expect(
      (await expired.client.verify({ ref: 'v2:abc', amount: 119_500_000, callback: paid, meta })).status,
    ).toBe('FAILED');

    const unknown = digipay({
      'POST /digipay/api/purchases/verify': () => json(failure(9011, 'نامشخص'), 422),
    });
    await expect(
      unknown.client.verify({ ref: 'v2:abc', amount: 119_500_000, callback: paid, meta }),
    ).rejects.toThrow(/code 9011/);
  });

  it('verifies later from the kept callback, and knows nothing without one', async () => {
    const { client } = digipay();
    expect(await client.status({ ref: 'v2:abc', amount: 119_500_000, meta })).toEqual({ status: 'UNKNOWN' });
    const later = await client.status({
      ref: 'v2:abc',
      amount: 119_500_000,
      meta: { ...meta, callback: paid },
    });
    expect(later).toMatchObject({ status: 'SUCCESS', trackingCode: paid.trackingCode, meta: { type: 5 } });
  });

  it('refunds in Rial against the sale tracking code with a new refund id', async () => {
    const { client, service } = digipay();
    const kept = { ...meta, trackingCode: paid.trackingCode, type: 5 };
    const result = await client.refund({ ref: 'v2:abc', amount: 119_500_000, meta: kept });
    expect(result).toMatchObject({ status: 'REFUNDED', reference: '571000000098' });
    const refund = service.calls.at(-1)!;
    expect(refund.query.get('type')).toBe('5');
    expect(refund.body).toMatchObject({ amount: 1_195_000_000, saleTrackingCode: paid.trackingCode });
    expect((refund.body as { providerId: string }).providerId).toMatch(/^pay_1-r/);

    const unverified = await client.refund({ ref: 'v2:abc', amount: 1, meta });
    expect(unverified.status).toBe('MANUAL');
  });

  it('reports the delivery of credit purchases only', async () => {
    const { client, service } = digipay();
    const credit = await client.confirmDelivery({
      ref: 'v2:abc',
      meta: { ...meta, trackingCode: paid.trackingCode, type: 13 },
      orderNumber: 'IH100001',
      skus: ['IPHONE-17-PRO-256-SILVER'],
    });
    expect(credit.status).toBe('CONFIRMED');
    const deliver = service.calls.at(-1)!;
    expect(deliver.query.get('type')).toBe('13');
    expect(deliver.body).toMatchObject({
      invoiceNumber: 'IH100001',
      trackingCode: paid.trackingCode,
      products: ['IPHONE-17-PRO-256-SILVER'],
    });
    expect(Math.abs((deliver.body as { deliveryDate: number }).deliveryDate - Date.now())).toBeLessThan(
      5_000,
    );

    const wallet = await client.confirmDelivery({
      ref: 'v2:abc',
      meta: { ...meta, trackingCode: '1', type: 0 },
      orderNumber: 'IH1',
      skus: [],
    });
    expect(wallet.status).toBe('NOT_NEEDED');
  });

  it('proves the keys from the server with a fresh sign-in, and nothing else', async () => {
    const { client, service } = digipay();
    await client.createSession(session);
    expect(await client.probe()).toEqual({ status: 'OK', detail: 'DigiPay accepted the keys (signed in)' });
    expect(service.trail()).toEqual([
      'POST /digipay/api/oauth/token',
      'POST /digipay/api/tickets/business',
      'POST /digipay/api/oauth/token',
    ]);

    const wrong = digipay({ 'POST /digipay/api/oauth/token': () => json({ error: 'invalid_grant' }, 400) });
    await expect(wrong.client.probe()).rejects.toThrow(/sign-in refused \(HTTP 400\): invalid_grant/);
  });

  it('signs in again after a 401', async () => {
    let first = true;
    const { client, service } = digipay({
      'POST /digipay/api/tickets/business': () => {
        if (first) {
          first = false;
          return json({ error: 'invalid_token' }, 401);
        }
        return json({ result: success, ticket: 'v2:x', redirectUrl: 'https://pay/x' });
      },
    });
    expect((await client.createSession(session)).ref).toBe('v2:x');
    expect(service.count('POST /digipay/api/oauth/token')).toBe(2);
  });
});
