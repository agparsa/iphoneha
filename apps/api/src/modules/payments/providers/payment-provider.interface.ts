import type { PaymentMethod } from '@iphoneha/shared';

export interface PaymentCustomer {
  name: string;
  phone: string;
}

export interface PaymentItemSnapshot {
  title: string;
  quantity: number;
  /** Toman, after the product's own discount */
  unitPrice: number;
  sku: string;
  /** the product page, for services that list the basket with links */
  url?: string;
}

/** Everything a provider needs to start a payment. */
export interface CreatePaymentContext {
  paymentId: string;
  orderId: string;
  orderNumber: string;
  /** Amount in Toman */
  amount: number;
  customer: PaymentCustomer;
  description: string;
  /** Where the customer is sent back to after paying */
  callbackUrl: string;
  items: PaymentItemSnapshot[];
  /** Toman: shipping charged on top of the items, and the coupon taken off (amount = Σ items + shipping − discount) */
  shipping?: number;
  discount?: number;
  /** the customer's address as the store saw it, for services that run their own fraud checks (Tara) */
  customerIp?: string;
}

export interface PaymentRecordRef {
  id: string;
  providerRef: string | null;
  amount: number;
  method: PaymentMethod;
  provider: string;
  meta: unknown;
  trackingCode?: string | null;
}

/**
 * A gateway the customer enters by submitting an HTML form (POST) rather than
 * by following a link (Tara). The API serves the form on
 * `GET /payments/go/:paymentId`, which is what the customer is sent to.
 */
export interface RedirectForm {
  /** https:// address the form posts to */
  action: string;
  fields: Record<string, string>;
}

export interface CreatePaymentResult {
  providerRef: string;
  /** where the customer goes next; ignored when `redirectForm` is set */
  redirectUrl: string;
  redirectForm?: RedirectForm | null;
  expiresAt?: Date | null;
  raw?: unknown;
}

export type VerifyStatus = 'SUCCESS' | 'FAILED' | 'PENDING';

export interface VerifyPaymentResult {
  status: VerifyStatus;
  providerRef: string | null;
  trackingCode?: string | null;
  failureReason?: string | null;
  raw?: unknown;
  /** kept on the payment (merged into its meta) for later calls: refunds, delivery */
  meta?: Record<string, unknown>;
}

export interface RefundPaymentResult {
  /** MANUAL → the provider has no refund API; operations must refund by hand. */
  status: 'REFUNDED' | 'PENDING' | 'MANUAL';
  reference?: string | null;
  message?: string | null;
  raw?: unknown;
}

export interface PaymentStatusResult {
  status: VerifyStatus | 'UNKNOWN';
  trackingCode?: string | null;
  raw?: unknown;
  meta?: Record<string, unknown>;
}

/** The answer to «the goods reached the customer» (credit services settle only after it). */
export interface DeliveryResult {
  status: 'CONFIRMED' | 'NOT_NEEDED' | 'FAILED';
  message?: string | null;
  raw?: unknown;
}

export interface EligibilityResult {
  eligible: boolean;
  reason: string | null;
  estimate: { downPayment: number; months: number; monthly: number } | null;
}

/**
 * Every payment method (online card gateway or installment service) implements
 * this interface. Adding a new provider only means implementing it and
 * registering it in PaymentProviderRegistry.
 */
export interface PaymentProvider {
  readonly method: PaymentMethod;
  /** Adapter/driver code stored on the payment row, e.g. "zarinpal" */
  readonly code: string;
  readonly kind: 'ONLINE' | 'INSTALLMENT';
  readonly displayName: string;

  checkEligibility(input: { amount: number }): Promise<EligibilityResult>;
  createPayment(context: CreatePaymentContext): Promise<CreatePaymentResult>;
  verifyPayment(input: {
    payment: PaymentRecordRef;
    callbackQuery?: Record<string, unknown>;
  }): Promise<VerifyPaymentResult>;
  refundPayment(input: {
    payment: PaymentRecordRef;
    amount: number;
    reason?: string;
  }): Promise<RefundPaymentResult>;
  getPaymentStatus(input: { payment: PaymentRecordRef }): Promise<PaymentStatusResult>;
  /** Only services that need to hear about delivery (DigiPay credit) implement it. */
  confirmDelivery?(input: {
    payment: PaymentRecordRef;
    orderNumber: string;
    skus: string[];
  }): Promise<DeliveryResult>;
}
