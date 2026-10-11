'use client';

import { useCallback, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import {
  PRODUCT_SORTS,
  PRODUCT_SORT_LABELS,
  SHIPPING_TIMES,
  SHIPPING_TIME_LABELS,
  formatNumberFa,
  formatToman,
  type CatalogFacets,
  type ProductSort,
  type ShippingTime,
} from '@iphoneha/shared';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

type Params = Record<string, string | undefined>;

/** Every filter key reset at once — «پاک کردن همه». */
const CLEARED: Params = {
  q: undefined,
  color: undefined,
  storage: undefined,
  model: undefined,
  series: undefined,
  shippingTime: undefined,
  minPrice: undefined,
  maxPrice: undefined,
  inStock: undefined,
  discounted: undefined,
};

function useFilterState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const current = useMemo(() => {
    const entries: Params = {};
    searchParams.forEach((value, key) => {
      entries[key] = value;
    });
    return entries;
  }, [searchParams]);

  const apply = useCallback(
    (patch: Params) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === '') params.delete(key);
        else params.set(key, value);
      }
      params.delete('page');
      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const toggleCsv = useCallback(
    (key: string, value: string) => {
      const list = (current[key] ?? '').split(',').filter(Boolean);
      const next = list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
      apply({ [key]: next.join(',') });
    },
    [apply, current],
  );

  const activeCount = useMemo(
    () =>
      [
        'color',
        'storage',
        'series',
        'model',
        'shippingTime',
        'minPrice',
        'maxPrice',
        'inStock',
        'discounted',
      ].filter((key) => Boolean(current[key])).length,
    [current],
  );

  return { current, apply, toggleCsv, activeCount, pathname, router };
}

export function CatalogSort() {
  const { current, apply } = useFilterState();
  const active = (current.sort as ProductSort) ?? 'featured';

  return (
    <div className="no-scrollbar flex items-center gap-2 overflow-x-auto">
      <span className="shrink-0 text-[12px] text-muted">مرتب‌سازی:</span>
      {PRODUCT_SORTS.map((sort) => (
        <button
          key={sort}
          type="button"
          onClick={() => apply({ sort })}
          aria-pressed={sort === active}
          className={cn(
            'shrink-0 rounded-pill border px-3 py-1.5 text-[12px] transition-colors',
            sort === active ? 'border-ink bg-ink text-white' : 'border-line text-ink-muted hover:bg-surface',
          )}
        >
          {PRODUCT_SORT_LABELS[sort]}
        </button>
      ))}
    </div>
  );
}

export function ActiveFilterChips({ facets }: { facets: CatalogFacets }) {
  const { current, apply, toggleCsv } = useFilterState();
  const chips: { key: string; label: string; onRemove: () => void }[] = [];

  for (const code of (current.color ?? '').split(',').filter(Boolean)) {
    const color = facets.colors.find((c) => c.code === code);
    chips.push({
      key: `color-${code}`,
      label: color?.name ?? code,
      onRemove: () => toggleCsv('color', code),
    });
  }
  for (const gb of (current.storage ?? '').split(',').filter(Boolean)) {
    const storage = facets.storages.find((s) => String(s.capacityGb) === gb);
    chips.push({
      key: `storage-${gb}`,
      label: storage?.labelFa ?? gb,
      onRemove: () => toggleCsv('storage', gb),
    });
  }
  for (const slug of (current.model ?? '').split(',').filter(Boolean)) {
    const model = facets.models.find((m) => m.slug === slug);
    chips.push({
      key: `model-${slug}`,
      label: model?.name ?? slug,
      onRemove: () => toggleCsv('model', slug),
    });
  }
  for (const value of (current.series ?? '').split(',').filter(Boolean)) {
    chips.push({ key: `series-${value}`, label: value, onRemove: () => toggleCsv('series', value) });
  }
  for (const time of (current.shippingTime ?? '').split(',').filter(Boolean)) {
    chips.push({
      key: `shipping-${time}`,
      label: SHIPPING_TIME_LABELS[time as ShippingTime] ?? time,
      onRemove: () => toggleCsv('shippingTime', time),
    });
  }
  if (current.inStock)
    chips.push({ key: 'inStock', label: 'فقط موجود', onRemove: () => apply({ inStock: undefined }) });
  if (current.discounted)
    chips.push({
      key: 'discounted',
      label: 'فقط تخفیف‌دار',
      onRemove: () => apply({ discounted: undefined }),
    });
  if (current.minPrice || current.maxPrice)
    chips.push({
      key: 'price',
      label: `${current.minPrice ? formatToman(Number(current.minPrice)) : '۰'} تا ${
        current.maxPrice ? formatToman(Number(current.maxPrice)) : '∞'
      }`,
      onRemove: () => apply({ minPrice: undefined, maxPrice: undefined }),
    });
  if (current.q) chips.push({ key: 'q', label: `«${current.q}»`, onRemove: () => apply({ q: undefined }) });

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.onRemove}
          aria-label={`حذف فیلتر ${chip.label}`}
          className="inline-flex items-center gap-1.5 rounded-pill bg-surface px-3 py-1.5 text-[12px] text-ink-muted transition-colors hover:bg-surface-3"
        >
          {chip.label}
          <X className="size-3" aria-hidden />
        </button>
      ))}
      {chips.length > 1 ? (
        <button
          type="button"
          onClick={() => apply(CLEARED)}
          className="rounded-pill px-2 py-1.5 text-[12px] text-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
        >
          پاک کردن همه
        </button>
      ) : null}
    </div>
  );
}

/** Collapsible group — `<details>` keeps it keyboard- and screen-reader-friendly. */
function FilterGroup({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group border-b border-line pb-4 last:border-b-0 last:pb-0">
      <summary className="flex cursor-pointer list-none items-center justify-between py-1 text-[13px] font-medium text-ink marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          {title}
          {count ? (
            <span className="rounded-pill bg-ink px-1.5 text-[10px] font-semibold text-white tabular">
              {formatNumberFa(count)}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className="size-4 text-muted-faint transition-transform duration-200 group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function FilterBody({ facets }: { facets: CatalogFacets }) {
  const { current, apply, toggleCsv } = useFilterState();
  const selected = (key: string, value: string) => (current[key] ?? '').split(',').includes(value);

  const csvCount = (key: string) => (current[key] ?? '').split(',').filter(Boolean).length;

  return (
    <div className="grid gap-4">
      <FilterGroup title="مدل" count={csvCount('model')}>
        <ul className="grid gap-2">
          {facets.models.map((model) => (
            <li key={model.slug}>
              <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-ink-muted">
                <Checkbox
                  checked={selected('model', model.slug)}
                  onCheckedChange={() => toggleCsv('model', model.slug)}
                />
                <span className="flex-1">{model.name}</span>
                <span className="text-[11px] text-muted-faint tabular">{formatNumberFa(model.count)}</span>
              </label>
            </li>
          ))}
        </ul>
      </FilterGroup>

      {facets.series.length > 1 ? (
        <FilterGroup title="سری" count={csvCount('series')}>
          <div className="flex flex-wrap gap-2">
            {facets.series.map((series) => {
              const active = selected('series', series.value);
              return (
                <button
                  key={series.value}
                  type="button"
                  onClick={() => toggleCsv('series', series.value)}
                  aria-pressed={active}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-[12px] transition-colors',
                    active ? 'border-ink bg-ink text-white' : 'border-line text-ink-muted hover:bg-surface',
                  )}
                >
                  <span dir="auto">{series.value}</span>
                  <span
                    className={cn(
                      'rounded-full px-1.5 text-[10px] tabular',
                      active ? 'bg-white/20 text-white' : 'bg-surface-3 text-muted',
                    )}
                  >
                    {formatNumberFa(series.count)}
                  </span>
                </button>
              );
            })}
          </div>
        </FilterGroup>
      ) : null}

      <FilterGroup title="حافظه" count={csvCount('storage')}>
        <div className="flex flex-wrap gap-2">
          {facets.storages.map((storage) => {
            const value = String(storage.capacityGb);
            const active = selected('storage', value);
            return (
              <button
                key={storage.id}
                type="button"
                onClick={() => toggleCsv('storage', value)}
                aria-pressed={active}
                className={cn(
                  'rounded-pill border px-3 py-1.5 text-[12px] transition-colors',
                  active ? 'border-ink bg-ink text-white' : 'border-line text-ink-muted hover:bg-surface',
                )}
              >
                {storage.labelFa}
              </button>
            );
          })}
        </div>
      </FilterGroup>

      <FilterGroup title="رنگ" count={csvCount('color')}>
        <ul className="grid gap-2">
          {facets.colors.map((color) => (
            <li key={color.id}>
              <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-ink-muted">
                <Checkbox
                  checked={selected('color', color.code)}
                  onCheckedChange={() => toggleCsv('color', color.code)}
                />
                <span
                  className="size-4 shrink-0 rounded-full"
                  style={{ backgroundColor: color.hex, boxShadow: 'inset 0 0 0 1px rgb(8 9 10 / 0.1)' }}
                  aria-hidden
                />
                <span className="flex-1">{color.name}</span>
                <span className="text-[11px] text-muted-faint tabular">{formatNumberFa(color.count)}</span>
              </label>
            </li>
          ))}
        </ul>
      </FilterGroup>

      <FilterGroup title="زمان ارسال" count={csvCount('shippingTime')} defaultOpen={false}>
        <div className="flex flex-wrap gap-2">
          {SHIPPING_TIMES.map((time) => {
            const active = selected('shippingTime', time);
            return (
              <button
                key={time}
                type="button"
                onClick={() => toggleCsv('shippingTime', time)}
                aria-pressed={active}
                className={cn(
                  'rounded-pill border px-3 py-1.5 text-[12px] transition-colors',
                  active ? 'border-ink bg-ink text-white' : 'border-line text-ink-muted hover:bg-surface',
                )}
              >
                {SHIPPING_TIME_LABELS[time]}
              </button>
            );
          })}
        </div>
      </FilterGroup>

      <FilterGroup title="محدوده قیمت" count={current.minPrice || current.maxPrice ? 1 : 0}>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            defaultValue={current.minPrice ?? ''}
            placeholder={String(facets.priceRange.min)}
            onBlur={(event) => apply({ minPrice: event.target.value || undefined })}
            className="h-11 w-full rounded-2xl border border-line px-3 text-[13px] tabular focus:border-ink-muted focus:outline-none"
            aria-label="حداقل قیمت"
          />
          <span className="text-muted-faint">تا</span>
          <input
            type="number"
            inputMode="numeric"
            defaultValue={current.maxPrice ?? ''}
            placeholder={String(facets.priceRange.max)}
            onBlur={(event) => apply({ maxPrice: event.target.value || undefined })}
            className="h-11 w-full rounded-2xl border border-line px-3 text-[13px] tabular focus:border-ink-muted focus:outline-none"
            aria-label="حداکثر قیمت"
          />
        </div>
        <p className="mt-2 text-[11px] text-muted-faint">
          قیمت‌ها بین {formatToman(facets.priceRange.min)} تا {formatToman(facets.priceRange.max)}
        </p>
      </FilterGroup>

      <div className="grid gap-3">
        <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-ink-muted">
          <Checkbox
            checked={Boolean(current.inStock)}
            onCheckedChange={(checked) => apply({ inStock: checked ? 'true' : undefined })}
          />
          فقط کالاهای موجود
        </label>
        <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-ink-muted">
          <Checkbox
            checked={Boolean(current.discounted)}
            onCheckedChange={(checked) => apply({ discounted: checked ? 'true' : undefined })}
          />
          فقط کالاهای تخفیف‌دار
        </label>
      </div>
    </div>
  );
}

export function CatalogFiltersDesktop({ facets }: { facets: CatalogFacets }) {
  const { activeCount, apply } = useFilterState();
  return (
    <aside className="hidden w-64 shrink-0 lg:block">
      <div className="sticky top-24 rounded-panel border border-line p-5">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-ink">فیلترها</h2>
          {activeCount > 0 ? (
            <button
              type="button"
              className="text-[12px] text-muted hover:text-ink"
              onClick={() => apply(CLEARED)}
            >
              پاک کردن
            </button>
          ) : null}
        </div>
        <FilterBody facets={facets} />
      </div>
    </aside>
  );
}

export function CatalogFiltersMobile({ facets, total }: { facets: CatalogFacets; total: number }) {
  const { activeCount, apply } = useFilterState();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="lg:hidden">
          <SlidersHorizontal className="size-4" aria-hidden />
          فیلترها
          {activeCount > 0 ? (
            <span className="grid size-5 place-items-center rounded-full bg-ink text-[10px] text-white tabular">
              {formatNumberFa(activeCount)}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" title="فیلترها" className="lg:hidden">
        <div className="flex-1 overflow-y-auto p-5">
          <FilterBody facets={facets} />
        </div>
        <div className="flex items-center gap-3 border-t border-line p-4">
          {activeCount > 0 ? (
            <Button variant="outline" size="lg" onClick={() => apply(CLEARED)}>
              پاک کردن
            </Button>
          ) : null}
          <Button block size="lg" onClick={() => setOpen(false)}>
            نمایش {formatNumberFa(total)} محصول
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
