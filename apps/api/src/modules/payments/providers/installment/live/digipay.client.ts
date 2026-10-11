import { Logger } from '@nestjs/common';
import { bodySnippet } from '../../../../../common/http/network-error';
import type { InstallmentGatewayClient, InstallmentSessionResult } from '../installment-gateway.client';
import type {
  CreatePaymentContext,
  DeliveryResult,
  PaymentStatusResult,
  RefundPaymentResult,
  VerifyPaymentResult,
} from '../../payment-provider.interface';
import {
  defaultFetch,
  exchange,
  mobile09,
  record,
  rial,
  text,
  TokenCache,
  type FetchImpl,
  type ProbeResult,
} from './http';

export interface DigipayCredentials {
  /** https://api.mydigipay.com/digipay/api (UAT: https://uat.mydigipay.info/digipay/api) */
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  /** ticket type: 11 = every way to pay DigiPay offers (credit and BNPL included) */
  ticketType: number;
  /** verify with the tracking code in the body (current docs) or in the path (document v1.2) */
  verifyStyle: 'body' | 'path';
  /** the basket's seller and supplier ids — DigiPay assigns them; the username when not given */
  sellerId?: string;
  supplierId?: string;
}

/** A refusal from DigiPay itself (`result.status` ≠ 0). */
export class DigipayError extends Error {
  override readonly name = 'DigipayError';
  constructor(
    message: string,
    readonly code: number | null,
    readonly httpStatus: number,
  ) {
    super(message);
  }
}

/** Callback `type`s that are credit or «buy now, pay later» — those need «deliver». */
const CREDIT_TYPES = new Set([5, 13]);
/** Verify answers that settle the purchase as not paid. Anything else leaves it pending, never cancels on a guess. */
const NOT_PAID = new Set([9000, 9003, 9005, 9007, 9009, 9010]);

/**
 * DigiPay (دیجی‌پی) — the merchant UPG API, used for credit and BNPL purchases.
 *
 * Amounts are Rial. The customer comes back by POST with a tracking code and
 * the purchase `type`; the purchase is ours only after `verify` with them —
 * unverified purchases are given back to the customer by DigiPay. The answer
 * of verify must name OUR providerId and amount: the callback is just the
 * customer's browser and could carry another purchase's tracking code.
 * Credit purchases are settled after `deliver`, sent when the order is marked
 * delivered. DigiPay has no purchase inquiry, so the callback fields are kept
 * on the payment (`meta.callback`) for a later verify.
 */
export class DigipayClient implements InstallmentGatewayClient {
  private readonly logger = new Logger('DigiPay');
  private readonly tokens: TokenCache;
  private readonly base: string;

  constructor(
    private readonly credentials: DigipayCredentials,
    private readonly fetchImpl: FetchImpl = defaultFetch,
    /** `sandbox`: the service's test environment (the payment code says so: snappay-sandbox…) */
    readonly driver: 'live' | 'sandbox' = 'live',
  ) {
    this.base = credentials.baseUrl.replace(/\/+$/, '');
    this.tokens = new TokenCache(() => this.signIn());
  }

  // ─── plumbing ──────────────────────────────────────────────────────────────

  private async signIn(): Promise<{ token: string; expiresInSeconds: number }> {
    const basic = Buffer.from(`${this.credentials.clientId}:${this.credentials.clientSecret}`).toString(
      'base64',
    );
    // multipart form, as the documentation's example sends it
    const form = new FormData();
    form.set('username', this.credentials.username);
    form.set('password', this.credentials.password);
    form.set('grant_type', 'password');
    const answer = await exchange(this.fetchImpl, 'DigiPay', `${this.base}/oauth/token`, {
      method: 'POST',
      headers: { authorization: `Basic ${basic}`, accept: 'application/json' },
      body: form,
    });
    const json = record(answer.json);
    const token = text(json.access_token);
    if (answer.status !== 200 || !token) {
      const why = text(json.error_description) || text(json.error) || bodySnippet(answer.text) || 'no token';
      throw new DigipayError(`DigiPay sign-in refused (HTTP ${answer.status}): ${why}`, null, answer.status);
    }
    return { token, expiresInSeconds: Number(json.expires_in) || 3599 };
  }

  private async call(
    path: string,
    body: unknown,
    options: { ticket?: boolean; retried?: boolean } = {},
  ): Promise<Record<string, unknown>> {
    const token = await this.tokens.get();
    const answer = await exchange(this.fetchImpl, 'DigiPay', `${this.base}/${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        'content-type': 'application/json;charset=UTF-8',
        ...(options.ticket ? { agent: 'WEB', 'digipay-version': '2022-02-02' } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (answer.status === 401 && !options.retried) {
      this.tokens.clear();
      return this.call(path, body, { ...options, retried: true });
    }
    const json = record(answer.json);
    const result = record(json.result);
    const code =
      typeof result.status === 'number'
        ? result.status
        : Number.isFinite(Number(result.status))
          ? Number(result.status)
          : null;
    if (answer.status === 200 && code === 0) return json;
    const message = text(result.message) || text(result.title) || bodySnippet(answer.text) || 'no details';
    throw new DigipayError(
      `DigiPay ${path.split('?')[0]} refused (HTTP ${answer.status}${code !== null ? `, code ${code}` : ''}): ${message}`,
      code,
      answer.status,
    );
  }

  // ─── the interface ─────────────────────────────────────────────────────────

  /** Proves from this server that the keys are accepted: a fresh sign-in (DigiPay has no harmless read call). */
  async probe(): Promise<ProbeResult> {
    this.tokens.clear();
    await this.tokens.get();
    return { status: 'OK', detail: 'DigiPay accepted the keys (signed in)' };
  }

  async createSession({ context }: { context: CreatePaymentContext }): Promise<InstallmentSessionResult> {
    const phone = mobile09(context.customer.phone);
    if (!phone) throw new DigipayError('DigiPay needs the customer mobile (09…)', 1054, 400);
    const amountRial = rial(context.amount);
    const providerId = context.paymentId;
    const seller = this.credentials.sellerId || this.credentials.username;
    const supplier = this.credentials.supplierId || seller;
    const json = await this.call(
      `tickets/business?type=${this.credentials.ticketType}`,
      {
        amount: amountRial,
        cellNumber: phone,
        providerId,
        callbackUrl: context.callbackUrl,
        basketDetailsDto: {
          basketId: `${context.orderNumber}-${providerId.slice(-6)}`,
          items: context.items.map((item) => ({
            sellerId: seller,
            supplierId: supplier,
            productCode: item.sku,
            brand: 'Apple',
            productType: 1, // durable goods (کالای بادوام)
            count: item.quantity,
            categoryId: 'mobile',
          })),
        },
      },
      { ticket: true },
    );
    const ticket = text(json.ticket);
    const redirectUrl = text(json.redirectUrl);
    if (!ticket || !redirectUrl) throw new DigipayError('DigiPay returned no ticket', null, 200);
    return { ref: ticket, redirectUrl, raw: { providerId, ticket, amountRial } };
  }

  async verify({
    ref,
    amount,
    callback,
    meta,
  }: {
    ref: string;
    amount: number;
    callback?: Record<string, unknown>;
    meta?: unknown;
  }): Promise<VerifyPaymentResult> {
    const stored = record(meta);
    const providerId = text(stored.providerId);
    const data = callback ?? record(stored.callback);
    if (Object.keys(data).length === 0) return { status: 'PENDING', providerRef: ref };

    // a callback naming another purchase is not ours to act on
    const namedId = text(data.providerId);
    if (namedId && providerId && namedId !== providerId) return { status: 'PENDING', providerRef: ref };
    const said = text(data.result).toUpperCase();
    if (said && said !== 'SUCCESS') {
      return {
        status: 'FAILED',
        providerRef: ref,
        failureReason: 'پرداخت در دیجی‌پی انجام نشد',
        raw: { result: said },
      };
    }
    const trackingCode = text(data.trackingCode);
    const type = Number(text(data.type));
    if (!trackingCode || !Number.isFinite(type) || text(data.type) === '') {
      return { status: 'PENDING', providerRef: ref };
    }

    let answer: Record<string, unknown>;
    try {
      answer =
        this.credentials.verifyStyle === 'path'
          ? await this.call(`purchases/verify/${encodeURIComponent(trackingCode)}?type=${type}`, undefined)
          : await this.call(`purchases/verify?type=${type}`, { trackingCode, providerId });
    } catch (error) {
      if (error instanceof DigipayError && error.code !== null && NOT_PAID.has(error.code)) {
        return {
          status: 'FAILED',
          providerRef: ref,
          failureReason: 'دیجی‌پی این پرداخت را تأیید نکرد',
          raw: { code: error.code },
        };
      }
      throw error;
    }

    const answeredId = text(answer.providerId);
    const answeredAmount = Number(answer.amount);
    const expectedRial = Number(stored.amountRial) || rial(amount);
    if (
      (answeredId && providerId && answeredId !== providerId) ||
      (Number.isFinite(answeredAmount) && answeredAmount !== expectedRial)
    ) {
      this.logger.error(
        `purchase ${trackingCode} verified for providerId ${answeredId || '?'} / ${answer.amount} IRR, expected ${providerId} / ${expectedRial} — not accepted`,
      );
      return {
        status: 'PENDING',
        providerRef: ref,
        failureReason: 'پاسخ دیجی‌پی با این سفارش یکی نیست',
        raw: answer,
      };
    }
    return {
      status: 'SUCCESS',
      providerRef: ref,
      trackingCode,
      raw: answer,
      meta: { trackingCode, type, verifiedAt: new Date().toISOString() },
    };
  }

  /** No purchase inquiry at DigiPay: a kept callback is verified, otherwise nothing is known yet. */
  async status({
    ref,
    amount,
    meta,
  }: {
    ref: string;
    amount: number;
    meta?: unknown;
  }): Promise<PaymentStatusResult> {
    if (Object.keys(record(record(meta).callback)).length === 0) return { status: 'UNKNOWN' };
    const result = await this.verify({ ref, amount, meta });
    return {
      status: result.status,
      trackingCode: result.trackingCode ?? null,
      raw: result.raw,
      meta: result.meta,
    };
  }

  async refund({
    ref,
    amount,
    meta,
    trackingCode,
  }: {
    ref: string;
    amount: number;
    meta?: unknown;
    trackingCode?: string | null;
  }): Promise<RefundPaymentResult> {
    const stored = record(meta);
    const sale = text(stored.trackingCode) || text(trackingCode);
    const type = Number(stored.type);
    if (!sale || !Number.isFinite(type)) {
      return {
        status: 'MANUAL',
        message: 'کد پیگیری دیجی‌پی این پرداخت ثبت نشده است؛ از پنل دیجی‌پی برگردانید',
      };
    }
    const refundId = `${text(stored.providerId) || ref}-r${Date.now().toString(36)}`;
    const answer = await this.call(`refunds?type=${type}`, {
      providerId: refundId,
      amount: rial(amount),
      saleTrackingCode: sale,
    });
    return { status: 'REFUNDED', reference: text(answer.trackingCode) || refundId, raw: answer };
  }

  async confirmDelivery({
    meta,
    trackingCode,
    orderNumber,
    skus,
  }: {
    ref: string;
    meta?: unknown;
    trackingCode?: string | null;
    orderNumber: string;
    skus: string[];
  }): Promise<DeliveryResult> {
    const stored = record(meta);
    const type = Number(stored.type);
    if (!CREDIT_TYPES.has(type)) return { status: 'NOT_NEEDED' };
    const sale = text(stored.trackingCode) || text(trackingCode);
    if (!sale) return { status: 'FAILED', message: 'کد پیگیری دیجی‌پی این پرداخت ثبت نشده است' };
    try {
      const answer = await this.call(`purchases/deliver?type=${type}`, {
        deliveryDate: Date.now(),
        invoiceNumber: orderNumber,
        trackingCode: sale,
        products: skus,
      });
      return { status: 'CONFIRMED', raw: answer };
    } catch (error) {
      return { status: 'FAILED', message: error instanceof Error ? error.message : String(error) };
    }
  }
}
