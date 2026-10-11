import { ServiceUnreachableError } from '../providers/installment/live/http';
import { TaraClient, TaraError } from '../providers/installment/live/tara.client';
import { fakeService, json, unreachable, type Route } from './live-fetch';

const credentials = {
  baseUrl: 'https://pay.tara.test/pay/',
  username: 'iphoneha-tara',
  password: 'tara-pw',
  serviceId: '4410',
  groupCode: '12',
};
const TOKEN = 'TARATOKEN00000001';

/** A Tara with one payment token whose state the test moves along. */
function tara(extra: Record<string, Route> = {}) {
  const state = { paid: false, verified: false, signIns: 0 };
  const service = fakeService({
    'POST /pay/api/v2/authenticate': (call) => {
      state.signIns += 1;
      const body = call.body as { username: string; password: string };
      if (body.username !== 'iphoneha-tara' || body.password !== 'tara-pw') {
        return json({ result: 401, description: 'نام کاربری یا رمز عبور اشتباه است' }, 401);
      }
      return json({ accessToken: `access-${state.signIns}`, expiresIn: 1800, result: 0 });
    },
    'POST /pay/api/getToken': () => json({ token: TOKEN, result: 0, description: 'OK' }),
    'POST /pay/api/purchaseVerify': () => {
      if (!state.paid) return json({ result: 21, description: 'تراکنش پرداخت نشده است' });
      if (state.verified) return json({ result: 22, description: 'تراکنش قبلاً تأیید شده است' });
      state.verified = true;
      return json({
        result: 0,
        rrn: '912345678901',
        amount: 1_205_000_000,
        cardNumber: '6037-99**-****-1234',
        traceNumber: 'T1',
        description: 'OK',
      });
    },
    'POST /pay/api/clubGroups': () =>
      json({
        result: 0,
        ipgClubMerchandiseGroupReportList: [
          { id: 12, title: 'موبایل و تبلت' },
          { id: 26, title: 'سایر' },
        ],
      }),
    ...extra,
  });
  return { service, state, client: new TaraClient(credentials, service.impl) };
}

const context = {
  paymentId: 'pay_1',
  orderId: 'ord_1',
  orderNumber: 'IH100001',
  amount: 120_500_000,
  customer: { name: 'مشتری', phone: '0912 123 4567' },
  description: 'سفارش IH100001 — فروشگاه آیفونی‌ها',
  callbackUrl: 'https://iphoneha.com/api/payments/callback/tara-live/pay_1',
  items: [
    {
      title: 'آیفون ۱۷ پرو',
      quantity: 2,
      unitPrice: 60_000_000,
      sku: 'IPHONE-17-PRO-256-SILVER',
      url: 'https://iphoneha.com/iphone/iphone-17-pro',
    },
  ],
  shipping: 500_000,
  discount: 0,
  customerIp: '5.5.5.5',
};
const session = {
  context,
  plan: { downPayment: 0, months: 12, monthly: 0 },
  providerName: 'تارا',
  brandColor: '#d61f7a',
  providerCode: 'tara-live',
};

describe('TaraClient', () => {
  it('signs in once, opens a token in Rial with an itemised invoice, and hands the customer a POST form', async () => {
    const { client, service } = tara();
    const created = await client.createSession(session);

    expect(service.trail()).toEqual(['POST /pay/api/v2/authenticate', 'POST /pay/api/getToken']);
    expect(service.calls[1]!.headers.authorization).toBe('Bearer access-1');
    const body = service.calls[1]!.body as {
      amount: number;
      vat: number;
      mobile: string;
      callBackUrl: string;
      ip: string;
      serviceAmountList: { serviceId: string; amount: number }[];
      taraInvoiceItemList: {
        name: string;
        code: string;
        count: number;
        unit: number;
        fee: number;
        group?: string;
        groupTitle?: string;
      }[];
    };
    expect(body).toMatchObject({
      amount: 1_205_000_000,
      vat: 0,
      mobile: '09121234567',
      callBackUrl: context.callbackUrl,
      ip: '5.5.5.5',
    });
    expect(body.serviceAmountList).toEqual([{ serviceId: '4410', amount: 1_205_000_000 }]);
    expect(body.taraInvoiceItemList).toEqual([
      expect.objectContaining({
        name: 'آیفون ۱۷ پرو',
        code: 'IPHONE-17-PRO-256-SILVER',
        count: 2,
        unit: 5,
        fee: 600_000_000,
        group: '12',
        groupTitle: 'موبایل',
      }),
      expect.objectContaining({
        name: 'هزینهٔ ارسال',
        count: 1,
        unit: 5,
        fee: 5_000_000,
        group: '40',
        groupTitle: 'ارسال',
      }),
    ]);
    expect(body.taraInvoiceItemList.reduce((sum, line) => sum + line.fee * line.count, 0)).toBe(body.amount);

    expect(created).toEqual({
      ref: TOKEN,
      redirectUrl: 'https://pay.tara.test/pay/api/ipgPurchase',
      redirectForm: {
        action: 'https://pay.tara.test/pay/api/ipgPurchase',
        fields: { username: 'iphoneha-tara', token: TOKEN },
      },
      raw: { token: TOKEN, amountRial: 1_205_000_000, customerIp: '5.5.5.5' },
    });
  });

  it('sends one line for the whole order when a coupon makes the lines disagree with the amount, and none without a group code', async () => {
    const { client, service } = tara();
    await client.createSession({
      ...session,
      context: { ...context, discount: 3_000_000, amount: 117_500_000 },
    });
    const withCoupon = (
      service.calls[1]!.body as { taraInvoiceItemList: { fee: number; count: number; name: string }[] }
    ).taraInvoiceItemList;
    expect(withCoupon).toEqual([
      expect.objectContaining({
        name: 'سفارش IH100001',
        code: 'IH100001',
        count: 1,
        fee: 1_175_000_000,
        group: '12',
      }),
    ]);

    const plain = new TaraClient({ ...credentials, groupCode: undefined }, service.impl);
    await plain.createSession(session);
    const lines = (service.calls.at(-1)!.body as { taraInvoiceItemList: Record<string, unknown>[] })
      .taraInvoiceItemList;
    expect(lines[0]).not.toHaveProperty('group');
    expect(lines[1]).toMatchObject({ group: '40' });
  });

  it('refuses a customer without an Iranian mobile before talking to Tara, and explains a refusal of Tara', async () => {
    const { client, service } = tara({
      'POST /pay/api/getToken': () => json({ result: 14, description: 'کد درگاه نامعتبر است' }),
    });
    await expect(
      client.createSession({
        ...session,
        context: { ...context, customer: { name: 'x', phone: '+442071234567' } },
      }),
    ).rejects.toThrow(/mobile/);
    expect(service.calls).toHaveLength(0);
    await expect(client.createSession(session)).rejects.toThrow(
      /getToken refused \(HTTP 200, result 14\): کد درگاه نامعتبر است/,
    );
    const { client: locked } = tara({
      'POST /pay/api/v2/authenticate': () => json({ result: 401, description: 'رمز اشتباه' }, 401),
    });
    await expect(locked.createSession(session)).rejects.toThrow(/sign-in refused \(HTTP 401\)/);
  });

  it('verifies only a result-0 callback for its own token, keeps the rrn, and signs in again after a 401', async () => {
    const { client, service, state } = tara();
    const meta = { token: TOKEN, amountRial: 1_205_000_000, customerIp: '5.5.5.5' };
    await expect(client.verify({ ref: TOKEN, amount: 120_500_000, meta })).resolves.toEqual({
      status: 'PENDING',
      providerRef: TOKEN,
    });
    await expect(
      client.verify({ ref: TOKEN, amount: 120_500_000, meta, callback: { token: 'OTHER', result: '0' } }),
    ).resolves.toEqual({ status: 'PENDING', providerRef: TOKEN });
    expect(service.calls).toHaveLength(0);

    state.paid = true;
    // an access token that expired meanwhile: the first bearer call is refused once
    let refusedOnce = false;
    const original = service.impl;
    const client2 = new TaraClient(credentials, (async (input, init) => {
      const headers = new Headers(init?.headers);
      if (
        String(input).endsWith('/purchaseVerify') &&
        !refusedOnce &&
        headers.get('authorization') === 'Bearer access-1'
      ) {
        refusedOnce = true;
        return json({ result: 401, description: 'Unauthorized' }, 401);
      }
      return original(input, init);
    }) as typeof fetch);
    const result = await client2.verify({
      ref: TOKEN,
      amount: 120_500_000,
      meta,
      callback: { token: TOKEN, result: '0', channelRefNumber: '140507051234', traceNumber: 'T1' },
    });
    expect(result).toMatchObject({ status: 'SUCCESS', providerRef: TOKEN, trackingCode: '912345678901' });
    expect(result.meta).toMatchObject({
      rrn: '912345678901',
      traceNumber: 'T1',
      channelRefNumber: '140507051234',
    });
    expect(service.trail()).toEqual([
      'POST /pay/api/v2/authenticate',
      'POST /pay/api/v2/authenticate',
      'POST /pay/api/purchaseVerify',
    ]);
    expect(service.calls[2]!.body as { token: string; ip: string }).toEqual({ token: TOKEN, ip: '5.5.5.5' });
  });

  it('ends the attempt on a callback that says no, or on a verify Tara refuses; a mismatched amount is left for the staff', async () => {
    const { client, service, state } = tara();
    const meta = { token: TOKEN, amountRial: 1_205_000_000 };
    await expect(
      client.verify({ ref: TOKEN, amount: 120_500_000, meta, callback: { token: TOKEN, result: '2' } }),
    ).resolves.toMatchObject({
      status: 'FAILED',
      failureReason: 'پرداخت در تارا انجام نشد',
    });
    expect(service.count('POST /pay/api/purchaseVerify')).toBe(0);

    // Tara says the token was never paid
    await expect(
      client.verify({ ref: TOKEN, amount: 120_500_000, meta, callback: { token: TOKEN, result: '0' } }),
    ).resolves.toMatchObject({
      status: 'FAILED',
      failureReason: 'تارا این پرداخت را تأیید نکرد',
      raw: { result: '21' },
    });

    state.paid = true;
    await expect(
      client.verify({
        ref: TOKEN,
        amount: 120_500_000,
        meta: { ...meta, amountRial: 999 },
        callback: { token: TOKEN, result: '0' },
      }),
    ).resolves.toMatchObject({ status: 'PENDING', failureReason: 'مبلغ تراکنش تارا با سفارش یکی نیست' });
  });

  it('throws — decides nothing — when verify gets no readable answer or no answer at all', async () => {
    const page = tara({
      'POST /pay/api/purchaseVerify': () => new Response('<html>502</html>', { status: 502 }),
    });
    page.state.paid = true;
    const callback = { token: TOKEN, result: '0' };
    await expect(
      page.client.verify({ ref: TOKEN, amount: 120_500_000, meta: { amountRial: 1_205_000_000 }, callback }),
    ).rejects.toThrow(TaraError);
    const down = tara({ 'POST /pay/api/purchaseVerify': unreachable });
    await expect(down.client.verify({ ref: TOKEN, amount: 120_500_000, callback })).rejects.toThrow(
      ServiceUnreachableError,
    );
    // status: nothing to ask Tara without a kept callback
    await expect(down.client.status({ ref: TOKEN, amount: 120_500_000, meta: {} })).resolves.toEqual({
      status: 'UNKNOWN',
    });
  });

  it('has no refund API, and its probe lists the merchandise groups of the contract', async () => {
    const { client } = tara();
    await expect(client.refund()).resolves.toMatchObject({
      status: 'MANUAL',
      message: expect.stringContaining('پنل پذیرندگی تارا'),
    });
    const probe = await client.probe();
    expect(probe.status).toBe('OK');
    expect(probe.detail).toContain('12 «موبایل و تبلت», 26 «سایر»');
    expect(probe.detail).toContain('TARA_GROUP_CODE 12 is one of them');
    const other = new TaraClient({ ...credentials, groupCode: '7' }, tara().service.impl);
    expect((await other.probe()).detail).toContain('TARA_GROUP_CODE 7 is NOT among them');
  });
});
