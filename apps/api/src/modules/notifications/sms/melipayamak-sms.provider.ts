import { Logger } from '@nestjs/common';
import { maskPhone } from '@iphoneha/shared';
import { bodySnippet, networkReason } from '../../../common/http/network-error';
import type { SmsMessage, SmsProvider, SmsSendResult } from './sms-provider.interface';

/** Response of `rest.payamak-panel.com/api/SendSMS/*`. Errors come back with HTTP 200. */
interface MelipayamakResponse {
  Value?: string | number;
  RetStatus?: number;
  StrRetStatus?: string;
}

export interface MelipayamakPatterns {
  /** «کد ورود شما: {0}» — required */
  otp: number;
  /** «پرداخت سفارش {0} با موفقیت انجام شد.» — optional */
  orderPaid?: number;
  /** «سفارش {0} ارسال شد. کد رهگیری: {1}» — optional */
  orderShipped?: number;
  /** to staff: «درخواست خرید قسطی تازه، شمارهٔ {0} با {1}» — optional */
  alertCreditRequest?: number;
  /** to staff: «سفارش {0} به مبلغ {1} تومان پرداخت شد» — optional */
  alertOrderPaid?: number;
  /** to customers: «یادآوری قسط قرارداد {0} به مبلغ {1} تومان با سررسید {2}» — optional */
  installmentReminder?: number;
  /** «سفارش {0} به مبلغ {1} تومان با موفقیت ثبت شد» — optional; without it the PAYMENT pattern is used */
  orderConfirmed?: number;
  /** «قسط قرارداد {0} به مبلغ {1} تومان از سررسید {2} پرداخت نشده است» — optional; without it the reminder pattern is used */
  installmentOverdue?: number;
  /** «پرداخت قسط {0} قرارداد {1} به مبلغ {2} تومان ثبت شد. مانده: {3} تومان» — optional */
  installmentPaid?: number;
  /** «دفترچه اقساط قرارداد {0} صادر شد: {1} قسط {2} تومانی، اولین سررسید {3}» — optional */
  contractIssued?: number;
}

const ENDPOINT = 'https://rest.payamak-panel.com/api/SendSMS/BaseServiceNumber';

/**
 * Melipayamak (ملی‌پیامک) driver on the shared service line (خط خدماتی اشتراکی).
 *
 * Every message is a pre-approved pattern: only the variables travel, joined
 * with `;` in `text`, and the line is bound to the pattern (there is no `from`).
 * That is what Iranian operators require for OTPs, and it is the only way the
 * message reaches numbers that blocked promotional SMS.
 *
 * The API reports failures in the body (`RetStatus` ≠ 1) with HTTP 200, so the
 * body is always checked — otherwise a code that never arrives leaves no trace.
 */
export class MelipayamakSmsProvider implements SmsProvider {
  readonly code = 'melipayamak';
  private readonly logger = new Logger('SMS');

  constructor(
    private readonly username: string,
    private readonly password: string,
    private readonly patterns: MelipayamakPatterns,
    private readonly fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init),
  ) {}

  /** Pattern id and its variables for a message, or null when no pattern is configured for it. */
  private pattern(message: SmsMessage): { bodyId: number; args: string[] } | null {
    switch (message.kind) {
      case 'otp':
        return { bodyId: this.patterns.otp, args: [message.code] };
      case 'order-paid':
        return this.patterns.orderPaid
          ? { bodyId: this.patterns.orderPaid, args: [message.orderNumber] }
          : null;
      case 'order-confirmed':
        if (this.patterns.orderConfirmed) {
          return { bodyId: this.patterns.orderConfirmed, args: [message.orderNumber, message.amount] };
        }
        // the older one-variable «پرداخت سفارش {0} با موفقیت انجام شد»
        return this.patterns.orderPaid
          ? { bodyId: this.patterns.orderPaid, args: [message.orderNumber] }
          : null;
      case 'order-shipped':
        return this.patterns.orderShipped
          ? {
              bodyId: this.patterns.orderShipped,
              args: [message.orderNumber, message.trackingCode || 'ثبت نشده'],
            }
          : null;
      case 'alert-credit-request':
        return this.patterns.alertCreditRequest
          ? { bodyId: this.patterns.alertCreditRequest, args: [message.number, message.method] }
          : null;
      case 'alert-order-paid':
        return this.patterns.alertOrderPaid
          ? { bodyId: this.patterns.alertOrderPaid, args: [message.orderNumber, message.amount] }
          : null;
      case 'installment-reminder':
        return this.patterns.installmentReminder
          ? {
              bodyId: this.patterns.installmentReminder,
              args: [message.contractNumber, message.amount, message.dueDate],
            }
          : null;
      case 'installment-overdue': {
        const bodyId = this.patterns.installmentOverdue ?? this.patterns.installmentReminder;
        return bodyId ? { bodyId, args: [message.contractNumber, message.amount, message.dueDate] } : null;
      }
      case 'installment-paid':
        return this.patterns.installmentPaid
          ? {
              bodyId: this.patterns.installmentPaid,
              args: [message.index, message.contractNumber, message.amount, message.remaining],
            }
          : null;
      case 'contract-issued':
        return this.patterns.contractIssued
          ? {
              bodyId: this.patterns.contractIssued,
              args: [message.contractNumber, message.months, message.monthly, message.firstDue],
            }
          : null;
      case 'text':
        // free text cannot go through a pattern line
        return null;
    }
  }

  async send(to: string, message: SmsMessage): Promise<SmsSendResult> {
    const pattern = this.pattern(message);
    if (!pattern) {
      // optional notifications without an approved pattern are skipped, not retried
      this.logger.warn(`no Melipayamak pattern for "${message.kind}" — SMS to ${maskPhone(to)} skipped`);
      return { provider: this.code, messageId: null, accepted: false };
    }

    const body = new URLSearchParams({
      username: this.username,
      password: this.password,
      to,
      bodyId: String(pattern.bodyId),
      // a `;` inside a variable would shift the others, so it can never be sent
      text: pattern.args.map((arg) => arg.replaceAll(';', ',')).join(';'),
    });

    let response: Response;
    try {
      response = await this.fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          accept: 'application/json',
        },
        body,
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      const reason = networkReason(error);
      this.logger.error(`Melipayamak unreachable for "${message.kind}" to ${maskPhone(to)}: ${reason}`);
      throw new Error(`Melipayamak unreachable: ${reason}`);
    }

    const text = await response.text().catch(() => '');
    let json: MelipayamakResponse | null = null;
    try {
      json = JSON.parse(text) as MelipayamakResponse;
    } catch {
      json = null;
    }
    if (!json || typeof json !== 'object') {
      // not Melipayamak answering: a firewall or proxy page, or an outage
      const detail = `HTTP ${response.status} ${bodySnippet(text)}`.trim();
      this.logger.error(`Melipayamak unreachable for "${message.kind}" to ${maskPhone(to)}: ${detail}`);
      throw new Error(`Melipayamak unreachable: ${detail}`);
    }

    if (!response.ok || json.RetStatus !== 1) {
      const detail =
        `HTTP ${response.status}, RetStatus ${json.RetStatus ?? '-'}, Value ${json.Value ?? '-'} ${
          json.StrRetStatus ?? ''
        }`.trim();
      this.logger.error(`Melipayamak rejected "${message.kind}" to ${maskPhone(to)}: ${detail}`);
      throw new Error(`Melipayamak error: ${detail}`);
    }

    return {
      provider: this.code,
      messageId: json.Value !== undefined ? String(json.Value) : null,
      accepted: true,
    };
  }
}
