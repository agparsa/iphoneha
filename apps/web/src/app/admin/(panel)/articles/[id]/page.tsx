import { notFound } from 'next/navigation';
import { getAdminArticle, getAdminMe } from '@/lib/api/admin';
import { PageHeader } from '@/components/admin/ui';
import { ArticleEditor } from '@/components/admin/article-editor';

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [article, admin] = await Promise.all([getAdminArticle(id), getAdminMe()]);
  if (!article) notFound();
  const canWrite = admin?.permissions.includes('content.write') ?? false;
  return (
    <div>
      <PageHeader title={article.title} description={`مقاله · ${article.statusLabel}`} />
      {/* not keyed by the last save: uploading a cover must not throw away unsaved text */}
      <ArticleEditor article={article} canWrite={canWrite} />
    </div>
  );
}
