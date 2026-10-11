import { Injectable } from '@nestjs/common';
import type { Article, Prisma } from '@prisma/client';
import {
  ARTICLE_STATUS_LABELS,
  type AdminArticleDto,
  type ArticleDto,
  type ArticleSummaryDto,
  type Paginated,
  type UpsertArticleInput,
} from '@iphoneha/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CacheService } from '../../infra/redis/cache.service';
import { Errors } from '../../common/errors';
import type { ClientInfo } from '../../common/utils';
import type { AuthAdmin } from '../../types/express';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';

/** Persian prose reads at roughly 200 words a minute. */
export function readingMinutes(body: string): number {
  const words = body
    .replace(/[#>*_`[\]()!|-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function toSummary(article: Article): ArticleSummaryDto {
  return {
    slug: article.slug,
    title: article.title,
    excerpt: article.excerpt,
    coverUrl: article.coverUrl,
    coverAlt: article.coverAlt,
    focusKeyword: article.focusKeyword,
    readingMinutes: readingMinutes(article.body),
    publishedAt: (article.publishedAt ?? article.createdAt).toISOString(),
    updatedAt: article.updatedAt.toISOString(),
  };
}

function toAdmin(article: Article): AdminArticleDto {
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    excerpt: article.excerpt,
    body: article.body,
    coverUrl: article.coverUrl,
    coverAlt: article.coverAlt,
    seoTitle: article.seoTitle,
    focusKeyword: article.focusKeyword,
    status: article.status,
    statusLabel: ARTICLE_STATUS_LABELS[article.status],
    readingMinutes: readingMinutes(article.body),
    publishedAt: article.publishedAt?.toISOString() ?? null,
    createdAt: article.createdAt.toISOString(),
    updatedAt: article.updatedAt.toISOString(),
  };
}

/** What the audit log keeps of an article: everything but the (long) body. */
function auditView(article: Article) {
  const { body, ...rest } = article;
  return { ...rest, bodyLength: body.length };
}

const PUBLISHED: Prisma.ArticleWhereInput = { status: 'PUBLISHED' };

/** Cache namespace of everything built from the article list (the sitemap). */
export const ARTICLES_CACHE_NAMESPACE = 'articles';

@Injectable()
export class ArticlesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly cache: CacheService,
  ) {}

  /** A new, edited or removed article shows up in the sitemap right away. */
  private changed(): Promise<number> {
    return this.cache.bumpVersion(ARTICLES_CACHE_NAMESPACE);
  }

  // ─── storefront ────────────────────────────────────────────────────────────

  async listPublished(page: number, pageSize: number): Promise<Paginated<ArticleSummaryDto>> {
    const [rows, total] = await Promise.all([
      this.prisma.article.findMany({
        where: PUBLISHED,
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.article.count({ where: PUBLISHED }),
    ]);
    return {
      items: rows.map(toSummary),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async bySlug(slug: string): Promise<ArticleDto> {
    const article = await this.prisma.article.findFirst({ where: { slug, ...PUBLISHED } });
    if (!article) throw Errors.notFound('مقاله پیدا نشد');
    return { ...toSummary(article), body: article.body, seoTitle: article.seoTitle };
  }

  /** For the sitemap: every published article with its last change and cover. */
  async sitemapEntries(): Promise<{ slug: string; updatedAt: string; image: string | null }[]> {
    const rows = await this.prisma.article.findMany({
      where: PUBLISHED,
      select: { slug: true, updatedAt: true, coverUrl: true },
      orderBy: { publishedAt: 'desc' },
    });
    return rows.map((row) => ({
      slug: row.slug,
      updatedAt: row.updatedAt.toISOString(),
      image: row.coverUrl,
    }));
  }

  // ─── admin ─────────────────────────────────────────────────────────────────

  async adminList(): Promise<AdminArticleDto[]> {
    const rows = await this.prisma.article.findMany({ orderBy: [{ updatedAt: 'desc' }] });
    return rows.map(toAdmin);
  }

  async adminGet(id: string): Promise<AdminArticleDto> {
    const article = await this.prisma.article.findUnique({ where: { id } });
    if (!article) throw Errors.notFound('مقاله پیدا نشد');
    return toAdmin(article);
  }

  private async assertSlugFree(slug: string, exceptId?: string): Promise<void> {
    const taken = await this.prisma.article.findUnique({ where: { slug }, select: { id: true } });
    if (taken && taken.id !== exceptId) {
      throw Errors.conflict('SLUG_TAKEN', 'این نشانی (اسلاگ) برای مقالهٔ دیگری استفاده شده است');
    }
  }

  async create(input: UpsertArticleInput, admin: AuthAdmin, client: ClientInfo): Promise<AdminArticleDto> {
    await this.assertSlugFree(input.slug);
    const article = await this.prisma.article.create({
      data: { ...input, publishedAt: input.status === 'PUBLISHED' ? new Date() : null },
    });
    await this.changed();
    await this.audit.log({
      adminUserId: admin.id,
      action: 'article.create',
      entityType: 'Article',
      entityId: article.id,
      after: auditView(article),
      client,
    });
    return toAdmin(article);
  }

  async update(
    id: string,
    input: UpsertArticleInput,
    admin: AuthAdmin,
    client: ClientInfo,
  ): Promise<AdminArticleDto> {
    const before = await this.prisma.article.findUnique({ where: { id } });
    if (!before) throw Errors.notFound('مقاله پیدا نشد');
    if (input.slug !== before.slug) await this.assertSlugFree(input.slug, id);

    const article = await this.prisma.article.update({
      where: { id },
      data: {
        ...input,
        // the first time it goes out is its publication date; later edits only move updatedAt
        ...(input.status === 'PUBLISHED' && !before.publishedAt ? { publishedAt: new Date() } : {}),
      },
    });
    await this.changed();
    await this.audit.log({
      adminUserId: admin.id,
      action: 'article.update',
      entityType: 'Article',
      entityId: id,
      before: auditView(before),
      after: auditView(article),
      client,
    });
    return toAdmin(article);
  }

  async remove(id: string, admin: AuthAdmin, client: ClientInfo): Promise<{ ok: true }> {
    const before = await this.prisma.article.findUnique({ where: { id } });
    if (!before) throw Errors.notFound('مقاله پیدا نشد');
    await this.prisma.article.delete({ where: { id } });
    if (before.coverKey) await this.storage.delete(before.coverKey);
    await this.changed();
    await this.audit.log({
      adminUserId: admin.id,
      action: 'article.delete',
      entityType: 'Article',
      entityId: id,
      before: auditView(before),
      client,
    });
    return { ok: true };
  }

  async setCover(
    id: string,
    file: { buffer: Buffer; mimetype: string; size: number },
    admin: AuthAdmin,
    client: ClientInfo,
  ): Promise<AdminArticleDto> {
    const before = await this.prisma.article.findUnique({ where: { id } });
    if (!before) throw Errors.notFound('مقاله پیدا نشد');
    const stored = await this.storage.putArticleCover(id, file);
    const article = await this.prisma.article.update({
      where: { id },
      data: { coverUrl: stored.url, coverKey: stored.key },
    });
    if (before.coverKey) await this.storage.delete(before.coverKey);
    await this.changed();
    await this.audit.log({
      adminUserId: admin.id,
      action: 'article.cover',
      entityType: 'Article',
      entityId: id,
      before: { coverUrl: before.coverUrl },
      after: { coverUrl: article.coverUrl },
      client,
    });
    return toAdmin(article);
  }
}
