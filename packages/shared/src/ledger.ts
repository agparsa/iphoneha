import { addJalaliMonths, isoToJalali } from './jalali';

export interface ScheduleRow {
  dueDate: string;
  amount: number;
}

/**
 * A contract's schedule the way the store quotes it: the fee is flat and
 * monthly on what is left after the down payment (4% a month for 6 months
 * adds 24%), split into equal monthly instalments rounded to `rounding`
 * toman, the last one taking what the rounding left over. Each due date
 * falls on the same Jalali day of the month as the first (the 31st becomes
 * the last day of a shorter month).
 */
/** Instalments are rounded to this many toman; the last one takes what is left. */
export const CREDIT_ROUNDING = 10_000;

/** Down payments are quoted in whole hundred-thousands of toman, never below the percentage asked. */
export const DOWN_PAYMENT_ROUNDING = 100_000;

/** The store's fee: flat, monthly, on what is left after the down payment — whole toman. */
export function creditFee(financed: number, monthlyFeePercent: number, months: number): number {
  // percent × months first, in hundredths, so 4.5% × 7 does not drift by a toman
  const hundredths = Math.round(Math.max(0, monthlyFeePercent) * 100) * Math.max(0, Math.floor(months));
  return Math.round((Math.max(0, Math.round(financed)) * hundredths) / 10_000);
}

/**
 * A total split into `months` instalments, each rounded to `rounding` toman
 * and the last one taking what the rounding left over — so the instalments
 * always add up to the total exactly.
 */
export function splitInstallments(total: number, months: number, rounding = CREDIT_ROUNDING): number[] {
  const count = Math.max(1, Math.min(60, Math.floor(months)));
  const sum = Math.max(0, Math.round(total));
  let each = rounding > 0 ? Math.round(sum / count / rounding) * rounding : Math.round(sum / count);
  // a rounding that would leave an instalment at zero or below falls back to plain division
  if (each <= 0 || (count > 1 && sum - each * (count - 1) <= 0)) each = Math.floor(sum / count);
  return Array.from({ length: count }, (_, i) => (i < count - 1 ? each : sum - each * (count - 1)));
}

/** The down payment for a price and a percentage: rounded up to whole hundred-thousands, at most the price. */
export function creditDownPayment(price: number, percent: number): number {
  const exact = (Math.max(0, price) * Math.max(0, percent)) / 100;
  return Math.min(
    Math.max(0, Math.round(price)),
    Math.ceil(exact / DOWN_PAYMENT_ROUNDING) * DOWN_PAYMENT_ROUNDING,
  );
}

/**
 * A contract's schedule the way the store quotes it: the fee is flat and
 * monthly on what is left after the down payment (4% a month for 6 months
 * adds 24%), split into equal monthly instalments rounded to `rounding`
 * toman, the last one taking what the rounding left over. Each due date
 * falls on the same Jalali day of the month as the first (the 31st becomes
 * the last day of a shorter month). The storefront calculator uses the same
 * fee and split, so a quote and the contract written from it agree.
 */
export function buildInstallmentSchedule(input: {
  financed: number;
  months: number;
  monthlyFeePercent: number;
  firstDueDate: string;
  rounding?: number;
}): ScheduleRow[] {
  const months = Math.max(1, Math.min(60, Math.floor(input.months)));
  const financed = Math.max(0, Math.round(input.financed));
  const total = financed + creditFee(financed, input.monthlyFeePercent, months);
  const amounts = splitInstallments(total, months, input.rounding ?? CREDIT_ROUNDING);
  const day = isoToJalali(input.firstDueDate).jd;
  return amounts.map((amount, i) => ({ dueDate: addJalaliMonths(input.firstDueDate, i, day), amount }));
}

/** The markup a schedule adds over what was financed. */
export function scheduleMarkup(rows: ScheduleRow[], financed: number): number {
  return rows.reduce((sum, row) => sum + row.amount, 0) - financed;
}
