import { existsSync } from 'node:fs';
import path from 'node:path';
import { ARTICLES, type SeedArticle } from '../../../../prisma/content/articles';

/**
 * Every article a release ships must pass the admin editor's SEO checklist
 * (apps/web/src/lib/article-seo.ts) and link only to pages that exist — a
 * broken link or a thin page would go out to every install unnoticed.
 */

/** The editor's loose Persian comparison: Arabic ي/ك, half-spaces and Markdown marks don't matter. */
function normalizeFa(text: string): string {
  return text
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[‌‏‎]/g, ' ')
    .replace(/[*_`#>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const contains = (haystack: string, needle: string) => normalizeFa(haystack).includes(normalizeFa(needle));

function wordCount(markdown: string): number {
  return markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`|-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

const firstParagraph = (markdown: string) =>
  markdown
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .find((block) => block && !block.startsWith('#') && !block.startsWith('|')) ?? '';

const headings = (markdown: string) =>
  markdown
    .split('\n')
    .filter((line) => /^#{2,3}\s/.test(line))
    .map((line) => line.replace(/^#+\s*/, ''));

const internalLinks = (markdown: string) =>
  [...markdown.matchAll(/\]\((\/[^)]*)\)/g)].map((match) => match[1]!);

/** Storefront pages an article may link to (besides other articles). */
const PAGES = new Set([
  '/',
  '/installments',
  '/installments/cheque',
  '/installments/safte',
  '/mag',
  '/shop',
  '/guide',
  '/about',
  '/contact',
  '/terms',
  '/privacy',
]);
const slugs = new Set(ARTICLES.map((article) => article.slug));
const coversDir = path.resolve(__dirname, '../../../../../web/public');

function effectiveTitle(article: SeedArticle): string {
  return article.seoTitle?.trim() || `${article.title.trim()} | آیفونی‌ها`;
}

describe('articles that ship with a release', () => {
  it('have unique, short Latin slugs', () => {
    expect(slugs.size).toBe(ARTICLES.length);
    for (const { slug } of ARTICLES) {
      expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(slug.length).toBeLessThanOrEqual(60);
    }
  });

  describe.each(ARTICLES.map((article) => [article.slug, article] as const))('%s', (_slug, article) => {
    const keyword = article.focusKeyword;

    it('puts the focus keyword in the title, SEO title, summary, first paragraph and a heading', () => {
      expect(keyword.trim().length).toBeGreaterThan(0);
      expect(contains(article.title, keyword)).toBe(true);
      expect(contains(effectiveTitle(article), keyword)).toBe(true);
      expect(contains(article.excerpt, keyword)).toBe(true);
      expect(contains(firstParagraph(article.body), keyword)).toBe(true);
      expect(headings(article.body).some((heading) => contains(heading, keyword))).toBe(true);
    });

    it('fits the search result: a 30–70 character title and a 110–175 character summary', () => {
      expect(effectiveTitle(article).length).toBeGreaterThanOrEqual(30);
      expect(effectiveTitle(article).length).toBeLessThanOrEqual(70);
      expect(article.excerpt.trim().length).toBeGreaterThanOrEqual(110);
      expect(article.excerpt.trim().length).toBeLessThanOrEqual(175);
    });

    it('is a full article: 600+ words, a cover with its alt text', () => {
      expect(wordCount(article.body)).toBeGreaterThanOrEqual(600);
      expect(article.coverAlt.trim().length).toBeGreaterThan(0);
      expect(existsSync(path.join(coversDir, article.coverUrl))).toBe(true);
    });

    it('links to at least two site pages, and only to pages that exist', () => {
      const links = internalLinks(article.body);
      expect(links.length).toBeGreaterThanOrEqual(2);
      for (const link of links) {
        const target = link.split('#')[0]!;
        const article = /^\/mag\/([a-z0-9-]+)$/.exec(target)?.[1];
        expect({ link, exists: article ? slugs.has(article) : PAGES.has(target) }).toEqual({
          link,
          exists: true,
        });
      }
    });

    it('never states the store’s own terms, which live in the settings', () => {
      // a fee, down payment or month count here could contradict the live terms
      expect(article.body).not.toMatch(/آیفونی‌ها[^.\n]{0,80}(٪|درصد|ماهه)/);
    });
  });
});
