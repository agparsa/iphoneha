'use client';

import { Minus, Plus } from 'lucide-react';
import { formatNumberFa } from '@iphoneha/shared';
import { cn } from '@/lib/utils';

export function QuantityStepper({
  value,
  min = 1,
  max,
  disabled,
  onChange,
  className,
  size = 'md',
}: {
  value: number;
  min?: number;
  max: number;
  disabled?: boolean;
  onChange: (next: number) => void;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const btn =
    'grid place-items-center rounded-full text-ink transition-colors hover:bg-surface disabled:opacity-35 disabled:hover:bg-transparent';
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-pill border border-line bg-canvas',
        size === 'md' ? 'p-1' : 'p-0.5',
        className,
      )}
    >
      <button
        type="button"
        className={cn(btn, size === 'md' ? 'size-9' : 'size-7')}
        onClick={() => onChange(value + 1)}
        disabled={disabled || value >= max}
        aria-label="افزایش تعداد"
      >
        <Plus className={size === 'md' ? 'size-4' : 'size-3.5'} />
      </button>
      <span
        className={cn(
          'min-w-8 text-center font-medium text-ink tabular',
          size === 'md' ? 'text-sm' : 'text-xs',
        )}
      >
        {formatNumberFa(value)}
      </span>
      <button
        type="button"
        className={cn(btn, size === 'md' ? 'size-9' : 'size-7')}
        onClick={() => onChange(value - 1)}
        disabled={disabled || value <= min}
        aria-label="کاهش تعداد"
      >
        <Minus className={size === 'md' ? 'size-4' : 'size-3.5'} />
      </button>
    </div>
  );
}
