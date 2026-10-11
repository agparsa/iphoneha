import type { StockStatus } from '@iphoneha/shared';
import { stockLabel } from '@iphoneha/shared';
import { cn } from '@/lib/utils';

const TONE: Record<StockStatus, string> = {
  IN_STOCK: 'text-success',
  LOW_STOCK: 'text-warning',
  OUT_OF_STOCK: 'text-muted-soft',
};

const DOT: Record<StockStatus, string> = {
  IN_STOCK: 'bg-success',
  LOW_STOCK: 'bg-warning',
  OUT_OF_STOCK: 'bg-muted-faint',
};

export function StockPill({
  status,
  available,
  className,
}: {
  status: StockStatus;
  available: number;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-medium', TONE[status], className)}>
      <span className={cn('size-1.5 rounded-full', DOT[status])} aria-hidden />
      {stockLabel(available)}
    </span>
  );
}
