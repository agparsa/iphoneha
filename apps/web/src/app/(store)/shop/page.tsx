import { Suspense } from 'react';
import type { Metadata } from 'next';
import { PackageSearch } from 'lucide-react';
import { formatNumberFa } from '@iphoneha/shared';
import { listProducts } from '@/lib/api/endpoints';
import { breadcrumbLd, itemListLd, jsonLdScript } from '@/lib/seo';
import {
  ActiveFilterChips,
  CatalogFiltersDesktop,
  CatalogFiltersMobile,
  CatalogSort,
} from '@/components/store/catalog-filters';
import { Pagination } from '@/components/store/pagination';
import { ProductCardSkeleton } from '@/components/store/product-card-skeleton';
import { ProductGrid } from '@/components/store/product-rail';
import { ScrollToTop } from '@/components/store/scroll-to-top';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * A filtered or sorted listing is a near-duplicate of `/shop`, so it stays out
 * of the index (but is still followed, so the products get crawled). Only the
 * clean `/shop` and its numbered pages are indexable.
 */
export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const params = await searchParams;
  const filtered = FACET_KEYS.some((key) => typeof params[key] === 'string' && params[key] !== '');
  const page = typeof params.page === 'string' ? Number(params.page) : 1;
  const canonical = page > 1 ? `/shop?page=${page}` : '/shop';

  return {
    title: filtered ? 'نتایج فیلترشدهٔ فروشگاه' : 'فروشگاه آیفون آکبند و اورجینال',
    description:
      'همه مدل‌های آیفون موجود در آیفونی‌ها با فیلتر مدل، حافظه، رنگ و قیمت؛ همه با ضمانت اصالت و امکان خرید قسطی.',
    alternates: { canonical: filtered ? '/shop' : canonical },
    robots: filtered ? { index: false, follow: true } : { index: true, follow: true },
  };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Facet params that make a listing a near-duplicate of the clean /shop page. */
const FACET_KEYS = [
  'q',
  'model',
  'series',
  'storage',
  'color',
  'shippingTime',
  'minPrice',
  'maxPrice',
  'inStock',
  'discounted',
  'featured',
  'sort',
] as const;

const FILTER_KEYS = [
  'q',
  'model',
  'series',
  'storage',
  'color',
  'shippingTime',
  'minPrice',
  'maxPrice',
  'inStock',
  'discounted',
  'featured',
  'sort',
  'page',
] as const;

export default async function ShopPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query: Record<string, string> = {};
  for (const key of FILTER_KEYS) {
    const value = params[key];
    if (typeof value === 'string' && value !== '') query[key] = value;
  }
  query.pageSize = '12';

  // the key changes with every filter, so a new selection shows the skeletons
  // instead of the previous list sitting there while the server answers
  const resultsKey = new URLSearchParams(query).toString();

  return (
    <div className="container-page py-5 md:py-8">
      <header className="mb-6">
        <p className="eyebrow">آیفونی‌ها</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink sm:text-3xl">
          {query.q ? `نتایج جست‌وجوی «${query.q}»` : 'آیفون آکبند و اورجینال'}
        </h1>
      </header>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(
          breadcrumbLd([
            { name: 'خانه', href: '/' },
            { name: 'فروشگاه', href: '/shop' },
          ]),
        )}
      />

      <Suspense key={resultsKey} fallback={<ShopSkeleton />}>
        <ShopResults query={query} />
      </Suspense>

      <ScrollToTop />
    </div>
  );
}

async function ShopResults({ query }: { query: Record<string, string> }) {
  const result = await listProducts(query);
  const page = Number(query.page ?? 1);

  return (
    <>
      {result.items.length > 0 ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={jsonLdScript(itemListLd(result.items, 'فهرست آیفون‌های فروشگاه'))}
        />
      ) : null}

      <p className="-mt-3 mb-6 text-[13px] text-muted">
        {formatNumberFa(result.total)} مدل موجود، همه با ضمانت اصالت و امکان خرید قسطی.
      </p>

      <div className="flex gap-8">
        <CatalogFiltersDesktop facets={result.facets} />

        <div className="min-w-0 flex-1">
          <div className="mb-4 flex items-center gap-3">
            <CatalogFiltersMobile facets={result.facets} total={result.total} />
            <div className="min-w-0 flex-1">
              <CatalogSort />
            </div>
          </div>

          <div className="mb-4">
            <ActiveFilterChips facets={result.facets} />
          </div>

          {result.items.length === 0 ? (
            <EmptyState
              icon={PackageSearch}
              title="محصولی با این فیلترها پیدا نشد"
              description="فیلترها را تغییر بده یا عبارت دیگری را جست‌وجو کن."
              className="border-dashed"
            />
          ) : (
            <>
              {/* the cards title themselves with h3, so the list needs its own h2 */}
              <h2 className="sr-only">فهرست آیفون‌ها</h2>
              <ProductGrid products={result.items} />
              <Pagination page={page} totalPages={result.totalPages} />
            </>
          )}
        </div>
      </div>
    </>
  );
}

function ShopSkeleton() {
  return (
    <div className="flex gap-8">
      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="space-y-4 rounded-panel border border-line p-5">
          <Skeleton className="h-5 w-24" />
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-4 w-full" />
          ))}
          <Skeleton className="h-11 w-full" />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <Skeleton className="mb-4 h-9 w-full max-w-md" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
          {Array.from({ length: 8 }, (_, index) => (
            <ProductCardSkeleton key={index} />
          ))}
        </div>
      </div>
    </div>
  );
}
