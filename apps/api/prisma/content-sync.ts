/**
 * Adds the magazine articles that shipped with this release and were never
 * inserted before. Never changes or restores an article the owner edited or
 * deleted. deploy.sh runs it on every deploy; running it again changes nothing.
 */
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { syncArticles } from './content/sync';
import { loadRootEnv } from './seed-env';

loadRootEnv();

const prisma = new PrismaClient();

/**
 * The API caches the magazine (and the sitemap keys on its version) in Redis,
 * which outlives the restart that follows — so the new articles would only
 * show up once those entries expire. Same namespace as ArticlesService.
 */
async function bustArticlesCache(): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) return;
  const redis = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: true });
  try {
    await redis.connect();
    await redis.incr('ver:articles');
  } catch (error) {
    console.log(
      `! could not refresh the magazine cache (${String(error)}) — it expires on its own within minutes`,
    );
  } finally {
    redis.disconnect();
  }
}

async function main(): Promise<void> {
  const report = await syncArticles(prisma, (line) => console.log(line));
  if (report.added.length) {
    await bustArticlesCache();
    console.log(`✓ magazine: ${report.added.length} new article(s) published`);
  } else {
    console.log('✓ magazine already up to date');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
