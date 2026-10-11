import {
  PAYMENT_METHOD_INFO,
  estimateInstallment,
  formatToman,
  type InstallmentMethod,
  type InstallmentTerms,
} from '@iphoneha/shared';
import type {
  CreatePaymentContext,
  CreatePaymentResult,
  DeliveryResult,
  EligibilityResult,
  PaymentProvider,
  PaymentRecordRef,
  PaymentStatusResult,
  RefundPaymentResult,
  VerifyPaymentResult,
} from '../payment-provider.interface';
import type { InstallmentGatewayClient } from './installment-gateway.client';

/**
 * Shared behaviour of every installment service: eligibility against the credit
 * ceiling, the repayment estimate, and delegation to a gateway client.
 */
export abstract class InstallmentProvider implements PaymentProvider {
  readonly kind = 'INSTALLMENT' as const;

  protected constructor(
    readonly method: InstallmentMethod,
    readonly code: string,
    protected readonly client: InstallmentGatewayClient,
    protected readonly termsFactory: () => Promise<InstallmentTerms>,
  ) {}

  get displayName(): string {
    return PAYMENT_METHOD_INFO[this.method].name;
  }

  protected get brandColor(): string {
    return PAYMENT_METHOD_INFO[this.method].color;
  }

  async terms(): Promise<InstallmentTerms> {
    return this.termsFactory();
  }

  async checkEligibility({ amount }: { amount: number }): Promise<EligibilityResult> {
    const terms = await this.terms();
    if (terms.maxCredit > 0 && amount > terms.maxCredit) {
      return {
        eligible: false,
        reason: `سقف اعتبار این سرویس ${formatToman(terms.maxCredit)} است`,
        estimate: null,
      };
    }
    // a live service that answers for itself has the last word (its reason is shown as it wrote it)
    if (this.client.eligibility && amount > 0) {
      const answer = await this.client.eligibility(amount).catch(() => null);
      if (!answer)
        return { eligible: false, reason: `${this.displayName} الان پاسخ نمی‌دهد`, estimate: null };
      if (!answer.eligible) {
        return {
          eligible: false,
          reason: answer.description || answer.title || `${this.displayName} برای این مبلغ فعال نیست`,
          estimate: null,
        };
      }
    }
    const estimate = estimateInstallment(amount, terms);
    return {
      eligible: true,
      reason: null,
      estimate: { downPayment: estimate.downPayment, months: estimate.months, monthly: estimate.monthly },
    };
  }

  async createPayment(context: CreatePaymentContext): Promise<CreatePaymentResult> {
    const terms = await this.terms();
    if (terms.maxCredit > 0 && context.amount > terms.maxCredit) {
      throw new Error(`amount exceeds the credit limit of ${this.method}`);
    }
    const estimate = estimateInstallment(context.amount, terms);
    const session = await this.client.createSession({
      context,
      plan: { downPayment: estimate.downPayment, months: estimate.months, monthly: estimate.monthly },
      providerName: this.displayName,
      brandColor: this.brandColor,
      providerCode: this.code,
    });
    return {
      providerRef: session.ref,
      redirectUrl: session.redirectUrl,
      redirectForm: session.redirectForm ?? null,
      expiresAt: session.expiresAt ?? null,
      raw: session.raw,
    };
  }

  async verifyPayment({
    payment,
    callbackQuery,
  }: {
    payment: PaymentRecordRef;
    callbackQuery?: Record<string, unknown>;
  }): Promise<VerifyPaymentResult> {
    if (!payment.providerRef) {
      return { status: 'FAILED', providerRef: null, failureReason: 'شناسه تراکنش موجود نیست' };
    }
    return this.client.verify({
      ref: payment.providerRef,
      amount: payment.amount,
      callback: callbackQuery && Object.keys(callbackQuery).length > 0 ? callbackQuery : undefined,
      meta: payment.meta,
    });
  }

  async refundPayment({
    payment,
    amount,
    reason,
  }: {
    payment: PaymentRecordRef;
    amount: number;
    reason?: string;
  }): Promise<RefundPaymentResult> {
    if (!payment.providerRef) return { status: 'MANUAL', message: 'شناسه تراکنش موجود نیست' };
    return this.client.refund({
      ref: payment.providerRef,
      amount,
      paidAmount: payment.amount,
      reason,
      meta: payment.meta,
      trackingCode: payment.trackingCode ?? null,
    });
  }

  async getPaymentStatus({ payment }: { payment: PaymentRecordRef }): Promise<PaymentStatusResult> {
    if (!payment.providerRef) return { status: 'UNKNOWN' };
    return this.client.status({ ref: payment.providerRef, amount: payment.amount, meta: payment.meta });
  }

  async confirmDelivery({
    payment,
    orderNumber,
    skus,
  }: {
    payment: PaymentRecordRef;
    orderNumber: string;
    skus: string[];
  }): Promise<DeliveryResult> {
    if (!this.client.confirmDelivery || !payment.providerRef) return { status: 'NOT_NEEDED' };
    return this.client.confirmDelivery({
      ref: payment.providerRef,
      meta: payment.meta,
      trackingCode: payment.trackingCode ?? null,
      orderNumber,
      skus,
    });
  }
}
