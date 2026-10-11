import { formatNumberFa, toPersianDigits } from '@iphoneha/shared';
import {
  SMS_PROVIDER,
  type SmsMessage,
  type SmsProvider,
  type SmsSendResult,
} from '../src/modules/notifications/sms/sms-provider.interface';
import { ALERT_BOT, type AlertBot } from '../src/modules/notifications/bot/alert-bot';
import { anonymous, defaultAddress, loginAdmin, loginWithProfile, type Actor } from './utils/actors';
import { resetDb } from './utils/db';
import { completeMockPayment, startCheckout } from './utils/payments';
import { closeTestApp, createTestApp, type TestContext } from './utils/test-app';

/** Stands in for Melipayamak: keeps every message instead of sending it. */
class RecordingSms implements SmsProvider {
  readonly code = 'recording';
  sent: { to: string; message: SmsMessage }[] = [];
  readonly failFor = new Set<string>();

  async send(to: string, message: SmsMessage): Promise<SmsSendResult> {
    if (this.failFor.has(to)) throw new Error('Melipayamak rejected: RetStatus 35');
    this.sent.push({ to, message });
    return { provider: this.code, messageId: String(this.sent.length), accepted: true };
  }

  alerts() {
    return this.sent.filter(({ message }) => message.kind.startsWith('alert-'));
  }
}

/** Stands in for the Bale/Telegram bot set up by deploy/alerts.sh. */
class RecordingBot implements AlertBot {
  readonly service = 'bale' as const;
  texts: string[] = [];

  async send(text: string): Promise<void> {
    this.texts.push(text);
  }
}

/** The queue sends in the background: wait until `read` satisfies `done` (or give up and let the test fail). */
async function eventually<T>(read: () => T, done: (value: T) => boolean, timeoutMs = 5_000): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = read();
    if (done(value) || Date.now() - started > timeoutMs) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 600));

describe('Staff alerts', () => {
  let ctx: TestContext;
  let owner: Actor;
  const sms = new RecordingSms();
  const bot = new RecordingBot();

  beforeAll(async () => {
    ctx = await createTestApp((builder) =>
      builder.overrideProvider(SMS_PROVIDER).useValue(sms).overrideProvider(ALERT_BOT).useValue(bot),
    );
  });
  afterAll(async () => {
    await ctx.prisma.setting.deleteMany({ where: { key: 'alerts' } });
    await closeTestApp(ctx);
  });

  beforeEach(async () => {
    await resetDb(ctx.prisma, ctx.redis);
    await ctx.prisma.setting.deleteMany({ where: { key: 'alerts' } });
    owner = await loginAdmin(ctx, '09120000000');
    sms.sent = [];
    sms.failFor.clear();
    bot.texts = [];
  });

  const request = {
    name: 'علی رضایی',
    phone: '09121234567',
    city: 'اصفهان',
    method: 'CHEQUE',
    productSlug: 'iphone-17-pro-max',
    months: 12,
    source: '/installments/cheque',
  };

  async function sendRequest(body: Record<string, unknown>, ip = '203.0.113.40') {
    const visitor = await anonymous(ctx);
    const response = await visitor.agent
      .post('/api/credit-requests')
      .set('x-csrf-token', visitor.csrf)
      .set('x-forwarded-for', ip)
      .send(body)
      .expect(201);
    return response.body as { number: number; duplicate: boolean };
  }

  const saveAlerts = (body: Record<string, unknown>) =>
    owner.agent.patch('/api/admin/settings/alerts').set('x-csrf-token', owner.csrf).send(body);

  it('tells the owner about a new request by SMS and through the bot, without the customer’s details', async () => {
    const { number } = await sendRequest(request);

    const alerts = await eventually(
      () => sms.alerts(),
      (list) => list.length >= 1,
    );
    // no mobile listed yet: the owner (the SUPER_ADMIN) gets it
    expect(alerts).toEqual([
      {
        to: '09120000000',
        message: { kind: 'alert-credit-request', number: toPersianDigits(number), method: 'چک صیادی' },
      },
    ]);

    const [text] = await eventually(
      () => bot.texts,
      (list) => list.length >= 1,
    );
    expect(text).toContain(`شمارهٔ ${toPersianDigits(number)}`);
    expect(text).toContain('مدل: آیفون ۱۷ پرو مکس، ۱۲ قسط');
    expect(text).toContain('/admin/credit-requests');
    for (const personal of ['علی رضایی', '09121234567', 'اصفهان']) expect(text).not.toContain(personal);

    // the same phone again is the same request: no second alert. The next real
    // request is queued after it, so once that one arrives nothing else can.
    expect((await sendRequest(request, '203.0.113.41')).duplicate).toBe(true);
    await sendRequest({ ...request, phone: '09351112233', method: 'SAFTE' }, '203.0.113.42');
    const after = await eventually(
      () => sms.alerts(),
      (list) => list.length >= 2,
    );
    expect(after.map(({ message }) => (message as { method: string }).method)).toEqual(['چک صیادی', 'سفته']);
  });

  it('texts the mobiles listed in the panel, keeps them off the storefront, and can be turned off', async () => {
    const saved = await saveAlerts({
      mobiles: ['۰۹۱۲۱۱۱۲۲۳۳', '09121112233', '0935 123 4567'],
      creditRequests: true,
      paidOrders: false,
    }).expect(200);
    expect(saved.body).toEqual({
      mobiles: ['09121112233', '09351234567'],
      creditRequests: true,
      paidOrders: false,
    });

    const status = await owner.agent.get('/api/admin/alerts').expect(200);
    expect(status.body).toEqual({
      sms: {
        driver: 'console',
        ready: { 'credit-request': true, 'order-paid': true },
        recipients: ['09121112233', '09351234567'],
      },
      bot: { service: 'bale' },
    });

    const config = await ctx.http().get('/api/storefront/config').expect(200);
    expect(config.body.alerts).toBeUndefined();
    expect(JSON.stringify(config.body)).not.toContain('09351234567');

    await sendRequest(request);
    const alerts = await eventually(
      () => sms.alerts(),
      (list) => list.length >= 2,
    );
    expect(alerts.map(({ to }) => to)).toEqual(['09121112233', '09351234567']);

    await saveAlerts({ mobiles: ['09121112233'], creditRequests: false, paidOrders: false }).expect(200);
    sms.sent = [];
    bot.texts = [];
    await sendRequest({ ...request, phone: '09351112233' }, '203.0.113.43');
    await settle();
    expect(sms.alerts()).toEqual([]);
    expect(bot.texts).toEqual([]);

    const malformed = await saveAlerts({ mobiles: ['0912'] }).expect(400);
    expect(Object.keys(malformed.body.details.fields)).toEqual(['mobiles.0']);
    const tooMany = await saveAlerts({
      mobiles: ['09121112233', '09121112244', '09121112255', '09121112266'],
    }).expect(400);
    expect(Object.keys(tooMany.body.details.fields)).toEqual(['mobiles']);
  });

  it('answers the test button channel by channel, for staff who may change settings only', async () => {
    await saveAlerts({ mobiles: ['09121112233', '09351234567'] }).expect(200);
    sms.failFor.add('09351234567');

    const result = await owner.agent
      .post('/api/admin/alerts/test')
      .set('x-csrf-token', owner.csrf)
      .expect(200);
    expect(result.body).toEqual({
      sms: [
        { phone: '09121112233', ok: true, error: null },
        { phone: '09351234567', ok: false, error: 'Melipayamak rejected: RetStatus 35' },
      ],
      bot: { ok: true, error: null },
    });
    expect(sms.alerts()).toEqual([
      { to: '09121112233', message: { kind: 'alert-credit-request', number: 'آزمایشی', method: 'چک صیادی' } },
    ]);
    expect(bot.texts[0]).toContain('پیام آزمایشی');

    const audit = await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'alerts.test' } });
    expect(audit.after).toEqual({ sms: [true, false], bot: true });

    await ctx.prisma.adminUser.create({
      data: { phone: '09120000002', name: 'پشتیبان فروش', role: 'SUPPORT' },
    });
    const support = await loginAdmin(ctx, '09120000002');
    await support.agent.get('/api/admin/alerts').expect(403);
    await support.agent.post('/api/admin/alerts/test').set('x-csrf-token', support.csrf).expect(403);
    await support.agent
      .patch('/api/admin/settings/alerts')
      .set('x-csrf-token', support.csrf)
      .send({ mobiles: ['09120000002'] })
      .expect(403);
  });

  it('tells the owner when an order is paid, with the amount and a link to the order', async () => {
    const customer = await loginWithProfile(ctx, '09124440009', 'سارا', 'محمدی');
    const addressId = await defaultAddress(customer);
    const methods = await ctx.http().get('/api/shipping/methods?province=تهران&subtotal=0').expect(200);
    const shippingMethodId = methods.body.find((m: { available: boolean }) => m.available).id;
    const detail = await ctx.http().get('/api/products/iphone-17').expect(200);
    const variantId = detail.body.variants.find((v: { availableStock: number }) => v.availableStock >= 1).id;
    await customer.agent
      .post('/api/cart')
      .set('x-csrf-token', customer.csrf)
      .send({ variantId, quantity: 1 })
      .expect(201);
    const checkout = await startCheckout(customer, { addressId, shippingMethodId }).expect(201);
    const order = checkout.body.order as { id: string; orderNumber: string };
    const payment = await ctx.prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });

    // nothing is said about an order that is not paid yet
    await settle();
    expect(sms.alerts()).toEqual([]);

    await completeMockPayment(ctx, customer, payment.providerRef as string, 'SUCCESS');

    const stored = await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    const alerts = await eventually(
      () => sms.alerts(),
      (list) => list.length >= 1,
    );
    expect(alerts).toEqual([
      {
        to: '09120000000',
        message: {
          kind: 'alert-order-paid',
          orderNumber: order.orderNumber,
          amount: formatNumberFa(Number(stored.total)),
        },
      },
    ]);
    const [text] = await eventually(
      () => bot.texts,
      (list) => list.length >= 1,
    );
    expect(text).toContain(`سفارش تازه پرداخت شد — ${order.orderNumber}`);
    expect(text).toContain(`/admin/orders/${order.id}`);
    for (const personal of ['سارا', 'محمدی', '09124440009']) expect(text).not.toContain(personal);

    // the customer gets «سفارش موفق» with the amount
    expect(
      sms.sent.some(
        ({ to, message }) =>
          to === '09124440009' &&
          message.kind === 'order-confirmed' &&
          message.amount === formatNumberFa(Number(stored.total)),
      ),
    ).toBe(true);
  });
});
