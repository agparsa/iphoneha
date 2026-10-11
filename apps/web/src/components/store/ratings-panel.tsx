import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { formatDecimalFa, formatNumberFa, type ProductCardDto } from '@iphoneha/shared';
import { RatingStars } from './rating-stars';

/**
 * Store rating on the left, per-model bars on the right. Every number is the
 * product's real `ratingAvg` / `ratingCount` — nothing is invented here.
 */
export function RatingsPanel({
  average,
  count,
  products,
}: {
  average: number | null;
  count: number;
  products: ProductCardDto[];
}) {
  // the caller passes several lists (featured + categories), so the same model
  // can arrive twice — keep the first occurrence of each
  const seen = new Set<string>();
  const rated = products
    .filter((product) => {
      if (!product.ratingAvg || product.ratingCount <= 0 || seen.has(product.id)) return false;
      seen.add(product.id);
      return true;
    })
    .slice(0, 5);
  if (average === null || rated.length === 0) return null;

  return (
    <div className="grid gap-px overflow-hidden rounded-panel border border-line bg-line md:grid-cols-[minmax(0,15rem)_1fr]">
      <div className="flex flex-col items-center justify-center gap-2 bg-surface-2 px-6 py-8 text-center">
        <span className="font-display text-[44px] leading-none font-semibold text-ink tabular">
          {formatDecimalFa(average)}
        </span>
        <RatingStars value={average} size="md" showCount={false} />
        <p className="text-[12px] leading-6 text-muted">
          میانگین امتیاز <span className="tabular">{formatNumberFa(count)}</span> خریدار به آیفون‌های ما
        </p>
      </div>

      <ul className="grid gap-3 bg-canvas p-5 sm:p-6">
        {rated.map((product) => {
          const percent = Math.round(((product.ratingAvg ?? 0) / 5) * 100);
          return (
            <li key={product.id}>
              <Link
                href={`/iphone/${product.slug}`}
                prefetch={false}
                className="group flex items-center gap-3 rounded-xl px-1 py-1 transition-colors hover:bg-surface"
              >
                <span className="w-32 shrink-0 truncate text-[12px] font-medium text-ink sm:w-40 sm:text-[13px]">
                  {product.name}
                </span>
                <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-pill bg-surface-3">
                  <span
                    className="block h-full rounded-pill bg-warning/80 transition-[width] duration-700 ease-out-quint"
                    style={{ width: `${percent}%` }}
                  />
                </span>
                <span className="shrink-0 text-[11px] text-muted tabular">
                  {formatDecimalFa(product.ratingAvg ?? 0)}
                  <span className="text-muted-faint"> ({formatNumberFa(product.ratingCount)})</span>
                </span>
                <ChevronLeft
                  className="size-3.5 shrink-0 text-muted-faint transition-transform group-hover:-translate-x-0.5"
                  aria-hidden
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
