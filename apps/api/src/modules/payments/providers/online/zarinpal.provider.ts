import { Logger } from '@nestjs/common';
import { PAYMENT_METHOD_INFO, tomanToRial } from '@iphoneha/shared';
import { bodySnippet, networkReason } from '../../../../common/http/network-error';
import type {
  CreatePaymentContext,
  CreatePaymentResult,
  EligibilityResult,
  PaymentProvider,
  PaymentRecordRef,
  PaymentStatusResult,
  RefundPaymentResult,
  VerifyPaymentResult,
} from '../payment-provider.interface';

interface ZarinpalError {
  code?: number;
  message?: string;
  validations?: unknown;
}

interface ZarinpalEnvelope<T> {
  data: T | [];
  errors: ZarinpalError | [];
}

interface ZarinpalRequestData {
  code: number;
  message: string;
  authority: string;
  fee_type?: string;
  fee?: number;
}

interface ZarinpalVerifyData {
  code: number;
  message: string;
  ref_id?: number | string;
  card_pan?: string;
}

interface ZarinpalInquiryData {
  code: number;
  message?: string;
  status: string;
}

const isData = <T>(value: T | []): value is T => !Array.isArray(value);

/**
 * Verify answers that settle a payment as not paid: amount mismatch (-50),
 * not paid (-51), another merchant's session (-53), unknown authority (-54).
 * Any other error is a configuration or temporary problem: the payment stays
 * pending and is asked about again, never cancelled on a guess.
 */
const NOT_PAID_CODES = new Set([-50, -51, -53, -54]);
/** Inquiry states in which the money is with Zarinpal: verifying captures it. */
const PAID_STATES = new Set(['PAID', 'VERIFIED']);
/** Inquiry states from which the payment can no longer succeed. */
const DEAD_STATES = new Set(['FAILED', 'REVERSED']);

function describeErrors(errors: ZarinpalError | []): string {
  if (Array.isArray(errors)) return 'no data in the answer';
  const validations = errors.validations ? ` ${JSON.stringify(errors.validations)}` : '';
  return `code ${errors.code ?? '?'}: ${errors.message ?? 'unknown error'}${validations}`;
}

/**
 * Zarinpal (زرین‌پال) payment gateway — REST API v4.
 * Amounts are sent in Rial; our own bookkeeping stays in Toman.
 *
 * Money is only ever taken as paid after `verify.json` confirms it for the
 * authority THIS payment opened. The callback's query string is a hint the
 * customer's browser carries and anyone can forge: its Authority must match
 * the stored one, otherwise a paid authority of one order could be replayed
 * against another order of the same amount (Zarinpal answers 101 «already
 * verified» for it). A payment Zarinpal holds as PAID must still be verified —
 * unverified money goes back to the payer — so reconciliation verifies too.
 */
export class ZarinpalProvider implements PaymentProvider {
  readonly method = 'ONLINE' as const;
  readonly code = 'zarinpal';
  readonly kind = 'ONLINE' as const;
  readonly displayName = PAYMENT_METHOD_INFO.ONLINE.name;

  private readonly logger = new Logger('ZarinpalProvider');
  private readonly api: string;
  private readonly startPay: string;

  constructor(
    private readonly merchantId: string,
    sandbox: boolean,
    private readonly fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init),
  ) {
    this.api = sandbox
      ? 'https://sandbox.zarinpal.com/pg/v4/payment'
      : 'https://payment.zarinpal.com/pg/v4/payment';
    this.startPay = sandbox
      ? 'https://sandbox.zarinpal.com/pg/StartPay'
      : 'https://payment.zarinpal.com/pg/StartPay';
  }

  /** One API call. Throws when Zarinpal itself did not answer (network, firewall page, outage). */
  private async call<T>(path: string, body: Record<string, unknown>): Promise<ZarinpalEnvelope<T>> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.api}/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ merchant_id: this.merchantId, ...body }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      throw new Error(`Zarinpal unreachable: ${networkReason(error)}`);
    }

    const text = await response.text().catch(() => '');
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    if (!json || typeof json !== 'object' || !('data' in json) || !('errors' in json)) {
      const snippet = bodySnippet(text);
      throw new Error(`Zarinpal unreachable: HTTP ${response.status}${snippet ? ` ${snippet}` : ''}`);
    }
    return json as ZarinpalEnvelope<T>;
  }

  async checkEligibility(): Promise<EligibilityResult> {
    return { eligible: true, reason: null, estimate: null };
  }

  async createPayment(context: CreatePaymentContext): Promise<CreatePaymentResult> {
    const result = await this.call<ZarinpalRequestData>('request.json', {
      amount: tomanToRial(context.amount),
      currency: 'IRR',
      description: context.description,
      callback_url: context.callbackUrl,
      metadata: { mobile: context.customer.phone, order_id: context.orderNumber },
    });

    if (!isData(result.data) || result.data.code !== 100 || !result.data.authority) {
      const message = describeErrors(result.errors);
      this.logger.error(`Zarinpal request failed: ${message}`);
      throw new Error(`Zarinpal request failed: ${message}`);
    }

    return {
      providerRef: result.data.authority,
      redirectUrl: `${this.startPay}/${result.data.authority}`,
      raw: result.data,
    };
  }

  async verifyPayment({
    payment,
    callbackQuery,
  }: {
    payment: PaymentRecordRef;
    callbackQuery?: Record<string, unknown>;
  }): Promise<VerifyPaymentResult> {
    const authority = payment.providerRef;
    const returned = callbackQuery?.Authority;
    // only a callback carrying this payment's own authority says anything about it
    const trusted = typeof returned === 'string' && authority !== null && returned === authority;
    if (callbackQuery && !trusted) {
      this.logger.warn(
        `payment ${payment.id}: callback without this payment's authority — its status is ignored`,
      );
    }

    if (!authority) {
      // the gateway session was never opened, so there is nothing to verify yet
      return { status: 'PENDING', providerRef: null };
    }

    const returnedStatus = trusted ? callbackQuery?.Status : undefined;
    if (returnedStatus !== 'OK') {
      // not back from a successful payment: ask where it stands before acting on it
      const state = await this.inquire(authority);
      if (DEAD_STATES.has(state)) {
        return {
          status: 'FAILED',
          providerRef: authority,
          failureReason: returnedStatus === 'NOK' ? 'پرداخت توسط کاربر لغو شد' : 'پرداخت انجام نشد',
          raw: { inquiry: state },
        };
      }
      if (!PAID_STATES.has(state)) {
        return returnedStatus === 'NOK'
          ? {
              status: 'FAILED',
              providerRef: authority,
              failureReason: 'پرداخت توسط کاربر لغو شد',
              raw: { inquiry: state },
            }
          : { status: 'PENDING', providerRef: authority, raw: { inquiry: state } };
      }
      // PAID or VERIFIED: verify below — money Zarinpal holds unverified goes back to the payer
    }

    return this.verify(payment, authority);
  }

  private async verify(payment: PaymentRecordRef, authority: string): Promise<VerifyPaymentResult> {
    const result = await this.call<ZarinpalVerifyData>('verify.json', {
      amount: tomanToRial(payment.amount),
      authority,
    });

    // 100: verified now, 101: this same authority was verified before
    if (isData(result.data) && (result.data.code === 100 || result.data.code === 101)) {
      const refId = result.data.ref_id;
      return {
        status: 'SUCCESS',
        providerRef: authority,
        trackingCode: refId !== undefined && refId !== null && refId !== '' ? String(refId) : null,
        raw: result.data,
      };
    }

    if (!Array.isArray(result.errors) && NOT_PAID_CODES.has(Number(result.errors.code))) {
      return {
        status: 'FAILED',
        providerRef: authority,
        failureReason: 'پرداخت انجام یا تأیید نشد',
        raw: result,
      };
    }

    throw new Error(`Zarinpal verify failed: ${describeErrors(result.errors)}`);
  }

  private async inquire(authority: string): Promise<string> {
    const result = await this.call<ZarinpalInquiryData>('inquiry.json', { authority });
    if (!isData(result.data)) throw new Error(`Zarinpal inquiry failed: ${describeErrors(result.errors)}`);
    return String(result.data.status ?? '').toUpperCase();
  }

  /**
   * Zarinpal refunds are issued from the merchant panel (the REST API v4 has no
   * public refund endpoint), so the payment is flagged for manual processing.
   */
  async refundPayment(): Promise<RefundPaymentResult> {
    return {
      status: 'MANUAL',
      reference: null,
      message: 'بازگشت وجه زرین‌پال باید از پنل پذیرنده انجام شود',
    };
  }

  /** Used when the customer never came back: a paid payment is verified here, which captures it. */
  async getPaymentStatus({ payment }: { payment: PaymentRecordRef }): Promise<PaymentStatusResult> {
    if (!payment.providerRef) return { status: 'UNKNOWN' };
    const result = await this.verifyPayment({ payment });
    return { status: result.status, trackingCode: result.trackingCode ?? null, raw: result.raw };
  }
}
