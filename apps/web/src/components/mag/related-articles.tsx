import type { ArticleSummaryDto } from '@iphoneha/shared';
import { SectionHeader } from '@/components/store/section-header';
import { ArticleCard } from './article-card';

/** «از مجلهٔ آیفونی‌ها»: up to three articles, the ones named first. */
export function RelatedArticles({
  articles,
  prefer = [],
  title = 'بیشتر بخوانید',
  exclude,
}: {
  articles: ArticleSummaryDto[];
  /** slugs to put first, in this order */
  prefer?: string[];
  title?: string;
  exclude?: string;
}) {
  const rank = (slug: string) => {
    const index = prefer.indexOf(slug);
    return index === -1 ? prefer.length : index;
  };
  const picked = articles
    .filter((article) => article.slug !== exclude)
    .sort((a, b) => rank(a.slug) - rank(b.slug))
    .slice(0, 3);
  if (picked.length === 0) return null;

  return (
    <section>
      <SectionHeader eyebrow="Magazine" title={title} href="/mag" linkLabel="همهٔ مقاله‌ها" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {picked.map((article) => (
          <ArticleCard key={article.slug} article={article} />
        ))}
      </div>
    </section>
  );
}
