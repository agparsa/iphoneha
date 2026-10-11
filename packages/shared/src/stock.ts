import type { StockStatus } from './enums';

export const DEFAULT_LOW_STOCK_THRESHOLD = 2;

export function stockStatusOf(available: number, lowThreshold = DEFAULT_LOW_STOCK_THRESHOLD): StockStatus {
  if (available <= 0) return 'OUT_OF_STOCK';
  if (available <= lowThreshold) return 'LOW_STOCK';
  return 'IN_STOCK';
}

/** «موجود» / «فقط ۲ عدد» / «ناموجود» */
export function stockLabel(available: number, lowThreshold = DEFAULT_LOW_STOCK_THRESHOLD): string {
  const status = stockStatusOf(available, lowThreshold);
  if (status === 'OUT_OF_STOCK') return 'ناموجود';
  if (status === 'LOW_STOCK') return `فقط ${new Intl.NumberFormat('fa-IR').format(available)} عدد`;
  return 'موجود';
}
