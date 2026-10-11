import { PAYMENT_METHOD_INFO } from '@iphoneha/shared';
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
import type { MockGatewayService } from '../mock-gateway.service';

/** Card payment through the local mock gateway (default in development). */
export class MockOnlineProvider implements PaymentProvider {
  readonly method = 'ONLINE' as const;
  readonly code = 'mock-online';
  readonly kind = 'ONLINE' as const;
  readonly displayName = PAYMENT_METHOD_INFO.ONLINE.name;

  constructor(
    private readonly gateway: MockGatewayService,
    private readonly mockBaseUrl: string,
  ) {}

  async checkEligibility(): Promise<EligibilityResult> {
    return { eligible: true, reason: null, estimate: null };
  }

  async createPayment(context: CreatePaymentContext): Promise<CreatePaymentResult> {
    const session = await this.gateway.create({
      paymentId: context.paymentId,
      providerCode: this.code,
      providerName: 'پرداخت آنلاین (آزمایشی)',
      brandColor: '#08090a',
      orderNumber: context.orderNumber,
      amount: context.amount,
      callbackUrl: context.callbackUrl,
      installment: null,
    });
    return {
      providerRef: session.token,
      redirectUrl: `${this.mockBaseUrl}/${session.token}`,
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      raw: { token: session.token },
    };
  }

  async verifyPayment({ payment }: { payment: PaymentRecordRef }): Promise<VerifyPaymentResult> {
    if (!payment.providerRef)
      return { status: 'FAILED', providerRef: null, failureReason: 'شناسه تراکنش موجود نیست' };
    const session = await this.gateway.get(payment.providerRef);
    if (!session)
      return { status: 'FAILED', providerRef: payment.providerRef, failureReason: 'تراکنش منقضی شده است' };
    if (session.status === 'PENDING') return { status: 'PENDING', providerRef: payment.providerRef };
    if (session.status === 'SUCCESS') {
      return {
        status: 'SUCCESS',
        providerRef: payment.providerRef,
        trackingCode: session.trackingCode,
        raw: session,
      };
    }
    return {
      status: 'FAILED',
      providerRef: payment.providerRef,
      failureReason: session.status === 'CANCELLED' ? 'پرداخت توسط کاربر لغو شد' : 'پرداخت ناموفق بود',
      raw: session,
    };
  }

  async refundPayment({ payment }: { payment: PaymentRecordRef }): Promise<RefundPaymentResult> {
    if (payment.providerRef) await this.gateway.markRefunded(payment.providerRef);
    return { status: 'REFUNDED', reference: payment.providerRef, message: 'بازپرداخت آزمایشی انجام شد' };
  }

  async getPaymentStatus({ payment }: { payment: PaymentRecordRef }): Promise<PaymentStatusResult> {
    const result = await this.verifyPayment({ payment });
    return { status: result.status, trackingCode: result.trackingCode ?? null, raw: result.raw };
  }
}
