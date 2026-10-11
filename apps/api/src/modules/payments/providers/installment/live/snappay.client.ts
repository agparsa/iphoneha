import { Logger } from '@nestjs/common';
import { bodySnippet } from '../../../../../common/http/network-error';
import type {
  InstallmentGatewayClient,
  InstallmentSessionResult,
  ServiceEligibility,
} from '../installment-gateway.client';
import type {
  CreatePaymentContext,
  PaymentStatusResult,
  RefundPaymentResult,
  VerifyPaymentResult,
} from '../../payment-provider.interface';
import {
  basketLines,
  defaultFetch,
  exchange,
  mobile09,
  numericId,
  record,
  rial,
  text,
  TokenCache,
  type FetchImpl,
  type ProbeResult,
} from './http';

export interface SnappPayCredentials {
  /** https://api.snapppay.ir (staging: https://fms-gateway-staging.apps.public.okd4.teh-1.snappcloud.io) */
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  /** the product category code of the merchant's contract (100 = general, what most merchants send) */
  commissionType: number;
}

interface Envelope<T> {
  successful?: boolean;
  response?: T;
  errorData?: { errorCode?: number; message?: string; data?: unknown };
}

interface PaymentTokenResponse {
  paymentToken: string;
  paymentPageUrl: string;
}

interface StatusResponse {
  transactionId?: string;
  status?: string;
  amount?: number;
}

/** A refusal from SnappPay itself (it answered, with an error code). */
export class SnappPayError extends Error {
  override readonly name = 'SnappPayError';
  constructor(
    message: string,
    readonly code: number | null,
    readonly httpStatus: number,
  ) {
    super(message);
  }
}

/** Customer-facing text for the codes a buyer can cause; the rest is logged, not shown. */
const REASONS: Record<number, string> = {
  1005: 'اطلاعات پرداخت برای اسنپ‌پی کامل نبود',
  1013: 'حساب فروشگاه در اسنپ‌پی فعال نیست',
  1051: 'آدرس بازگشت فروشگاه در اسنپ‌پی ثبت نشده است',
};

const ELIGIBILITY_TTL_MS = 60_000;
/** Toman asked about by `probe()` — any answer proves the keys work. */
const PROBE_AMOUNT = 50_000_000;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Snapp Pay (اسنپ‌پی) — the online-merchant REST API (document v1.9).
 *
 * Every amount is Rial. The customer's first instalment is taken on SnappPay's
 * page; the purchase is ours only after `verify` and then `settle` — anything
 * not verified in time is given back to the customer by SnappPay itself. So
 * every path that finds a paid (`PENDING`) transaction captures it, and every
 * decision comes from SnappPay's `status`, never from the callback's `state`.
 *
 * SnappPay only answers servers whose IP it has whitelisted, sign-in included.
 */
export class SnappPayClient implements InstallmentGatewayClient {
  private readonly logger = new Logger('SnappPay');
  private readonly tokens: TokenCache;
  private readonly base: string;
  private readonly eligibilityCache = new Map<number, { at: number; answer: ServiceEligibility }>();

  constructor(
    private readonly credentials: SnappPayCredentials,
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
    const answer = await exchange(this.fetchImpl, 'SnappPay', `${this.base}/api/online/v1/oauth/token`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${basic}`,
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'password',
        scope: 'online-merchant',
        username: this.credentials.username,
        password: this.credentials.password,
      }).toString(),
    });
    const json = record(answer.json);
    const token = text(json.access_token);
    if (answer.status !== 200 || !token) {
      const why = text(json.error_description) || text(json.error) || bodySnippet(answer.text) || 'no token';
      throw new SnappPayError(
        `SnappPay sign-in refused (HTTP ${answer.status}): ${why}`,
        null,
        answer.status,
      );
    }
    return { token, expiresInSeconds: Number(json.expires_in) || 3600 };
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown, retried = false): Promise<T> {
    const token = await this.tokens.get();
    const answer = await exchange(this.fetchImpl, 'SnappPay', `${this.base}/api/online${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      // verify and settle can be slow; SnappPay's guide counts a timeout only after 30 s
      timeoutMs: /\/(verify|settle|revert|cancel)$/.test(path) ? 60_000 : 30_000,
    });
    const json = answer.json as Envelope<T> | null;
    const code = json?.errorData?.errorCode ?? null;
    if ((answer.status === 401 || code === 1003) && !retried) {
      this.tokens.clear();
      return this.call(method, path, body, true);
    }
    if (answer.status >= 200 && answer.status < 300 && json?.successful === true) return json.response as T;
    const message = json?.errorData?.message || bodySnippet(answer.text) || 'no details';
    throw new SnappPayError(
      `SnappPay ${path} refused (HTTP ${answer.status}${code ? `, code ${code}` : ''}): ${message}`,
      code,
      answer.status,
    );
  }

  private async statusOf(paymentToken: string): Promise<StatusResponse> {
    return this.call<StatusResponse>(
      'GET',
      `/payment/v1/status?paymentToken=${encodeURIComponent(paymentToken)}`,
    );
  }

  // ─── the interface ─────────────────────────────────────────────────────────

  /**
   * Proves from this server that the keys and its address are accepted: a
   * fresh sign-in and an eligibility question. Nothing is bought.
   */
  async probe(): Promise<ProbeResult> {
    this.tokens.clear();
    this.eligibilityCache.clear();
    const answer = await this.eligibility(PROBE_AMOUNT);
    const said = `${answer.eligible ? 'eligible' : 'not eligible'}${answer.title ? ` («${answer.title}»)` : ''}`;
    return {
      status: 'OK',
      detail: `SnapPay accepted the keys and answered: ${said} for ${PROBE_AMOUNT.toLocaleString('en-US')} Toman`,
    };
  }

  async eligibility(amount: number): Promise<ServiceEligibility> {
    const amountRial = rial(amount);
    const cached = this.eligibilityCache.get(amountRial);
    if (cached && Date.now() - cached.at < ELIGIBILITY_TTL_MS) return cached.answer;
    const response = record(await this.call<unknown>('GET', `/offer/v1/eligible?amount=${amountRial}`));
    const answer: ServiceEligibility = {
      eligible: response.eligible === true,
      // v1.7 English and v1.9 name it title_message, the v1.7 Persian copy titleMessage
      title: text(response.title_message ?? response.titleMessage) || null,
      description: text(response.description) || null,
    };
    if (this.eligibilityCache.size > 200) this.eligibilityCache.clear();
    this.eligibilityCache.set(amountRial, { at: Date.now(), answer });
    return answer;
  }

  async createSession({ context }: { context: CreatePaymentContext }): Promise<InstallmentSessionResult> {
    const phone = mobile09(context.customer.phone);
    if (!phone) throw new SnappPayError('SnappPay needs the customer mobile (09…)', 1005, 400);
    const basket = basketLines({
      orderNumber: context.orderNumber,
      amountToman: context.amount,
      items: context.items,
      shippingToman: context.shipping,
      discountToman: context.discount,
    });
    const itemsRial = basket.lines.reduce((sum, line) => sum + line.unitRial * line.quantity, 0);
    const totalAmount = itemsRial + basket.shippingRial;

    const open = async (transactionId: string) =>
      this.call<PaymentTokenResponse>('POST', '/payment/v1/token', {
        amount: totalAmount - basket.discountRial,
        discountAmount: basket.discountRial,
        externalSourceAmount: 0,
        mobile: `+98${phone.slice(1)}`,
        paymentMethodTypeDto: 'INSTALLMENT',
        returnURL: context.callbackUrl,
        transactionId,
        cartList: [
          {
            cartId: Number(transactionId),
            cartItems: basket.lines.map((line, index) => ({
              id: index + 1,
              name: line.title,
              category: 'موبایل',
              count: line.quantity,
              amount: line.unitRial,
              commissionType: this.credentials.commissionType,
            })),
            // «included» = already counted in totalAmount, the way SnappPay's own plugin sends it
            isShipmentIncluded: true,
            isTaxIncluded: true,
            shippingAmount: basket.shippingRial,
            taxAmount: 0,
            totalAmount,
          },
        ],
      });

    // 5–9 digits and unique for ever; a clash (409) gets a fresh one
    let transactionId = numericId(9);
    let opened: PaymentTokenResponse;
    try {
      opened = await open(transactionId);
    } catch (error) {
      if (!(error instanceof SnappPayError) || error.httpStatus !== 409) throw this.explain(error);
      transactionId = numericId(9);
      opened = await open(transactionId).catch((again: unknown) => {
        throw this.explain(again);
      });
    }
    if (!opened?.paymentToken || !opened.paymentPageUrl) {
      throw new SnappPayError('SnappPay returned no payment token', null, 200);
    }
    return {
      ref: opened.paymentToken,
      redirectUrl: opened.paymentPageUrl,
      raw: {
        transactionId,
        paymentToken: opened.paymentToken,
        amountRial: totalAmount - basket.discountRial,
      },
    };
  }

  /** The customer is back (or the result page asks): decided by SnappPay's own status. */
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
    const callbackFor = text(callback?.transactionId);
    const ours = !callbackFor || callbackFor === text(stored.transactionId);
    const said = text(callback?.state).toUpperCase();
    // a FAILED from our own transaction ends it — unless SnappPay says the first instalment was paid after all
    const result = await this.finalize(ref, amount, stored);
    if (result.status === 'PENDING' && ours && said === 'FAILED') {
      return {
        status: 'FAILED',
        providerRef: ref,
        failureReason: 'پرداخت در اسنپ‌پی انجام نشد',
        raw: result.raw,
      };
    }
    return result;
  }

  async status({
    ref,
    amount,
    meta,
  }: {
    ref: string;
    amount: number;
    meta?: unknown;
  }): Promise<PaymentStatusResult> {
    const result = await this.finalize(ref, amount, record(meta));
    return { status: result.status, trackingCode: result.trackingCode ?? null, raw: result.raw };
  }

  /**
   * status → capture what is paid (verify, then settle), report the rest.
   * A settle that fails is not a failed payment: SnappPay settles verified
   * transactions itself every night.
   */
  private async finalize(
    ref: string,
    amount: number,
    stored: Record<string, unknown>,
  ): Promise<VerifyPaymentResult> {
    const trackingCode = text(stored.transactionId) || null;
    const expectedRial = Number(stored.amountRial) || rial(amount);

    for (let round = 0; round < 3; round += 1) {
      const current = await this.statusOf(ref);
      const state = text(current.status).toUpperCase();
      const raw = { status: current.status, amount: current.amount ?? null };

      if (
        current.amount !== undefined &&
        current.amount !== null &&
        Number(current.amount) !== expectedRial
      ) {
        this.logger.error(
          `payment ${ref}: SnappPay holds ${current.amount} IRR, expected ${expectedRial} — not captured`,
        );
        return {
          status: 'PENDING',
          providerRef: ref,
          failureReason: 'مبلغ تراکنش اسنپ‌پی با سفارش یکی نیست',
          raw,
        };
      }

      switch (state) {
        case 'PENDING':
          try {
            await this.call('POST', '/payment/v1/verify', { paymentToken: ref });
          } catch (error) {
            // 1011: moved on meanwhile (verified by an earlier call, or reverted) — look again;
            // 1053: another request on it is still running — give it a moment first
            if (error instanceof SnappPayError && error.code === 1053) await pause(1500);
            if (error instanceof SnappPayError && (error.code === 1011 || error.code === 1053)) continue;
            throw error;
          }
          await this.settle(ref);
          return { status: 'SUCCESS', providerRef: ref, trackingCode, raw: { ...raw, status: 'SETTLE' } };
        case 'VERIFY':
          await this.settle(ref);
          return { status: 'SUCCESS', providerRef: ref, trackingCode, raw };
        case 'SETTLE':
          return { status: 'SUCCESS', providerRef: ref, trackingCode, raw };
        case 'REVERT':
        case 'CANCEL':
          return { status: 'FAILED', providerRef: ref, failureReason: 'پرداخت در اسنپ‌پی برگشت خورد', raw };
        default:
          // registered: the customer has not paid the first instalment (yet)
          return { status: 'PENDING', providerRef: ref, raw };
      }
    }
    return { status: 'PENDING', providerRef: ref };
  }

  private async settle(ref: string): Promise<void> {
    try {
      await this.call('POST', '/payment/v1/settle', { paymentToken: ref });
    } catch (error) {
      this.logger.warn(
        `settle ${ref} failed (SnappPay settles verified payments at night): ${String(error)}`,
      );
    }
  }

  /**
   * The whole amount back: revert before settlement, cancel after it. Part of
   * it needs the cart sent again (`update`), which the panel does better.
   */
  async refund({
    ref,
    amount,
    paidAmount,
  }: {
    ref: string;
    amount: number;
    paidAmount: number;
    reason?: string;
    meta?: unknown;
    trackingCode?: string | null;
  }): Promise<RefundPaymentResult> {
    if (amount < paidAmount) {
      return {
        status: 'MANUAL',
        message: 'بازگشت بخشی از مبلغ اسنپ‌پی را از پنل پذیرندگی اسنپ‌پی انجام دهید',
      };
    }
    const current = await this.statusOf(ref);
    const state = text(current.status).toUpperCase();
    switch (state) {
      case 'PENDING':
        await this.call('POST', '/payment/v1/revert', { paymentToken: ref });
        return { status: 'REFUNDED', reference: ref, raw: { from: state, via: 'revert' } };
      case 'VERIFY':
        await this.call('POST', '/payment/v1/settle', { paymentToken: ref });
        await this.call('POST', '/payment/v1/cancel', { paymentToken: ref });
        return { status: 'REFUNDED', reference: ref, raw: { from: state, via: 'settle+cancel' } };
      case 'SETTLE':
        await this.call('POST', '/payment/v1/cancel', { paymentToken: ref });
        return { status: 'REFUNDED', reference: ref, raw: { from: state, via: 'cancel' } };
      case 'REVERT':
      case 'CANCEL':
        return {
          status: 'REFUNDED',
          reference: ref,
          message: 'اسنپ‌پی قبلاً مبلغ را برگردانده است',
          raw: { from: state },
        };
      default:
        return { status: 'MANUAL', message: `وضعیت تراکنش در اسنپ‌پی «${current.status ?? 'نامعلوم'}» است` };
    }
  }

  /** A readable error for the log, with the customer-facing part when there is one. */
  private explain(error: unknown): Error {
    if (error instanceof SnappPayError && error.code !== null && REASONS[error.code]) {
      return new SnappPayError(`${error.message} — ${REASONS[error.code]}`, error.code, error.httpStatus);
    }
    return error instanceof Error ? error : new Error(String(error));
  }
}
