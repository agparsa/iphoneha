import type {
  AdminRole,
  ArticleStatus,
  CreditMethod,
  CreditRequestStatus,
  DiscountType,
  InventoryMovementType,
  OrderPaymentMethod,
  OrderSource,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ProductImageKind,
  RegistryStatus,
  ShippingTime,
  StatusActor,
  StockStatus,
} from './enums';
import type { Permission } from './permissions';
import type { InstallmentTerms } from './payments';
import type { LedgerSummaryDto, OrderDeviceDto } from './backoffice-types';
import type { CommerceSettings, CreditSettings, SeoSettings, StoreSettings } from './schemas/settings';

/** Paginated list envelope used by every list endpoint. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}

// ─── Catalog ─────────────────────────────────────────────────────────────────

export interface ColorDto {
  id: string;
  code: string;
  name: string;
  nameEn: string;
  hex: string;
  finish: string | null;
}

export interface StorageDto {
  id: string;
  capacityGb: number;
  label: string;
  labelFa: string;
}

export interface ImageDto {
  id: string;
  url: string;
  alt: string | null;
  colorId: string | null;
  width: number | null;
  height: number | null;
  kind: ProductImageKind;
}

export interface VariantDto {
  id: string;
  productId: string;
  colorId: string;
  storageId: string;
  sku: string;
  price: number;
  compareAtPrice: number | null;
  discountPercent: number;
  stock: number;
  reservedStock: number;
  availableStock: number;
  stockStatus: StockStatus;
  shippingTime: ShippingTime;
  shippingTimeLabel: string;
  active: boolean;
}

export interface ProductCardVariant {
  id: string;
  sku: string;
  color: ColorDto;
  storage: StorageDto;
  price: number;
  compareAtPrice: number | null;
  discountPercent: number;
  availableStock: number;
  stockStatus: StockStatus;
  shippingTime: ShippingTime;
  shippingTimeLabel: string;
  image: ImageDto | null;
}

export interface ProductCardDto {
  id: string;
  slug: string;
  name: string;
  nameEn: string;
  series: string;
  releaseYear: number;
  ratingAvg: number | null;
  ratingCount: number;
  /** Best variant for the active filters/sort (cheapest in-stock by default) */
  variant: ProductCardVariant;
  colors: ColorDto[];
  storages: StorageDto[];
  minPrice: number;
  maxDiscountPercent: number;
  inStock: boolean;
}

export interface CatalogFacets {
  colors: (ColorDto & { count: number })[];
  storages: (StorageDto & { count: number })[];
  series: { value: string; count: number }[];
  models: { slug: string; name: string; count: number }[];
  priceRange: { min: number; max: number };
}

export interface ProductListResponse extends Paginated<ProductCardDto> {
  facets: CatalogFacets;
}

export interface SpecDto {
  key: string;
  value: string;
}

export interface BreadcrumbDto {
  name: string;
  href: string;
}

export interface ProductDetailDto {
  id: string;
  slug: string;
  name: string;
  nameEn: string;
  model: string;
  series: string;
  releaseYear: number;
  tagline: string | null;
  shortDescription: string | null;
  description: string;
  warranty: string;
  registryStatus: RegistryStatus;
  registryLabel: string;
  basePrice: number;
  specs: SpecDto[];
  ratingAvg: number | null;
  ratingCount: number;
  seoTitle: string;
  seoDescription: string;
  images: ImageDto[];
  colors: ColorDto[];
  storages: StorageDto[];
  variants: VariantDto[];
  /** Variant pre-selected on first render */
  defaultVariantId: string | null;
  priceRange: { min: number; max: number };
  inStock: boolean;
  breadcrumbs: BreadcrumbDto[];
  updatedAt: string;
}

export interface SearchSuggestionDto {
  productId: string;
  slug: string;
  name: string;
  nameEn: string;
  variantId: string | null;
  label: string;
  price: number | null;
  image: string | null;
  href: string;
}

export interface CatalogMetaDto {
  colors: ColorDto[];
  storages: StorageDto[];
  series: string[];
  models: { slug: string; name: string; nameEn: string; series: string }[];
  shippingTimes: { value: ShippingTime; label: string }[];
  priceRange: { min: number; max: number };
}

// ─── Users & auth ────────────────────────────────────────────────────────────

export interface UserDto {
  id: string;
  phone: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  profileComplete: boolean;
}

export interface SessionDto {
  id: string;
  current: boolean;
  deviceName: string | null;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

export interface SendOtpResponse {
  sent: true;
  phone: string;
  expiresIn: number;
  resendIn: number;
  codeLength: number;
}

export interface VerifyOtpResponse {
  user: UserDto;
  isNewUser: boolean;
  needsProfile: boolean;
}

export interface AddressDto {
  id: string;
  title: string | null;
  recipientName: string;
  mobile: string;
  province: string;
  city: string;
  addressLine: string;
  postalCode: string;
  plaque: string | null;
  unit: string | null;
  notes: string | null;
  isDefault: boolean;
}

export type AddressSnapshot = Omit<AddressDto, 'id' | 'isDefault' | 'title'>;

// ─── Cart ────────────────────────────────────────────────────────────────────

export interface CartItemDto {
  id: string;
  variantId: string;
  productId: string;
  productName: string;
  productSlug: string;
  sku: string;
  color: Pick<ColorDto, 'id' | 'name' | 'hex' | 'code'>;
  storage: Pick<StorageDto, 'id' | 'label' | 'labelFa' | 'capacityGb'>;
  image: string | null;
  quantity: number;
  unitPrice: number;
  compareAtPrice: number | null;
  discountPercent: number;
  /** (compareAt − price) × qty */
  lineDiscount: number;
  /** unitPrice × qty */
  lineTotal: number;
  availableStock: number;
  maxQuantity: number;
  shippingTime: ShippingTime;
  shippingTimeLabel: string;
  stockStatus: StockStatus;
  isAvailable: boolean;
  /** Price changed since the item was added */
  priceChanged: boolean;
  previousUnitPrice: number | null;
}

export interface CartSummaryDto {
  itemsCount: number;
  subtotal: number;
  itemsDiscount: number;
  couponDiscount: number;
  discount: number;
  shipping: number | null;
  total: number;
}

export interface CartIssueDto {
  itemId: string;
  code: 'OUT_OF_STOCK' | 'INSUFFICIENT_STOCK' | 'INACTIVE' | 'PRICE_CHANGED';
  message: string;
}

export interface CartDto {
  id: string | null;
  items: CartItemDto[];
  couponCode: string | null;
  summary: CartSummaryDto;
  issues: CartIssueDto[];
}

// ─── Checkout ────────────────────────────────────────────────────────────────

export interface ShippingMethodDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  etaLabel: string;
  cost: number;
  isFree: boolean;
  available: boolean;
  unavailableReason: string | null;
}

export interface PaymentMethodOptionDto {
  method: PaymentMethod;
  kind: 'ONLINE' | 'INSTALLMENT';
  name: string;
  tagline: string;
  color: string;
  logo: string | null;
  eligible: boolean;
  reason: string | null;
  estimate: { downPayment: number; months: number; monthly: number } | null;
}

export interface CheckoutQuoteDto {
  cart: CartDto;
  shippingMethods: ShippingMethodDto[];
  selectedShippingMethodId: string | null;
  summary: CartSummaryDto;
  coupon: { code: string; valid: boolean; message: string | null; amount: number } | null;
  paymentMethods: PaymentMethodOptionDto[];
}

export interface CheckoutResponseDto {
  order: { id: string; orderNumber: string; status: OrderStatus; total: number };
  payment: { id: string; method: PaymentMethod; status: PaymentStatus; redirectUrl: string | null } | null;
  paymentError: string | null;
}

// ─── The customer's instalment booklet (دفترچهٔ اقساط) ─────────────────────────

/** One instalment as the customer sees it in their booklet. */
export interface MyInstallmentDto {
  index: number;
  dueDate: string;
  amount: number;
  paidAmount: number;
  remaining: number;
  status: 'PENDING' | 'PAID' | 'WAIVED';
  statusLabel: string;
  overdue: boolean;
  daysLate: number;
  paidAt: string | null;
  /** the cheque written for it: the bank and the last four digits of its Sayad ID */
  cheque: { bankName: string; sayadTail: string; statusLabel: string } | null;
}

/** A contract of the store's own instalments (cheque or promissory note), for its customer. */
export interface MyContractDto {
  number: number;
  method: 'CHEQUE' | 'SAFTE';
  methodLabel: string;
  status: 'ACTIVE' | 'COMPLETED' | 'DEFAULTED' | 'CANCELLED';
  statusLabel: string;
  itemDescription: string;
  orderNumber: string | null;
  contractDate: string;
  cashPrice: number;
  downPayment: number;
  financed: number;
  /** what the instalments add over the amount financed */
  markup: number;
  totalPayable: number;
  months: number;
  monthlyFeePercent: number | null;
  /** received so far, down payment included */
  paid: number;
  remaining: number;
  overdueAmount: number;
  overdueCount: number;
  nextDue: { index: number; dueDate: string; amount: number } | null;
  paidCount: number;
  installments: MyInstallmentDto[];
  payments: {
    amount: number;
    channelLabel: string;
    paidAt: string;
    installmentIndex: number | null;
    note: string | null;
  }[];
  saftes: { serial: string; amount: number; statusLabel: string }[];
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export interface OrderItemDto {
  id: string;
  variantId: string | null;
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
  shippingTimeLabel: string;
}

export interface PaymentDto {
  id: string;
  method: OrderPaymentMethod;
  methodName: string;
  provider: string;
  amount: number;
  status: PaymentStatus;
  statusLabel: string;
  providerRef: string | null;
  trackingCode: string | null;
  failureReason: string | null;
  paidAt: string | null;
  refundedAt: string | null;
  createdAt: string;
}

export interface OrderStatusHistoryDto {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actor: StatusActor;
  note: string | null;
  createdAt: string;
  adminName: string | null;
}

export interface OrderSummaryDto {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  statusLabel: string;
  paymentMethod: OrderPaymentMethod;
  /** website checkout, or taken by the staff by phone or at the store */
  source: OrderSource;
  total: number;
  itemsCount: number;
  createdAt: string;
  firstItem: { productName: string; imageUrl: string | null; variantTitle: string } | null;
}

export interface OrderDto extends OrderSummaryDto {
  customerName: string;
  customerPhone: string;
  shippingAddress: AddressSnapshot;
  shippingMethod: { code: string; name: string; etaLabel: string; cost: number };
  subtotal: number;
  itemsDiscount: number;
  couponDiscount: number;
  discountTotal: number;
  shippingCost: number;
  couponCode: string | null;
  notes: string | null;
  trackingCode: string | null;
  cancelReason: string | null;
  reservationExpiresAt: string | null;
  paidAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  updatedAt: string;
  items: OrderItemDto[];
  payments: PaymentDto[];
  history: OrderStatusHistoryDto[];
  canPay: boolean;
  canCancel: boolean;
}

export interface PaymentResultDto {
  orderNumber: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  success: boolean;
  trackingCode: string | null;
  message: string;
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export interface AdminMeDto {
  id: string;
  phone: string;
  name: string;
  role: AdminRole;
  roleLabel: string;
  permissions: Permission[];
}

export interface AdminVerifyOtpResponse {
  admin: AdminMeDto;
}

export interface AdminDashboardDto {
  today: { orders: number; paidOrders: number; revenue: number };
  last30Days: { orders: number; paidOrders: number; revenue: number; averageOrderValue: number };
  ordersByStatus: { status: OrderStatus; label: string; count: number }[];
  salesByDay: { date: string; revenue: number; orders: number }[];
  paymentsByMethod: { method: OrderPaymentMethod; name: string; count: number; amount: number }[];
  lowStock: {
    variantId: string;
    productName: string;
    title: string;
    sku: string;
    available: number;
    threshold: number;
  }[];
  recentOrders: OrderSummaryDto[];
  usersCount: number;
  activeReservations: number;
  /** the store's own instalments (null: this admin may not see them) */
  ledger: LedgerSummaryDto | null;
}

export interface AdminProductListItem {
  id: string;
  slug: string;
  name: string;
  nameEn: string;
  series: string;
  releaseYear: number;
  isActive: boolean;
  isFeatured: boolean;
  variantsCount: number;
  activeVariants: number;
  /** colour × capacity combinations without a price yet — hidden from the store until priced */
  unpricedVariants: number;
  totalAvailable: number;
  minPrice: number | null;
  image: string | null;
  updatedAt: string;
}

export interface AdminVariantDto extends VariantDto {
  productName: string;
  productSlug: string;
  color: ColorDto;
  storage: StorageDto;
  sold: number;
  lowStockThreshold: number;
  updatedAt: string;
}

export interface AdminProductDetailDto {
  id: string;
  slug: string;
  name: string;
  nameEn: string;
  model: string;
  series: string;
  releaseYear: number;
  tagline: string | null;
  shortDescription: string | null;
  description: string;
  warranty: string;
  registryStatus: RegistryStatus;
  basePrice: number;
  specs: SpecDto[];
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: number;
  ratingAvg: number | null;
  ratingCount: number;
  seoTitle: string | null;
  seoDescription: string | null;
  images: ImageDto[];
  variants: AdminVariantDto[];
  createdAt: string;
  updatedAt: string;
}

export interface InventoryMovementDto {
  id: string;
  variantId: string;
  type: InventoryMovementType;
  typeLabel: string;
  quantity: number;
  stockAfter: number;
  reservedAfter: number;
  orderId: string | null;
  adminUserId: string | null;
  reason: string | null;
  createdAt: string;
}

export interface AdminOrderListItem extends OrderSummaryDto {
  customerName: string;
  customerPhone: string;
  paymentStatus: PaymentStatus | null;
}

export interface AdminOrderDto extends OrderDto {
  user: { id: string; phone: string; fullName: string | null };
  allowedTransitions: OrderStatus[];
  reservations: { variantId: string; sku: string; quantity: number; status: string; expiresAt: string }[];
  /** internal note, never shown to the customer */
  adminNote: string | null;
  /** who recorded a phone or in-store order */
  createdByName: string | null;
  /** the instalment contract of a cheque or safte sale */
  contract: { id: string; number: number; status: string; statusLabel: string } | null;
  /** the phones handed over, by order line */
  devices: OrderDeviceDto[];
}

export interface AdminUserListItem {
  id: string;
  phone: string;
  fullName: string | null;
  isActive: boolean;
  ordersCount: number;
  totalSpent: number;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminPaymentListItem extends PaymentDto {
  orderId: string;
  orderNumber: string;
  customerPhone: string;
}

export interface PaymentTransactionDto {
  id: string;
  type: string;
  success: boolean;
  requestPayload: unknown;
  responsePayload: unknown;
  errorMessage: string | null;
  createdAt: string;
}

export interface DiscountDto {
  id: string;
  name: string;
  type: DiscountType;
  value: number;
  maxDiscount: number | null;
  minOrderAmount: number | null;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  couponsCount: number;
  createdAt: string;
}

export interface CouponDto {
  id: string;
  code: string;
  discountId: string;
  discountName: string;
  usageLimit: number | null;
  perUserLimit: number;
  usedCount: number;
  isActive: boolean;
  createdAt: string;
}

export interface ShippingMethodAdminDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  calculator: string;
  baseCost: number;
  freeThreshold: number | null;
  etaLabel: string;
  allowedProvinces: string[];
  isActive: boolean;
  sortOrder: number;
}

export interface AuditLogDto {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  admin: { id: string; name: string; phone: string } | null;
}

export interface AdminColorDto extends ColorDto {
  aliases: string[];
  sortOrder: number;
}

export interface AdminStorageDto extends StorageDto {
  sortOrder: number;
}

export interface AdminUserDto {
  id: string;
  phone: string;
  name: string;
  role: AdminRole;
  roleLabel: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

// ─── Storefront (home page payloads) ─────────────────────────────────────────

export interface HeroSlideDto {
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  theme: 'light' | 'dark';
  href: string;
  colorCode: string | null;
  image: string | null;
  price: number | null;
  monthly: number | null;
  product: ProductCardDto | null;
}

export interface StorefrontConfigDto {
  store: StoreSettings;
  commerce: CommerceSettings;
  installments: InstallmentTerms[];
  disabledMethods: PaymentMethod[];
  models: { slug: string; name: string; nameEn: string; series: string }[];
  series: string[];
  /** Search-console codes and the analytics id — public by nature, they end up in the page's HTML. */
  seo: SeoSettings;
  /** The store's own instalment plans with a cheque or a promissory note (figures may still be blank). */
  credit: CreditSettings;
}

/** One column of the home-page comparison table. */
export interface CompareColumnDto {
  slug: string;
  name: string;
  nameEn: string;
  href: string;
  image: string | null;
  price: number | null;
  monthly: number | null;
  ratingAvg: number | null;
  ratingCount: number;
  inStock: boolean;
}

/** One spec row; `values` lines up with `CompareTableDto.products`. */
export interface CompareRowDto {
  key: string;
  values: (string | null)[];
}

export interface CompareTableDto {
  products: CompareColumnDto[];
  rows: CompareRowDto[];
}

/** Minimal per-URL data the sitemap needs: slug, last content change and photos. */
export interface SitemapEntryDto {
  slug: string;
  updatedAt: string;
  /**
   * The product's photos in gallery order (site-relative `/media/…` paths),
   * including the other colours' photos the page only loads on a tap — an
   * image sitemap is how a crawler learns about those.
   */
  images: string[];
}

export interface StorefrontSitemapDto {
  products: SitemapEntryDto[];
  /** published magazine articles, with their cover for the image sitemap */
  articles: { slug: string; updatedAt: string; image: string | null }[];
  /** Newest product change, used as `lastModified` for the listing pages. */
  catalogUpdatedAt: string;
}

export interface StorefrontHomeDto {
  hero: HeroSlideDto[];
  categories: ProductCardDto[];
  featured: ProductCardDto[];
  discounted: ProductCardDto[];
  compare: CompareTableDto;
  stats: {
    products: number;
    variants: number;
    installmentServices: number;
    /** Weighted average of every active product's rating, and the total count. */
    ratingAvg: number | null;
    ratingCount: number;
  };
}

// ─── Instalments with a cheque or promissory note ───────────────────────────

/** What the storefront gets back: a number to quote on the phone, nothing personal. */
export interface CreditRequestCreatedDto {
  /** null when the request was dropped as spam */
  number: number | null;
  /** the same phone already has an open request from the last day */
  duplicate: boolean;
}

export interface CreditRequestDto {
  id: string;
  number: number;
  name: string;
  phone: string;
  city: string | null;
  method: CreditMethod;
  methodLabel: string;
  product: { slug: string; name: string } | null;
  productName: string | null;
  months: number | null;
  note: string | null;
  source: string | null;
  status: CreditRequestStatus;
  statusLabel: string;
  adminNote: string | null;
  handledBy: string | null;
  handledAt: string | null;
  createdAt: string;
}

export interface CreditRequestListDto extends Paginated<CreditRequestDto> {
  counts: Record<CreditRequestStatus, number>;
}

/** The menu badge, and how the open panel notices a request that just came in. */
export interface CreditRequestSummaryDto {
  /** requests still waiting for a call */
  new: number;
  /** the highest request number so far (null before the first one) */
  latestNumber: number | null;
}

// ─── Staff alerts ────────────────────────────────────────────────────────────

export type AlertEvent = 'credit-request' | 'order-paid';

/**
 * How a payment method is connected on this server, for «تنظیمات ← پرداخت».
 * It never carries a key — at most the names of the keys still missing.
 */
export interface PaymentConnectionDto {
  method: PaymentMethod;
  /**
   * LIVE: real money, offered to customers. TEST: the service's test
   * environment (in production offered to the staff only). MOCK: the built-in
   * simulator, development only. INCOMPLETE: set up with something missing, so
   * not offered. OFF: not connected.
   */
  state: 'LIVE' | 'TEST' | 'MOCK' | 'INCOMPLETE' | 'OFF';
  /** where it points (LIVE/TEST), or what is missing (INCOMPLETE) */
  detail: string | null;
}

/** Which alert channels work on this server, for the «هشدارها» settings tab. */
export interface AlertStatusDto {
  sms: {
    driver: 'console' | 'kavenegar' | 'melipayamak';
    /** an event is ready when the driver can send it (Melipayamak: its pattern is set on the server) */
    ready: Record<AlertEvent, boolean>;
    /** the mobiles an alert goes to right now (the owner's when none are listed) */
    recipients: string[];
  };
  bot: {
    /** null: no bot is set up on the server */
    service: 'telegram' | 'bale' | null;
  };
}

/** Result of «پیام آزمایشی» in the settings tab: what each channel answered. */
export interface AlertTestResultDto {
  sms: { phone: string; ok: boolean; error: string | null }[];
  bot: { ok: boolean; error: string | null } | null;
}

// ─── Magazine ────────────────────────────────────────────────────────────────

export interface ArticleSummaryDto {
  slug: string;
  title: string;
  excerpt: string;
  coverUrl: string | null;
  coverAlt: string | null;
  focusKeyword: string | null;
  readingMinutes: number;
  publishedAt: string;
  updatedAt: string;
}

export interface ArticleDto extends ArticleSummaryDto {
  body: string;
  seoTitle: string | null;
}

export interface AdminArticleDto {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  coverUrl: string | null;
  coverAlt: string | null;
  seoTitle: string | null;
  focusKeyword: string | null;
  status: ArticleStatus;
  statusLabel: string;
  readingMinutes: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
