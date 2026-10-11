import type { AdminRole, OrderStatus } from './enums';

export const PERMISSIONS = [
  'dashboard.read',
  'products.read',
  'products.write',
  'inventory.read',
  'inventory.write',
  'orders.read',
  'orders.write',
  'users.read',
  'users.write',
  'payments.read',
  'payments.refund',
  'discounts.read',
  'discounts.write',
  'shipping.read',
  'shipping.write',
  'settings.read',
  'settings.write',
  'audit.read',
  'admins.manage',
  'leads.read',
  'leads.write',
  'content.read',
  'content.write',
  /** record a phone or in-store order, with its price and discount */
  'orders.create',
  /** the store's own instalment contracts, their cheques and payments */
  'installments.read',
  'installments.write',
  /** sales reports and Excel exports (customers' details included) */
  'reports.read',
  /** keep notes on a customer */
  'users.notes',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Record<AdminRole, readonly Permission[]> = {
  SUPER_ADMIN: ALL,
  MANAGER: ALL.filter((p) => p !== 'admins.manage'),
  SUPPORT: [
    'dashboard.read',
    'products.read',
    'inventory.read',
    'orders.read',
    'users.read',
    'payments.read',
    'discounts.read',
    'shipping.read',
    // support staff call the customers back
    'leads.read',
    'leads.write',
    // …and about their instalments
    'installments.read',
    'users.notes',
  ],
  WAREHOUSE: [
    'dashboard.read',
    'products.read',
    'inventory.read',
    'inventory.write',
    'orders.read',
    'orders.write',
  ],
};

/**
 * Order statuses a role may set by hand (on top of `orders.write`).
 * Cancelling or refunding a paid order additionally needs `payments.refund`.
 */
export const ROLE_ORDER_TARGETS: Record<AdminRole, readonly OrderStatus[] | 'ALL'> = {
  SUPER_ADMIN: 'ALL',
  MANAGER: 'ALL',
  SUPPORT: [],
  WAREHOUSE: ['PROCESSING', 'READY_TO_SHIP', 'SHIPPED'],
};

export function roleHasPermission(role: AdminRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function roleCanSetOrderStatus(role: AdminRole, to: OrderStatus): boolean {
  const targets = ROLE_ORDER_TARGETS[role];
  return targets === 'ALL' || targets.includes(to);
}
