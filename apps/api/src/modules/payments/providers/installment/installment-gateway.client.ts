import type {
  CreatePaymentContext,
  DeliveryResult,
  PaymentStatusResult,
  RedirectForm,
  RefundPaymentResult,
  VerifyPaymentResult,
} from '../payment-provider.interface';
import type { MockGatewayService } from '../mock-gateway.service';

export interface InstallmentPlanInput {
  downPayment: number;
  months: number;
  monthly: number;
}

export interface InstallmentSessionResult {
  ref: string;
  /** the service's payment page; ignored when the service is entered with `redirectForm` */
  redirectUrl: string;
  redirectForm?: RedirectForm | null;
  expiresAt?: Date | null;
  raw?: unknown;
}

/** What a service says about paying a given basket with it, in its own words. */
export interface ServiceEligibility {
  eligible: boolean;
  title?: string | null;
  description?: string | null;
}

/**
 * The only piece that differs between a mocked and a live installment service.
 * A live client talks to the service's real API (sign-in, payment token,
 * verify/settle, refund); registering it in the provider registry is the only
 * other change — no other layer knows which one it is talking to.
 *
 * `meta` is what `createSession` returned as `raw` (plus whatever `verify`
 * returned as `meta`), stored on the payment row; `callback` is what the
 * customer's browser brought back (query string and form fields) — a hint to
 * check against `meta`, never proof of payment.
 */
export interface InstallmentGatewayClient {
  readonly driver: 'mock' | 'live' | 'sandbox';
  createSession(input: {
    context: CreatePaymentContext;
    plan: InstallmentPlanInput;
    providerName: string;
    brandColor: string;
    providerCode: string;
  }): Promise<InstallmentSessionResult>;
  verify(input: {
    ref: string;
    amount: number;
    callback?: Record<string, unknown>;
    meta?: unknown;
  }): Promise<VerifyPaymentResult>;
  /** Asks the service; a paid-but-not-captured payment is captured on the way (so reconciliation never loses it). */
  status(input: { ref: string; amount: number; meta?: unknown }): Promise<PaymentStatusResult>;
  refund(input: {
    ref: string;
    /** Toman to give back */
    amount: number;
    /** Toman the customer paid (a smaller `amount` is a partial refund) */
    paidAmount: number;
    reason?: string;
    meta?: unknown;
    trackingCode?: string | null;
  }): Promise<RefundPaymentResult>;
  /** The service's own yes/no for this amount (SnapPay asks merchants to hide itself when it says no). */
  eligibility?(amount: number): Promise<ServiceEligibility>;
  /** «The goods reached the customer» — DigiPay credit is settled only after it. */
  confirmDelivery?(input: {
    ref: string;
    meta?: unknown;
    trackingCode?: string | null;
    orderNumber: string;
    skus: string[];
  }): Promise<DeliveryResult>;
}

/** Mock client: drives the local fake gateway page. */
export class MockInstallmentClient implements InstallmentGatewayClient {
  readonly driver = 'mock' as const;

  constructor(
    private readonly gateway: MockGatewayService,
    private readonly mockBaseUrl: string,
  ) {}

  async createSession({
    context,
    plan,
    providerName,
    brandColor,
    providerCode,
  }: Parameters<InstallmentGatewayClient['createSession']>[0]): Promise<InstallmentSessionResult> {
    const session = await this.gateway.create({
      paymentId: context.paymentId,
      providerCode,
      providerName: `${providerName} (آزمایشی)`,
      brandColor,
      orderNumber: context.orderNumber,
      amount: context.amount,
      callbackUrl: context.callbackUrl,
      installment: plan,
    });
    return {
      ref: session.token,
      redirectUrl: `${this.mockBaseUrl}/${session.token}`,
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      raw: { token: session.token, plan },
    };
  }

  async verify({ ref }: { ref: string }): Promise<VerifyPaymentResult> {
    const session = await this.gateway.get(ref);
    if (!session) return { status: 'FAILED', providerRef: ref, failureReason: 'تراکنش منقضی شده است' };
    if (session.status === 'PENDING') return { status: 'PENDING', providerRef: ref };
    if (session.status === 'SUCCESS') {
      return { status: 'SUCCESS', providerRef: ref, trackingCode: session.trackingCode, raw: session };
    }
    return {
      status: 'FAILED',
      providerRef: ref,
      failureReason: session.status === 'CANCELLED' ? 'پرداخت توسط کاربر لغو شد' : 'اعتبارسنجی ناموفق بود',
      raw: session,
    };
  }

  async status({ ref }: { ref: string; amount: number }): Promise<PaymentStatusResult> {
    const result = await this.verify({ ref });
    return { status: result.status, trackingCode: result.trackingCode ?? null, raw: result.raw };
  }

  async refund({ ref }: { ref: string }): Promise<RefundPaymentResult> {
    await this.gateway.markRefunded(ref);
    return { status: 'REFUNDED', reference: ref, message: 'بازپرداخت آزمایشی انجام شد' };
  }
}
