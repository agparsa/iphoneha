import { formatNumberFa } from '@iphoneha/shared';

/**
 * The on-page checks the article editor shows next to the text — the same
 * things a search-engine audit looks at, in words the owner can act on.
 */

export interface ArticleDraft {
  title: string;
  seoTitle: string;
  excerpt: string;
  body: string;
  slug: string;
  focusKeyword: string;
  coverAlt: string;
  hasCover: boolean;
}

export interface SeoCheck {
  ok: boolean;
  label: string;
}

/** Persian text compared loosely: Arabic ي/ك, half-spaces and extra spaces don't matter. */
export function normalizeFa(text: string): string {
  return text
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[‌‏‎]/g, ' ')
    .replace(/[*_`#>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function contains(haystack: string, needle: string): boolean {
  const key = normalizeFa(needle);
  return key.length > 0 && normalizeFa(haystack).includes(key);
}

/** The title Google shows: the SEO title as written, or the title with the store's name. */
export function effectiveTitle(draft: Pick<ArticleDraft, 'title' | 'seoTitle'>): string {
  return draft.seoTitle.trim() || `${draft.title.trim()} | آیفونی‌ها`;
}

export function wordCount(markdown: string): number {
  return markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`|-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

function firstParagraph(markdown: string): string {
  return (
    markdown
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .find((block) => block && !block.startsWith('#') && !block.startsWith('|')) ?? ''
  );
}

function headings(markdown: string): string[] {
  return markdown
    .split('\n')
    .filter((line) => /^#{2,3}\s/.test(line))
    .map((line) => line.replace(/^#+\s*/, ''));
}

export function articleSeoChecks(draft: ArticleDraft): SeoCheck[] {
  const keyword = draft.focusKeyword.trim();
  const title = effectiveTitle(draft);
  const words = wordCount(draft.body);
  const internalLinks = (draft.body.match(/\]\(\/[^)]*\)/g) ?? []).length;

  return [
    { ok: keyword.length > 0, label: 'کلمهٔ کلیدی اصلی تعیین شده است' },
    { ok: contains(draft.title, keyword), label: 'کلمهٔ کلیدی در عنوان مقاله آمده است' },
    { ok: contains(title, keyword), label: 'کلمهٔ کلیدی در عنوان سئو آمده است' },
    {
      ok: contains(draft.excerpt, keyword),
      label: 'کلمهٔ کلیدی در خلاصه (توضیح زیر عنوان در گوگل) آمده است',
    },
    { ok: contains(firstParagraph(draft.body), keyword), label: 'کلمهٔ کلیدی در پاراگراف اول آمده است' },
    {
      ok: headings(draft.body).some((heading) => contains(heading, keyword)),
      label: 'کلمهٔ کلیدی دست‌کم در یک تیتر (##) آمده است',
    },
    {
      ok: title.length >= 30 && title.length <= 70,
      label: `عنوان سئو ۳۰ تا ۷۰ نویسه است (الان ${formatNumberFa(title.length)})`,
    },
    {
      ok: draft.excerpt.trim().length >= 110 && draft.excerpt.trim().length <= 175,
      label: `خلاصه ۱۱۰ تا ۱۷۵ نویسه است (الان ${formatNumberFa(draft.excerpt.trim().length)})`,
    },
    { ok: words >= 600, label: `متن دست‌کم ۶۰۰ کلمه است (الان ${formatNumberFa(words)})` },
    {
      ok: internalLinks >= 2,
      label: `دست‌کم ۲ لینک به صفحه‌های سایت دارد (الان ${formatNumberFa(internalLinks)})`,
    },
    { ok: draft.hasCover && draft.coverAlt.trim().length > 0, label: 'تصویر کاور و متن جایگزین آن را دارد' },
    {
      ok: /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug) && draft.slug.length <= 60,
      label: 'نشانی لاتین، کوتاه و با خط تیره است',
    },
  ];
}
