import { randomInt } from 'node:crypto';
import { normalizePhone, tomanToRial } from '@iphoneha/shared';
import { networkReason } from '../../../../../common/http/network-error';

export type FetchImpl = typeof fetch;

export const defaultFetch: FetchImpl = (input, init) => globalThis.fetch(input, init);

/** The service did not answer at all (network, firewall, timeout) — nothing is known about the payment. */
export class ServiceUnreachableError extends Error {
  override readonly name = 'ServiceUnreachableError';
}

/** What a harmless call from this server showed (deploy/installment-check.cjs prints it). */
export interface ProbeResult {
  /** OK: the keys and this server were accepted. UNSURE: the service answered in a way we cannot read as a yes. */
  status: 'OK' | 'UNSURE';
  detail: string;
}

export interface HttpAnswer {
  status: number;
  /** the body parsed as JSON, or null when it was not JSON (a firewall or proxy page) */
  json: unknown;
  text: string;
}

/**
 * One HTTP exchange with a service. Throws only when no answer came back;
 * any answer — 200 or 500, JSON or not — is returned for the caller to read,
 * because these services report errors in the body with all kinds of statuses.
 */
export async function exchange(
  fetchImpl: FetchImpl,
  service: string,
  url: string,
  init: RequestInit & { timeoutMs?: number },
): Promise<HttpAnswer> {
  const { timeoutMs = 30_000, ...rest } = init;
  let response: Response;
  try {
    response = await fetchImpl(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    throw new ServiceUnreachableError(`${service} unreachable: ${networkReason(error)}`);
  }
  const text = await response.text().catch(() => '');
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { status: response.status, json, text };
}

/**
 * An OAuth access token kept until shortly before it expires. Concurrent
 * callers share one sign-in; `clear()` forces the next call to sign in again
 * (after a 401).
 */
export class TokenCache {
  private token: { value: string; expiresAt: number } | null = null;
  private pending: Promise<string> | null = null;

  constructor(
    private readonly signIn: () => Promise<{ token: string; expiresInSeconds: number }>,
    private readonly skewMs = 60_000,
  ) {}

  async get(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value;
    this.pending ??= this.signIn()
      .then(({ token, expiresInSeconds }) => {
        const lifetime = Math.max(0, expiresInSeconds * 1000 - this.skewMs);
        this.token = { value: token, expiresAt: Date.now() + lifetime };
        return token;
      })
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }

  clear(): void {
    this.token = null;
  }
}

/** Toman (our bookkeeping) → Rial (what every Iranian payment API takes). */
export const rial = (toman: number): number => tomanToRial(Math.round(toman));

/** «09121234567», or null when the number is not an Iranian mobile. */
export function mobile09(phone: string): string | null {
  const normalized = normalizePhone(phone);
  return normalized && /^09\d{9}$/.test(normalized) ? normalized : null;
}

/** A random number with exactly `digits` digits (never a leading zero). */
export function numericId(digits: number): string {
  let id = String(randomInt(1, 10));
  while (id.length < digits) id += String(randomInt(0, 10));
  return id;
}

/** Plain object fields of an unknown value (callback bodies, stored meta). */
export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** A callback/meta field as trimmed text ('' when missing). Arrays (repeated query keys) take the last value. */
export function text(value: unknown): string {
  if (Array.isArray(value)) return text(value.at(-1));
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/**
 * The basket as the services want it: unit prices in Rial and, when the
 * items and shipping minus the coupon do not add up to the amount charged
 * (rounding, a price changed mid-way), a single line for the whole order —
 * a basket that does not add up is refused by the stricter services.
 */
export function basketLines(input: {
  orderNumber: string;
  amountToman: number;
  items: { title: string; quantity: number; unitPrice: number; sku: string; url?: string }[];
  shippingToman?: number;
  discountToman?: number;
}): {
  lines: { title: string; quantity: number; unitRial: number; sku: string; url?: string }[];
  shippingRial: number;
  discountRial: number;
  consistent: boolean;
} {
  const amount = rial(input.amountToman);
  const shippingRial = rial(input.shippingToman ?? 0);
  const discountRial = rial(input.discountToman ?? 0);
  const lines = input.items.map((item) => ({
    title: item.title,
    quantity: item.quantity,
    unitRial: rial(item.unitPrice),
    sku: item.sku,
    url: item.url,
  }));
  const itemsRial = lines.reduce((sum, line) => sum + line.unitRial * line.quantity, 0);
  if (lines.length > 0 && itemsRial + shippingRial - discountRial === amount) {
    return { lines, shippingRial, discountRial, consistent: true };
  }
  return {
    lines: [
      {
        title: `سفارش ${input.orderNumber}`,
        quantity: 1,
        unitRial: amount,
        sku: input.orderNumber,
        url: input.items[0]?.url,
      },
    ],
    shippingRial: 0,
    discountRial: 0,
    consistent: false,
  };
}
