import type { Order, OrderItem, OrderStatusHistory, Payment, Prisma } from '@prisma/client';
import {
  ORDER_STATUS_LABELS,
  SHIPPING_TIME_LABELS,
  type AddressSnapshot,
  type OrderDto,
  type OrderItemDto,
  type OrderStatusHistoryDto,
  type OrderSummaryDto,
} from '@iphoneha/shared';
import { toNullableNumber, toNumber } from '../../common/bigint';
import { PaymentsService } from '../payments/payments.service';

export const orderInclude = {
  items: true,
  payments: { orderBy: { createdAt: 'desc' as const } },
  statusHistory: {
    orderBy: { createdAt: 'asc' as const },
    include: { adminUser: { select: { name: true } } },
  },
  reservations: { include: { variant: { select: { sku: true } } } },
} satisfies Prisma.OrderInclude;

export type OrderWithRelations = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export function toOrderItemDto(item: OrderItem): OrderItemDto {
  return {
    id: item.id,
    variantId: item.variantId,
    productName: item.productName,
    productSlug: item.productSlug,
    variantTitle: item.variantTitle,
    colorName: item.colorName,
    storageLabel: item.storageLabel,
    sku: item.sku,
    imageUrl: item.imageUrl,
    unitPrice: toNumber(item.unitPrice),
    compareAtPrice: toNullableNumber(item.compareAtPrice),
    quantity: item.quantity,
    discount: toNumber(item.discount),
    finalPrice: toNumber(item.finalPrice),
    shippingTime: item.shippingTime,
    shippingTimeLabel: item.shippingTimeLabel || SHIPPING_TIME_LABELS[item.shippingTime],
  };
}

export function toOrderSummary(order: Order & { items: OrderItem[] }): OrderSummaryDto {
  const first = order.items[0] ?? null;
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    statusLabel: ORDER_STATUS_LABELS[order.status],
    paymentMethod: order.paymentMethod,
    source: order.source,
    total: toNumber(order.total),
    itemsCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    createdAt: order.createdAt.toISOString(),
    firstItem: first
      ? { productName: first.productName, imageUrl: first.imageUrl, variantTitle: first.variantTitle }
      : null,
  };
}

function toHistoryDto(
  entry: OrderStatusHistory & { adminUser?: { name: string } | null },
): OrderStatusHistoryDto {
  return {
    id: entry.id,
    fromStatus: entry.fromStatus,
    toStatus: entry.toStatus,
    actor: entry.actor,
    note: entry.note,
    createdAt: entry.createdAt.toISOString(),
    adminName: entry.adminUser?.name ?? null,
  };
}

export function toOrderDto(order: OrderWithRelations): OrderDto {
  const shippingSnapshot = (order.shippingMethodSnapshot ?? {}) as {
    code?: string;
    name?: string;
    etaLabel?: string;
    cost?: number;
  };
  const canPay =
    ['PENDING', 'PAYMENT_PENDING'].includes(order.status) &&
    (!order.reservationExpiresAt || order.reservationExpiresAt.getTime() > Date.now());

  return {
    ...toOrderSummary(order),
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    shippingAddress: order.shippingAddress as unknown as AddressSnapshot,
    shippingMethod: {
      code: shippingSnapshot.code ?? '',
      name: shippingSnapshot.name ?? '',
      etaLabel: shippingSnapshot.etaLabel ?? '',
      cost: Number(shippingSnapshot.cost ?? 0),
    },
    subtotal: toNumber(order.subtotal),
    itemsDiscount: toNumber(order.itemsDiscount),
    couponDiscount: toNumber(order.couponDiscount),
    discountTotal: toNumber(order.discountTotal),
    shippingCost: toNumber(order.shippingCost),
    couponCode: order.couponCode,
    notes: order.notes,
    trackingCode: order.trackingCode,
    cancelReason: order.cancelReason,
    reservationExpiresAt: order.reservationExpiresAt?.toISOString() ?? null,
    paidAt: order.paidAt?.toISOString() ?? null,
    shippedAt: order.shippedAt?.toISOString() ?? null,
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    updatedAt: order.updatedAt.toISOString(),
    items: order.items.map(toOrderItemDto),
    payments: order.payments.map((payment: Payment) => PaymentsService.toDto(payment)),
    history: order.statusHistory.map(toHistoryDto),
    canPay,
    canCancel: ['PENDING', 'PAYMENT_PENDING'].includes(order.status),
  };
}
