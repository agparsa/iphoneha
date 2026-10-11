import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatNumberFa, type ArticleSummaryDto, type Paginated } from '@iphoneha/shared';
import { cn } from '@/lib/utils';
import { breadcrumbLd, jsonLdScript } from '@/lib/seo';
import { Breadcrumbs } from '@/components/store/breadcrumbs';
import { ArticleCard } from './article-card';

export const MAG_PAGE_SIZE = 12;

export function magPageHref(page: number): string {
  return page <= 1 ? '/mag' : `/mag/page/${page}`;
}

/** «مجلهٔ آیفونی‌ها»: the article grid with crawlable page links. */
export function MagazineList({ list }: { list: Paginated<ArticleSummaryDto> }) {
  const crumbs = [
    { name: 'آیفونی‌ها', href: '/' },
    { name: 'مجله', href: '/mag' },
    ...(list.page > 1 ? [{ name: `صفحهٔ ${formatNumberFa(list.page)}`, href: magPageHref(list.page) }] : []),
  ];

  return (
    <div className="container-page py-5 md:py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(breadcrumbLd(crumbs))} />
      <Breadcrumbs items={crumbs} />

      <header className="relative isolate overflow-hidden rounded-panel bg-brand-deep px-6 py-9 text-white md:px-10 md:py-12">
        <span aria-hidden className="panel-grid absolute inset-0 -z-10" />
        <span
          aria-hidden
          className="animate-drift absolute -top-32 -right-24 -z-10 size-96 rounded-full bg-brand/40 blur-3xl"
        />
        <p className="eyebrow text-brand-mint">Magazine</p>
        <h1 className="mt-3 text-3xl font-semibold leading-[1.35] sm:text-4xl">مجلهٔ آیفونی‌ها</h1>
        <p className="mt-3 max-w-2xl text-[13px] leading-7 text-white/80">
          راهنمای خرید آیفون قسطی با چک و سفته، محاسبهٔ اقساط و نکته‌هایی که پیش از خرید گوشی باید بدانی.
        </p>
      </header>

      {list.items.length === 0 ? (
        <p className="mt-10 text-center text-[13px] text-muted">هنوز مقاله‌ای منتشر نشده است.</p>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.items.map((article, index) => (
            <li key={article.slug}>
              <ArticleCard article={article} headingLevel="h2" priority={list.page === 1 && index === 0} />
            </li>
          ))}
        </ul>
      )}

      {list.totalPages > 1 ? (
        <nav className="mt-10 flex items-center justify-center gap-1.5" aria-label="صفحه‌های مجله">
          {list.page > 1 ? (
            <Link
              href={magPageHref(list.page - 1)}
              rel="prev"
              className="grid size-9 place-items-center rounded-full border border-line text-ink hover:bg-surface"
              aria-label="صفحهٔ قبل"
            >
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          ) : null}
          {Array.from({ length: list.totalPages }, (_, i) => i + 1).map((page) => (
            <Link
              key={page}
              href={magPageHref(page)}
              aria-current={page === list.page ? 'page' : undefined}
              className={cn(
                'grid size-9 place-items-center rounded-full text-[13px] tabular',
                page === list.page ? 'bg-ink text-white' : 'border border-line text-ink hover:bg-surface',
              )}
            >
              {formatNumberFa(page)}
            </Link>
          ))}
          {list.page < list.totalPages ? (
            <Link
              href={magPageHref(list.page + 1)}
              rel="next"
              className="grid size-9 place-items-center rounded-full border border-line text-ink hover:bg-surface"
              aria-label="صفحهٔ بعد"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
