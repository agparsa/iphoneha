import type { Article } from '@prisma/client';
import sharp from 'sharp';
import { ARTICLES } from '../prisma/content/articles';
import { syncArticles } from '../prisma/content/sync';
import { loginAdmin, type Actor } from './utils/actors';
import { resetDb } from './utils/db';
import { closeTestApp, createTestApp, type TestContext } from './utils/test-app';

/** The magazine: storefront reads, the admin editor, the sitemap and the release sync. */
describe('Articles', () => {
  let ctx: TestContext;
  let admin: Actor;

  beforeAll(async () => {
    ctx = await createTestApp();
    // the magazine as a fresh install has it — every shipped article, in the order articles.ts lists
    // them — however many releases this test database has already synced
    await ctx.prisma.article.deleteMany({});
    await ctx.prisma.setting.deleteMany({ where: { key: 'content.seeded-articles' } });
    await syncArticles(ctx.prisma);
  });
  afterAll(async () => {
    await closeTestApp(ctx);
  });

  beforeEach(async () => {
    await resetDb(ctx.prisma, ctx.redis);
    admin = await loginAdmin(ctx, '09120000000');
  });

  const draft = {
    slug: 'test-article',
    title: 'راهنمای آزمایشی خرید آیفون',
    excerpt: 'این خلاصهٔ یک مقالهٔ آزمایشی است که زیر عنوان در نتیجهٔ جست‌وجوی گوگل دیده می‌شود.',
    body: `## بخش اول\n\n${'این متن آزمایشی برای بدنهٔ مقاله است و باید به اندازهٔ کافی بلند باشد. '.repeat(8)}`,
    seoTitle: 'راهنمای آزمایشی',
    focusKeyword: 'خرید آیفون',
    coverAlt: null,
    status: 'DRAFT',
  };

  const create = (body: Record<string, unknown> = draft) =>
    admin.agent.post('/api/admin/articles').set('x-csrf-token', admin.csrf).send(body);

  it('lists the published articles that ship with the store, newest first', async () => {
    const { body } = await ctx.http().get('/api/articles').expect(200);
    expect(body.total).toBe(ARTICLES.length);
    expect(body.items.map((a: { slug: string }) => a.slug)).toEqual(ARTICLES.map((a) => a.slug));
    const [first] = body.items;
    expect(first).toMatchObject({ title: ARTICLES[0]!.title, focusKeyword: ARTICLES[0]!.focusKeyword });
    expect(first.readingMinutes).toBeGreaterThanOrEqual(3);
    // the list is for teasers; the body only comes with the article itself
    expect(first.body).toBeUndefined();

    const paged = await ctx.http().get('/api/articles?page=2&pageSize=2').expect(200);
    expect(paged.body).toMatchObject({ page: 2, pageSize: 2, totalPages: Math.ceil(ARTICLES.length / 2) });
    expect(paged.body.items).toHaveLength(2);
  });

  it('serves one article with its Markdown body', async () => {
    const [article] = ARTICLES;
    const { body } = await ctx.http().get(`/api/articles/${article!.slug}`).expect(200);
    expect(body).toMatchObject({ slug: article!.slug, seoTitle: article!.seoTitle, body: article!.body });
    await ctx.http().get('/api/articles/no-such-article').expect(404);
  });

  it('keeps a draft off the storefront until it is published', async () => {
    const created = await create().expect(201);
    expect(created.body).toMatchObject({ status: 'DRAFT', statusLabel: 'پیش‌نویس', publishedAt: null });
    await ctx.http().get('/api/articles/test-article').expect(404);

    const published = await admin.agent
      .patch(`/api/admin/articles/${created.body.id}`)
      .set('x-csrf-token', admin.csrf)
      .send({ ...draft, status: 'PUBLISHED' })
      .expect(200);
    expect(published.body.publishedAt).toEqual(expect.any(String));
    await ctx.http().get('/api/articles/test-article').expect(200);

    // a later edit moves updatedAt but keeps the publication date
    const edited = await admin.agent
      .patch(`/api/admin/articles/${created.body.id}`)
      .set('x-csrf-token', admin.csrf)
      .send({ ...draft, title: 'راهنمای آزمایشی خرید آیفون، ویرایش دوم', status: 'PUBLISHED' })
      .expect(200);
    expect(edited.body.publishedAt).toBe(published.body.publishedAt);
  });

  it('puts a newly published article in the sitemap right away', async () => {
    const before = await ctx.http().get('/api/storefront/sitemap').expect(200);
    expect(before.body.articles.map((a: { slug: string }) => a.slug)).not.toContain('test-article');

    await create({ ...draft, status: 'PUBLISHED' }).expect(201);
    const after = await ctx.http().get('/api/storefront/sitemap').expect(200);
    expect(after.body.articles.map((a: { slug: string }) => a.slug)).toContain('test-article');
    expect(after.body.articles).toHaveLength(ARTICLES.length + 1);
  });

  it('validates the editor and refuses a slug that is taken', async () => {
    const invalid = await create({ ...draft, excerpt: 'کوتاه', body: 'کوتاه' }).expect(400);
    expect(Object.keys(invalid.body.details.fields)).toEqual(expect.arrayContaining(['excerpt', 'body']));

    const taken = await create({ ...draft, slug: ARTICLES[0]!.slug }).expect(409);
    expect(taken.body.code).toBe('SLUG_TAKEN');
  });

  it('stores an uploaded cover as WebP and deletes the article with an audit trail', async () => {
    const created = await create().expect(201);
    const png = await sharp({
      create: { width: 2400, height: 1260, channels: 3, background: { r: 14, g: 138, b: 92 } },
    })
      .png()
      .toBuffer();

    const covered = await admin.agent
      .post(`/api/admin/articles/${created.body.id}/cover`)
      .set('x-csrf-token', admin.csrf)
      .attach('file', png, { filename: 'cover.png', contentType: 'image/png' })
      .expect(201);
    expect(covered.body.coverUrl).toMatch(new RegExp(`/articles/${created.body.id}/[\\w-]+\\.webp$`));

    await admin.agent
      .delete(`/api/admin/articles/${created.body.id}`)
      .set('x-csrf-token', admin.csrf)
      .expect(200);
    expect(await ctx.prisma.article.findUnique({ where: { id: created.body.id } })).toBeNull();

    const actions = (
      await ctx.prisma.auditLog.findMany({
        where: { entityId: created.body.id },
        orderBy: { createdAt: 'asc' },
      })
    ).map((entry) => entry.action);
    expect(actions).toEqual(['article.create', 'article.cover', 'article.delete']);
    const logged = await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'article.create' } });
    // the log keeps the length of the body, not the whole text
    expect(logged.after).toMatchObject({ slug: 'test-article', bodyLength: draft.body.trim().length });
    expect(JSON.stringify(logged.after)).not.toContain('بخش اول');
  });

  it('keeps the editor to roles with content permissions', async () => {
    await ctx.prisma.adminUser.create({ data: { phone: '09120000002', name: 'پشتیبان', role: 'SUPPORT' } });
    const support = await loginAdmin(ctx, '09120000002');
    const warehouse = await loginAdmin(ctx, '09120000001');

    await ctx.http().get('/api/admin/articles').expect(401);
    await support.agent.get('/api/admin/articles').expect(403);
    await warehouse.agent.get('/api/admin/articles').expect(403);
    await support.agent.post('/api/admin/articles').set('x-csrf-token', support.csrf).send(draft).expect(403);

    const list = await admin.agent.get('/api/admin/articles').expect(200);
    expect(list.body).toHaveLength(ARTICLES.length);
  });

  describe('release sync', () => {
    const [edited, removed] = ARTICLES;
    let original: Article;
    let shippedBefore: unknown;

    beforeEach(async () => {
      original = await ctx.prisma.article.findUniqueOrThrow({ where: { slug: removed!.slug } });
      shippedBefore = (
        await ctx.prisma.setting.findUniqueOrThrow({ where: { key: 'content.seeded-articles' } })
      ).value;
    });

    afterEach(async () => {
      // put the shipped articles back exactly as the seed left them (the list is ordered by publishedAt)
      await ctx.prisma.article.update({ where: { slug: edited!.slug }, data: { title: edited!.title } });
      await ctx.prisma.article.deleteMany({ where: { slug: removed!.slug } });
      await ctx.prisma.article.create({ data: original });
      await ctx.prisma.setting.update({
        where: { key: 'content.seeded-articles' },
        data: { value: shippedBefore as string[] },
      });
    });

    it('never overwrites an edited article or brings back a deleted one', async () => {
      await ctx.prisma.article.update({
        where: { slug: edited!.slug },
        data: { title: 'عنوانی که مدیر نوشت' },
      });
      await ctx.prisma.article.delete({ where: { slug: removed!.slug } });

      const report = await syncArticles(ctx.prisma);
      expect(report.added).toEqual([]);
      expect((await ctx.prisma.article.findUniqueOrThrow({ where: { slug: edited!.slug } })).title).toBe(
        'عنوانی که مدیر نوشت',
      );
      expect(await ctx.prisma.article.findUnique({ where: { slug: removed!.slug } })).toBeNull();
    });

    it('adds an article a release ships for the first time', async () => {
      await ctx.prisma.article.delete({ where: { slug: removed!.slug } });
      const row = await ctx.prisma.setting.findUniqueOrThrow({ where: { key: 'content.seeded-articles' } });
      const shipped = (row.value as string[]).filter((slug) => slug !== removed!.slug);
      await ctx.prisma.setting.update({
        where: { key: 'content.seeded-articles' },
        data: { value: shipped },
      });

      const report = await syncArticles(ctx.prisma);
      expect(report.added).toEqual([removed!.slug]);
      const restored = await ctx.prisma.article.findUniqueOrThrow({ where: { slug: removed!.slug } });
      expect(restored).toMatchObject({ status: 'PUBLISHED', title: removed!.title });
      expect(restored.publishedAt).toBeInstanceOf(Date);
    });
  });
});
