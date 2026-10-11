/**
 * All prices are integers in Toman.
 */

/** round((compareAt − price) / compareAt × 100); 0 when there is no real discount. */
export function calcDiscountPercent(price: number, compareAtPrice?: number | null): number {
  if (!compareAtPrice || compareAtPrice <= 0 || compareAtPrice <= price) return 0;
  return Math.round(((compareAtPrice - price) / compareAtPrice) * 100);
}

/** Discount amount for a single unit. */
export function unitDiscount(price: number, compareAtPrice?: number | null): number {
  if (!compareAtPrice || compareAtPrice <= price) return 0;
  return compareAtPrice - price;
}

const faNumber = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 });
const enNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** 139000000 → «۱۳۹٬۰۰۰٬۰۰۰» */
export function formatNumberFa(value: number): string {
  return faNumber.format(Math.round(value));
}

/** 139000000 → «۱۳۹٬۰۰۰٬۰۰۰ تومان» */
export function formatToman(value: number): string {
  return `${formatNumberFa(value)} تومان`;
}

const faDecimal = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1, minimumFractionDigits: 0 });

/**
 * 4.8 → «۴٫۸» — for ratings and averages, where `formatNumberFa` would round
 * the value away to a whole number.
 */
export function formatDecimalFa(value: number): string {
  return faDecimal.format(value);
}

const faPercent = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2, minimumFractionDigits: 0 });

/** 3.5 → «۳٫۵», 4.25 → «۴٫۲۵» — a fee percentage exactly as set (formatNumberFa would round 3.5 to ۴) */
export function formatPercentFa(value: number): string {
  return faPercent.format(value);
}

/** 139000000 → «139,000,000» (admin tables, exports) */
export function formatNumberEn(value: number): string {
  return enNumber.format(Math.round(value));
}

/** Rounds an amount to the nearest 100,000 Toman (installment estimates). */
export function roundToHundredThousand(value: number): number {
  return Math.round(value / 100_000) * 100_000;
}

/** Iranian gateways and schema.org expect Rial (ISO 4217 IRR). */
export function tomanToRial(value: number): number {
  return value * 10;
}

export interface CartLineInput {
  price: number;
  compareAtPrice?: number | null;
  quantity: number;
}

export interface CartTotals {
  itemsCount: number;
  /** Σ (compareAt ?? price) × qty */
  subtotal: number;
  /** Σ (compareAt − price) × qty */
  itemsDiscount: number;
  /** Σ price × qty */
  itemsTotal: number;
}

export function calcCartTotals(lines: CartLineInput[]): CartTotals {
  let itemsCount = 0;
  let subtotal = 0;
  let itemsDiscount = 0;
  let itemsTotal = 0;
  for (const line of lines) {
    const listPrice =
      line.compareAtPrice && line.compareAtPrice > line.price ? line.compareAtPrice : line.price;
    itemsCount += line.quantity;
    subtotal += listPrice * line.quantity;
    itemsDiscount += (listPrice - line.price) * line.quantity;
    itemsTotal += line.price * line.quantity;
  }
  return { itemsCount, subtotal, itemsDiscount, itemsTotal };
}
