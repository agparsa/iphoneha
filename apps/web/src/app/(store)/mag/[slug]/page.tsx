import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CalendarDays, Clock, ListOrdered } from 'lucide-react';
import { formatNumberFa } from '@iphoneha/shared';
import { getArticle, getLatestArticles, getStorefrontConfig, listArticles } from '@/lib/api/endpoints';
import { CREDIT_COLORS, CREDIT_PAGES, offeredMethods } from '@/lib/credit';
import { tableOfContents } from '@/lib/markdown';
import { articleLd, breadcrumbLd, jsonLdScript } from '@/lib/seo';
import { mediaUrl } from '@/lib/utils';
import { Breadcrumbs } from '@/components/store/breadcrumbs';
import { PlanIcon } from '@/components/credit/plan-icon';
import { ArticleBody } from '@/components/mag/article-body';
import { articleDate } from '@/components/mag/article-card';
import { RelatedArticles } from '@/components/mag/related-articles';

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const article = await getArticle((await params).slug);
  if (!article) return {};
  const path = `/mag/${article.slug}`;
  const cover = mediaUrl(article.coverUrl);
  const title = article.seoTitle ?? article.title;
  return {
    // the owner's SEO title is written whole; a plain title gets the brand after it
    title: article.seoTitle ? { absolute: article.seoTitle } : article.title,
    description: article.excerpt,
    alternates: { canonical: path },
    openGraph: {
      type: 'article',
      url: path,
      title,
      description: article.excerpt,
      publishedTime: article.publishedAt,
      modifiedTime: article.updatedAt,
      ...(cover ? { images: [{ url: cover, alt: article.coverAlt ?? article.title }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: article.excerpt,
      ...(cover ? { images: [cover] } : {}),
    },
  };
}

// every published article is built ahead; a new one renders on its first visit
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const list = await listArticles(1, 50);
  return list.items.map((article) => ({ slug: article.slug }));
}

export const revalidate = 300;

const DAY = 24 * 60 * 60 * 1000;

export default async function ArticlePage({ params }: { params: Params }) {
  const { slug } = await params;
  const [article, config, latest] = await Promise.all([
    getArticle(slug),
    getStorefrontConfig(),
    getLatestArticles(12),
  ]);
  if (!article) notFound();

  const cover = mediaUrl(article.coverUrl);
  const toc = tableOfContents(article.body);
  const methods = offeredMethods(config);
  const edited = new Date(article.updatedAt).getTime() - new Date(article.publishedAt).getTime() > DAY;
  const crumbs = [
    { name: 'آیفونی‌ها', href: '/' },
    { name: 'مجله', href: '/mag' },
    { name: article.title, href: `/mag/${article.slug}` },
  ];

  return (
    <div className="container-page py-5 md:py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([articleLd(article, config.store), breadcrumbLd(crumbs)])}
      />
      <Breadcrumbs items={crumbs} />

      <article className="mx-auto max-w-3xl">
        <header>
          <Link href="/mag" className="eyebrow hover:text-ink">
            مجلهٔ آیفونی‌ها
          </Link>
          <h1 className="mt-3 text-2xl font-bold leading-[1.6] text-balance text-ink sm:text-[2rem]">
            {article.title}
          </h1>
          <p className="mt-4 text-[14px] leading-8 text-muted">{article.excerpt}</p>
          <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-3.5" aria-hidden />
              <time dateTime={article.publishedAt}>{articleDate(article.publishedAt)}</time>
            </span>
            {edited ? (
              <span>
                به‌روزرسانی: <time dateTime={article.updatedAt}>{articleDate(article.updatedAt)}</time>
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3.5" aria-hidden />
              {formatNumberFa(article.readingMinutes)} دقیقه مطالعه
            </span>
          </p>
        </header>

        {cover ? (
          <div className="relative mt-7 aspect-[1600/840] overflow-hidden rounded-panel bg-brand-deep">
            <Image
              src={cover}
              alt={article.coverAlt ?? article.title}
              fill
              priority
              sizes="(min-width: 800px) 768px, 100vw"
              className="object-cover"
            />
          </div>
        ) : null}

        {toc.length >= 3 ? (
          <nav aria-labelledby="toc-title" className="mt-8 rounded-panel border border-line bg-surface-2 p-5">
            <p id="toc-title" className="flex items-center gap-2 text-[13px] font-semibold text-ink">
              <ListOrdered className="size-4 text-brand" aria-hidden />
              فهرست مطالب
            </p>
            <ol className="mt-3 grid list-decimal gap-1.5 ps-5 text-[13px] leading-7 marker:text-muted">
              {toc.map((entry) => (
                <li key={entry.id}>
                  <a href={`#${entry.id}`} className="text-ink-muted hover:text-brand-ink hover:underline">
                    {entry.text}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}

        <div className="mt-8">
          <ArticleBody markdown={article.body} />
        </div>

        {methods.length > 0 ? (
          <aside className="mt-12 rounded-panel bg-brand-deep p-6 text-white md:p-8">
            <p className="text-[12px] text-brand-mint">خرید از آیفونی‌ها</p>
            <p className="mt-2 text-xl font-semibold leading-8">آیفون را قسطی بخر؛ غیرحضوری، از هر شهری</p>
            <p className="mt-2 text-[13px] leading-7 text-white/75">
              شرایط روز، قیمت اقساطی هر مدل و فرم درخواست در صفحهٔ هر روش آمده است.
            </p>
            <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
              {methods.map((method) => (
                <li key={method}>
                  <Link
                    href={CREDIT_PAGES[method].path}
                    className="group flex items-center gap-3 rounded-2xl bg-white/[0.07] p-3.5 transition-colors hover:bg-white/[0.12]"
                  >
                    <PlanIcon method={method} color={CREDIT_COLORS[method]} size={36} className="bg-white" />
                    <span className="flex-1 text-[14px] font-medium">{CREDIT_PAGES[method].title}</span>
                    <ArrowLeft
                      className="size-4 text-brand-mint transition-transform duration-300 group-hover:-translate-x-1"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              href="/installments"
              className="mt-4 inline-flex items-center gap-1.5 text-[13px] text-brand-mint hover:text-white"
            >
              همهٔ روش‌های خرید آیفون قسطی
              <ArrowLeft className="size-3.5" aria-hidden />
            </Link>
          </aside>
        ) : null}
      </article>

      <div className="mt-14">
        <RelatedArticles articles={latest} exclude={article.slug} />
      </div>
    </div>
  );
}
