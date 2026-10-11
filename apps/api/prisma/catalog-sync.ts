/**
 * Brings the live catalogue in line with prisma/catalog: new models and
 * colour × capacity combinations (unpriced, so hidden until the owner prices
 * them), fixed specs and Apple's product photos. Never changes prices, stock,
 * names, descriptions or photos the owner uploaded. deploy.sh runs it on every
 * deploy; running it again changes nothing.
 */
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { syncCatalog } from './catalog/sync';
import { loadRootEnv } from './seed-env';

loadRootEnv();

const prisma = new PrismaClient();

async function bustCatalogCache(): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) return;
  const redis = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: true });
  try {
    await redis.connect();
    await redis.incr('ver:catalog');
  } catch (error) {
    console.log(
      `! could not refresh the catalogue cache (${String(error)}) — it expires on its own within minutes`,
    );
  } finally {
    redis.disconnect();
  }
}

async function main(): Promise<void> {
  const report = await syncCatalog(prisma);
  const changed =
    report.colorsCreated.length +
    report.productsCreated.length +
    report.variantsCreated +
    report.specsUpdated.length +
    report.imagesUpdated.length;

  if (report.productsCreated.length) {
    console.log(`✓ new models (hidden until you price them): ${report.productsCreated.join(', ')}`);
  }
  if (report.variantsCreated) {
    console.log(
      `✓ ${report.variantsCreated} colour × capacity combinations added without a price (hidden until priced)`,
    );
  }
  if (report.colorsCreated.length) console.log(`✓ new colours: ${report.colorsCreated.join(', ')}`);
  if (report.specsUpdated.length) console.log(`✓ specs refreshed: ${report.specsUpdated.join(', ')}`);
  if (report.imagesUpdated.length)
    console.log(`✓ product photos set for ${report.imagesUpdated.length} colours`);
  if (report.imagesKept.length) {
    console.log(`– your own photos kept for: ${report.imagesKept.join(', ')}`);
  }
  if (!changed) console.log('✓ catalogue already up to date');
  else await bustCatalogCache();
}

main()
  .catch((error) => {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
