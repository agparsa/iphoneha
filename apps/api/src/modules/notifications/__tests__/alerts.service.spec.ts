import type { AlertSettings } from '@iphoneha/shared';
import { AlertsService, CREDIT_ALERTS_PER_HOUR, type CreditRequestAlert } from '../alerts.service';
import type { SmsMessage } from '../sms/sms-provider.interface';

interface Options {
  settings?: Partial<AlertSettings>;
  driver?: 'console' | 'kavenegar' | 'melipayamak';
  requestBodyId?: number;
  orderBodyId?: number;
  bot?: boolean;
  owners?: string[];
  order?: unknown;
  smsFailsFor?: string;
}

function setup(options: Options = {}) {
  const settings: AlertSettings = {
    mobiles: [],
    creditRequests: true,
    paidOrders: true,
    ...options.settings,
  };
  const settingsService = {
    get: jest.fn(async (key: string) => {
      if (key !== 'alerts') throw new Error(`unexpected settings key ${key}`);
      return settings;
    }),
  };
  const prisma = {
    adminUser: {
      findMany: jest.fn(async () => (options.owners ?? ['09120000000']).map((phone) => ({ phone }))),
    },
    order: { findUnique: jest.fn(async () => options.order ?? null) },
  };
  const queued = { sms: [] as { phone: string; message: SmsMessage }[], bot: [] as string[] };
  const notifications = {
    sendStaffSms: jest.fn(async (phone: string, message: SmsMessage) => {
      queued.sms.push({ phone, message });
    }),
    sendBotMessage: jest.fn(async (text: string) => {
      queued.bot.push(text);
    }),
  };
  const counters = new Map<string, number>();
  const redis = {
    incr: jest.fn(async (key: string) => {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    }),
    expire: jest.fn(async () => 1),
  };
  const config = {
    SMS_DRIVER: options.driver ?? 'melipayamak',
    MELIPAYAMAK_ALERT_REQUEST_BODY_ID: 'requestBodyId' in options ? options.requestBodyId : 444,
    MELIPAYAMAK_ALERT_ORDER_BODY_ID: 'orderBodyId' in options ? options.orderBodyId : 555,
    WEB_URL: 'https://iphoneha.com/',
  };
  const sms = {
    code: 'fake',
    send: jest.fn(async (phone: string) => {
      if (phone === options.smsFailsFor) throw new Error('Melipayamak rejected: RetStatus 35');
      return { provider: 'fake', messageId: '1', accepted: true };
    }),
  };
  const bot =
    options.bot === false ? null : { service: 'telegram' as const, send: jest.fn(async () => undefined) };

  const service = new AlertsService(
    settingsService as never,
    prisma as never,
    notifications as never,
    redis as never,
    config as never,
    sms as never,
    bot as never,
  );
  return { service, queued, sms, bot, prisma, settingsService };
}

const request: CreditRequestAlert = {
  number: 12,
  method: 'CHEQUE',
  productName: 'آیفون ۱۷ پرو مکس',
  months: 12,
};

describe('AlertsService', () => {
  describe('a new credit request', () => {
    it('texts every listed mobile and tells the bot chat, with the number, method and model only', async () => {
      const { service, queued } = setup({ settings: { mobiles: ['09121111111', '09122222222'] } });

      await service.creditRequestCreated(request);

      expect(queued.sms).toEqual([
        { phone: '09121111111', message: { kind: 'alert-credit-request', number: '۱۲', method: 'چک صیادی' } },
        { phone: '09122222222', message: { kind: 'alert-credit-request', number: '۱۲', method: 'چک صیادی' } },
      ]);
      expect(queued.bot).toEqual([
        [
          'درخواست خرید قسطی تازه — شمارهٔ ۱۲',
          'روش: چک صیادی',
          'مدل: آیفون ۱۷ پرو مکس، ۱۲ قسط',
          'نام و شمارهٔ مشتری در پنل:',
          'https://iphoneha.com/admin/credit-requests',
        ].join('\n'),
      ]);
    });

    it('leaves the model line out when the visitor did not pick one', async () => {
      const { service, queued } = setup();
      await service.creditRequestCreated({ number: 3, method: 'SAFTE', productName: null, months: null });
      expect(queued.bot[0]).not.toContain('مدل:');
      expect(queued.bot[0]).toContain('روش: سفته');
    });

    it('texts the owner when no mobile is listed', async () => {
      const { service, queued, prisma } = setup({ owners: ['09129999999'] });
      await service.creditRequestCreated(request);
      expect(prisma.adminUser.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { role: 'SUPER_ADMIN', isActive: true } }),
      );
      expect(queued.sms.map((sms) => sms.phone)).toEqual(['09129999999']);
    });

    it('sends no SMS on Melipayamak until the alert pattern is set, but still tells the bot', async () => {
      const { service, queued } = setup({ requestBodyId: undefined });
      await service.creditRequestCreated(request);
      expect(queued.sms).toHaveLength(0);
      expect(queued.bot).toHaveLength(1);
    });

    it('needs no pattern on the other drivers', async () => {
      const { service, queued } = setup({ driver: 'console', requestBodyId: undefined, bot: false });
      await service.creditRequestCreated(request);
      expect(queued.sms).toHaveLength(1);
      expect(queued.bot).toHaveLength(0);
    });

    it('stays quiet when the owner turned request alerts off', async () => {
      const { service, queued } = setup({ settings: { creditRequests: false } });
      await service.creditRequestCreated(request);
      expect(queued).toEqual({ sms: [], bot: [] });
    });

    it(`stops after ${CREDIT_ALERTS_PER_HOUR} alerts in an hour, so a flood of fake forms costs nothing`, async () => {
      const { service, queued } = setup({ bot: false });
      for (let i = 1; i <= CREDIT_ALERTS_PER_HOUR + 3; i += 1) {
        await service.creditRequestCreated({ ...request, number: i });
      }
      expect(queued.sms).toHaveLength(CREDIT_ALERTS_PER_HOUR);
    });

    it('never throws: the request is already saved when the alert fails', async () => {
      const { service, settingsService } = setup();
      settingsService.get.mockRejectedValueOnce(new Error('redis down'));
      await expect(service.creditRequestCreated(request)).resolves.toBeUndefined();
    });
  });

  describe('a paid order', () => {
    const order = {
      id: 'ord_1',
      orderNumber: 'IH100012',
      total: 85_000_000n,
      paymentMethod: 'ONLINE',
      items: [
        { productName: 'آیفون ۱۷ پرو', storageLabel: '۲۵۶ گیگابایت', colorName: 'نارنجی', quantity: 2 },
        { productName: 'آیفون ۱۷', storageLabel: '۱۲۸ گیگابایت', colorName: 'مشکی', quantity: 1 },
      ],
    };

    it('texts the order number and amount and sends the items with a link to the order', async () => {
      const { service, queued } = setup({ order });

      await service.orderPaid('ord_1');

      expect(queued.sms).toEqual([
        {
          phone: '09120000000',
          message: { kind: 'alert-order-paid', orderNumber: 'IH100012', amount: '۸۵٬۰۰۰٬۰۰۰' },
        },
      ]);
      expect(queued.bot[0]!.split('\n')).toEqual([
        'سفارش تازه پرداخت شد — IH100012',
        'مبلغ: ۸۵٬۰۰۰٬۰۰۰ تومان',
        'پرداخت: پرداخت آنلاین',
        'آیفون ۱۷ پرو ۲۵۶ گیگابایت نارنجی × ۲',
        'آیفون ۱۷ ۱۲۸ گیگابایت مشکی',
        'https://iphoneha.com/admin/orders/ord_1',
      ]);
    });

    it('stays quiet when paid-order alerts are off or the order is gone', async () => {
      const off = setup({ order, settings: { paidOrders: false } });
      await off.service.orderPaid('ord_1');
      expect(off.queued).toEqual({ sms: [], bot: [] });

      const missing = setup();
      await missing.service.orderPaid('ord_x');
      expect(missing.queued).toEqual({ sms: [], bot: [] });
    });
  });

  describe('status and the test button', () => {
    it('says which alerts SMS can send and who gets them', async () => {
      const { service } = setup({ orderBodyId: undefined, settings: { mobiles: ['09121111111'] } });
      await expect(service.status()).resolves.toEqual({
        sms: {
          driver: 'melipayamak',
          ready: { 'credit-request': true, 'order-paid': false },
          recipients: ['09121111111'],
        },
        bot: { service: 'telegram' },
      });
    });

    it('sends the test right away and reports every channel’s answer', async () => {
      const { service, sms, bot } = setup({
        settings: { mobiles: ['09121111111', '09122222222'] },
        smsFailsFor: '09122222222',
      });

      const result = await service.sendTest();

      expect(sms.send).toHaveBeenCalledWith('09121111111', {
        kind: 'alert-credit-request',
        number: 'آزمایشی',
        method: 'چک صیادی',
      });
      expect(result).toEqual({
        sms: [
          { phone: '09121111111', ok: true, error: null },
          { phone: '09122222222', ok: false, error: 'Melipayamak rejected: RetStatus 35' },
        ],
        bot: { ok: true, error: null },
      });
      expect(bot!.send).toHaveBeenCalledTimes(1);
    });

    it('tests SMS with the order pattern when only that one is set, and skips SMS when neither is', async () => {
      const orderOnly = setup({ requestBodyId: undefined, bot: false });
      await orderOnly.service.sendTest();
      expect(orderOnly.sms.send).toHaveBeenCalledWith('09120000000', {
        kind: 'alert-order-paid',
        orderNumber: 'آزمایشی',
        amount: '۰',
      });

      const none = setup({ requestBodyId: undefined, orderBodyId: undefined, bot: false });
      await expect(none.service.sendTest()).resolves.toEqual({ sms: [], bot: null });
    });
  });
});
