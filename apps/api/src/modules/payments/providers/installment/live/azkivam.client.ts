import { createCipheriv } from 'node:crypto';
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
  basketLines,
  defaultFetch,
  exchange,
  mobile09,
  numericId,
  record,
  text,
  type FetchImpl,
  type ProbeResult,
} from './http';

export interface AzkiVamCredentials {
  /** https://api.azkivam.com (the older name api.azkiloan.com is the same service) */
  baseUrl: string;
  /** the numeric shop id AzkiVam issues (کد فروشگاه) */
  merchantId: string;
  /** 64 hex characters */
  apiKey: string;
}

/** A refusal from AzkiVam itself (`rsCode` ≠ 0). */
export class AzkiVamError extends Error {
  override readonly name = 'AzkiVamError';
  constructor(
    message: string,
    readonly code: number | null,
    readonly httpStatus: number,
  ) {
    super(message);
  }
}

/** Ticket states. */
const TICKET = {
  CREATED: 1,
  VERIFIED: 2,
  REVERSED: 3,
  FAILED: 4,
  CANCELED: 5,
  SETTLED: 6,
  EXPIRED: 7,
  DONE: 8,
  SETTLE_QUEUE: 9,
} as const;
const CAPTURED = new Set<number>([TICKET.VERIFIED, TICKET.SETTLED, TICKET.SETTLE_QUEUE]);
const DEAD = new Set<number>([TICKET.REVERSED, TICKET.FAILED, TICKET.CANCELED, TICKET.EXPIRED]);

/** Customer-facing text for what a buyer can cause. */
const REASONS: Record<number, string> = {
  12: 'فروشگاه در ازکی‌وام فعال نیست',
  13: 'شمارهٔ موبایل برای ازکی‌وام معتبر نیست',
  20: 'این شماره در ازکی‌وام ثبت‌نام نکرده است؛ با شماره‌ای که در ازکی‌وام دارید سفارش دهید',
  21: 'اعتبار ازکی‌وام شما برای این خرید کافی نیست',
  33: 'قرارداد ازکی‌وام شما هنوز فعال نشده است',
  34: 'قرارداد ازکی‌وام شما تمام شده است',
};

/**
 * The `Signature` header: AES-256-CBC (key = the API key's 32 bytes, IV =
 * zeros, PKCS#7) of «/sub/url#unix-seconds#POST#api-key», as lowercase hex.
 * It names the endpoint, so every request has its own.
 */
export function azkiSignature(subUrl: string, apiKey: string, now = Date.now()): string {
  const key = Buffer.from(apiKey, 'hex');
  if (key.length !== 32) throw new AzkiVamError('the AzkiVam API key must be 64 hex characters', null, 0);
  const cipher = createCipheriv('aes-256-cbc', key, Buffer.alloc(16, 0));
  const plain = `${subUrl}#${Math.floor(now / 1000)}#POST#${apiKey}`;
  return Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]).toString('hex');
}

/**
 * AzkiVam (ازکی‌وام) — the merchant API.
 *
 * Amounts are Rial. The customer comes back with `status=Done&ticketId=…`;
 * that is a hint only — the ticket is ours after `verify` answers VERIFIED (2),
 * and AzkiVam's `status` decides everything else. A ticket AzkiVam reports as
 * Done (8) is verified wherever it is found, so reconciliation never lets a
 * paid ticket lapse.
 */
export class AzkiVamClient implements InstallmentGatewayClient {
  private readonly logger = new Logger('AzkiVam');
  private readonly base: string;

  constructor(
    private readonly credentials: AzkiVamCredentials,
    private readonly fetchImpl: FetchImpl = defaultFetch,
    /** `sandbox`: the service's test environment (the payment code says so: snappay-sandbox…) */
    readonly driver: 'live' | 'sandbox' = 'live',
  ) {
    this.base = credentials.baseUrl.replace(/\/+$/, '');
  }

  private async call(subUrl: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const answer = await exchange(this.fetchImpl, 'AzkiVam', `${this.base}${subUrl}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        MerchantId: this.credentials.merchantId,
        Signature: azkiSignature(subUrl, this.credentials.apiKey),
      },
      body: JSON.stringify(body),
    });
    // errors come back as JSON with 404, 500… — the body decides, not the status
    const json = record(answer.json);
    const code =
      Number.isFinite(Number(json.rsCode)) && json.rsCode !== undefined ? Number(json.rsCode) : null;
    if (code === 0) return record(json.result);
    const message = text(json.message) || bodySnippet(answer.text) || 'no details';
    throw new AzkiVamError(
      `AzkiVam ${subUrl} refused (HTTP ${answer.status}${code !== null ? `, rsCode ${code}` : ''}): ${message}`,
      code,
      answer.status,
    );
  }

  /**
   * Proves from this server that the shop id and the API key are accepted:
   * the status of a ticket that does not exist. A request AzkiVam accepts gets
   * «not found»; a wrong key «Signature Invalid» (18), a wrong shop id
   * «Access Denied» (15). Nothing is bought.
   */
  async probe(): Promise<ProbeResult> {
    const accepted = 'AzkiVam accepted the shop id and the key';
    try {
      await this.call('/payment/status', { ticket_id: 'IPHONEHA0PROBE00' });
      return { status: 'OK', detail: accepted };
    } catch (error) {
      if (!(error instanceof AzkiVamError) || error.code === null || [12, 15, 18].includes(error.code))
        throw error;
      if (error.code === 2 || error.code === 5)
        return { status: 'OK', detail: `${accepted} (a made-up ticket was «not found», as it should be)` };
      return {
        status: 'UNSURE',
        detail: `AzkiVam answered a status question about a made-up ticket with ${error.message}`,
      };
    }
  }

  async createSession({ context }: { context: CreatePaymentContext }): Promise<InstallmentSessionResult> {
    const phone = mobile09(context.customer.phone);
    if (!phone) throw new AzkiVamError(`AzkiVam: ${REASONS[13]}`, 13, 400);
    const basket = basketLines({
      orderNumber: context.orderNumber,
      amountToman: context.amount,
      items: context.items,
      shippingToman: context.shipping,
      discountToman: context.discount,
    });
    // AzkiVam wants the lines to add up to the amount: shipping is a line, a coupon makes it one line
    const lines =
      basket.discountRial > 0
        ? basketLines({ orderNumber: context.orderNumber, amountToman: context.amount, items: [] }).lines
        : basket.lines;
    const items = lines.map((line) => ({
      name: line.title,
      count: line.quantity,
      amount: line.unitRial,
      url: line.url ?? context.callbackUrl.split('/api/')[0],
    }));
    if (basket.discountRial === 0 && basket.shippingRial > 0) {
      items.push({
        name: 'هزینهٔ ارسال',
        count: 1,
        amount: basket.shippingRial,
        url: context.callbackUrl.split('/api/')[0],
      });
    }
    const amount = items.reduce((sum, item) => sum + item.amount * item.count, 0);
    const providerId = Number(numericId(12));
    const merchant = /^\d+$/.test(this.credentials.merchantId)
      ? Number(this.credentials.merchantId)
      : this.credentials.merchantId;

    let result: Record<string, unknown>;
    try {
      result = await this.call('/payment/purchase', {
        amount,
        redirect_uri: context.callbackUrl,
        fallback_uri: context.callbackUrl,
        provider_id: providerId,
        mobile_number: phone,
        merchant_id: merchant,
        items,
      });
    } catch (error) {
      if (error instanceof AzkiVamError && error.code !== null && REASONS[error.code]) {
        throw new AzkiVamError(`${error.message} — ${REASONS[error.code]}`, error.code, error.httpStatus);
      }
      throw error;
    }
    const ticketId = text(result.ticket_id);
    const paymentUri = text(result.payment_uri);
    if (!ticketId || !paymentUri) throw new AzkiVamError('AzkiVam returned no ticket', null, 200);
    return { ref: ticketId, redirectUrl: paymentUri, raw: { ticketId, providerId, amountRial: amount } };
  }

  async verify({
    ref,
    callback,
  }: {
    ref: string;
    amount: number;
    callback?: Record<string, unknown>;
    meta?: unknown;
  }): Promise<VerifyPaymentResult> {
    const namedTicket = text(callback?.ticketId);
    const ours = !namedTicket || namedTicket === ref;
    const said = text(callback?.status).toLowerCase();
    const result = await this.finalize(ref);
    // our own ticket coming back without «Done» ends the attempt, unless AzkiVam says it was paid
    if (result.status === 'PENDING' && ours && said && said !== 'done') {
      return {
        status: 'FAILED',
        providerRef: ref,
        failureReason: 'پرداخت در ازکی‌وام انجام نشد',
        raw: result.raw,
      };
    }
    return result;
  }

  async status({ ref }: { ref: string; amount: number; meta?: unknown }): Promise<PaymentStatusResult> {
    const result = await this.finalize(ref);
    return { status: result.status, trackingCode: result.trackingCode ?? null, raw: result.raw };
  }

  /** status → verify what is Done, report the rest. */
  private async finalize(ref: string): Promise<VerifyPaymentResult> {
    for (let round = 0; round < 2; round += 1) {
      const current = await this.call('/payment/status', { ticket_id: ref });
      const state = Number(current.status);
      if (CAPTURED.has(state))
        return { status: 'SUCCESS', providerRef: ref, trackingCode: ref, raw: current };
      if (DEAD.has(state)) {
        return {
          status: 'FAILED',
          providerRef: ref,
          failureReason: 'پرداخت در ازکی‌وام انجام نشد',
          raw: current,
        };
      }
      if (state !== TICKET.DONE) return { status: 'PENDING', providerRef: ref, raw: current };
      try {
        const verified = await this.call('/payment/verify', { ticket_id: ref });
        if (Number(verified.status) === TICKET.VERIFIED || Number(verified.rsCode ?? 0) === 0) {
          return { status: 'SUCCESS', providerRef: ref, trackingCode: ref, raw: verified };
        }
      } catch (error) {
        // 28: verified meanwhile (or no longer verifiable) — the next status says which
        if (error instanceof AzkiVamError && error.code === 28) continue;
        throw error;
      }
    }
    return { status: 'PENDING', providerRef: ref };
  }

  /** The whole amount back (reverse). Part of it is done from AzkiVam's panel. */
  async refund({
    ref,
    amount,
    paidAmount,
    meta,
  }: {
    ref: string;
    amount: number;
    paidAmount: number;
    meta?: unknown;
  }): Promise<RefundPaymentResult> {
    if (amount < paidAmount) {
      return { status: 'MANUAL', message: 'بازگشت بخشی از مبلغ ازکی‌وام را از پنل ازکی‌وام انجام دهید' };
    }
    const providerId = Number(record(meta).providerId);
    try {
      const result = await this.call('/payment/reverse', {
        ticket_id: ref,
        ...(Number.isFinite(providerId) && providerId > 0 ? { provider_id: providerId } : {}),
        reason: 'regret',
      });
      const inner = Number(result.rsCode ?? 0);
      return {
        status: 'REFUNDED',
        reference: ref,
        message: inner === 16 ? 'ازکی‌وام قبلاً مبلغ را برگردانده است' : null,
        raw: result,
      };
    } catch (error) {
      // 59: not reversible any more (settled), 60: never verified
      if (error instanceof AzkiVamError && (error.code === 59 || error.code === 60)) {
        this.logger.warn(`reverse ${ref} refused: ${error.message}`);
        return {
          status: 'MANUAL',
          message: 'ازکی‌وام این تراکنش را برنمی‌گرداند؛ از پنل ازکی‌وام پیگیری کنید',
        };
      }
      throw error;
    }
  }
}
