'use client';

import { useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, CircleDashed, ExternalLink, ImagePlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatNumberFa, type AdminArticleDto, type ArticleStatus } from '@iphoneha/shared';
import { api, apiUpload } from '@/lib/api/client';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { articleSeoChecks, effectiveTitle } from '@/lib/article-seo';
import { cn, mediaUrl } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input, Textarea } from '@/components/ui/input';
import { ArticleBody } from '@/components/mag/article-body';
import { ConfirmDelete } from './confirm-delete';

const MARKDOWN_HELP = '## تیتر بخش · **پررنگ** · [متن لینک](/installments/cheque) · - فهرست · | جدول |';

/**
 * «مقاله»: write in Markdown with a live preview, and see the on-page SEO
 * checks while typing. The cover can be uploaded once the article is saved.
 */
export function ArticleEditor({ article, canWrite }: { article: AdminArticleDto | null; canWrite: boolean }) {
  const router = useRouter();
  const coverInput = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(article?.title ?? '');
  const [slug, setSlug] = useState(article?.slug ?? '');
  const [seoTitle, setSeoTitle] = useState(article?.seoTitle ?? '');
  const [focusKeyword, setFocusKeyword] = useState(article?.focusKeyword ?? '');
  const [excerpt, setExcerpt] = useState(article?.excerpt ?? '');
  const [body, setBody] = useState(article?.body ?? '');
  const [coverAlt, setCoverAlt] = useState(article?.coverAlt ?? '');
  const [status, setStatus] = useState<ArticleStatus>(article?.status ?? 'DRAFT');
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);

  const cover = mediaUrl(article?.coverUrl);
  const checks = useMemo(
    () =>
      articleSeoChecks({
        title,
        seoTitle,
        excerpt,
        body,
        slug,
        focusKeyword,
        coverAlt,
        hasCover: Boolean(cover),
      }),
    [title, seoTitle, excerpt, body, slug, focusKeyword, coverAlt, cover],
  );
  const passed = checks.filter((check) => check.ok).length;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setPending(true);
    const payload = {
      title,
      slug: slug.trim().toLowerCase(),
      seoTitle: seoTitle || null,
      focusKeyword: focusKeyword || null,
      excerpt,
      body,
      coverAlt: coverAlt || null,
      status,
    };
    try {
      if (article) {
        await api.patch(`/admin/articles/${article.id}`, payload);
        toast.success(status === 'PUBLISHED' ? 'مقاله ذخیره و منتشر شد' : 'پیش‌نویس ذخیره شد');
        router.refresh();
      } else {
        const created = await api.post<AdminArticleDto>('/admin/articles', payload);
        toast.success('مقاله ساخته شد؛ حالا می‌توانی کاور بگذاری');
        router.replace(`/admin/articles/${created.id}`);
      }
    } catch (cause) {
      if (cause instanceof ApiError && Object.keys(cause.fieldErrors).length > 0) {
        setErrors(cause.fieldErrors);
        toast.error('چند فیلد را باید اصلاح کنی');
      } else toast.error(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  async function uploadCover(file: File) {
    if (!article) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      await apiUpload(`/admin/articles/${article.id}/cover`, form);
      toast.success('کاور ذخیره شد');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setUploading(false);
      if (coverInput.current) coverInput.current.value = '';
    }
  }

  return (
    <form onSubmit={save} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid content-start gap-4">
        <Field label="عنوان مقاله (تیتر اصلی صفحه)" htmlFor="a-title" error={errors.title}>
          <Input
            id="a-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={!canWrite}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="نشانی (لاتین)"
            htmlFor="a-slug"
            error={errors.slug}
            hint="مثل buy-iphone-with-cheque؛ بعد از انتشار عوضش نکن"
          >
            <Input
              id="a-slug"
              dir="ltr"
              className="font-display"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              disabled={!canWrite}
            />
          </Field>
          <Field
            label="کلمهٔ کلیدی اصلی"
            htmlFor="a-keyword"
            error={errors.focusKeyword}
            hint="عبارتی که مقاله برای آن نوشته می‌شود"
          >
            <Input
              id="a-keyword"
              value={focusKeyword}
              onChange={(event) => setFocusKeyword(event.target.value)}
              disabled={!canWrite}
            />
          </Field>
        </div>
        <Field
          label="عنوان سئو (اختیاری)"
          htmlFor="a-seo-title"
          error={errors.seoTitle}
          hint={`عنوانی که در نتیجهٔ گوگل دیده می‌شود: «${effectiveTitle({ title, seoTitle }) || '—'}»`}
        >
          <Input
            id="a-seo-title"
            value={seoTitle}
            maxLength={70}
            onChange={(event) => setSeoTitle(event.target.value)}
            disabled={!canWrite}
          />
        </Field>
        <Field
          label={`خلاصه — ${formatNumberFa(excerpt.trim().length)} نویسه`}
          htmlFor="a-excerpt"
          error={errors.excerpt}
          hint="زیر عنوان در نتیجهٔ گوگل و در فهرست مجله دیده می‌شود؛ ۱۲۰ تا ۱۷۰ نویسه"
        >
          <Textarea
            id="a-excerpt"
            rows={3}
            maxLength={300}
            value={excerpt}
            onChange={(event) => setExcerpt(event.target.value)}
            disabled={!canWrite}
          />
        </Field>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-[13px] font-medium text-ink-muted">متن مقاله</span>
            <div className="flex gap-1 rounded-pill bg-surface p-1" role="tablist" aria-label="نمای متن">
              {(
                [
                  ['write', 'نوشتن'],
                  ['preview', 'پیش‌نمایش'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={tab === value}
                  onClick={() => setTab(value)}
                  className={cn(
                    'rounded-pill px-3 py-1 text-[12px] transition-colors',
                    tab === value ? 'bg-canvas text-ink shadow-hairline' : 'text-muted hover:text-ink',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {tab === 'write' ? (
            <>
              <Textarea
                id="a-body"
                aria-label="متن مقاله (Markdown)"
                rows={24}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                disabled={!canWrite}
                className="text-[13px] leading-8"
              />
              <p className="mt-1.5 text-[11px] text-muted" dir="auto">
                {MARKDOWN_HELP}
              </p>
              {errors.body ? <p className="mt-1.5 text-xs text-danger">{errors.body}</p> : null}
            </>
          ) : (
            <div className="min-h-64 rounded-panel border border-line p-5">
              {body.trim() ? (
                <ArticleBody markdown={body} />
              ) : (
                <p className="text-[13px] text-muted">هنوز متنی ننوشته‌ای.</p>
              )}
            </div>
          )}
        </div>
      </div>

      <aside className="grid content-start gap-4">
        <section className="rounded-panel border border-line p-4">
          <p className="text-[13px] font-semibold text-ink">وضعیت</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(
              [
                ['DRAFT', 'پیش‌نویس'],
                ['PUBLISHED', 'منتشرشده'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={status === value}
                disabled={!canWrite}
                onClick={() => setStatus(value)}
                className={cn(
                  'rounded-pill border px-3 py-2 text-[12px] transition-colors',
                  status === value
                    ? 'border-ink bg-ink text-white'
                    : 'border-line text-ink-muted hover:bg-surface',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {article?.status === 'PUBLISHED' ? (
            <Link
              href={`/mag/${article.slug}`}
              target="_blank"
              className="mt-3 inline-flex items-center gap-1 text-[12px] text-brand-ink hover:underline"
            >
              مشاهده در سایت
              <ExternalLink className="size-3" aria-hidden />
            </Link>
          ) : null}
          {canWrite ? (
            <Button type="submit" block className="mt-4" loading={pending}>
              {article ? 'ذخیره' : 'ساخت مقاله'}
            </Button>
          ) : null}
        </section>

        <section className="rounded-panel border border-line p-4">
          <p className="text-[13px] font-semibold text-ink">کاور</p>
          <div className="relative mt-3 aspect-[1600/840] overflow-hidden rounded-2xl bg-surface">
            {cover ? (
              <Image src={cover} alt={coverAlt || title} fill sizes="320px" className="object-cover" />
            ) : (
              <p className="absolute inset-0 grid place-items-center px-4 text-center text-[11px] text-muted">
                {article ? 'کاوری نگذاشته‌ای' : 'پس از ساخت مقاله می‌توانی کاور بگذاری'}
              </p>
            )}
          </div>
          <Field label="متن جایگزین کاور" htmlFor="a-cover-alt" className="mt-3" error={errors.coverAlt}>
            <Input
              id="a-cover-alt"
              value={coverAlt}
              onChange={(event) => setCoverAlt(event.target.value)}
              disabled={!canWrite}
            />
          </Field>
          {article && canWrite ? (
            <>
              <input
                ref={coverInput}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadCover(file);
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                block
                className="mt-3"
                disabled={uploading}
                onClick={() => coverInput.current?.click()}
              >
                {uploading ? <Loader2 className="animate-spin" aria-hidden /> : <ImagePlus aria-hidden />}
                {cover ? 'عوض کردن کاور' : 'بارگذاری کاور'}
              </Button>
              <p className="mt-1.5 text-[11px] leading-5 text-muted">افقی، ۱۶۰۰ در ۸۴۰ پیکسل یا بزرگ‌تر</p>
            </>
          ) : null}
        </section>

        <section className="rounded-panel border border-line p-4" aria-live="polite">
          <p className="flex items-center justify-between text-[13px] font-semibold text-ink">
            سئوی صفحه
            <span className="text-[12px] font-medium text-muted tabular">
              {formatNumberFa(passed)} از {formatNumberFa(checks.length)}
            </span>
          </p>
          <ul className="mt-3 grid gap-2">
            {checks.map((check) => (
              <li key={check.label} className="flex items-start gap-2 text-[12px] leading-5">
                {check.ok ? (
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
                ) : (
                  <CircleDashed className="mt-0.5 size-3.5 shrink-0 text-muted-faint" aria-hidden />
                )}
                <span className={check.ok ? 'text-ink-muted' : 'text-muted'}>
                  <span className="sr-only">{check.ok ? 'انجام شده: ' : 'انجام نشده: '}</span>
                  {check.label}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {article && canWrite ? (
          <ConfirmDelete
            path={`/admin/articles/${article.id}`}
            title="حذف مقاله"
            description="مقاله از سایت و نقشهٔ سایت برداشته می‌شود و برنمی‌گردد."
            label="حذف مقاله"
            redirectTo="/admin/articles"
            iconOnly={false}
          />
        ) : null}
      </aside>
    </form>
  );
}
