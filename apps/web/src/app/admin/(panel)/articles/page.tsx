import Link from 'next/link';
import { ExternalLink, Plus } from 'lucide-react';
import { formatNumberFa } from '@iphoneha/shared';
import { getAdminMe, listAdminArticles } from '@/lib/api/admin';
import { formatDateFa } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyRow, PageHeader, Table, Td, Th } from '@/components/admin/ui';

export default async function AdminArticlesPage() {
  const [articles, admin] = await Promise.all([listAdminArticles(), getAdminMe()]);
  const canWrite = admin?.permissions.includes('content.write') ?? false;

  return (
    <div>
      <PageHeader
        title="مجله"
        description="مقاله‌های راهنمای خرید؛ هر مقاله برای یک جست‌وجوی مشتری نوشته می‌شود و به صفحه‌های خرید قسطی لینک می‌دهد"
        action={
          canWrite ? (
            <Button asChild size="sm">
              <Link href="/admin/articles/new">
                <Plus aria-hidden />
                مقالهٔ تازه
              </Link>
            </Button>
          ) : null
        }
      />
      <Table>
        <thead>
          <tr>
            <Th>عنوان</Th>
            <Th>کلمهٔ کلیدی</Th>
            <Th>وضعیت</Th>
            <Th>انتشار</Th>
            <Th>آخرین ویرایش</Th>
            <Th>
              <span className="sr-only">مشاهده</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {articles.length === 0 ? (
            <EmptyRow colSpan={6} label="هنوز مقاله‌ای نیست" />
          ) : (
            articles.map((article) => (
              <tr key={article.id} className="transition-colors hover:bg-surface-2">
                <Td>
                  <Link
                    href={`/admin/articles/${article.id}`}
                    className="font-medium text-ink hover:underline"
                  >
                    {article.title}
                  </Link>
                  <span className="block text-[11px] text-muted">
                    {formatNumberFa(article.readingMinutes)} دقیقه مطالعه
                  </span>
                </Td>
                <Td className="text-[12px]">{article.focusKeyword ?? '—'}</Td>
                <Td>
                  <Badge tone={article.status === 'PUBLISHED' ? 'success' : 'neutral'}>
                    {article.statusLabel}
                  </Badge>
                </Td>
                <Td className="text-[12px]">
                  {article.publishedAt ? formatDateFa(article.publishedAt) : '—'}
                </Td>
                <Td className="text-[12px]">{formatDateFa(article.updatedAt)}</Td>
                <Td>
                  {article.status === 'PUBLISHED' ? (
                    <Link
                      href={`/mag/${article.slug}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-ink"
                      aria-label={`مشاهدهٔ «${article.title}» در سایت`}
                    >
                      <ExternalLink className="size-3.5" aria-hidden />
                      سایت
                    </Link>
                  ) : null}
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
    </div>
  );
}
