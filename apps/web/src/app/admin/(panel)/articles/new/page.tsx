import { redirect } from 'next/navigation';
import { getAdminMe } from '@/lib/api/admin';
import { PageHeader } from '@/components/admin/ui';
import { ArticleEditor } from '@/components/admin/article-editor';

export default async function NewArticlePage() {
  const admin = await getAdminMe();
  if (!admin?.permissions.includes('content.write')) redirect('/admin/articles');
  return (
    <div>
      <PageHeader
        title="مقالهٔ تازه"
        description="متن را با Markdown بنویس؛ پیش‌نمایش و چک‌لیست سئو کنار متن است"
      />
      <ArticleEditor article={null} canWrite />
    </div>
  );
}
