import { ZarinpalProvider } from '../providers/online/zarinpal.provider';
import type { PaymentRecordRef } from '../providers/payment-provider.interface';

const MERCHANT = '1344b5d4-0048-11e8-94db-005056a205be';

type Call = { path: string; body: Record<string, unknown> };
type Answer = { status?: number; json?: unknown; text?: string } | Error;

/** A scripted Zarinpal: one answer per endpoint, every request recorded. */
function fakeZarinpal(answers: Partial<Record<'request' | 'verify' | 'inquiry', Answer>>) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname.split('/').pop()!.replace('.json', '') as
      'request' | 'verify' | 'inquiry';
    calls.push({ path, body: JSON.parse(String(init.body)) as Record<string, unknown> });
    const answer = answers[path];
    if (!answer) throw new Error(`unexpected call to ${path}`);
    if (answer instanceof Error) throw answer;
    const text = answer.text ?? JSON.stringify(answer.json);
    return new Response(text, { status: answer.status ?? 200 });
  }) as unknown as typeof fetch;
  return { impl, calls, paths: () => calls.map((c) => c.path) };
}

const ok = <T>(data: T) => ({ json: { data, errors: [] } });
const error = (code: number, message = 'error') => ({
  status: 400,
  json: { data: [], errors: { code, message } },
});

const payment = (overrides: Partial<PaymentRecordRef> = {}): PaymentRecordRef => ({
  id: 'pay_1',
  providerRef: 'A000000000000000000000000000000000001',
  amount: 85_000_000, // Toman
  method: 'ONLINE',
  provider: 'zarinpal',
  meta: null,
  ...overrides,
});

describe('ZarinpalProvider', () => {
  it('opens a live payment in Rial and sends the customer to StartPay', async () => {
    const zp = fakeZarinpal({ request: ok({ code: 100, message: 'Success', authority: 'A0001', fee: 0 }) });
    const provider = new ZarinpalProvider(MERCHANT, false, zp.impl);

    const result = await provider.createPayment({
      paymentId: 'pay_1',
      orderId: 'ord_1',
      orderNumber: 'IH-1001',
      amount: 85_000_000,
      customer: { name: 'مشتری', phone: '09121234567' },
      description: 'سفارش IH-1001',
      callbackUrl: 'https://iphoneha.com/api/payments/callback/zarinpal/pay_1',
      items: [],
    });

    expect(result).toMatchObject({
      providerRef: 'A0001',
      redirectUrl: 'https://payment.zarinpal.com/pg/StartPay/A0001',
    });
    expect(zp.calls[0]!.body).toMatchObject({
      merchant_id: MERCHANT,
      amount: 850_000_000,
      currency: 'IRR',
      callback_url: 'https://iphoneha.com/api/payments/callback/zarinpal/pay_1',
      metadata: { mobile: '09121234567', order_id: 'IH-1001' },
    });
  });

  it('reports Zarinpal’s own error code when it refuses to open a payment', async () => {
    const zp = fakeZarinpal({
      request: error(-10, 'Terminal is not valid, please check merchant_id or ip address.'),
    });
    const provider = new ZarinpalProvider(MERCHANT, false, zp.impl);

    await expect(
      provider.createPayment({
        paymentId: 'p',
        orderId: 'o',
        orderNumber: 'IH-1',
        amount: 1000,
        customer: { name: 'x', phone: '09121234567' },
        description: 'x',
        callbackUrl: 'https://iphoneha.com/cb',
        items: [],
      }),
    ).rejects.toThrow('Zarinpal request failed: code -10: Terminal is not valid');
  });

  it('says Zarinpal is unreachable when the connection drops or a firewall answers instead', async () => {
    const reset = fakeZarinpal({
      inquiry: new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } } as never),
    });
    await expect(
      new ZarinpalProvider(MERCHANT, false, reset.impl).getPaymentStatus({ payment: payment() }),
    ).rejects.toThrow('Zarinpal unreachable: ECONNRESET');

    const blocked = fakeZarinpal({ inquiry: { status: 403, text: '<html><h1>Access denied</h1></html>' } });
    await expect(
      new ZarinpalProvider(MERCHANT, false, blocked.impl).getPaymentStatus({ payment: payment() }),
    ).rejects.toThrow('Zarinpal unreachable: HTTP 403 Access denied');
  });

  describe('coming back from the gateway', () => {
    it('verifies the stored authority with the amount in Rial and keeps the reference id', async () => {
      const zp = fakeZarinpal({
        verify: ok({ code: 100, message: 'Verified', ref_id: 201, card_pan: '502229******5995' }),
      });
      const provider = new ZarinpalProvider(MERCHANT, false, zp.impl);

      const result = await provider.verifyPayment({
        payment: payment(),
        callbackQuery: { Authority: 'A000000000000000000000000000000000001', Status: 'OK' },
      });

      expect(result).toMatchObject({ status: 'SUCCESS', trackingCode: '201' });
      expect(zp.paths()).toEqual(['verify']);
      expect(zp.calls[0]!.body).toEqual({
        merchant_id: MERCHANT,
        authority: 'A000000000000000000000000000000000001',
        amount: 850_000_000,
      });
    });

    it('never verifies an authority the callback brings from another payment', async () => {
      // the attacker's authority was really paid (for another order of the same amount):
      // verifying it here would answer 101 «already verified»
      const zp = fakeZarinpal({
        inquiry: ok({ code: 100, status: 'IN_BANK' }),
        verify: ok({ code: 101, message: 'Verified', ref_id: 999 }),
      });
      const provider = new ZarinpalProvider(MERCHANT, false, zp.impl);

      const result = await provider.verifyPayment({
        payment: payment(),
        callbackQuery: { Authority: 'A0000000000000000000000000000000PAID', Status: 'OK' },
      });

      expect(result.status).toBe('PENDING');
      expect(zp.paths()).toEqual(['inquiry']);
      expect(zp.calls.every((call) => call.body.authority === 'A000000000000000000000000000000000001')).toBe(
        true,
      );
    });

    it('does not act on a bare Status=OK without the authority', async () => {
      const zp = fakeZarinpal({ inquiry: ok({ code: 100, status: 'IN_BANK' }) });
      const result = await new ZarinpalProvider(MERCHANT, false, zp.impl).verifyPayment({
        payment: payment(),
        callbackQuery: { Status: 'OK' },
      });
      expect(result.status).toBe('PENDING');
      expect(zp.paths()).toEqual(['inquiry']);
    });

    it('treats 101 for its own authority as the same successful payment', async () => {
      const zp = fakeZarinpal({ verify: ok({ code: 101, message: 'Verified', ref_id: 201 }) });
      const result = await new ZarinpalProvider(MERCHANT, false, zp.impl).verifyPayment({
        payment: payment(),
        callbackQuery: { Authority: 'A000000000000000000000000000000000001', Status: 'OK' },
      });
      expect(result).toMatchObject({ status: 'SUCCESS', trackingCode: '201' });
    });

    it('fails a payment the customer cancelled', async () => {
      const zp = fakeZarinpal({ inquiry: ok({ code: 100, status: 'FAILED' }) });
      const result = await new ZarinpalProvider(MERCHANT, false, zp.impl).verifyPayment({
        payment: payment(),
        callbackQuery: { Authority: 'A000000000000000000000000000000000001', Status: 'NOK' },
      });
      expect(result).toMatchObject({ status: 'FAILED', failureReason: 'پرداخت توسط کاربر لغو شد' });
      expect(zp.paths()).toEqual(['inquiry']);
    });

    it('fails when Zarinpal says the payment was not made (-51)', async () => {
      const zp = fakeZarinpal({
        verify: error(-51, 'Session is not valid, session is not active paid try.'),
      });
      const result = await new ZarinpalProvider(MERCHANT, false, zp.impl).verifyPayment({
        payment: payment(),
        callbackQuery: { Authority: 'A000000000000000000000000000000000001', Status: 'OK' },
      });
      expect(result.status).toBe('FAILED');
    });

    it('keeps the payment open on any other verify error instead of cancelling a paid order', async () => {
      const zp = fakeZarinpal({ verify: error(-12, 'Too many attempts, please try again later.') });
      await expect(
        new ZarinpalProvider(MERCHANT, false, zp.impl).verifyPayment({
          payment: payment(),
          callbackQuery: { Authority: 'A000000000000000000000000000000000001', Status: 'OK' },
        }),
      ).rejects.toThrow('Zarinpal verify failed: code -12');
    });
  });

  describe('when the customer never came back', () => {
    it('verifies a payment Zarinpal holds as PAID — otherwise the money would go back to the payer', async () => {
      const zp = fakeZarinpal({
        inquiry: ok({ code: 100, status: 'PAID' }),
        verify: ok({ code: 100, message: 'Verified', ref_id: 777 }),
      });
      const result = await new ZarinpalProvider(MERCHANT, false, zp.impl).getPaymentStatus({
        payment: payment(),
      });

      expect(result).toMatchObject({ status: 'SUCCESS', trackingCode: '777' });
      expect(zp.paths()).toEqual(['inquiry', 'verify']);
    });

    it('leaves a payment still at the bank alone', async () => {
      const zp = fakeZarinpal({ inquiry: ok({ code: 100, status: 'IN_BANK' }) });
      const result = await new ZarinpalProvider(MERCHANT, false, zp.impl).getPaymentStatus({
        payment: payment(),
      });
      expect(result.status).toBe('PENDING');
      expect(zp.paths()).toEqual(['inquiry']);
    });

    it('reports a reversed payment as failed', async () => {
      const zp = fakeZarinpal({ inquiry: ok({ code: 100, status: 'REVERSED' }) });
      const result = await new ZarinpalProvider(MERCHANT, false, zp.impl).getPaymentStatus({
        payment: payment(),
      });
      expect(result.status).toBe('FAILED');
    });

    it('has nothing to ask before the gateway session exists', async () => {
      const zp = fakeZarinpal({});
      const provider = new ZarinpalProvider(MERCHANT, false, zp.impl);
      expect(await provider.getPaymentStatus({ payment: payment({ providerRef: null }) })).toEqual({
        status: 'UNKNOWN',
      });
      expect((await provider.verifyPayment({ payment: payment({ providerRef: null }) })).status).toBe(
        'PENDING',
      );
      expect(zp.calls).toHaveLength(0);
    });
  });

  it('uses the sandbox only when asked to', async () => {
    const zp = fakeZarinpal({ request: ok({ code: 100, message: 'Success', authority: 'S1' }) });
    const result = await new ZarinpalProvider(MERCHANT, true, zp.impl).createPayment({
      paymentId: 'p',
      orderId: 'o',
      orderNumber: 'IH-1',
      amount: 1000,
      customer: { name: 'x', phone: '09121234567' },
      description: 'x',
      callbackUrl: 'https://iphoneha.com/cb',
      items: [],
    });
    expect(result.redirectUrl).toBe('https://sandbox.zarinpal.com/pg/StartPay/S1');
  });
});
