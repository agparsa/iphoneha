import {
  isOfflinePaymentMethod,
  type InstallmentMethod,
  type OrderPaymentMethod,
  type PaymentMethod,
} from './enums';
import { OFFLINE_PAYMENT_METHOD_LABELS } from './labels';
import type { CreditPlan } from './schemas/settings';
import { creditDownPayment, creditFee, splitInstallments } from './ledger';
import { roundToHundredThousand } from './money';

export interface PaymentMethodInfo {
  method: PaymentMethod;
  kind: 'ONLINE' | 'INSTALLMENT';
  name: string;
  nameEn: string;
  /** Brand accent colour */
  color: string;
  /** Square logo under the web app's /public folder (null → text tile) */
  logo: string | null;
  /** Promotional round badge under /public (optional) */
  badge: string | null;
  tagline: string;
}

/** The name of any way an order was paid: a checkout method or one the staff recorded. */
export function paymentMethodName(method: OrderPaymentMethod): string {
  return isOfflinePaymentMethod(method)
    ? OFFLINE_PAYMENT_METHOD_LABELS[method]
    : PAYMENT_METHOD_INFO[method].name;
}

export const PAYMENT_METHOD_INFO: Record<PaymentMethod, PaymentMethodInfo> = {
  ONLINE: {
    method: 'ONLINE',
    kind: 'ONLINE',
    name: 'پرداخت آنلاین',
    nameEn: 'Online payment',
    color: '#08090a',
    logo: null,
    badge: null,
    tagline: 'همه کارت‌های عضو شتاب',
  },
  SNAPPAY: {
    method: 'SNAPPAY',
    kind: 'INSTALLMENT',
    name: 'اسنپ‌پی',
    nameEn: 'SnapPay',
    color: '#1e8ef0',
    logo: '/payments/snappay.webp',
    badge: '/payments/snappay-badge.webp',
    tagline: 'اعتبار آنی',
  },
  TARA: {
    method: 'TARA',
    kind: 'INSTALLMENT',
    name: 'تارا',
    nameEn: 'Tara',
    color: '#d61f7a',
    logo: '/payments/tara.webp',
    badge: '/payments/tara-badge.webp',
    tagline: 'کارت اعتباری تارا',
  },
  DIGIPAY: {
    method: 'DIGIPAY',
    kind: 'INSTALLMENT',
    name: 'دیجی‌پی',
    nameEn: 'Digipay',
    color: '#2b6fe6',
    logo: '/payments/digipay.webp',
    badge: '/payments/digipay-badge.webp',
    tagline: 'کیف پول اعتباری',
  },
  NESIBA: {
    method: 'NESIBA',
    kind: 'INSTALLMENT',
    name: 'نسیبا',
    nameEn: 'Nesiba',
    color: '#0f766e',
    logo: null,
    badge: null,
    tagline: 'خرید اعتباری اقساطی',
  },
  BOJET: {
    method: 'BOJET',
    kind: 'INSTALLMENT',
    name: 'باجت',
    nameEn: 'Bajet',
    color: '#5fa32a',
    logo: '/payments/bojet.webp',
    badge: '/payments/bojet-badge.webp',
    tagline: 'اعتبار خرید',
  },
  AZKIVAM: {
    method: 'AZKIVAM',
    kind: 'INSTALLMENT',
    name: 'ازکی‌وام',
    nameEn: 'AzkiVam',
    color: '#1a3fc4',
    logo: '/payments/azkivam.webp',
    badge: '/payments/azkivam-badge.webp',
    tagline: 'وام خرید کالا',
  },
};

/**
 * Commercial terms shown to customers. These are editable defaults
 * (Settings → payments.installmentTerms) and must be confirmed with each provider.
 */
export interface InstallmentTerms {
  method: InstallmentMethod;
  /** Minimum down payment in percent (0 = none) */
  minDownPaymentPercent: number;
  maxInstallments: number;
  /** Annual fee rate (0.23 = 23%) */
  annualFeeRate: number;
  /** Credit ceiling in Toman */
  maxCredit: number;
  approvalTime: string;
  documents: string;
  description: string;
}

export const DEFAULT_INSTALLMENT_TERMS: Record<InstallmentMethod, InstallmentTerms> = {
  SNAPPAY: {
    method: 'SNAPPAY',
    minDownPaymentPercent: 25,
    maxInstallments: 4,
    annualFeeRate: 0,
    maxCredit: 200_000_000,
    approvalTime: 'کمتر از ۱۰ دقیقه',
    documents: 'کارت ملی و احراز هویت آنلاین',
    description: 'خرید با اعتبار اسنپ‌پی و تسویه در چهار قسط بدون کارمزد.',
  },
  TARA: {
    method: 'TARA',
    minDownPaymentPercent: 0,
    maxInstallments: 12,
    annualFeeRate: 0.18,
    maxCredit: 250_000_000,
    approvalTime: 'یک روز کاری',
    documents: 'کارت ملی و فیش حقوقی',
    description: 'خرید با کارت اعتباری تارا؛ بدون پیش‌پرداخت و با سقف اعتبار بالا.',
  },
  DIGIPAY: {
    method: 'DIGIPAY',
    minDownPaymentPercent: 25,
    maxInstallments: 12,
    annualFeeRate: 0.23,
    maxCredit: 150_000_000,
    approvalTime: 'کمتر از ۳۰ دقیقه',
    documents: 'کارت ملی و شماره شبا',
    description: 'خرید اقساطی با دیجی‌پی و بازپرداخت ماهانه منظم.',
  },
  NESIBA: {
    method: 'NESIBA',
    minDownPaymentPercent: 20,
    maxInstallments: 9,
    annualFeeRate: 0.21,
    maxCredit: 120_000_000,
    approvalTime: 'کمتر از ۳۰ دقیقه',
    documents: 'کارت ملی و احراز هویت آنلاین',
    description: 'خرید اعتباری با نسیبا و بازپرداخت در اقساط ماهانه.',
  },
  BOJET: {
    method: 'BOJET',
    minDownPaymentPercent: 30,
    maxInstallments: 6,
    annualFeeRate: 0.2,
    maxCredit: 100_000_000,
    approvalTime: 'کمتر از ۲۰ دقیقه',
    documents: 'کارت ملی و احراز هویت آنلاین',
    description: 'خرید با باجت؛ احراز هویت کاملاً آنلاین و تأیید سریع.',
  },
  AZKIVAM: {
    method: 'AZKIVAM',
    minDownPaymentPercent: 10,
    maxInstallments: 36,
    annualFeeRate: 0.28,
    maxCredit: 200_000_000,
    approvalTime: 'دو تا سه روز کاری',
    documents: 'کارت ملی، فیش حقوقی و ضامن',
    description: 'وام خرید کالا با بازپرداخت بلندمدت تا سه سال.',
  },
};

export const INSTALLMENT_MONTH_OPTIONS = [3, 4, 6, 9, 12, 18, 24, 36] as const;

export interface InstallmentEstimate {
  downPayment: number;
  financed: number;
  months: number;
  monthly: number;
  totalRepayment: number;
  totalCost: number;
}

/**
 * Flat-fee estimate used by the storefront calculator:
 * repayment = financed × (1 + annualRate × months / 12)
 */
export function estimateInstallment(
  price: number,
  terms: Pick<InstallmentTerms, 'annualFeeRate' | 'maxInstallments' | 'minDownPaymentPercent'>,
  options: { downPaymentPercent?: number; months?: number } = {},
): InstallmentEstimate {
  const downPercent = Math.max(
    terms.minDownPaymentPercent,
    options.downPaymentPercent ?? terms.minDownPaymentPercent,
  );
  const months = Math.max(1, Math.min(options.months ?? terms.maxInstallments, terms.maxInstallments));
  const downPayment = Math.round((price * downPercent) / 100);
  const financed = price - downPayment;
  const totalRepayment = Math.round(financed * (1 + (terms.annualFeeRate * months) / 12));
  return {
    downPayment,
    financed,
    months,
    monthly: roundToHundredThousand(totalRepayment / months),
    totalRepayment,
    totalCost: downPayment + totalRepayment,
  };
}

// ─── the store's own plan: Sayad cheque or promissory note ───────────────────

/** A plan with every figure the calculator needs. */
export type ReadyCreditPlan = CreditPlan & {
  minDownPaymentPercent: number;
  maxMonths: number;
  monthlyFeePercent: number;
};

/** Offered, and the owner has filled in the down payment, the months and the fee. */
export function creditPlanReady(plan: CreditPlan | null | undefined): plan is ReadyCreditPlan {
  return (
    Boolean(plan?.enabled) &&
    plan!.minDownPaymentPercent !== null &&
    plan!.maxMonths !== null &&
    plan!.monthlyFeePercent !== null
  );
}

/** Month choices for a plan: the usual steps up to its maximum, and the maximum itself. */
export function creditMonthOptions(maxMonths: number): number[] {
  const options: number[] = INSTALLMENT_MONTH_OPTIONS.filter((months) => months <= maxMonths);
  if (!options.includes(maxMonths)) options.push(maxMonths);
  return options;
}

export interface CreditPlanEstimate extends InstallmentEstimate {
  downPaymentPercent: number;
  /** the down payment was raised so the rest fits under the plan's ceiling */
  raisedForCeiling: boolean;
  /** the store's fee in toman: what the instalments add over the amount financed */
  fee: number;
  /** every instalment in order; all but the last equal `monthly`, and they add up to `totalRepayment` */
  installments: number[];
  /** the last instalment, which takes what rounding the others left over */
  lastInstallment: number;
}

/**
 * Estimate for the store's plan, figured exactly as the contract is written
 * (lib ledger): the down payment rounded up to whole hundred-thousands of
 * toman; the fee flat and monthly on what is left (4% a month for 6 months
 * adds 24% of it); the instalments equal, rounded to ten thousand toman, the
 * last one taking the remainder — so `monthly × (months − 1) + lastInstallment`
 * is exactly the total. A ceiling on the financed amount raises the down
 * payment instead of refusing the purchase.
 */
export function estimateCreditPlan(
  price: number,
  plan: ReadyCreditPlan,
  options: { downPaymentPercent?: number; months?: number } = {},
): CreditPlanEstimate {
  const amount = Math.max(0, Math.round(price));
  let downPaymentPercent = Math.min(
    90,
    Math.max(plan.minDownPaymentPercent, options.downPaymentPercent ?? plan.minDownPaymentPercent),
  );
  let raisedForCeiling = false;
  if (plan.maxFinanced !== null && amount > 0) {
    const needed = Math.ceil(((amount - plan.maxFinanced) / amount) * 100);
    if (needed > downPaymentPercent) {
      downPaymentPercent = Math.min(100, needed);
      raisedForCeiling = true;
    }
  }
  const months = Math.max(1, Math.min(options.months ?? plan.maxMonths, plan.maxMonths));
  let downPayment = creditDownPayment(amount, downPaymentPercent);
  // rounding the down payment up can only lower what is financed — but never above the ceiling
  if (plan.maxFinanced !== null && amount - downPayment > plan.maxFinanced) {
    downPayment = amount - plan.maxFinanced;
  }
  const financed = amount - downPayment;
  const fee = creditFee(financed, plan.monthlyFeePercent, months);
  const totalRepayment = financed + fee;
  const installments = financed > 0 ? splitInstallments(totalRepayment, months) : Array(months).fill(0);
  return {
    downPayment,
    financed,
    months,
    monthly: installments[0] ?? 0,
    totalRepayment,
    totalCost: downPayment + totalRepayment,
    downPaymentPercent,
    raisedForCeiling,
    fee,
    installments,
    lastInstallment: installments[installments.length - 1] ?? 0,
  };
}
