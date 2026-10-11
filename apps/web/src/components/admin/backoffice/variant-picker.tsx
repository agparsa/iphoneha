'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatNumberFa, formatToman, type PricingRowDto } from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/utils';

/** Every colour and capacity with its price and stock (the price table's rows), cached for the page's life. */
export function useVariants() {
  return useQuery({
    queryKey: ['admin', 'pricing'],
    queryFn: () => api.get<PricingRowDto[]>('/admin/pricing'),
    staleTime: 60_000,
  });
}

export function variantLabel(row: Pick<PricingRowDto, 'productName' | 'storageLabel' | 'colorName'>): string {
  return `${row.productName} ${row.storageLabel} ${row.colorName}`;
}

/**
 * A colour × capacity chosen from a list grouped by model, with its price and
 * what is on the shelf. `pricedOnly` hides combinations without a price (for
 * a sale); receiving stock can use any of them.
 */
export function VariantPicker({
  value,
  onChange,
  id,
  pricedOnly = false,
  className,
  invalid,
}: {
  value: string | null;
  onChange: (row: PricingRowDto | null) => void;
  id?: string;
  pricedOnly?: boolean;
  className?: string;
  invalid?: boolean;
}) {
  const { data, isLoading, error } = useVariants();
  const groups = useMemo(() => {
    const map = new Map<string, PricingRowDto[]>();
    for (const row of data ?? []) {
      if (pricedOnly && row.price <= 0) continue;
      const list = map.get(row.productName) ?? [];
      list.push(row);
      map.set(row.productName, list);
    }
    return [...map.entries()];
  }, [data, pricedOnly]);

  return (
    <select
      id={id}
      className={cn(
        'h-12 w-full rounded-2xl border border-line bg-canvas px-3 text-sm text-ink focus:border-ink-muted focus:outline-none aria-invalid:border-danger',
        className,
      )}
      value={value ?? ''}
      aria-invalid={invalid || undefined}
      disabled={isLoading || Boolean(error)}
      onChange={(event) => onChange(data?.find((row) => row.variantId === event.target.value) ?? null)}
    >
      <option value="">
        {isLoading ? 'در حال خواندن فهرست…' : error ? 'فهرست خوانده نشد' : 'مدل، حافظه و رنگ را انتخاب کن'}
      </option>
      {groups.map(([product, rows]) => (
        <optgroup key={product} label={product}>
          {rows.map((row) => (
            <option key={row.variantId} value={row.variantId}>
              {`${row.storageLabel} — ${row.colorName} · ${row.price > 0 ? formatToman(row.price) : 'بدون قیمت'} · موجودی ${formatNumberFa(row.available)}`}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
