/**
 * What the back office reads: the IMEI registry, the instalment ledger,
 * customer profiles, the pricing table and the sales report.
 * Money in Toman; calendar days as ISO dates («2026-09-26»).
 */
import type {
  ChequeStatus,
  ContractStatus,
  CreditMethod,
  CreditRequestStatus,
  DeviceUnitStatus,
  InstallmentStatus,
  ManualPaymentChannel,
  OrderPaymentMethod,
  OrderSource,
  SafteStatus,
} from './enums';
import type { AddressDto, AdminOrderListItem } from './types';

// ─── Devices ─────────────────────────────────────────────────────────────────

export interface DeviceUnitDto {
  id: string;
  variantId: string;
  sku: string;
  productName: string;
  /** «۲۵۶ گیگابایت — مشکی» */
  variantTitle: string;
  imei: string;
  imei2: string | null;
  serialNumber: string | null;
  status: DeviceUnitStatus;
  statusLabel: string;
  costPrice: number | null;
  supplier: string | null;
  note: string | null;
  receivedAt: string;
  receivedByName: string | null;
  soldAt: string | null;
  order: { id: string; orderNumber: string; customerName: string; customerPhone: string } | null;
}

/** A phone handed over on an order line (shown on the order and the invoice). */
export interface OrderDeviceDto {
  id: string;
  orderItemId: string;
  imei: string;
  imei2: string | null;
  serialNumber: string | null;
}

export interface DeviceReceiveResultDto {
  created: number;
  stock: number;
  available: number;
  /** units of this variant on the shelf with an IMEI on record */
  unitsInStock: number;
}

/** Units per variant against the stock count, for the inventory page. */
export interface DeviceCoverageDto {
  variantId: string;
  unitsInStock: number;
}

// ─── The instalment ledger ───────────────────────────────────────────────────

export interface ChequeDto {
  id: string;
  contractId: string;
  contractNumber: number;
  customerName: string;
  customerPhone: string;
  installmentId: string | null;
  installmentIndex: number | null;
  sayadId: string;
  serial: string | null;
  bankName: string;
  branch: string | null;
  drawerName: string;
  amount: number;
  dueDate: string;
  status: ChequeStatus;
  statusLabel: string;
  sayadConfirmed: boolean;
  /** days past the due date while still with the store or at the bank (0 = not late) */
  daysLate: number;
  depositedAt: string | null;
  clearedAt: string | null;
  bouncedAt: string | null;
  returnedAt: string | null;
  note: string | null;
}

export interface InstallmentDto {
  id: string;
  index: number;
  dueDate: string;
  amount: number;
  paidAmount: number;
  remaining: number;
  status: InstallmentStatus;
  /** pending and past its due date */
  overdue: boolean;
  daysLate: number;
  statusLabel: string;
  paidAt: string | null;
  remindedAt: string | null;
  note: string | null;
  cheque: { id: string; status: ChequeStatus; statusLabel: string; bankName: string; sayadId: string } | null;
}

export interface PromissoryNoteDto {
  id: string;
  serial: string;
  amount: number;
  electronic: boolean;
  status: SafteStatus;
  statusLabel: string;
  dueDate: string | null;
  returnedAt: string | null;
  note: string | null;
}

export interface InstallmentPaymentDto {
  id: string;
  installmentId: string | null;
  installmentIndex: number | null;
  chequeId: string | null;
  amount: number;
  channel: ManualPaymentChannel;
  channelLabel: string;
  reference: string | null;
  paidAt: string;
  note: string | null;
  recordedByName: string | null;
  voidedAt: string | null;
}

export interface ContractSummaryDto {
  id: string;
  number: number;
  method: CreditMethod;
  methodLabel: string;
  status: ContractStatus;
  statusLabel: string;
  customerName: string;
  customerPhone: string;
  itemDescription: string;
  totalPayable: number;
  /** received so far, down payment included */
  paid: number;
  remaining: number;
  overdueAmount: number;
  overdueCount: number;
  nextDue: { dueDate: string; amount: number } | null;
  contractDate: string;
  createdAt: string;
}

export interface ContractDetailDto extends ContractSummaryDto {
  userId: string | null;
  orderId: string | null;
  orderNumber: string | null;
  creditRequestId: string | null;
  creditRequestNumber: number | null;
  nationalId: string | null;
  customerAddress: string | null;
  guarantorName: string | null;
  guarantorPhone: string | null;
  guarantorNationalId: string | null;
  cashPrice: number;
  downPayment: number;
  financed: number;
  markup: number;
  months: number;
  monthlyFeePercent: number | null;
  note: string | null;
  createdByName: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  installments: InstallmentDto[];
  cheques: ChequeDto[];
  saftes: PromissoryNoteDto[];
  payments: InstallmentPaymentDto[];
  devices: { imei: string; imei2: string | null; serialNumber: string | null; title: string }[];
  /** the store's contract clauses («تنظیمات ← دفتر اقساط»), printed under the contract */
  terms: string;
}

/** An open instalment on the «سررسیدها» list. */
export interface DueRowDto {
  installmentId: string;
  contractId: string;
  contractNumber: number;
  method: CreditMethod;
  customerName: string;
  customerPhone: string;
  index: number;
  months: number;
  dueDate: string;
  amount: number;
  remaining: number;
  /** positive: days overdue · 0: due today · negative: days left */
  daysLate: number;
  cheque: { id: string; status: ChequeStatus; statusLabel: string; bankName: string } | null;
  remindedAt: string | null;
}

export interface LedgerSummaryDto {
  activeContracts: number;
  /** everything still to be received on active and defaulted contracts */
  outstanding: number;
  overdue: { count: number; amount: number };
  dueNext7Days: { count: number; amount: number };
  dueNext30Days: { count: number; amount: number };
  /** cheques still with the store, due within 7 days (or already due) */
  chequesToDeposit: { count: number; amount: number };
  bouncedCheques: { count: number; amount: number };
  /** reminder SMS can go out (pattern set on the server) */
  remindersReady: boolean;
}

// ─── Customers ───────────────────────────────────────────────────────────────

export interface CustomerNoteDto {
  id: string;
  body: string;
  authorName: string | null;
  createdAt: string;
}

export interface AdminCustomerDto {
  id: string;
  phone: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  stats: {
    ordersCount: number;
    paidOrders: number;
    totalSpent: number;
    lastOrderAt: string | null;
    /** still to be received on the store's instalments */
    ledgerOutstanding: number;
    ledgerOverdue: number;
  };
  orders: AdminOrderListItem[];
  contracts: ContractSummaryDto[];
  creditRequests: {
    id: string;
    number: number;
    method: CreditMethod;
    status: CreditRequestStatus;
    statusLabel: string;
    productName: string | null;
    createdAt: string;
  }[];
  addresses: AddressDto[];
  notes: CustomerNoteDto[];
}

// ─── Pricing ─────────────────────────────────────────────────────────────────

export interface PricingRowDto {
  variantId: string;
  productId: string;
  productName: string;
  productSlug: string;
  colorName: string;
  colorHex: string;
  storageLabel: string;
  capacityGb: number;
  sku: string;
  price: number;
  compareAtPrice: number | null;
  discountPercent: number;
  active: boolean;
  productActive: boolean;
  stock: number;
  available: number;
  updatedAt: string;
  lastChange: { at: string; oldPrice: number; adminName: string | null } | null;
}

export interface PriceChangeDto {
  id: string;
  variantId: string;
  sku: string;
  title: string;
  oldPrice: number;
  newPrice: number;
  oldCompareAt: number | null;
  newCompareAt: number | null;
  batchId: string | null;
  adminName: string | null;
  createdAt: string;
}

export interface BulkPricePreviewDto {
  applied: boolean;
  batchId: string | null;
  rows: {
    variantId: string;
    sku: string;
    title: string;
    oldValue: number | null;
    newValue: number | null;
    /** the new sale price reaches the «before discount» one, which is then cleared */
    compareAtCleared: boolean;
  }[];
  /** rows left alone: a «before discount» price below the sale price, or a price that would be zero */
  skipped: { variantId: string; sku: string; reason: string }[];
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export interface ReportRow {
  key: string;
  label: string;
  orders: number;
  units: number;
  revenue: number;
}

export interface SalesReportDto {
  from: string;
  to: string;
  /** days in the range, both ends included */
  days: number;
  totals: {
    revenue: number;
    orders: number;
    units: number;
    averageOrderValue: number;
    discount: number;
    shipping: number;
    cancelledOrders: number;
    refundedAmount: number;
    /** cost of the sold phones whose purchase price is on record */
    costOfGoods: number | null;
    grossProfit: number | null;
    /** how many sold units have a purchase price on record */
    costCoverage: { unitsWithCost: number; units: number };
  };
  byDay: { date: string; revenue: number; orders: number }[];
  /** the same, by Jalali month (for ranges longer than a few months) */
  byMonth: { key: string; label: string; revenue: number; orders: number }[];
  byModel: ReportRow[];
  byStorage: ReportRow[];
  byColor: ReportRow[];
  byPaymentMethod: (ReportRow & { method: OrderPaymentMethod })[];
  bySource: (ReportRow & { source: OrderSource })[];
  byProvince: ReportRow[];
  topVariants: ReportRow[];
  ledger: {
    /** money received on contracts in the range, down payments included */
    collected: number;
    newContracts: number;
    financed: number;
    markup: number;
  };
}

/** «تغییر وضعیت گروهی»: which orders moved and why the others did not. */
export interface BulkOrderStatusResultDto {
  updated: string[];
  failed: { orderId: string; orderNumber: string | null; message: string }[];
}

/** The steps a bulk price change may be rounded to, in Toman (0 = not rounded). Here, not beside the zod schema, so the panel's table does not pull the whole validation library into the browser. */
export const PRICE_ROUNDINGS = [0, 1_000, 10_000, 100_000, 1_000_000] as const;
