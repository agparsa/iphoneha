import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { Prisma } from '@prisma/client';
import {
  SHIPPING_TIME_LABELS,
  calcCartTotals,
  type AddressInput,
  type CartDto,
  type CheckoutQuoteDto,
  type CheckoutResponseDto,
  type CreateOrderInput,
  type OrderDto,
  type ShippingTime,
  type PaymentMethod,
} from '@iphoneha/shared';
import { APP_CONFIG, type AppConfig } from '../../config/env.config';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { LockService } from '../../infra/redis/lock.service';
import { JOB_EXPIRE_ORDER, QUEUE_ORDERS } from '../../infra/queue/queue.constants';
import { Errors } from '../../common/errors';
import { hashObject } from '../../common/utils';
import { toNumber } from '../../common/bigint';
import { CartService } from '../cart/cart.service';
import { DiscountsService } from '../discounts/discounts.service';
import { InventoryService, type ReservationItem } from '../inventory/inventory.service';
import { PaymentsService } from '../payments/payments.service';
import { PaymentProviderRegistry } from '../payments/provider-registry.service';
import { ShippingService } from '../shipping/shipping.service';
import { UsersService } from '../users/users.service';
import { OrderNumberService } from './order-number.service';
import { orderInclude, toOrderDto } from './orders.mapper';
import type { AuthUser } from '../../types/express';

interface PricedLine {
  variantId: string;
  productId: string;
  productName: string;
  productSlug: string;
  variantTitle: string;
  colorName: string;
  storageLabel: string;
  sku: string;
  imageUrl: string | null;
  unitPrice: number;
  compareAtPrice: number | null;
  quantity: number;
  discount: number;
  finalPrice: number;
  shippingTime: ShippingTime;
}

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cart: CartService,
    private readonly shipping: ShippingService,
    private readonly discounts: DiscountsService,
    private readonly inventory: InventoryService,
    private readonly payments: PaymentsService,
    private readonly registry: PaymentProviderRegistry,
    private readonly users: UsersService,
    private readonly orderNumbers: OrderNumberService,
    private readonly locks: LockService,
    @InjectQueue(QUEUE_ORDERS) private readonly ordersQueue: Queue,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ─── Quote (review step) ───────────────────────────────────────────────────

  async quote(
    user: AuthUser,
    input: { addressId?: string; province?: string; shippingMethodId?: string; couponCode?: string },
  ): Promise<CheckoutQuoteDto> {
    const cartResult = await this.cart.get({ userId: user.id, guestToken: null });
    const cart = cartResult.cart;

    let province = input.province ?? null;
    if (input.addressId) {
      const address = await this.users.getAddressOrThrow(user.id, input.addressId);
      province = address.province;
    }

    const itemsTotal = cart.summary.total + cart.summary.couponDiscount;
    const couponCode = input.couponCode ?? cart.couponCode;
    const coupon = couponCode ? await this.discounts.evaluate(couponCode, user.id, itemsTotal) : null;
    const couponDiscount = coupon?.valid ? coupon.amount : 0;

    const methods = await this.shipping.listForCart(province, itemsTotal - couponDiscount);
    const selected =
      methods.find((m) => m.id === input.shippingMethodId && m.available) ??
      methods.find((m) => m.available) ??
      null;
    const shippingCost = selected?.cost ?? 0;
    const total = Math.max(0, itemsTotal - couponDiscount + shippingCost);

    return {
      cart,
      shippingMethods: methods,
      selectedShippingMethodId: selected?.id ?? null,
      summary: {
        ...cart.summary,
        couponDiscount,
        discount: cart.summary.itemsDiscount + couponDiscount,
        shipping: shippingCost,
        total,
      },
      coupon: coupon
        ? { code: coupon.code, valid: coupon.valid, message: coupon.message, amount: coupon.amount }
        : null,
      paymentMethods: await this.registry.options(total, { phone: user.phone }),
    };
  }

  // ─── Order creation ────────────────────────────────────────────────────────

  /**
   * Creates the order and reserves stock in a single transaction.
   * Protected by a per-user Redis lock and an Idempotency-Key record so a
   * double-submit or a retried request can never create two orders.
   */
  async createOrder(user: AuthUser, input: CreateOrderInput, idempotencyKey: string): Promise<OrderDto> {
    const scope = `checkout:${user.id}`;
    const requestHash = hashObject(input);

    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: { scope_key: { scope, key: idempotencyKey } },
    });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw Errors.conflict(
          'IDEMPOTENCY_MISMATCH',
          'این درخواست با کلید تکراری ولی اطلاعات متفاوت ارسال شد',
        );
      }
      const orderId = (existing.responseBody as { orderId?: string }).orderId;
      if (orderId) return this.getOrderDto(orderId, user.id);
    }

    return this.locks.withLock(
      `lock:checkout:${user.id}`,
      20_000,
      async () => {
        const order = await this.buildOrder(user, input);
        await this.prisma.idempotencyRecord.create({
          data: {
            scope,
            key: idempotencyKey,
            requestHash,
            statusCode: 201,
            responseBody: { orderId: order.id, orderNumber: order.orderNumber } as Prisma.InputJsonValue,
            expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
          },
        });
        await this.scheduleExpiry(order.id);
        return order;
      },
      () => Errors.conflict('CHECKOUT_IN_PROGRESS', 'یک سفارش در حال ثبت است. چند لحظه صبر کنید'),
    );
  }

  private async buildOrder(user: AuthUser, input: CreateOrderInput): Promise<OrderDto> {
    const cartRow = await this.cart.itemsForCheckout(user.id);
    if (!cartRow || cartRow.items.length === 0)
      throw Errors.badRequest('EMPTY_CART', 'سبد خرید شما خالی است');

    // every unpaid order holds stock back from other customers until it expires;
    // one account cannot pile them up and empty the shelf without paying
    const open = await this.prisma.order.count({
      where: { userId: user.id, status: { in: ['PENDING', 'PAYMENT_PENDING'] } },
    });
    if (open >= this.config.MAX_OPEN_ORDERS_PER_USER) {
      throw Errors.conflict(
        'TOO_MANY_OPEN_ORDERS',
        'چند سفارش پرداخت‌نشده دارید. اول یکی از آن‌ها را پرداخت یا لغو کنید، بعد سفارش تازه ثبت کنید',
      );
    }

    const cartDto = await this.cart.toDto(cartRow, user.id);
    const blocking = CartService.blockingIssues(cartDto);
    if (blocking.length) {
      throw Errors.conflict('CART_NOT_READY', blocking[0]!.message, { issues: blocking });
    }

    // Address: either a saved one or a new address supplied inline.
    let addressSnapshot: AddressInput & { id?: string };
    if (input.addressId) {
      const address = await this.users.getAddressOrThrow(user.id, input.addressId);
      addressSnapshot = { ...address } as AddressInput & { id?: string };
    } else {
      addressSnapshot = input.address as AddressInput;
      if (input.saveAddress) {
        await this.users.createAddress(user.id, {
          ...(input.address as AddressInput),
          title: input.address?.title ?? null,
          plaque: input.address?.plaque ?? null,
          unit: input.address?.unit ?? null,
          notes: input.address?.notes ?? null,
          isDefault: false,
        } as never);
      }
    }

    // Prices always come from the database, never from the client.
    const lines: PricedLine[] = cartRow.items.map((item) => {
      const variant = item.variant;
      const unitPrice = toNumber(variant.price);
      const compareAtPrice = variant.compareAtPrice ? toNumber(variant.compareAtPrice) : null;
      const image =
        variant.product.images.find((i) => i.colorId === variant.colorId)?.url ??
        variant.product.images.find((i) => i.colorId === null)?.url ??
        variant.product.images[0]?.url ??
        null;
      return {
        variantId: variant.id,
        productId: variant.product.id,
        productName: variant.product.name,
        productSlug: variant.product.slug,
        variantTitle: `${variant.storage.labelFa} — ${variant.color.name}`,
        colorName: variant.color.name,
        storageLabel: variant.storage.labelFa,
        sku: variant.sku,
        imageUrl: image,
        unitPrice,
        compareAtPrice,
        quantity: item.quantity,
        discount:
          compareAtPrice && compareAtPrice > unitPrice ? (compareAtPrice - unitPrice) * item.quantity : 0,
        finalPrice: unitPrice * item.quantity,
        shippingTime: variant.shippingTime,
      };
    });

    const totals = calcCartTotals(
      lines.map((l) => ({ price: l.unitPrice, compareAtPrice: l.compareAtPrice, quantity: l.quantity })),
    );

    const couponCode = input.couponCode ?? cartRow.couponCode ?? null;
    const coupon = couponCode ? await this.discounts.evaluate(couponCode, user.id, totals.itemsTotal) : null;
    if (couponCode && coupon && !coupon.valid) {
      throw Errors.badRequest('INVALID_COUPON', coupon.message ?? 'کد تخفیف معتبر نیست');
    }
    const couponDiscount = coupon?.valid ? coupon.amount : 0;

    const shippingQuote = await this.shipping.quote(
      input.shippingMethodId,
      addressSnapshot.province,
      totals.itemsTotal - couponDiscount,
    );

    const total = Math.max(0, totals.itemsTotal - couponDiscount + shippingQuote.cost);
    const provider = await this.registry.assertEnabled(input.paymentMethod, { phone: user.phone });
    const eligibility = await provider.checkEligibility({ amount: total });
    if (!eligibility.eligible) {
      throw Errors.badRequest(
        'PAYMENT_NOT_ELIGIBLE',
        eligibility.reason ?? 'این روش پرداخت برای این مبلغ فعال نیست',
      );
    }

    const profile = await this.users.findByIdOrThrow(user.id);
    const customerName =
      [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim() || addressSnapshot.recipientName;
    const expiresAt = new Date(Date.now() + this.config.reservationTtlMs);

    const orderId = await this.prisma.transaction(async (tx) => {
      const orderNumber = await this.orderNumbers.next(tx);
      const order = await tx.order.create({
        data: {
          orderNumber,
          userId: user.id,
          status: 'PENDING',
          paymentMethod: input.paymentMethod,
          customerName,
          customerPhone: profile.phone,
          shippingAddress: {
            recipientName: addressSnapshot.recipientName,
            mobile: addressSnapshot.mobile,
            province: addressSnapshot.province,
            city: addressSnapshot.city,
            addressLine: addressSnapshot.addressLine,
            postalCode: addressSnapshot.postalCode,
            plaque: addressSnapshot.plaque ?? null,
            unit: addressSnapshot.unit ?? null,
            notes: addressSnapshot.notes ?? null,
          } as Prisma.InputJsonValue,
          shippingMethodId: shippingQuote.method.id,
          shippingMethodSnapshot: {
            code: shippingQuote.method.code,
            name: shippingQuote.method.name,
            etaLabel: shippingQuote.method.etaLabel,
            cost: shippingQuote.cost,
          } as Prisma.InputJsonValue,
          subtotal: BigInt(totals.subtotal),
          itemsDiscount: BigInt(totals.itemsDiscount),
          couponDiscount: BigInt(couponDiscount),
          discountTotal: BigInt(totals.itemsDiscount + couponDiscount),
          shippingCost: BigInt(shippingQuote.cost),
          total: BigInt(total),
          couponCode: coupon?.valid ? coupon.code : null,
          notes: input.notes ?? null,
          reservationExpiresAt: expiresAt,
          items: {
            create: lines.map((line) => ({
              variantId: line.variantId,
              productId: line.productId,
              productName: line.productName,
              productSlug: line.productSlug,
              variantTitle: line.variantTitle,
              colorName: line.colorName,
              storageLabel: line.storageLabel,
              sku: line.sku,
              imageUrl: line.imageUrl,
              unitPrice: BigInt(line.unitPrice),
              compareAtPrice: line.compareAtPrice ? BigInt(line.compareAtPrice) : null,
              quantity: line.quantity,
              discount: BigInt(line.discount),
              finalPrice: BigInt(line.finalPrice),
              shippingTime: line.shippingTime,
              shippingTimeLabel: SHIPPING_TIME_LABELS[line.shippingTime],
            })),
          },
          statusHistory: { create: { toStatus: 'PENDING', actor: 'USER', note: 'ثبت سفارش' } },
        },
      });

      const reservationItems: ReservationItem[] = lines.map((line) => ({
        variantId: line.variantId,
        quantity: line.quantity,
        title: `${line.productName} ${line.variantTitle}`,
      }));
      await this.inventory.reserve(tx, order.id, reservationItems, expiresAt);

      if (coupon?.valid && coupon.couponId) {
        await this.discounts.redeem(tx, coupon.couponId, user.id, order.id, coupon.amount);
      }

      await tx.cartItem.deleteMany({ where: { cartId: cartRow.id } });
      await tx.cart.update({ where: { id: cartRow.id }, data: { couponCode: null } });

      return order.id;
    });

    return this.getOrderDto(orderId, user.id);
  }

  /** POST /checkout — create the order and immediately start the payment. */
  async checkout(
    user: AuthUser,
    input: CreateOrderInput,
    idempotencyKey: string,
    options: { customerIp?: string } = {},
  ): Promise<CheckoutResponseDto> {
    const order = await this.createOrder(user, input, idempotencyKey);
    try {
      const { payment, redirectUrl } = await this.payments.createForOrderId(
        order.id,
        input.paymentMethod,
        options,
      );
      return {
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: 'PAYMENT_PENDING',
          total: order.total,
        },
        // a checkout payment always goes through one of the checkout methods
        payment: {
          id: payment.id,
          method: payment.method as PaymentMethod,
          status: payment.status,
          redirectUrl,
        },
        paymentError: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'اتصال به درگاه پرداخت برقرار نشد';
      this.logger.warn(`payment creation failed for ${order.orderNumber}: ${message}`);
      return {
        order: { id: order.id, orderNumber: order.orderNumber, status: order.status, total: order.total },
        payment: null,
        paymentError: 'اتصال به درگاه پرداخت برقرار نشد. از صفحه سفارش دوباره تلاش کنید',
      };
    }
  }

  private async scheduleExpiry(orderId: string): Promise<void> {
    try {
      await this.ordersQueue.add(
        JOB_EXPIRE_ORDER,
        { orderId },
        { delay: this.config.reservationTtlMs + 5_000, jobId: `expire-${orderId}`, attempts: 3 },
      );
    } catch (error) {
      this.logger.error(`could not schedule expiry for order ${orderId}: ${String(error)}`);
    }
  }

  private async getOrderDto(orderId: string, userId: string): Promise<OrderDto> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: orderInclude,
    });
    if (!order) throw Errors.notFound('سفارش پیدا نشد');
    return toOrderDto(order);
  }

  /** Convenience for the cart page: cart + shipping + payment options in one call. */
  async summaryForCart(user: AuthUser): Promise<CartDto> {
    const result = await this.cart.get({ userId: user.id, guestToken: null });
    return result.cart;
  }
}
