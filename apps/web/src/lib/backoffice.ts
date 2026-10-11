import type { ChequeStatus, ContractStatus, DeviceUnitStatus, OrderStatus } from '@iphoneha/shared';

/** A download link to an Excel export of the API (same origin, so the admin's cookie goes along). */
export function exportHref(kind: string, params: Record<string, string | null | undefined> = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const query = search.toString();
  return `/api/admin/exports/${kind}${query ? `?${query}` : ''}`;
}

type Tone = 'neutral' | 'success' | 'danger' | 'warning' | 'info' | 'outline' | 'ink';

export const CONTRACT_TONE: Record<ContractStatus, Tone> = {
  ACTIVE: 'info',
  COMPLETED: 'success',
  DEFAULTED: 'danger',
  CANCELLED: 'outline',
};

export const CHEQUE_TONE: Record<ChequeStatus, Tone> = {
  IN_HAND: 'neutral',
  DEPOSITED: 'info',
  CLEARED: 'success',
  BOUNCED: 'danger',
  RETURNED: 'outline',
};

export const DEVICE_TONE: Record<DeviceUnitStatus, Tone> = {
  IN_STOCK: 'success',
  SOLD: 'neutral',
  RETURNED: 'warning',
  DEFECTIVE: 'danger',
};

export function orderTone(status: OrderStatus): Tone {
  if (status === 'DELIVERED') return 'success';
  if (status === 'CANCELLED' || status === 'REFUNDED') return 'danger';
  return 'neutral';
}

/** A row of an instalment: overdue red, paid green, forgiven grey. */
export function installmentTone(status: string, overdue: boolean): Tone {
  if (overdue) return 'danger';
  if (status === 'PAID') return 'success';
  if (status === 'WAIVED') return 'outline';
  return 'neutral';
}

/** «۳ روز تأخیر», «امروز», «۵ روز دیگر» for a due date. */
export function dueLabel(daysLate: number, format: (n: number) => string): string {
  if (daysLate > 0) return `${format(daysLate)} روز تأخیر`;
  if (daysLate === 0) return 'امروز';
  return `${format(-daysLate)} روز دیگر`;
}
