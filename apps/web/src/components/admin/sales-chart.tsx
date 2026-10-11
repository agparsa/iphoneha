'use client';

import { useMemo, useState } from 'react';
import { formatNumberFa, formatToman } from '@iphoneha/shared';
import { formatDateFa } from '@/lib/utils';
import { cn } from '@/lib/utils';

/** Lightweight bar chart — no chart library, just divs, so the bundle stays small. */
export function SalesChart({
  data,
  label = 'نمودار فروش ۳۰ روز اخیر — هر ستون یک روز',
}: {
  data: { date: string; revenue: number; orders: number }[];
  label?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = useMemo(() => Math.max(1, ...data.map((d) => d.revenue)), [data]);

  if (data.length === 0) return <p className="text-[13px] text-muted">داده‌ای برای نمایش نیست.</p>;
  const hasRevenue = data.some((day) => day.revenue > 0);

  const current = active === null ? null : data[active];

  return (
    <div>
      {/* a group (not role="img") so the focusable bars below stay valid for
          screen readers and keyboard users */}
      <div
        className="flex h-40 items-end justify-center gap-1 border-b border-line"
        role="group"
        aria-label={label}
      >
        {data.map((day, index) => {
          const height = Math.max(2, Math.round((day.revenue / max) * 100));
          return (
            <button
              key={day.date}
              type="button"
              onMouseEnter={() => setActive(index)}
              onFocus={() => setActive(index)}
              onMouseLeave={() => setActive(null)}
              onBlur={() => setActive(null)}
              className="group flex h-full max-w-10 flex-1 items-end justify-center px-px"
              aria-label={`${formatDateFa(day.date)}: ${formatToman(day.revenue)}`}
            >
              <span
                className={cn(
                  'w-full rounded-t-[3px] transition-colors',
                  day.revenue === 0
                    ? 'bg-surface-3'
                    : active === index
                      ? 'bg-ink'
                      : 'bg-ink/25 group-hover:bg-ink/60',
                )}
                style={{ height: `${height}%` }}
              />
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
        <span>{formatDateFa(data[0]!.date)}</span>
        {current ? (
          <span className="text-ink">
            {formatDateFa(current.date)} — {formatToman(current.revenue)} ({formatNumberFa(current.orders)}{' '}
            سفارش)
          </span>
        ) : (
          <span>{hasRevenue ? 'فروش روزانه (تومان)' : 'در این بازه فروشی ثبت نشده است'}</span>
        )}
        <span>{formatDateFa(data[data.length - 1]!.date)}</span>
      </div>
    </div>
  );
}
