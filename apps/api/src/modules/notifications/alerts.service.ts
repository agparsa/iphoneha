import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import {
  CREDIT_METHOD_LABELS,
  paymentMethodName,
  formatNumberFa,
  formatToman,
  maskPhone,
  toPersianDigits,
  type AlertEvent,
  type AlertSettings,
  type AlertStatusDto,
  type AlertTestResultDto,
  type CreditMethod,
} from '@iphoneha/shared';
import { APP_CONFIG, type AppConfig } from '../../config/env.config';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { REDIS_CLIENT } from '../../infra/redis/redis.constants';
import { SettingsService } from '../settings/settings.service';
import { NotificationService } from './notification.service';
import { ALERT_BOT, type AlertBot } from './bot/alert-bot';
import { SMS_PROVIDER, type SmsMessage, type SmsProvider } from './sms/sms-provider.interface';

/**
 * Anyone can fill in the public request form. Past this many alerts in a clock
 * hour the rest only wait in the panel, so a flood of fake requests cannot
 * turn into a flood of paid SMS.
 */
export const CREDIT_ALERTS_PER_HOUR = 10;

export interface CreditRequestAlert {
  number: number;
  method: CreditMethod;
  productName: string | null;
  months: number | null;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Tells the store's staff about a new instalment request or a paid order, by
 * SMS (to the mobiles in «تنظیمات ← هشدارها», or the owner's) and through the
 * Telegram or Bale bot set up on the server.
 *
 * Only what is needed to act travels: the request or order number, the method,
 * the model and the amount. The customer's name and phone stay in the panel —
 * a bot message sits on the messenger's servers.
 */
@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
    @Optional() @Inject(ALERT_BOT) private readonly bot: AlertBot | null = null,
  ) {}

  /** Whether the SMS driver can send this alert: on Melipayamak it needs its own approved pattern. */
  private smsReady(event: AlertEvent): boolean {
    if (this.config.SMS_DRIVER !== 'melipayamak') return true;
    return Boolean(
      event === 'credit-request'
        ? this.config.MELIPAYAMAK_ALERT_REQUEST_BODY_ID
        : this.config.MELIPAYAMAK_ALERT_ORDER_BODY_ID,
    );
  }

  /** The listed mobiles, or the owner's (every active SUPER_ADMIN) when none are listed. */
  private async recipients(settings: AlertSettings): Promise<string[]> {
    if (settings.mobiles.length > 0) return settings.mobiles;
    const owners = await this.prisma.adminUser.findMany({
      where: { role: 'SUPER_ADMIN', isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { phone: true },
      take: 3,
    });
    return owners.map((owner) => owner.phone);
  }

  private panelUrl(path: string): string {
    return `${this.config.WEB_URL.replace(/\/$/, '')}${path}`;
  }

  async status(): Promise<AlertStatusDto> {
    const settings = await this.settings.get('alerts');
    return {
      sms: {
        driver: this.config.SMS_DRIVER,
        ready: {
          'credit-request': this.smsReady('credit-request'),
          'order-paid': this.smsReady('order-paid'),
        },
        recipients: await this.recipients(settings),
      },
      bot: { service: this.bot?.service ?? null },
    };
  }

  /** A request just came in from the storefront form. Never throws: the request itself is saved. */
  async creditRequestCreated(request: CreditRequestAlert): Promise<void> {
    try {
      const settings = await this.settings.get('alerts');
      if (!settings.creditRequests) return;
      if (!(await this.withinHourlyLimit())) {
        this.logger.warn(
          `credit request #${request.number}: over ${CREDIT_ALERTS_PER_HOUR} alerts this hour — it waits in the panel`,
        );
        return;
      }
      const number = toPersianDigits(request.number);
      const method = CREDIT_METHOD_LABELS[request.method];
      const model = request.productName
        ? `مدل: ${request.productName}${request.months ? `، ${formatNumberFa(request.months)} قسط` : ''}`
        : null;
      await this.dispatch('credit-request', settings, { kind: 'alert-credit-request', number, method }, [
        `درخواست خرید قسطی تازه — شمارهٔ ${number}`,
        `روش: ${method}`,
        model,
        'نام و شمارهٔ مشتری در پنل:',
        this.panelUrl('/admin/credit-requests'),
      ]);
    } catch (error) {
      this.logger.error(`credit request #${request.number}: alert failed: ${errorText(error)}`);
    }
  }

  /** An order was just paid (online or through an instalment service). Never throws. */
  async orderPaid(orderId: string): Promise<void> {
    try {
      const settings = await this.settings.get('alerts');
      if (!settings.paidOrders) return;
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          orderNumber: true,
          total: true,
          paymentMethod: true,
          items: { select: { productName: true, storageLabel: true, colorName: true, quantity: true } },
        },
      });
      if (!order) return;

      const total = Number(order.total);
      const items = order.items.map(
        (item) =>
          `${item.productName} ${item.storageLabel} ${item.colorName}${
            item.quantity > 1 ? ` × ${formatNumberFa(item.quantity)}` : ''
          }`,
      );
      const sms: SmsMessage = {
        kind: 'alert-order-paid',
        orderNumber: order.orderNumber,
        amount: formatNumberFa(total),
      };
      await this.dispatch('order-paid', settings, sms, [
        `سفارش تازه پرداخت شد — ${order.orderNumber}`,
        `مبلغ: ${formatToman(total)}`,
        `پرداخت: ${paymentMethodName(order.paymentMethod)}`,
        ...items,
        this.panelUrl(`/admin/orders/${order.id}`),
      ]);
    } catch (error) {
      this.logger.error(`order ${orderId}: paid-order alert failed: ${errorText(error)}`);
    }
  }

  private async dispatch(
    event: AlertEvent,
    settings: AlertSettings,
    sms: SmsMessage,
    lines: (string | null)[],
  ): Promise<void> {
    if (this.smsReady(event)) {
      for (const phone of await this.recipients(settings)) await this.notifications.sendStaffSms(phone, sms);
    }
    if (this.bot) await this.notifications.sendBotMessage(lines.filter(Boolean).join('\n'));
  }

  /** One counter per clock hour, shared by every API process. */
  private async withinHourlyLimit(): Promise<boolean> {
    const key = `alerts:credit:${Math.floor(Date.now() / 3_600_000)}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 3_600);
    return count <= CREDIT_ALERTS_PER_HOUR;
  }

  /**
   * «پیام آزمایشی» in the settings tab: sent now, not queued, so the owner sees
   * each channel's real answer — a wrong pattern, a blocked bot, no connection.
   */
  async sendTest(): Promise<AlertTestResultDto> {
    const settings = await this.settings.get('alerts');
    const result: AlertTestResultDto = { sms: [], bot: null };

    const event = (['credit-request', 'order-paid'] as const).find((candidate) => this.smsReady(candidate));
    if (event) {
      const message: SmsMessage =
        event === 'credit-request'
          ? { kind: 'alert-credit-request', number: 'آزمایشی', method: CREDIT_METHOD_LABELS.CHEQUE }
          : { kind: 'alert-order-paid', orderNumber: 'آزمایشی', amount: formatNumberFa(0) };
      for (const phone of await this.recipients(settings)) {
        try {
          const sent = await this.sms.send(phone, message);
          result.sms.push({ phone, ok: sent.accepted, error: sent.accepted ? null : 'پیامک فرستاده نشد' });
        } catch (error) {
          this.logger.warn(`test alert SMS to ${maskPhone(phone)} failed: ${errorText(error)}`);
          result.sms.push({ phone, ok: false, error: errorText(error) });
        }
      }
    }

    if (this.bot) {
      try {
        await this.bot.send(
          [
            'پیام آزمایشی پنل آیفونی‌ها',
            'هشدارهای فروشگاه به این گفتگو می‌رسند.',
            this.panelUrl('/admin'),
          ].join('\n'),
        );
        result.bot = { ok: true, error: null };
      } catch (error) {
        result.bot = { ok: false, error: errorText(error) };
      }
    }
    return result;
  }
}
