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
  record,
  rial,
  text,
  TokenCache,
  type FetchImpl,
  type ProbeResult,
} from './http';

export interface TaraCredentials {
  /** https://pay.tara360.ir/pay */
  baseUrl: string;
  /** the merchant's Tara panel sign-in */
  username: string;
  password: string;
  /** the shop's «gateway code» (کد درگاه): the service of the contract the amount is routed to */
  serviceId: string;
  /** the merchandise group phones are sold under (Tara grants credit per group; `probe()` lists the contract's groups) */
  groupCode?: string;
}

/** A refusal from Tara itself (it answered, with a `result` other than 0 or without what was asked for). */
export class TaraError extends Error {
  override readonly name = 'TaraError';
  constructor(
    message: string,
    readonly code: string | null,
    readonly httpStatus: number,
  ) {
    super(message);
  }
}

/** Tara's unit-of-measure code for «piece». */
const UNIT_PIECE = 5;
/** Tara's own group for a shipping line, as its WooCommerce plugin sends it. */
const SHIPPING_GROUP = { group: '40', groupTitle: 'ارسال' };
/** How long a Tara access token is kept when Tara does not say; a 401 signs in again anyway. */
const TOKEN_LIFETIME_SECONDS = 30 * 60;

interface Answer {
  status: number;
  json: Record<string, unknown>;
  text: string;
}

/** Tara's `result`: 0 (number or text) means yes; some answers leave it out. */
const succeeded = (result: unknown): boolean => {
  const said = text(result);
  return said === '' || said === '0';
};

/**
 * Tara (تارا) — the merchant IPG of the Tara club credit (pay.tara360.ir).
 *
 * Amounts are Rial and the invoice is itemised, because the credit is granted
 * per merchandise group. The customer is not sent to a link: `getToken`
 * returns a token, and the browser POSTs `{username, token}` to
 * `/api/ipgPurchase` (our bridge page does that). Tara posts the customer back
 * with `{token, result, channelRefNumber, traceNumber}`; the purchase is ours
 * only after `purchaseVerify` answers `result 0` with an `rrn` for our token
 * and our amount — a payment that is never verified is reversed by Tara.
 * There is no inquiry API, so the callback is kept on the payment
 * (`meta.callback`) for a later verify, and no refund API: reversals are done
 * from the Tara merchant panel.
 */
export class TaraClient implements InstallmentGatewayClient {
  private readonly logger = new Logger('Tara');
  private readonly tokens: TokenCache;
  private readonly base: string;

  constructor(
    private readonly credentials: TaraCredentials,
    private readonly fetchImpl: FetchImpl = defaultFetch,
    /** `sandbox`: the test environment Tara handed out (the payment code says so: tara-sandbox) */
    readonly driver: 'live' | 'sandbox' = 'live',
  ) {
    this.base = credentials.baseUrl.replace(/\/+$/, '');
    this.tokens = new TokenCache(() => this.signIn());
  }

  // ─── plumbing ──────────────────────────────────────────────────────────────

  private async signIn(): Promise<{ token: string; expiresInSeconds: number }> {
    const answer = await exchange(this.fetchImpl, 'Tara', `${this.base}/api/v2/authenticate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ username: this.credentials.username, password: this.credentials.password }),
    });
    const json = record(answer.json);
    const token = text(json.accessToken);
    if (answer.status !== 200 || !token) {
      const why = text(json.description) || text(json.message) || bodySnippet(answer.text) || 'no token';
      throw new TaraError(
        `Tara sign-in refused (HTTP ${answer.status}): ${why}`,
        text(json.result) || null,
        answer.status,
      );
    }
    const expiresIn = Number(json.expiresIn);
    return {
      token,
      expiresInSeconds: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : TOKEN_LIFETIME_SECONDS,
    };
  }

  /** One call with the bearer token (a 401 signs in again once). Every answer comes back for the caller to read. */
  private async call(path: string, body: unknown, retried = false): Promise<Answer> {
    const token = await this.tokens.get();
    const answer = await exchange(this.fetchImpl, 'Tara', `${this.base}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(body ?? {}),
      timeoutMs: path.endsWith('/purchaseVerify') ? 60_000 : 30_000,
    });
    if (answer.status === 401 && !retried) {
      this.tokens.clear();
      return this.call(path, body, true);
    }
    return { status: answer.status, json: record(answer.json), text: answer.text };
  }

  private refusal(what: string, answer: Answer): TaraError {
    const code = text(answer.json.result);
    const why =
      text(answer.json.description) || text(answer.json.message) || bodySnippet(answer.text) || 'no details';
    return new TaraError(
      `Tara ${what} refused (HTTP ${answer.status}${code ? `, result ${code}` : ''}): ${why}`,
      code || null,
      answer.status,
    );
  }

  /**
   * The invoice Tara is shown: the phones (in the contract's group when one
   * is set) and the shipping, adding up to the amount charged. A coupon or a
   * basket that does not add up becomes one line for the whole order — Tara
   * refuses an invoice whose lines and amount disagree.
   */
  private invoice(context: CreatePaymentContext, amountRial: number): Record<string, unknown>[] {
    const basket = basketLines({
      orderNumber: context.orderNumber,
      amountToman: context.amount,
      items: context.items,
      shippingToman: context.shipping,
      discountToman: context.discount,
    });
    const group = this.credentials.groupCode
      ? { group: this.credentials.groupCode, groupTitle: 'موبایل' }
      : {};
    const lines = (basket.consistent && basket.discountRial === 0 ? basket.lines : []).map((line) => ({
      name: line.title,
      code: line.sku,
      count: line.quantity,
      unit: UNIT_PIECE,
      fee: line.unitRial,
      data: context.description,
      ...group,
    }));
    if (lines.length > 0 && basket.shippingRial > 0) {
      lines.push({
        name: 'هزینهٔ ارسال',
        code: 'shipping',
        count: 1,
        unit: UNIT_PIECE,
        fee: basket.shippingRial,
        data: context.description,
        ...SHIPPING_GROUP,
      });
    }
    const total = lines.reduce((sum, line) => sum + line.fee * line.count, 0);
    if (lines.length > 0 && total === amountRial) return lines;
    return [
      {
        name: `سفارش ${context.orderNumber}`,
        code: context.orderNumber,
        count: 1,
        unit: UNIT_PIECE,
        fee: amountRial,
        data: context.description,
        ...group,
      },
    ];
  }

  // ─── the interface ─────────────────────────────────────────────────────────

  /**
   * Proves from this server that the sign-in is accepted, and lists the
   * merchandise groups of the contract (the phones' group goes in
   * TARA_GROUP_CODE). Nothing is bought; the gateway code is only checked by
   * Tara when a payment is opened.
   */
  async probe(): Promise<ProbeResult> {
    this.tokens.clear();
    await this.tokens.get();
    const accepted = 'Tara accepted the sign-in';
    const answer = await this.call('/api/clubGroups', {});
    const list = answer.json.ipgClubMerchandiseGroupReportList;
    if (answer.status !== 200 || !Array.isArray(list)) {
      return {
        status: 'OK',
        detail: `${accepted}; the group list was not available (HTTP ${answer.status})`,
      };
    }
    const groups = list
      .map((item) => record(item))
      .map((item) => ({ id: text(item.id), title: text(item.title) }));
    const named = groups.map((g) => `${g.id} «${g.title}»`);
    const shown = named.slice(0, 12).join(', ') + (named.length > 12 ? `, … (${named.length} groups)` : '');
    const chosen = this.credentials.groupCode;
    const about = chosen
      ? groups.some((g) => g.id === chosen)
        ? `TARA_GROUP_CODE ${chosen} is one of them`
        : `TARA_GROUP_CODE ${chosen} is NOT among them — pick one of these`
      : 'set the phones’ group in TARA_GROUP_CODE (installments.sh asks for it)';
    return {
      status: 'OK',
      detail: `${accepted}; merchandise groups of the contract: ${shown || 'none'}; ${about}`,
    };
  }

  async createSession({ context }: { context: CreatePaymentContext }): Promise<InstallmentSessionResult> {
    const phone = mobile09(context.customer.phone);
    if (!phone)
      throw new TaraError(
        'Tara needs the customer mobile (09…): the credit belongs to that number',
        null,
        400,
      );
    const amount = rial(context.amount);
    const answer = await this.call('/api/getToken', {
      additionalData: context.description,
      mobile: phone,
      callBackUrl: context.callbackUrl,
      amount,
      vat: 0,
      serviceAmountList: [{ serviceId: this.credentials.serviceId, amount }],
      taraInvoiceItemList: this.invoice(context, amount),
      ...(context.customerIp ? { ip: context.customerIp } : {}),
    });
    const token = text(answer.json.token);
    if (answer.status !== 200 || !token || !succeeded(answer.json.result))
      throw this.refusal('getToken', answer);
    const action = `${this.base}/api/ipgPurchase`;
    return {
      ref: token,
      redirectUrl: action,
      redirectForm: { action, fields: { username: this.credentials.username, token } },
      raw: { token, amountRial: amount, ...(context.customerIp ? { customerIp: context.customerIp } : {}) },
    };
  }

  /**
   * The customer is back (or the result page asks). Only a callback for our
   * own token counts; `result 0` is verified with Tara, anything else ends the
   * attempt — Tara has nothing to ask about a payment the customer gave up.
   */
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
    const data = callback ?? record(stored.callback);
    if (Object.keys(data).length === 0) return { status: 'PENDING', providerRef: ref };
    const namedToken = text(data.token);
    if (namedToken && namedToken !== ref) return { status: 'PENDING', providerRef: ref };
    const said = text(data.result);
    if (!said) return { status: 'PENDING', providerRef: ref };
    if (said !== '0') {
      return {
        status: 'FAILED',
        providerRef: ref,
        failureReason: 'پرداخت در تارا انجام نشد',
        raw: { result: said, description: text(data.description) || undefined },
      };
    }

    const answer = await this.call('/api/purchaseVerify', {
      token: ref,
      ...(text(stored.customerIp) ? { ip: text(stored.customerIp) } : {}),
    });
    const rrn = text(answer.json.rrn);
    if (answer.status === 200 && succeeded(answer.json.result) && rrn) {
      const expectedRial = Number(stored.amountRial) || rial(amount);
      const answered = Number(answer.json.amount);
      if (Number.isFinite(answered) && text(answer.json.amount) !== '' && answered !== expectedRial) {
        this.logger.error(
          `payment ${ref}: Tara verified ${answer.json.amount} IRR, expected ${expectedRial} — not accepted`,
        );
        return {
          status: 'PENDING',
          providerRef: ref,
          failureReason: 'مبلغ تراکنش تارا با سفارش یکی نیست',
          raw: answer.json,
        };
      }
      return {
        status: 'SUCCESS',
        providerRef: ref,
        trackingCode: rrn,
        raw: answer.json,
        meta: {
          rrn,
          traceNumber: text(answer.json.traceNumber) || text(data.traceNumber) || undefined,
          channelRefNumber: text(data.channelRefNumber) || undefined,
          verifiedAt: new Date().toISOString(),
        },
      };
    }
    // Tara answered and said no: the purchase is not ours (it reverses whatever was taken)
    if (answer.status === 200 && text(answer.json.result) !== '') {
      const refusal = this.refusal('purchaseVerify', answer);
      this.logger.warn(refusal.message);
      return {
        status: 'FAILED',
        providerRef: ref,
        failureReason: 'تارا این پرداخت را تأیید نکرد',
        raw: { result: refusal.code, description: text(answer.json.description) || undefined },
      };
    }
    // no readable answer (a gateway page, 5xx): nothing is decided, the kept callback lets the next call try again
    throw this.refusal('purchaseVerify', answer);
  }

  /** No inquiry at Tara: a kept callback is verified, otherwise nothing is known yet. */
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

  /** Tara exposes no refund or reversal to merchants: the money goes back from the Tara panel. */
  async refund(): Promise<RefundPaymentResult> {
    return { status: 'MANUAL', message: 'تارا API برگشت وجه ندارد؛ مبلغ را از پنل پذیرندگی تارا برگردانید' };
  }
}
