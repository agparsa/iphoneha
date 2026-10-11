/**
 * Enum values mirrored from apps/api/prisma/schema.prisma.
 * A unit test in the API asserts both definitions stay identical.
 */
const makeEnum = <const T extends readonly string[]>(values: T) =>
  Object.freeze(Object.fromEntries(values.map((v) => [v, v]))) as { readonly [K in T[number]]: K };

export const ORDER_STATUSES = [
  'PENDING',
  'PAYMENT_PENDING',
  'PAID',
  'PROCESSING',
  'READY_TO_SHIP',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED',
] as const;
export const OrderStatus = makeEnum(ORDER_STATUSES);
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_METHODS = [
  'ONLINE',
  'SNAPPAY',
  'TARA',
  'DIGIPAY',
  'NESIBA',
  'BOJET',
  'AZKIVAM',
] as const;
export const PaymentMethod = makeEnum(PAYMENT_METHODS);
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const INSTALLMENT_METHODS = ['SNAPPAY', 'TARA', 'DIGIPAY', 'NESIBA', 'BOJET', 'AZKIVAM'] as const;
export type InstallmentMethod = (typeof INSTALLMENT_METHODS)[number];

/**
 * Sales the staff record themselves (by phone or at the store): never offered
 * at checkout. CHEQUE and SAFTE are the store's own instalments, whose money is
 * tracked by an InstallmentContract.
 */
export const OFFLINE_PAYMENT_METHODS = ['IN_STORE', 'CHEQUE', 'SAFTE'] as const;
export type OfflinePaymentMethod = (typeof OFFLINE_PAYMENT_METHODS)[number];

/** Every way an order can be paid — the checkout methods and the staff-recorded ones (the Prisma enum). */
export const ORDER_PAYMENT_METHODS = [...PAYMENT_METHODS, ...OFFLINE_PAYMENT_METHODS] as const;
export type OrderPaymentMethod = (typeof ORDER_PAYMENT_METHODS)[number];

export function isOfflinePaymentMethod(method: string): method is OfflinePaymentMethod {
  return (OFFLINE_PAYMENT_METHODS as readonly string[]).includes(method);
}

/** Where an order came from. */
export const ORDER_SOURCES = ['WEBSITE', 'PHONE', 'IN_STORE'] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

/** How money reached the store when the staff record a payment by hand. */
export const MANUAL_PAYMENT_CHANNELS = ['CASH', 'POS', 'TRANSFER', 'CHEQUE', 'ONLINE'] as const;
export type ManualPaymentChannel = (typeof MANUAL_PAYMENT_CHANNELS)[number];

export const DEVICE_UNIT_STATUSES = ['IN_STOCK', 'SOLD', 'RETURNED', 'DEFECTIVE'] as const;
export type DeviceUnitStatus = (typeof DEVICE_UNIT_STATUSES)[number];

export const CONTRACT_STATUSES = ['ACTIVE', 'COMPLETED', 'DEFAULTED', 'CANCELLED'] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const INSTALLMENT_STATUSES = ['PENDING', 'PAID', 'WAIVED'] as const;
export type InstallmentStatus = (typeof INSTALLMENT_STATUSES)[number];

export const CHEQUE_STATUSES = ['IN_HAND', 'DEPOSITED', 'CLEARED', 'BOUNCED', 'RETURNED'] as const;
export type ChequeStatus = (typeof CHEQUE_STATUSES)[number];

export const SAFTE_STATUSES = ['HELD', 'RETURNED', 'CLAIMED'] as const;
export type SafteStatus = (typeof SAFTE_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'INITIATED',
  'PENDING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
  'REFUND_PENDING',
  'REFUNDED',
] as const;
export const PaymentStatus = makeEnum(PAYMENT_STATUSES);
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const SHIPPING_TIMES = [
  'SAME_DAY',
  'ONE_TO_TWO_DAYS',
  'THREE_TO_FIVE_DAYS',
  'WAREHOUSE',
  'PRE_ORDER',
] as const;
export const ShippingTime = makeEnum(SHIPPING_TIMES);
export type ShippingTime = (typeof SHIPPING_TIMES)[number];

export const REGISTRY_STATUSES = ['REGISTERED', 'ACTIVATION_CODE', 'NOT_REGISTERED'] as const;
export const RegistryStatus = makeEnum(REGISTRY_STATUSES);
export type RegistryStatus = (typeof REGISTRY_STATUSES)[number];

/** DEVICE: the whole phone on a transparent background · DETAIL: a full-bleed close-up photo */
export const PRODUCT_IMAGE_KINDS = ['DEVICE', 'DETAIL'] as const;
export const ProductImageKind = makeEnum(PRODUCT_IMAGE_KINDS);
export type ProductImageKind = (typeof PRODUCT_IMAGE_KINDS)[number];

export const ADMIN_ROLES = ['SUPER_ADMIN', 'MANAGER', 'SUPPORT', 'WAREHOUSE'] as const;
export const AdminRole = makeEnum(ADMIN_ROLES);
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const DISCOUNT_TYPES = ['PERCENT', 'FIXED'] as const;
export const DiscountType = makeEnum(DISCOUNT_TYPES);
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const INVENTORY_MOVEMENT_TYPES = [
  'RESTOCK',
  'ADJUSTMENT',
  'RESERVE',
  'RELEASE',
  'SALE',
  'RETURN',
] as const;
export const InventoryMovementType = makeEnum(INVENTORY_MOVEMENT_TYPES);
export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number];

export const RESERVATION_STATUSES = ['ACTIVE', 'COMMITTED', 'RELEASED'] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const STATUS_ACTORS = ['SYSTEM', 'USER', 'ADMIN', 'PAYMENT'] as const;
export type StatusActor = (typeof STATUS_ACTORS)[number];

/** The store's own instalment plans (not payment methods: the contract is signed off-site). */
export const CREDIT_METHODS = ['CHEQUE', 'SAFTE'] as const;
export const CreditMethod = makeEnum(CREDIT_METHODS);
export type CreditMethod = (typeof CREDIT_METHODS)[number];

export const CREDIT_REQUEST_STATUSES = ['NEW', 'CONTACTED', 'CONTRACTED', 'CANCELLED'] as const;
export const CreditRequestStatus = makeEnum(CREDIT_REQUEST_STATUSES);
export type CreditRequestStatus = (typeof CREDIT_REQUEST_STATUSES)[number];

export const ARTICLE_STATUSES = ['DRAFT', 'PUBLISHED'] as const;
export const ArticleStatus = makeEnum(ARTICLE_STATUSES);
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

export const PRODUCT_SORTS = ['featured', 'newest', 'price_asc', 'price_desc', 'discount_desc'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
