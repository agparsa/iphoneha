import type {
  AdminRole,
  ArticleStatus,
  ChequeStatus,
  ContractStatus,
  CreditMethod,
  CreditRequestStatus,
  DeviceUnitStatus,
  DiscountType,
  InstallmentStatus,
  InventoryMovementType,
  ManualPaymentChannel,
  OfflinePaymentMethod,
  OrderSource,
  OrderStatus,
  PaymentStatus,
  ProductSort,
  RegistryStatus,
  SafteStatus,
  ShippingTime,
  StatusActor,
} from './enums';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'ثبت اولیه',
  PAYMENT_PENDING: 'در انتظار پرداخت',
  PAID: 'پرداخت‌شده',
  PROCESSING: 'در حال پردازش',
  READY_TO_SHIP: 'آماده ارسال',
  SHIPPED: 'ارسال‌شده',
  DELIVERED: 'تحویل‌شده',
  CANCELLED: 'لغوشده',
  REFUNDED: 'مسترد‌شده',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  INITIATED: 'ایجاد‌شده',
  PENDING: 'در انتظار پرداخت',
  SUCCEEDED: 'موفق',
  FAILED: 'ناموفق',
  CANCELLED: 'انصراف',
  EXPIRED: 'منقضی',
  REFUND_PENDING: 'در انتظار بازپرداخت',
  REFUNDED: 'بازپرداخت‌شده',
};

export const SHIPPING_TIME_LABELS: Record<ShippingTime, string> = {
  SAME_DAY: 'ارسال امروز',
  ONE_TO_TWO_DAYS: '۱ تا ۲ روز کاری',
  THREE_TO_FIVE_DAYS: '۳ تا ۵ روز کاری',
  WAREHOUSE: 'موجودی انبار',
  PRE_ORDER: 'پیش‌فروش',
};

/** Lower = faster. Used for sorting and for "fastest shipping" filters. */
export const SHIPPING_TIME_RANK: Record<ShippingTime, number> = {
  SAME_DAY: 0,
  ONE_TO_TWO_DAYS: 1,
  THREE_TO_FIVE_DAYS: 2,
  WAREHOUSE: 3,
  PRE_ORDER: 4,
};

export const REGISTRY_STATUS_LABELS: Record<RegistryStatus, string> = {
  REGISTERED: 'رجیستر‌شده',
  ACTIVATION_CODE: 'همراه با کد فعال‌سازی',
  NOT_REGISTERED: 'بدون رجیستری',
};

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  SUPER_ADMIN: 'مدیر کل',
  MANAGER: 'مدیر فروشگاه',
  SUPPORT: 'پشتیبانی',
  WAREHOUSE: 'انباردار',
};

export const DISCOUNT_TYPE_LABELS: Record<DiscountType, string> = {
  PERCENT: 'درصدی',
  FIXED: 'مبلغ ثابت',
};

export const INVENTORY_MOVEMENT_LABELS: Record<InventoryMovementType, string> = {
  RESTOCK: 'ورود کالا',
  ADJUSTMENT: 'اصلاح موجودی',
  RESERVE: 'رزرو سفارش',
  RELEASE: 'آزادسازی رزرو',
  SALE: 'فروش',
  RETURN: 'برگشت به انبار',
};

export const STATUS_ACTOR_LABELS: Record<StatusActor, string> = {
  SYSTEM: 'سیستم',
  USER: 'مشتری',
  ADMIN: 'مدیر',
  PAYMENT: 'درگاه پرداخت',
};

export const PRODUCT_SORT_LABELS: Record<ProductSort, string> = {
  featured: 'پیشنهاد آیفونی‌ها',
  newest: 'جدیدترین',
  price_asc: 'ارزان‌ترین',
  price_desc: 'گران‌ترین',
  discount_desc: 'بیشترین تخفیف',
};

export const CREDIT_METHOD_LABELS: Record<CreditMethod, string> = {
  CHEQUE: 'چک صیادی',
  SAFTE: 'سفته',
};

export const CREDIT_REQUEST_STATUS_LABELS: Record<CreditRequestStatus, string> = {
  NEW: 'جدید',
  CONTACTED: 'تماس گرفته شد',
  CONTRACTED: 'قرارداد بسته شد',
  CANCELLED: 'منصرف شد',
};

export const ARTICLE_STATUS_LABELS: Record<ArticleStatus, string> = {
  DRAFT: 'پیش‌نویس',
  PUBLISHED: 'منتشرشده',
};

export const OFFLINE_PAYMENT_METHOD_LABELS: Record<OfflinePaymentMethod, string> = {
  IN_STORE: 'پرداخت حضوری',
  CHEQUE: 'اقساط با چک',
  SAFTE: 'اقساط با سفته',
};

export const ORDER_SOURCE_LABELS: Record<OrderSource, string> = {
  WEBSITE: 'سایت',
  PHONE: 'تلفنی',
  IN_STORE: 'حضوری',
};

export const MANUAL_PAYMENT_CHANNEL_LABELS: Record<ManualPaymentChannel, string> = {
  CASH: 'نقد',
  POS: 'کارت‌خوان',
  TRANSFER: 'کارت‌به‌کارت یا واریز',
  CHEQUE: 'وصول چک',
  ONLINE: 'درگاه آنلاین',
};

export const DEVICE_UNIT_STATUS_LABELS: Record<DeviceUnitStatus, string> = {
  IN_STOCK: 'در انبار',
  SOLD: 'فروخته‌شده',
  RETURNED: 'مرجوعی',
  DEFECTIVE: 'معیوب',
};

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  ACTIVE: 'جاری',
  COMPLETED: 'تسویه‌شده',
  DEFAULTED: 'نکول',
  CANCELLED: 'لغوشده',
};

/** `OVERDUE` is not stored: a pending instalment past its due date. */
export const INSTALLMENT_STATUS_LABELS: Record<InstallmentStatus | 'OVERDUE', string> = {
  PENDING: 'در انتظار',
  PAID: 'پرداخت‌شده',
  WAIVED: 'بخشوده',
  OVERDUE: 'معوق',
};

export const CHEQUE_STATUS_LABELS: Record<ChequeStatus, string> = {
  IN_HAND: 'نزد فروشگاه',
  DEPOSITED: 'به بانک رفته',
  CLEARED: 'وصول شد',
  BOUNCED: 'برگشتی',
  RETURNED: 'عودت به مشتری',
};

export const SAFTE_STATUS_LABELS: Record<SafteStatus, string> = {
  HELD: 'نزد فروشگاه',
  RETURNED: 'عودت به مشتری',
  CLAIMED: 'واخواست یا اجرا',
};
