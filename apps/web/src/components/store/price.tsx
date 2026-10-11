import { formatNumberFa } from '@iphoneha/shared';
import { AnimatedNumber } from '@/components/motion/animated-number';
import { cn } from '@/lib/utils';

export function Price({
  value,
  compareAt,
  size = 'md',
  className,
  animate,
}: {
  value: number;
  compareAt?: number | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** count to a new value instead of jumping (the product page) */
  animate?: boolean;
}) {
  const hasDiscount = Boolean(compareAt && compareAt > value);
  return (
    <div className={cn('flex flex-col', className)}>
      {hasDiscount ? (
        <span
          className={cn(
            'leading-5 text-muted-faint line-through tabular',
            size === 'lg' ? 'text-[13px]' : 'text-[11px]',
          )}
        >
          {formatNumberFa(compareAt!)}
        </span>
      ) : null}
      <span
        className={cn(
          'font-semibold text-ink tabular',
          size === 'sm' && 'text-sm',
          size === 'md' && 'text-[17px]',
          size === 'lg' && 'text-[26px] leading-tight',
        )}
      >
        {animate ? <AnimatedNumber value={value} /> : formatNumberFa(value)}
        <span className="ms-1 text-[11px] font-normal text-muted">تومان</span>
      </span>
    </div>
  );
}

export function DiscountBadge({ percent, className }: { percent: number; className?: string }) {
  if (percent <= 0) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill bg-danger px-2 py-0.5 text-[11px] font-semibold text-white tabular',
        className,
      )}
    >
      {formatNumberFa(percent)}٪
    </span>
  );
}

export function MonthlyHint({ monthly, className }: { monthly: number | null; className?: string }) {
  if (!monthly) return null;
  return (
    <p className={cn('truncate text-[11px] text-muted', className)}>
      قسطی از ماهانه <span className="font-medium text-ink-muted tabular">{formatNumberFa(monthly)}</span>
    </p>
  );
}
