import type { OrderStatus } from './enums';

/** Every legal status transition (system + admin). */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ['PAYMENT_PENDING', 'CANCELLED'],
  PAYMENT_PENDING: ['PAID', 'CANCELLED'],
  PAID: ['PROCESSING', 'CANCELLED', 'REFUNDED'],
  PROCESSING: ['READY_TO_SHIP', 'CANCELLED', 'REFUNDED'],
  // DELIVERED straight from «آماده ارسال»: collected by the customer at the store
  READY_TO_SHIP: ['SHIPPED', 'DELIVERED', 'PROCESSING', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
};

/**
 * Transitions an admin may trigger manually. Payment-driven transitions
 * (→ PAYMENT_PENDING, → PAID) are reserved for the payment flow.
 */
export const ADMIN_ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ['CANCELLED'],
  PAYMENT_PENDING: ['CANCELLED'],
  PAID: ['PROCESSING', 'CANCELLED', 'REFUNDED'],
  PROCESSING: ['READY_TO_SHIP', 'CANCELLED', 'REFUNDED'],
  // DELIVERED straight from «آماده ارسال»: collected by the customer at the store
  READY_TO_SHIP: ['SHIPPED', 'DELIVERED', 'PROCESSING', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
};

/** Statuses in which money has been captured. */
export const PAID_ORDER_STATUSES: readonly OrderStatus[] = [
  'PAID',
  'PROCESSING',
  'READY_TO_SHIP',
  'SHIPPED',
  'DELIVERED',
];

/** Statuses that still hold an inventory reservation. */
export const RESERVING_ORDER_STATUSES: readonly OrderStatus[] = ['PENDING', 'PAYMENT_PENDING'];

export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = ['CANCELLED', 'REFUNDED'];

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export function canAdminTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ADMIN_ORDER_TRANSITIONS[from].includes(to);
}

/** A cancellation/refund of an order whose money was captured requires a refund. */
export function transitionRequiresRefund(from: OrderStatus, to: OrderStatus): boolean {
  return PAID_ORDER_STATUSES.includes(from) && (to === 'CANCELLED' || to === 'REFUNDED');
}

/** Stock goes back to the shelf when a paid order is cancelled before/after delivery (returned). */
export function transitionRestocks(from: OrderStatus, to: OrderStatus): boolean {
  return transitionRequiresRefund(from, to);
}
