import Image from 'next/image';
import Link from 'next/link';
import { Clock } from 'lucide-react';
import { formatNumberFa, type ArticleSummaryDto } from '@iphoneha/shared';
import { cn, mediaUrl } from '@/lib/utils';

/** «۳ مهر ۱۴۰۵», in Tehran time whatever the server's zone. */
export function articleDate(value: string): string {
  return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'long', timeZone: 'Asia/Tehran' }).format(
    new Date(value),
  );
}

/** A magazine teaser: cover, title, excerpt, date and reading time. */
export function ArticleCard({
  article,
  headingLevel: Heading = 'h3',
  priority,
  className,
}: {
  article: ArticleSummaryDto;
  headingLevel?: 'h2' | 'h3';
  priority?: boolean;
  className?: string;
}) {
  const cover = mediaUrl(article.coverUrl);
  return (
    <article
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-panel border border-line bg-canvas transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:border-brand/30 hover:shadow-card',
        className,
      )}
    >
      <div className="relative aspect-[1200/630] overflow-hidden bg-brand-deep">
        {cover ? (
          <Image
            src={cover}
            alt={article.coverAlt ?? ''}
            fill
            priority={priority}
            sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-700 ease-out-quint group-hover:scale-[1.04]"
          />
        ) : null}
      </div>
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <Heading className="text-[15px] font-semibold leading-7 text-ink">
          <Link href={`/mag/${article.slug}`} className="after:absolute after:inset-0">
            {article.title}
          </Link>
        </Heading>
        <p className="mt-2 line-clamp-3 flex-1 text-[12px] leading-6 text-muted">{article.excerpt}</p>
        <p className="mt-4 flex items-center gap-3 text-[11px] text-muted">
          <time dateTime={article.publishedAt}>{articleDate(article.publishedAt)}</time>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" aria-hidden />
            {formatNumberFa(article.readingMinutes)} دقیقه مطالعه
          </span>
        </p>
      </div>
    </article>
  );
}
