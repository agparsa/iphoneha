import { Logger } from '@nestjs/common';
import { bodySnippet } from '../../../../../common/http/network-error';
import type { InstallmentGatewayClient, InstallmentSessionResult } from '../installment-gateway.client';
import type {
  CreatePaymentContext,
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

export interface BajetCredentials {
  /** https://jetpay.mybajet.ir */
  baseUrl: string;
  username: string;
  password: string;
  /** the terminal Bajet opened for the shop */
  terminalId: string;
  /** the basket item type Bajet assigned to phones; without it no basket is sent (it is optional) */
  productType?: number;
}

/** A refusal from Bajet itself (`success` false, or an answer without what was asked for). */
export class BajetError extends Error {
  override readonly name = 'BajetError';
  constructor(
    message: string,
    readonly code: number | null,
    readonly httpStatus: number,
  ) {
    super(message);
  }
}

/** `finalStatus` of a Bajet transaction. */
const CAPTURED = new Set(['VERIFIED']);
const PAID_NOT_CAPTURED = 'SUCCESS';
const DEAD = new Set(['FAILED', 'REVERSE', 'REFUND']);
/** What a customer's browser says in `status` when it comes back without paying (Bajet documents no values; these end the attempt). */
const NEGATIVE_HINTS = new Set([
  'false',
  '0',
  'failed',
  'fail',
  'failure',
  'cancel',
  'canceled',
  'cancelled',
  'error',
  'reverse',
  'reversed',
]);

/**
 * Bajet (باجت, Bank Tejarat's credit plan) — the JETPAY merchant API, v1.3.2.
 *
 * Amounts are Rial. `order` returns a reference and the page the customer is
 * sent to (a plain GET); the customer comes back with `id`, `orderId` and
 * `status` in the query, which are hints only. The truth is `inquiry` on our
 * stored reference: `SUCCESS` is paid but not ours until `verify`, which must
 * happen within 15 minutes or Bajet reverses the payment itself; `VERIFIED`
 * is already ours. There is no refund API in this version: reversals are done
 * from the Bajet merchant panel.
 */
export class BajetClient implements InstallmentGatewayClient {
  private readonly logger = new Logger('Bajet');
  private readonly tokens: TokenCache;
  private readonly base: string;

  constructor(
    private readonly credentials: BajetCredentials,
    private readonly fetchImpl: FetchImpl = defaultFetch,
    /** `sandbox`: the test environment Bajet handed out (the payment code says so: bojet-sandbox) */
    readonly driver: 'live' | 'sandbox' = 'live',
  ) {
    this.base = credentials.baseUrl.replace(/\/+$/, '');
    this.tokens = new TokenCache(() => this.signIn());
  }

  // ─── plumbing ──────────────────────────────────────────────────────────────

  private async signIn(): Promise<{ token: string; expiresInSeconds: number }> {
    const result = await this.post('token', {
      username: this.credentials.username,
      password: this.credentials.password,
      terminalId: this.credentials.terminalId,
    });
    const token = text(result.token);
    if (!token) throw new BajetError('Bajet sign-in answered without a token', null, 200);
    const expiresIn = Number(result.expiresIn);
    return { token, expiresInSeconds: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600 };
  }

  /** `POST /api/v1/jetpay/<operation>`; the `result` of a successful envelope, a BajetError otherwise. */
  private async post(
    operation: string,
    body: Record<string, unknown>,
    token?: string,
  ): Promise<Record<string, unknown>> {
    const answer = await exchange(this.fetchImpl, 'Bajet', `${this.base}/api/v1/jetpay/${operation}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      timeoutMs: operation === 'verify' ? 60_000 : 30_000,
    });
    const json = record(answer.json);
    const result = record(json.result);
    if (
      answer.status === 200 &&
      Number(json.status) === 200 &&
      json.success === true &&
      Object.keys(result).length > 0
    ) {
      return result;
    }
    const error = record(result.error);
    const code =
      Number.isFinite(Number(error.code)) && error.code !== undefined && error.code !== ''
        ? Number(error.code)
        : null;
    const message =
      text(error.en) || text(error.fa) || text(error.message) || bodySnippet(answer.text) || 'no details';
    throw new BajetError(
      `Bajet ${operation} refused (HTTP ${answer.status}${code !== null ? `, code ${code}` : ''}): ${message}`,
      code,
      answer.status,
    );
  }

  /** A signed call; a 401 signs in again once. */
  private async call(
    operation: string,
    body: Record<string, unknown>,
    retried = false,
  ): Promise<Record<string, unknown>> {
    const token = await this.tokens.get();
    try {
      return await this.post(operation, body, token);
    } catch (error) {
      if (error instanceof BajetError && error.httpStatus === 401 && !retried) {
        this.tokens.clear();
        return this.call(operation, body, true);
      }
      throw error;
    }
  }

  // ─── the interface ─────────────────────────────────────────────────────────

  /** Proves from this server that the sign-in and the terminal are accepted (a fresh token). Nothing is bought. */
  async probe(): Promise<ProbeResult> {
    this.tokens.clear();
    await this.tokens.get();
    return { status: 'OK', detail: `Bajet accepted the sign-in for terminal ${this.credentials.terminalId}` };
  }

  async createSession({ context }: { context: CreatePaymentContext }): Promise<InstallmentSessionResult> {
    const phone = mobile09(context.customer.phone);
    if (!phone) throw new BajetError('Bajet needs the customer mobile (09…)', null, 400);
    const amountRial = rial(context.amount);
    // one Bajet order per payment attempt: a retry of the same store order gets a new one
    const orderId = `${context.orderNumber}-${context.paymentId.slice(-6)}`;
    const productType = this.credentials.productType;
    const result = await this.call('order', {
      orderId,
      amount: amountRial,
      mobile: phone,
      returnUrl: context.callbackUrl,
      ...(productType
        ? {
            basketItems: context.items.map((item) => ({ brand: 'Apple', productType, count: item.quantity })),
          }
        : {}),
    });
    const referenceId = text(result.referenceId);
    const referUrl = text(result.referUrl);
    if (!referenceId || !/^https:\/\/[^\s]+$/i.test(referUrl)) {
      throw new BajetError('Bajet returned no reference or no https payment page', null, 200);
    }
    return { ref: referenceId, redirectUrl: referUrl, raw: { referenceId, orderId, amountRial } };
  }

  /** The customer is back: decided by Bajet's own inquiry, the query is at most a reason to stop waiting. */
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
    const namedRef = text(callback?.id);
    const ours = !namedRef || namedRef === ref;
    const hint = text(callback?.status).toLowerCase();
    const result = await this.finalize(ref, amount, stored);
    // our own reference back with a «no»: the customer gave up — unless Bajet says it was paid after all
    if (result.status === 'PENDING' && !result.failureReason && ours && NEGATIVE_HINTS.has(hint)) {
      return {
        status: 'FAILED',
        providerRef: ref,
        failureReason: 'پرداخت در باجت انجام نشد',
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
    return {
      status: result.status,
      trackingCode: result.trackingCode ?? null,
      raw: result.raw,
      meta: result.meta,
    };
  }

  /** inquiry → verify what is paid (within Bajet's 15 minutes), report the rest. */
  private async finalize(
    ref: string,
    amount: number,
    stored: Record<string, unknown>,
  ): Promise<VerifyPaymentResult> {
    const expectedRial = Number(stored.amountRial) || rial(amount);
    const expectedOrder = text(stored.orderId);
    const inquiry = await this.call('inquiry', { referenceId: ref });
    const raw = {
      finalStatus: inquiry.finalStatus ?? null,
      amount: inquiry.amount ?? null,
      creditAmount: inquiry.creditAmount ?? null,
      cashAmount: inquiry.cashAmount ?? null,
    };
    const mismatch = this.mismatch(inquiry, ref, expectedOrder, expectedRial);
    if (mismatch) {
      this.logger.error(`payment ${ref}: ${mismatch} — not captured`);
      return { status: 'PENDING', providerRef: ref, failureReason: 'پاسخ باجت با این سفارش یکی نیست', raw };
    }
    const state = text(inquiry.finalStatus).toUpperCase();
    if (CAPTURED.has(state))
      return { status: 'SUCCESS', providerRef: ref, trackingCode: ref, raw, meta: this.split(inquiry) };
    if (DEAD.has(state)) {
      return {
        status: 'FAILED',
        providerRef: ref,
        failureReason: 'پرداخت در باجت انجام نشد یا برگشت خورد',
        raw,
      };
    }
    if (state !== PAID_NOT_CAPTURED) return { status: 'PENDING', providerRef: ref, raw };

    const verified = await this.call('verify', { referenceId: ref });
    const credit = Number(verified.creditAmount);
    const cash = Number(verified.cashAmount);
    const identity = this.mismatch(verified, ref, expectedOrder, null);
    if (
      identity ||
      !Number.isFinite(credit) ||
      !Number.isFinite(cash) ||
      credit < 0 ||
      cash < 0 ||
      credit + cash !== expectedRial
    ) {
      this.logger.error(
        `payment ${ref}: Bajet verify answered ${identity || `credit ${verified.creditAmount} + cash ${verified.cashAmount}`}, expected ${expectedRial} IRR — not accepted`,
      );
      return {
        status: 'PENDING',
        providerRef: ref,
        failureReason: 'پاسخ تأیید باجت با این سفارش یکی نیست',
        raw: verified,
      };
    }
    return {
      status: 'SUCCESS',
      providerRef: ref,
      trackingCode: ref,
      raw: { ...raw, finalStatus: 'VERIFIED', creditAmount: credit, cashAmount: cash },
      meta: { ...this.split(verified), verifiedAt: new Date().toISOString() },
    };
  }

  /** Why an answer is not about our payment ('' when it is). */
  private mismatch(
    answer: Record<string, unknown>,
    ref: string,
    expectedOrder: string,
    expectedRial: number | null,
  ): string {
    if (text(answer.referenceId) !== ref)
      return `Bajet answered for reference ${text(answer.referenceId) || '?'}`;
    if (expectedOrder && text(answer.orderId) !== expectedOrder)
      return `Bajet answered for order ${text(answer.orderId) || '?'}, expected ${expectedOrder}`;
    if (expectedRial !== null && text(answer.amount) !== '' && Number(answer.amount) !== expectedRial) {
      return `Bajet holds ${text(answer.amount)} IRR, expected ${expectedRial}`;
    }
    return '';
  }

  private split(answer: Record<string, unknown>): Record<string, unknown> {
    const credit = Number(answer.creditAmount);
    const cash = Number(answer.cashAmount);
    return {
      ...(Number.isFinite(credit) ? { creditAmount: credit } : {}),
      ...(Number.isFinite(cash) ? { cashAmount: cash } : {}),
    };
  }

  /** JETPAY v1.3.2 has no refund or reversal call: the money goes back from the Bajet panel. */
  async refund(): Promise<RefundPaymentResult> {
    return { status: 'MANUAL', message: 'باجت API برگشت وجه ندارد؛ مبلغ را از پنل پذیرندگی باجت برگردانید' };
  }
}
