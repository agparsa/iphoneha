import { defaultAddress, loginWithProfile, type Actor } from './utils/actors';
import { resetDb, stockOf } from './utils/db';
import { startCheckout } from './utils/payments';
import { closeTestApp, createTestApp, type TestContext } from './utils/test-app';
import { OrdersService } from '../src/modules/orders/orders.service';

const MERCHANT = '1344b5d4-0048-11e8-94db-005056a205be';

type State = 'IN_BANK' | 'PAID' | 'VERIFIED' | 'FAILED';

/**
 * Zarinpal as the store sees it, behind the global fetch: it opens authorities,
 * lets a test «pay» or «cancel» them, and answers inquiry/verify the way the
 * real API does — 101 for an authority verified before, -50 for a wrong
 * amount, -51 for one never paid.
 */
class FakeZarinpal {
  readonly authorities = new Map<string, { amountRial: number; state: State; refId: number }>();
  readonly calls: { path: string; authority?: string }[] = [];
  unreachable = false;
  private seq = 0;

  pay(authority: string) {
    this.authorities.get(authority)!.state = 'PAID';
  }
  cancel(authority: string) {
    this.authorities.get(authority)!.state = 'FAILED';
  }
  count(path: string, authority?: string) {
    return this.calls.filter((c) => c.path === path && (!authority || c.authority === authority)).length;
  }

  answer(path: string, body: { amount?: number; authority?: string }): Response {
    const json = (data: unknown, errors: unknown = [], status = 200) =>
      new Response(JSON.stringify({ data, errors }), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    const refused = (code: number, message: string) => json([], { code, message }, 400);

    if (path === 'request') {
      this.seq += 1;
      const authority = `A${String(this.seq).padStart(35, '0')}`;
      this.authorities.set(authority, {
        amountRial: body.amount!,
        state: 'IN_BANK',
        refId: 90_000 + this.seq,
      });
      return json({ code: 100, message: 'Success', authority, fee_type: 'Merchant', fee: 0 });
    }
    const entry = this.authorities.get(body.authority ?? '');
    if (!entry) return refused(-54, 'Invalid authority.');
    if (path === 'inquiry') return json({ code: 100, message: 'Success', status: entry.state });
    // verify
    if (entry.amountRial !== body.amount)
      return refused(-50, 'Session is not valid, amounts values is not the same.');
    if (entry.state === 'VERIFIED') return json({ code: 101, message: 'Verified', ref_id: entry.refId });
    if (entry.state !== 'PAID') return refused(-51, 'Session is not valid, session is not active paid try.');
    entry.state = 'VERIFIED';
    return json({ code: 100, message: 'Verified', ref_id: entry.refId, card_pan: '502229******5995' });
  }
}

describe('Payments through Zarinpal', () => {
  let ctx: TestContext;
  let zarinpal: FakeZarinpal;
  let actor: Actor;
  let addressId: string;
  let shippingMethodId: string;
  let variantId: string;
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    process.env.ALLOW_MOCK_PAYMENTS = 'false';
    process.env.PAYMENT_ONLINE_DRIVER = 'zarinpal';
    process.env.ZARINPAL_MERCHANT_ID = MERCHANT;
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      if (!url.includes('zarinpal.com')) return realFetch(input, init);
      const path = new URL(url).pathname.split('/').pop()!.replace('.json', '');
      const body = JSON.parse(String(init?.body ?? '{}')) as { amount?: number; authority?: string };
      zarinpal.calls.push({ path, authority: body.authority });
      if (zarinpal.unreachable) throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } });
      return zarinpal.answer(path, body);
    });
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await closeTestApp(ctx);
    jest.restoreAllMocks();
    process.env.PAYMENT_ONLINE_DRIVER = 'mock';
    delete process.env.ALLOW_MOCK_PAYMENTS;
    delete process.env.ZARINPAL_MERCHANT_ID;
  });

  beforeEach(async () => {
    zarinpal = new FakeZarinpal();
    await resetDb(ctx.prisma, ctx.redis);
    actor = await loginWithProfile(ctx, '09124440777');
    addressId = await defaultAddress(actor);
    const methods = await ctx.http().get('/api/shipping/methods?province=تهران&subtotal=0').expect(200);
    shippingMethodId = methods.body.find((m: { available: boolean }) => m.available).id;
    const detail = await ctx.http().get('/api/products/iphone-17').expect(200);
    variantId = detail.body.variants.find((v: { availableStock: number }) => v.availableStock >= 5).id;
  });

  const checkout = async () => {
    await actor.agent
      .post('/api/cart')
      .set('x-csrf-token', actor.csrf)
      .send({ variantId, quantity: 1 })
      .expect(201);
    const response = await startCheckout(actor, {
      addressId,
      shippingMethodId,
      paymentMethod: 'ONLINE',
    }).expect(201);
    const payment = await ctx.prisma.payment.findFirstOrThrow({ where: { orderId: response.body.order.id } });
    return {
      order: response.body.order as { id: string; orderNumber: string },
      payment,
      response: response.body,
    };
  };

  /** The customer's browser coming back from the gateway. */
  const callback = (paymentId: string, query: Record<string, string>) =>
    ctx
      .http()
      .get(`/api/payments/callback/zarinpal/${paymentId}?${new URLSearchParams(query).toString()}`)
      .expect(302);

  it('offers Zarinpal and nothing simulated', async () => {
    const { body } = await ctx.http().get('/api/payments/methods?amount=50000000').expect(200);
    expect(body.map((m: { method: string }) => m.method)).toEqual(['ONLINE']);
  });

  it('sends the customer to Zarinpal and settles the order only after verify', async () => {
    const before = await stockOf(ctx.prisma, variantId);
    const { order, payment, response } = await checkout();
    const authority = payment.providerRef!;
    expect(response.payment.redirectUrl).toBe(`https://sandbox.zarinpal.com/pg/StartPay/${authority}`);
    expect(zarinpal.authorities.get(authority)!.amountRial).toBe(Number(payment.amount) * 10);

    zarinpal.pay(authority);
    const back = await callback(payment.id, { Authority: authority, Status: 'OK' });
    expect(back.headers.location).toContain(`/checkout/result?order=${order.orderNumber}&status=success`);

    const stored = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(stored).toMatchObject({
      status: 'SUCCEEDED',
      trackingCode: String(zarinpal.authorities.get(authority)!.refId),
    });
    expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('PAID');
    expect(zarinpal.authorities.get(authority)!.state).toBe('VERIFIED');
    const stock = await stockOf(ctx.prisma, variantId);
    expect(stock).toMatchObject({ stock: before.stock - 1, reserved: 0, sold: 1 });
  });

  it('never settles an order with an authority it did not open for that order', async () => {
    const first = await checkout();
    const paidAuthority = first.payment.providerRef!;
    zarinpal.pay(paidAuthority);
    await callback(first.payment.id, { Authority: paidAuthority, Status: 'OK' });
    expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: first.order.id } })).status).toBe('PAID');

    // a second order of exactly the same amount, never paid
    const second = await checkout();
    expect(second.payment.amount).toEqual(first.payment.amount);
    // and a payment of that amount made to the same merchant outside the store
    // (a payment link, another site): Zarinpal would answer 101 for it
    zarinpal.authorities.set('A_PAID_ELSEWHERE', {
      amountRial: Number(second.payment.amount) * 10,
      state: 'VERIFIED',
      refId: 555,
    });

    for (const stolen of [paidAuthority, 'A_PAID_ELSEWHERE']) {
      const replay = await callback(second.payment.id, { Authority: stolen, Status: 'OK' });
      expect(replay.headers.location).not.toContain('status=success');
    }

    expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: second.order.id } })).status).toBe(
      'PAYMENT_PENDING',
    );
    expect((await ctx.prisma.payment.findUniqueOrThrow({ where: { id: second.payment.id } })).status).toBe(
      'PENDING',
    );
    // only this payment's own authority is ever sent to Zarinpal for it
    expect(zarinpal.count('verify', paidAuthority)).toBe(1);
    expect(zarinpal.count('verify', 'A_PAID_ELSEWHERE')).toBe(0);
    expect(zarinpal.count('inquiry', 'A_PAID_ELSEWHERE')).toBe(0);
  });

  it('cancels the order and frees the stock when the customer cancels at the gateway', async () => {
    const before = await stockOf(ctx.prisma, variantId);
    const { order, payment } = await checkout();
    zarinpal.cancel(payment.providerRef!);

    await callback(payment.id, { Authority: payment.providerRef!, Status: 'NOK' });

    expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('CANCELLED');
    expect(await stockOf(ctx.prisma, variantId)).toMatchObject({ stock: before.stock, reserved: 0 });
    expect(zarinpal.count('verify')).toBe(0);
  });

  it('captures a payment whose customer never came back instead of letting it be reversed', async () => {
    const { order, payment } = await checkout();
    zarinpal.pay(payment.providerRef!);
    await ctx.prisma.order.update({
      where: { id: order.id },
      data: { reservationExpiresAt: new Date(Date.now() - 60_000) },
    });

    expect(await ctx.app.get(OrdersService).expireOrder(order.id)).toBe('PAID');

    expect(zarinpal.authorities.get(payment.providerRef!)!.state).toBe('VERIFIED');
    const stored = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(stored.status).toBe('SUCCEEDED');
    expect(stored.trackingCode).toBe(String(zarinpal.authorities.get(payment.providerRef!)!.refId));
  });

  it('leaves an order whose customer is still at the bank untouched on the result page', async () => {
    const { order, payment } = await checkout();

    const result = await actor.agent.get(`/api/payments/result/${order.orderNumber}`).expect(200);

    expect(result.body).toMatchObject({ success: false, paymentStatus: 'PENDING' });
    expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      'PAYMENT_PENDING',
    );
    expect(zarinpal.count('verify')).toBe(0);
    expect(zarinpal.count('inquiry', payment.providerRef!)).toBe(1);
  });

  it('answers the result page at once when Zarinpal cannot be reached, asking only once', async () => {
    const { order } = await checkout();
    zarinpal.unreachable = true;
    const asked = zarinpal.calls.length;

    const result = await actor.agent.get(`/api/payments/result/${order.orderNumber}`).expect(200);

    expect(result.body).toMatchObject({ success: false, paymentStatus: 'PENDING' });
    expect(zarinpal.calls.length - asked).toBe(1);
    expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      'PAYMENT_PENDING',
    );
  });
});
