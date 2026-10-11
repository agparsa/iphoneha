import type { PrismaClient } from '@prisma/client';
import { ARTICLES } from './articles';

/** Setting row listing every article a release has ever inserted. */
const SEEDED_KEY = 'content.seeded-articles';

export interface ContentSyncReport {
  added: string[];
}

/**
 * Inserts the magazine articles that ship with the code — once. An article
 * the owner edited keeps his version, and one he deleted is not brought back:
 * a release only adds slugs it has never inserted before.
 */
export async function syncArticles(
  prisma: PrismaClient,
  log: (line: string) => void = () => {},
): Promise<ContentSyncReport> {
  const row = await prisma.setting.findUnique({ where: { key: SEEDED_KEY } });
  const seeded = new Set(Array.isArray(row?.value) ? (row.value as string[]) : []);
  const existing = new Set((await prisma.article.findMany({ select: { slug: true } })).map((a) => a.slug));

  const added: string[] = [];
  const now = Date.now();
  for (const [index, article] of ARTICLES.entries()) {
    if (seeded.has(article.slug)) continue;
    seeded.add(article.slug);
    if (existing.has(article.slug)) continue;
    await prisma.article.create({
      data: {
        ...article,
        status: 'PUBLISHED',
        // the list shows them in the order they are written in articles.ts
        publishedAt: new Date(now - index * 60_000),
      },
    });
    added.push(article.slug);
    log(`  + ${article.slug}`);
  }

  await prisma.setting.upsert({
    where: { key: SEEDED_KEY },
    create: { key: SEEDED_KEY, value: [...seeded] },
    update: { value: [...seeded] },
  });
  return { added };
}
