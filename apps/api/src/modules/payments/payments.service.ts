import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Order, OrderItem, Payment, Prisma } from '@prisma/client';
import {
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  formatNumberFa,
  isOfflinePaymentMethod,
  paymentMethodName,
  type PaymentDto,
  type PaymentMethod,
  type PaymentResultDto,
} from '@iphoneha/shared';
import { APP_CONFIG, type AppConfig } from '../../config/env.config';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { Errors } from '../../common/errors';
import { toNumber } from '../../common/bigint';
import { InventoryService } from '../inventory/inventory.service';
import { DiscountsService } from '../discounts/discounts.service';
import { NotificationService } from '../notifications/notification.service';
import { AlertsService } from '../notifications/alerts.service';
import { PaymentProviderRegistry } from './provider-registry.service';
import type {
  PaymentProvider,
  PaymentRecordRef,
  RedirectForm,
  VerifyPaymentResult,
} from './providers/payment-provider.interface';

type OrderWithItems = Order & { items: OrderItem[] };

/** `provider` of a payment the staff recorded by hand (in-store, or a cheque or safte sale). */
export const MANUAL_PROVIDER = 'manual';

export interface FinalizeResult {
  paymentStatus: PaymentDto['status'];
  orderStatus: Order['status'];
  success: boolean;
  message: string;
  trackingCode: string | null;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PaymentProviderRegistry,
    private readonly inventory: InventoryService,
    private readonly discounts: DiscountsService,
    private readonly notifications: NotificationService,
    private readonly alerts: AlertsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  static toDto(payment: Payment): PaymentDto {
    return {
      id: payment.id,
      method: payment.method,
      methodName: paymentMethodName(payment.method),
      provider: payment.provider,
      amount: toNumber(payment.amount),
      status: payment.status,
      statusLabel: PAYMENT_STATUS_LABELS[payment.status],
      providerRef: payment.providerRef,
      trackingCode: payment.trackingCode,
      failureReason: payment.failureReason,
      paidAt: payment.paidAt?.toISOString() ?? null,
      refundedAt: payment.refundedAt?.toISOString() ?? null,
      createdAt: payment.createdAt.toISOString(),
    };
  }

  /** The adapter a payment went through; null for one the staff recorded by hand. */
  private providerFor(payment: Payment): PaymentProvider | null {
    if (payment.provider === MANUAL_PROVIDER || isOfflinePaymentMethod(payment.method)) return null;
    return this.registry.byCode(payment.provider) ?? this.registry.get(payment.method);
  }

  private toRef(payment: Payment): PaymentRecordRef {
    return {
      id: payment.id,
      providerRef: payment.providerRef,
      amount: toNumber(payment.amount),
      // only payments made through an adapter get here (see providerFor)
      method: payment.method as PaymentMethod,
      provider: payment.provider,
      meta: payment.meta,
      trackingCode: payment.trackingCode,
    };
  }

  private callbackUrl(providerCode: string, paymentId: string): string {
    return `${this.config.publicApiUrl}/payments/callback/${providerCode}/${paymentId}`;
  }

  /** The page that posts the customer into a gateway entered by form (see `RedirectForm`). */
  private bridgeUrl(paymentId: string): string {
    return `${this.config.publicApiUrl}/payments/go/${paymentId}`;
  }

  private async logTransaction(
    paymentId: string,
    type: 'CREATE' | 'CALLBACK' | 'VERIFY' | 'STATUS' | 'REFUND' | 'DELIVERY',
    success: boolean,
    payload: { request?: unknown; response?: unknown; error?: string; idempotencyKey?: string },
  ): Promise<void> {
    try {
      await this.prisma.paymentTransaction.create({
        data: {
          paymentId,
          type,
          success,
          requestPayload: (payload.request ?? null) as Prisma.InputJsonValue,
          responsePayload: (payload.response ?? null) as Prisma.InputJsonValue,
          errorMessage: payload.error ?? null,
          idempotencyKey: payload.idempotencyKey ?? null,
        },
      });
    } catch (error) {
      this.logger.warn(`failed to log payment transaction: ${String(error)}`);
    }
  }

  // ─── Creating payments ─────────────────────────────────────────────────────

  /**
   * Creates a payment attempt for an order and asks the provider for a
   * redirect URL. Safe to call again when a previous attempt failed.
   */
  async createForOrder(
    order: OrderWithItems,
    method?: PaymentMethod,
    options: { customerIp?: string } = {},
  ): Promise<{ payment: PaymentDto; redirectUrl: string | null }> {
    if (!['PENDING', 'PAYMENT_PENDING'].includes(order.status)) {
      throw Errors.conflict('ORDER_NOT_PAYABLE', 'این سفارش قابل پرداخت نیست');
    }
    if (order.reservationExpiresAt && order.reservationExpiresAt.getTime() < Date.now()) {
      throw Errors.conflict('ORDER_EXPIRED', 'مهلت پرداخت این سفارش تمام شده است');
    }

    const chosen = method ?? order.paymentMethod;
    // an order the staff recorded is paid at the store, never through a gateway
    if (isOfflinePaymentMethod(chosen)) {
      throw Errors.badRequest('PAYMENT_METHOD_UNAVAILABLE', 'این روش پرداخت در حال حاضر در دسترس نیست');
    }
    const provider = await this.registry.assertEnabled(chosen, { userId: order.userId });
    const amount = toNumber(order.total);

    const eligibility = await provider.checkEligibility({ amount });
    if (!eligibility.eligible) {
      throw Errors.badRequest(
        'PAYMENT_NOT_ELIGIBLE',
        eligibility.reason ?? 'این روش پرداخت برای این مبلغ فعال نیست',
      );
    }

    // A retry of the same request reuses the gateway session already opened.
    const reusable = await this.prisma.payment.findFirst({
      where: { orderId: order.id, method: chosen, status: 'PENDING', redirectUrl: { not: null } },
      orderBy: { createdAt: 'desc' },
    });
    if (reusable && (!reusable.expiresAt || reusable.expiresAt.getTime() > Date.now())) {
      return { payment: PaymentsService.toDto(reusable), redirectUrl: reusable.redirectUrl };
    }

    // Cancel any earlier unfinished attempt for this order.
    await this.prisma.payment.updateMany({
      where: { orderId: order.id, status: { in: ['INITIATED', 'PENDING'] } },
      data: { status: 'CANCELLED', failureReason: 'تلاش جدید برای پرداخت' },
    });

    const payment = await this.prisma.payment.create({
      data: {
        orderId: order.id,
        method: chosen,
        provider: provider.code,
        amount: order.total,
        status: 'INITIATED',
      },
    });

    try {
      const result = await provider.createPayment({
        paymentId: payment.id,
        orderId: order.id,
        orderNumber: order.orderNumber,
        amount,
        customer: { name: order.customerName, phone: order.customerPhone },
        description: `سفارش ${order.orderNumber} — فروشگاه آیفونی‌ها`,
        callbackUrl: this.callbackUrl(provider.code, payment.id),
        items: order.items.map((item) => ({
          title: `${item.productName} ${item.variantTitle}`,
          quantity: item.quantity,
          unitPrice: toNumber(item.unitPrice),
          sku: item.sku,
          url: `${this.config.WEB_URL.replace(/\/$/, '')}/iphone/${item.productSlug}`,
        })),
        shipping: toNumber(order.shippingCost),
        discount: toNumber(order.couponDiscount),
        customerIp: options.customerIp,
      });

      // a gateway entered by form: the customer goes to our bridge page, which posts the form kept on the payment
      const redirectUrl = result.redirectForm ? this.bridgeUrl(payment.id) : result.redirectUrl;
      const meta = result.redirectForm
        ? { ...metaObject(result.raw), redirectForm: result.redirectForm }
        : (result.raw ?? null);
      const updated = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'PENDING',
          providerRef: result.providerRef,
          redirectUrl,
          expiresAt: result.expiresAt ?? order.reservationExpiresAt,
          meta: meta as Prisma.InputJsonValue,
        },
      });
      await this.prisma.order.updateMany({
        where: { id: order.id, status: 'PENDING' },
        data: { status: 'PAYMENT_PENDING', paymentMethod: chosen },
      });
      await this.prisma.order.updateMany({
        where: { id: order.id, status: 'PAYMENT_PENDING' },
        data: { paymentMethod: chosen },
      });
      await this.logTransaction(payment.id, 'CREATE', true, { request: { amount }, response: result.raw });

      return { payment: PaymentsService.toDto(updated), redirectUrl };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', failureReason: 'ایجاد تراکنش در درگاه ناموفق بود' },
      });
      await this.logTransaction(payment.id, 'CREATE', false, { request: { amount }, error: message });
      this.logger.error(`createPayment failed for order ${order.orderNumber}: ${message}`);
      throw Errors.badRequest(
        'PAYMENT_CREATE_FAILED',
        'اتصال به درگاه پرداخت برقرار نشد. کمی بعد دوباره تلاش کنید',
      );
    }
  }

  async createForOrderId(orderId: string, method?: PaymentMethod, options: { customerIp?: string } = {}) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) throw Errors.notFound('سفارش پیدا نشد');
    return this.createForOrder(order, method, options);
  }

  /**
   * The form that takes the customer into a gateway entered by POST (Tara),
   * for the bridge page: only while the payment is still open.
   */
  async redirectFormFor(paymentId: string): Promise<{
    form: RedirectForm;
    method: PaymentMethod;
    orderNumber: string;
    expired: boolean;
  }> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: { select: { orderNumber: true } } },
    });
    const form = payment ? metaObject(payment.meta).redirectForm : null;
    if (!payment || !isRedirectForm(form) || isOfflinePaymentMethod(payment.method)) {
      throw Errors.notFound('صفحه پیدا نشد');
    }
    const open = ['INITIATED', 'PENDING'].includes(payment.status);
    const inTime = !payment.expiresAt || payment.expiresAt.getTime() > Date.now();
    return {
      form,
      method: payment.method as PaymentMethod,
      orderNumber: payment.order.orderNumber,
      expired: !(open && inTime),
    };
  }

  // ─── Verification ──────────────────────────────────────────────────────────

  /**
   * Verifies a payment with its provider and applies the result exactly once.
   * Every path here is idempotent: repeated callbacks return the stored result.
   */
  async verifyAndFinalize(
    paymentId: string,
    callbackQuery?: Record<string, unknown>,
  ): Promise<FinalizeResult> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: { include: { items: true } } },
    });
    if (!payment) throw Errors.notFound('تراکنش پیدا نشد');

    if (payment.status === 'SUCCEEDED') {
      return {
        paymentStatus: 'SUCCEEDED',
        orderStatus: payment.order.status,
        success: true,
        message: 'این پرداخت قبلاً با موفقیت ثبت شده است',
        trackingCode: payment.trackingCode,
      };
    }
    // An EXPIRED payment is still verified: the customer may have paid at the
    // gateway after our reservation window closed (handled in applySuccess).
    if (['FAILED', 'CANCELLED'].includes(payment.status)) {
      return {
        paymentStatus: payment.status,
        orderStatus: payment.order.status,
        success: false,
        message: payment.failureReason ?? 'پرداخت ناموفق بود',
        trackingCode: null,
      };
    }

    const provider = this.providerFor(payment);
    // a payment recorded by the staff has no gateway to come back from
    if (!provider) throw Errors.notFound('پرداخت پیدا نشد');
    // what the browser brought back is kept: a service without an inquiry API
    // (DigiPay) can only be verified with it, also later from the result page
    const kept = keepCallback(callbackQuery);
    if (kept) {
      payment.meta = { ...metaObject(payment.meta), callback: kept } as Prisma.JsonValue;
      await this.prisma.payment
        .update({ where: { id: payment.id }, data: { meta: payment.meta as Prisma.InputJsonValue } })
        .catch(() => undefined);
    }
    let result: VerifyPaymentResult;
    try {
      result = await provider.verifyPayment({ payment: this.toRef(payment), callbackQuery });
      await this.logTransaction(payment.id, 'VERIFY', result.status === 'SUCCESS', {
        request: callbackQuery,
        response: result.raw ?? result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.logTransaction(payment.id, 'VERIFY', false, { request: callbackQuery, error: message });
      this.logger.error(`verify failed for payment ${payment.id}: ${message}`);
      throw Errors.badRequest(
        'PAYMENT_VERIFY_FAILED',
        'تأیید پرداخت با خطا روبه‌رو شد. با پشتیبانی تماس بگیرید',
      );
    }

    if (result.status === 'PENDING') {
      return {
        paymentStatus: 'PENDING',
        orderStatus: payment.order.status,
        success: false,
        message: 'پرداخت هنوز نهایی نشده است',
        trackingCode: null,
      };
    }

    return result.status === 'SUCCESS'
      ? this.applySuccess(payment.id, payment.orderId, result)
      : this.applyFailure(payment.id, payment.orderId, result.failureReason ?? 'پرداخت ناموفق بود');
  }

  /** Marks the payment as paid, commits the reservation and moves the order to PAID. */
  private async applySuccess(
    paymentId: string,
    orderId: string,
    result: VerifyPaymentResult,
  ): Promise<FinalizeResult> {
    let meta: Prisma.InputJsonValue | undefined;
    if (result.meta) {
      const current = await this.prisma.payment.findUnique({
        where: { id: paymentId },
        select: { meta: true },
      });
      meta = { ...metaObject(current?.meta), ...result.meta } as Prisma.InputJsonValue;
    }
    const claimed = await this.prisma.payment.updateMany({
      where: { id: paymentId, status: { in: ['INITIATED', 'PENDING', 'EXPIRED'] } },
      data: {
        status: 'SUCCEEDED',
        paidAt: new Date(),
        trackingCode: result.trackingCode ?? null,
        providerRef: result.providerRef ?? undefined,
        failureReason: null,
        ...(meta ? { meta } : {}),
      },
    });

    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });

    if (!claimed.count) {
      return {
        paymentStatus: 'SUCCEEDED',
        orderStatus: order.status,
        success: true,
        message: 'این پرداخت قبلاً ثبت شده است',
        trackingCode: result.trackingCode ?? null,
      };
    }

    // Late success: the reservation was already released, try to take stock again.
    if (order.status === 'CANCELLED') {
      const reReserved = await this.inventory.reReserveForOrder(
        orderId,
        new Date(Date.now() + this.config.reservationTtlMs),
      );
      if (!reReserved) {
        this.logger.warn(`late payment for cancelled order ${order.orderNumber} — refunding`);
        await this.refund(paymentId, toNumber(order.total), 'پرداخت پس از انقضای سفارش');
        return {
          paymentStatus: 'REFUND_PENDING',
          orderStatus: 'CANCELLED',
          success: false,
          message: 'مهلت سفارش تمام شده بود و مبلغ بازگردانده می‌شود',
          trackingCode: result.trackingCode ?? null,
        };
      }
    }

    const moved = await this.prisma.order.updateMany({
      where: { id: orderId, status: { in: ['PENDING', 'PAYMENT_PENDING', 'CANCELLED'] } },
      data: { status: 'PAID', paidAt: new Date(), cancelReason: null, cancelledAt: null },
    });
    if (moved.count) {
      await this.inventory.commit(orderId);
      await this.prisma.orderStatusHistory.create({
        data: { orderId, fromStatus: order.status, toStatus: 'PAID', actor: 'PAYMENT', note: 'پرداخت موفق' },
      });
      await this.notifications.sendOrderConfirmed(
        order.customerPhone,
        order.orderNumber,
        formatNumberFa(toNumber(order.total)),
      );
      await this.alerts.orderPaid(orderId);
    }

    return {
      paymentStatus: 'SUCCEEDED',
      orderStatus: 'PAID',
      success: true,
      message: 'پرداخت با موفقیت انجام شد',
      trackingCode: result.trackingCode ?? null,
    };
  }

  /** Marks the payment failed, releases the reservation and cancels the order. */
  private async applyFailure(paymentId: string, orderId: string, reason: string): Promise<FinalizeResult> {
    await this.prisma.payment.updateMany({
      where: { id: paymentId, status: { in: ['INITIATED', 'PENDING', 'EXPIRED'] } },
      data: { status: 'FAILED', failureReason: reason },
    });

    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    const cancelled = await this.prisma.order.updateMany({
      where: { id: orderId, status: { in: ['PENDING', 'PAYMENT_PENDING'] } },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason },
    });
    if (cancelled.count) {
      await this.inventory.release(orderId, `پرداخت ناموفق: ${reason}`);
      await this.discounts.releaseRedemption(orderId);
      await this.prisma.orderStatusHistory.create({
        data: { orderId, fromStatus: order.status, toStatus: 'CANCELLED', actor: 'PAYMENT', note: reason },
      });
    }

    return {
      paymentStatus: 'FAILED',
      orderStatus: 'CANCELLED',
      success: false,
      message: reason,
      trackingCode: null,
    };
  }

  /**
   * Asks the provider about every unfinished payment of an order.
   * Used before expiring an order so a paid-but-not-notified order is not lost.
   */
  async reconcileOrder(orderId: string): Promise<boolean> {
    const payments = await this.prisma.payment.findMany({
      where: { orderId, status: { in: ['INITIATED', 'PENDING'] } },
    });
    for (const payment of payments) {
      const provider = this.providerFor(payment);
      if (!provider) continue;
      try {
        const status = await provider.getPaymentStatus({ payment: this.toRef(payment) });
        await this.logTransaction(payment.id, 'STATUS', status.status === 'SUCCESS', {
          response: status.raw,
        });
        if (status.status === 'SUCCESS') {
          await this.applySuccess(payment.id, orderId, {
            status: 'SUCCESS',
            providerRef: payment.providerRef,
            trackingCode: status.trackingCode ?? null,
            raw: status.raw,
            meta: status.meta,
          });
          return true;
        }
      } catch (error) {
        this.logger.warn(`status check failed for payment ${payment.id}: ${String(error)}`);
      }
    }
    return false;
  }

  /** Marks unfinished payments of an expired order. */
  async expirePendingPayments(orderId: string): Promise<void> {
    await this.prisma.payment.updateMany({
      where: { orderId, status: { in: ['INITIATED', 'PENDING'] } },
      data: { status: 'EXPIRED', failureReason: 'مهلت پرداخت تمام شد' },
    });
  }

  // ─── Refunds ───────────────────────────────────────────────────────────────

  async refund(paymentId: string, amount: number, reason: string): Promise<PaymentDto> {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw Errors.notFound('تراکنش پیدا نشد');
    if (payment.status === 'REFUNDED') return PaymentsService.toDto(payment);
    if (payment.status !== 'SUCCEEDED' && payment.status !== 'REFUND_PENDING') {
      throw Errors.conflict('PAYMENT_NOT_REFUNDABLE', 'این تراکنش قابل بازپرداخت نیست');
    }

    const provider = this.providerFor(payment);
    if (!provider) {
      // the store gave the money back itself (cash, card reader, transfer, or the contract was cancelled)
      await this.logTransaction(payment.id, 'REFUND', true, {
        request: { amount, reason },
        response: { manual: true },
      });
      const updated = await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'REFUNDED', refundedAt: new Date(), failureReason: null },
      });
      return PaymentsService.toDto(updated);
    }
    try {
      const result = await provider.refundPayment({ payment: this.toRef(payment), amount, reason });
      await this.logTransaction(payment.id, 'REFUND', result.status !== 'MANUAL', {
        request: { amount, reason },
        response: result.raw ?? result,
      });
      const updated = await this.prisma.payment.update({
        where: { id: payment.id },
        data:
          result.status === 'REFUNDED'
            ? { status: 'REFUNDED', refundedAt: new Date(), failureReason: null }
            : { status: 'REFUND_PENDING', failureReason: result.message ?? 'بازپرداخت در انتظار اقدام دستی' },
      });
      return PaymentsService.toDto(updated);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.logTransaction(payment.id, 'REFUND', false, { request: { amount, reason }, error: message });
      const updated = await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'REFUND_PENDING', failureReason: 'بازپرداخت خودکار ناموفق بود' },
      });
      this.logger.error(`refund failed for payment ${payment.id}: ${message}`);
      return PaymentsService.toDto(updated);
    }
  }

  /** Refunds every captured payment of an order (admin cancel/refund). */
  async refundOrder(orderId: string, reason: string): Promise<void> {
    const payments = await this.prisma.payment.findMany({
      where: { orderId, status: { in: ['SUCCEEDED', 'REFUND_PENDING'] } },
    });
    for (const payment of payments) {
      await this.refund(payment.id, toNumber(payment.amount), reason);
    }
  }

  /**
   * Tells the credit services that settle only on delivery (DigiPay) that the
   * order reached the customer. Never throws: the order is delivered either
   * way; a refusal is logged on the payment for the admin to see.
   */
  async confirmDelivery(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { select: { sku: true } }, payments: { where: { status: 'SUCCEEDED' } } },
    });
    if (!order) return;
    for (const payment of order.payments) {
      const provider = this.registry.byCode(payment.provider);
      if (!provider?.confirmDelivery) continue;
      try {
        const result = await provider.confirmDelivery({
          payment: this.toRef(payment),
          orderNumber: order.orderNumber,
          skus: order.items.map((item) => item.sku),
        });
        if (result.status === 'NOT_NEEDED') continue;
        await this.logTransaction(payment.id, 'DELIVERY', result.status === 'CONFIRMED', {
          request: { orderNumber: order.orderNumber },
          response: result.raw ?? null,
          error: result.status === 'FAILED' ? (result.message ?? 'refused') : undefined,
        });
        if (result.status === 'FAILED') {
          this.logger.error(
            `delivery of ${order.orderNumber} not accepted by ${payment.provider}: ${result.message}`,
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.logTransaction(payment.id, 'DELIVERY', false, { error: message });
        this.logger.error(
          `delivery of ${order.orderNumber} could not be reported to ${payment.provider}: ${message}`,
        );
      }
    }
  }

  // ─── Callback / result ─────────────────────────────────────────────────────

  async handleCallback(
    providerCode: string,
    paymentId: string,
    query: Record<string, unknown>,
  ): Promise<{ redirectUrl: string }> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: { select: { orderNumber: true } } },
    });
    if (!payment) throw Errors.notFound('تراکنش پیدا نشد');
    await this.logTransaction(payment.id, 'CALLBACK', true, { request: query });

    let result: FinalizeResult;
    try {
      result = await this.verifyAndFinalize(paymentId, query);
    } catch {
      result = {
        paymentStatus: 'FAILED',
        orderStatus: 'PAYMENT_PENDING',
        success: false,
        message: 'تأیید پرداخت ناموفق بود',
        trackingCode: null,
      };
    }

    const status = result.success ? 'success' : result.paymentStatus === 'PENDING' ? 'pending' : 'failed';
    const params = new URLSearchParams({ order: payment.order.orderNumber, status });
    return { redirectUrl: `${this.config.WEB_URL}/checkout/result?${params.toString()}` };
  }

  async resultFor(orderNumber: string, userId: string, askGateway = true): Promise<PaymentResultDto> {
    const order = await this.prisma.order.findFirst({
      where: { orderNumber, userId },
      include: { payments: { orderBy: { createdAt: 'desc' } } },
    });
    if (!order) throw Errors.notFound('سفارش پیدا نشد');
    const payment = order.payments[0] ?? null;

    // one question to the gateway per request: when it cannot answer, the
    // payment is reported as still pending instead of asking again and again
    if (askGateway && payment && ['INITIATED', 'PENDING'].includes(payment.status)) {
      await this.verifyAndFinalize(payment.id).catch(() => undefined);
      return this.resultFor(orderNumber, userId, false);
    }

    const success = payment?.status === 'SUCCEEDED';
    return {
      orderNumber: order.orderNumber,
      orderStatus: order.status,
      paymentStatus: payment?.status ?? 'FAILED',
      success,
      trackingCode: payment?.trackingCode ?? null,
      message: success
        ? 'پرداخت با موفقیت انجام شد'
        : (payment?.failureReason ?? `وضعیت سفارش: ${ORDER_STATUS_LABELS[order.status]}`),
    };
  }
}

/** A payment's meta as a plain object (it can be null or, in old rows, anything). */
function metaObject(meta: unknown): Record<string, unknown> {
  return meta && typeof meta === 'object' && !Array.isArray(meta)
    ? { ...(meta as Record<string, unknown>) }
    : {};
}

/** A `RedirectForm` as stored on a payment: an https:// action and text fields, nothing else is ever posted. */
function isRedirectForm(value: unknown): value is RedirectForm {
  const form = metaObject(value);
  if (typeof form.action !== 'string' || !/^https:\/\/[^\s]+$/i.test(form.action)) return false;
  const fields = metaObject(form.fields);
  return Object.keys(fields).length > 0 && Object.values(fields).every((field) => typeof field === 'string');
}

/**
 * The callback fields worth keeping: short plain values only (a gateway
 * returns a handful), so a hostile request cannot bloat the row.
 */
function keepCallback(query: Record<string, unknown> | undefined): Record<string, string> | null {
  if (!query) return null;
  const kept: Record<string, string> = {};
  for (const [key, raw] of Object.entries(query).slice(0, 20)) {
    const value = Array.isArray(raw) ? raw.at(-1) : raw;
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') continue;
    if (key.length > 40) continue;
    kept[key] = String(value).slice(0, 200);
  }
  return Object.keys(kept).length > 0 ? kept : null;
}
