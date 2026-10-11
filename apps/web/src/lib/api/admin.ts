import 'server-only';
import type {
  AdminArticleDto,
  AdminDashboardDto,
  AdminMeDto,
  AdminOrderDto,
  AdminOrderListItem,
  AdminPaymentListItem,
  AdminProductDetailDto,
  AdminProductListItem,
  AdminColorDto,
  AdminStorageDto,
  AdminUserDto,
  AdminUserListItem,
  AdminVariantDto,
  AlertStatusDto,
  PaymentConnectionDto,
  AuditLogDto,
  CouponDto,
  CreditRequestListDto,
  CreditRequestSummaryDto,
  DiscountDto,
  InventoryMovementDto,
  Paginated,
  PaymentTransactionDto,
  ShippingMethodAdminDto,
} from '@iphoneha/shared';
import type {
  AdminCustomerDto,
  ChequeDto,
  ContractDetailDto,
  ContractSummaryDto,
  DeviceUnitDto,
  DueRowDto,
  LedgerSummaryDto,
  PriceChangeDto,
  PricingRowDto,
  SalesReportDto,
} from '@iphoneha/shared';
import type {
  AlertSettings,
  CommerceSettings,
  CreditSettings,
  HomeSettings,
  LedgerSettings,
  PaymentSettings,
  SeoSettings,
  StoreSettings,
} from '@iphoneha/shared';
import { apiGet, apiGetOptional, apiGetOr, type ServerFetchOptions } from './server';

type Query = ServerFetchOptions['searchParams'];

export const getAdminMe = () => apiGetOptional<AdminMeDto>('/admin/auth/me');

export const getDashboard = () => apiGet<AdminDashboardDto>('/admin/dashboard');

export const listAdminProducts = (searchParams: Query) =>
  apiGet<Paginated<AdminProductListItem>>('/admin/products', { searchParams });

export const getAdminProduct = (id: string) => apiGetOptional<AdminProductDetailDto>(`/admin/products/${id}`);

export const listAdminVariants = (searchParams: Query) =>
  apiGet<Paginated<AdminVariantDto>>('/admin/variants', { searchParams });

export const listInventory = (searchParams: Query) =>
  apiGet<Paginated<AdminVariantDto>>('/admin/inventory', { searchParams });

export const getLowStock = () => apiGet<AdminVariantDto[]>('/admin/inventory/low-stock');

export const getMovements = (variantId: string) =>
  apiGet<InventoryMovementDto[]>(`/admin/inventory/${variantId}/movements`);

export const listAdminOrders = (searchParams: Query) =>
  apiGet<Paginated<AdminOrderListItem>>('/admin/orders', { searchParams });

export const getAdminOrder = (id: string) => apiGetOptional<AdminOrderDto>(`/admin/orders/${id}`);

export const listAdminPayments = (searchParams: Query) =>
  apiGet<Paginated<AdminPaymentListItem>>('/admin/payments', { searchParams });

export const getPaymentTransactions = (id: string) =>
  apiGet<PaymentTransactionDto[]>(`/admin/payments/${id}/transactions`);

export const listCustomers = (searchParams: Query) =>
  apiGet<Paginated<AdminUserListItem>>('/admin/users', { searchParams });

export const listAdminUsers = () => apiGet<AdminUserDto[]>('/admin/admins');

export const listAuditLogs = (searchParams: Query) =>
  apiGet<Paginated<AuditLogDto>>('/admin/audit-logs', { searchParams });

export const listDiscounts = (searchParams: Query) =>
  apiGet<Paginated<DiscountDto>>('/admin/discounts', { searchParams });

export const listCoupons = (searchParams: Query) =>
  apiGet<Paginated<CouponDto>>('/admin/coupons', { searchParams });

export const listShippingMethods = () => apiGet<ShippingMethodAdminDto[]>('/admin/shipping-methods');

export const getColors = () => apiGet<AdminColorDto[]>('/admin/colors');

export const getStorages = () => apiGet<AdminStorageDto[]>('/admin/storages');

export const getAdminSettings = () =>
  apiGet<{
    store: StoreSettings;
    home: HomeSettings;
    payments: PaymentSettings;
    commerce: CommerceSettings;
    seo: SeoSettings;
    credit: CreditSettings;
    alerts: AlertSettings;
    ledger: LedgerSettings;
  }>('/admin/settings');

/** Which alert channels the server has, for «تنظیمات ← هشدارها»; null never breaks the settings page. */
export const getAlertStatus = () => apiGetOr<AlertStatusDto | null>('/admin/alerts', null);

/** How each payment method is connected on the server («تنظیمات ← پرداخت»); empty when the API cannot say. */
export const getPaymentConnections = () => apiGetOr<PaymentConnectionDto[]>('/admin/payment-connections', []);

export const listCreditRequests = (searchParams: Query) =>
  apiGet<CreditRequestListDto>('/admin/credit-requests', { searchParams });

/** How many requests wait for a call — the badge in the menu; never breaks the panel. */
export const getCreditRequestSummary = () =>
  apiGetOr<CreditRequestSummaryDto>('/admin/credit-requests/summary', { new: 0, latestNumber: null });

export const listAdminArticles = () => apiGet<AdminArticleDto[]>('/admin/articles');

export const getAdminArticle = (id: string) => apiGetOptional<AdminArticleDto>(`/admin/articles/${id}`);

// ─── Back office: IMEI registry, instalment book, customers, prices, reports ─

export const listDevices = (searchParams: Query) =>
  apiGet<Paginated<DeviceUnitDto>>('/admin/devices', { searchParams });

export const getLedgerSummary = () => apiGet<LedgerSummaryDto>('/admin/ledger/summary');

/** The same, for pages that only mention it (null never breaks them). */
export const getLedgerStatus = () => apiGetOr<LedgerSummaryDto | null>('/admin/ledger/summary', null);

export const listDues = (searchParams: Query) =>
  apiGet<Paginated<DueRowDto>>('/admin/ledger/dues', { searchParams });

export const listCheques = (searchParams: Query) =>
  apiGet<Paginated<ChequeDto>>('/admin/ledger/cheques', { searchParams });

export const listContracts = (searchParams: Query) =>
  apiGet<Paginated<ContractSummaryDto>>('/admin/ledger/contracts', { searchParams });

export const getContract = (id: string) => apiGetOptional<ContractDetailDto>(`/admin/ledger/contracts/${id}`);

export const getCustomer = (id: string) => apiGetOptional<AdminCustomerDto>(`/admin/customers/${id}`);

export const getPricingTable = (searchParams: Query) =>
  apiGet<PricingRowDto[]>('/admin/pricing', { searchParams });

export const getPriceHistory = (variantId?: string) =>
  apiGet<PriceChangeDto[]>('/admin/pricing/history', { searchParams: { variantId } });

export const getSalesReport = (from: string, to: string) =>
  apiGet<SalesReportDto>('/admin/reports/sales', { searchParams: { from, to } });
