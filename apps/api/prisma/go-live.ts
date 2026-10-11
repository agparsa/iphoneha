/**
 * One-time switch from the sample store to the real one. Run by
 * deploy/go-live.sh (as the app user) — never by hand with guessed values.
 *
 *   GO_LIVE_ADMIN_PHONE   the owner's mobile; becomes the SUPER_ADMIN
 *   GO_LIVE_ADMIN_NAME    optional display name
 *   GO_LIVE_STORE_PHONE   the public phone printed on the site
 *
 * Always safe to re-run: the owner account and the store phone are upserts,
 * and the sample-data cleanup (ratings, sample coupon, stock) runs only once —
 * a second run can never wipe stock the owner has entered since.
 */
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { normalizePhone, storeSettingsSchema } from '@iphoneha/shared';
import { loadRootEnv } from './seed-env';

loadRootEnv();

const prisma = new PrismaClient();

/** The seed's placeholder staff accounts. */
const SAMPLE_ADMIN_PHONES = ['09120000000', '09120000001'];
/** Sample contact details the seed shipped with — cleared unless the owner changed them. */
const SAMPLE_CONTACT = {
  phone: '۰۲۱-۹۱۰۰۲۲۳۳',
  email: 'support@iphoneha.net',
  address: 'تهران، خیابان ولیعصر، برج نگین، طبقه ۷',
  instagram: 'iphoneha',
};
const GO_LIVE_KEY = 'goLive';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function upsertOwner(): Promise<string> {
  const phone = normalizePhone(required('GO_LIVE_ADMIN_PHONE'));
  if (!phone) throw new Error('GO_LIVE_ADMIN_PHONE is not a valid Iranian mobile number');
  const name = process.env.GO_LIVE_ADMIN_NAME?.trim() || 'مدیر فروشگاه';

  await prisma.adminUser.upsert({
    where: { phone },
    create: { phone, name, role: 'SUPER_ADMIN', isActive: true },
    update: { role: 'SUPER_ADMIN', isActive: true },
  });
  console.log(`✓ owner admin ${phone} (SUPER_ADMIN)`);

  // placeholder staff accounts must not survive: once SMS is live, whoever owns
  // those numbers would receive a working admin login code
  const samples = SAMPLE_ADMIN_PHONES.filter((sample) => sample !== phone);
  const disabled = await prisma.adminUser.updateMany({
    where: { phone: { in: samples }, isActive: true },
    data: { isActive: false },
  });
  const revoked = await prisma.session.updateMany({
    where: { adminUser: { phone: { in: samples } }, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  console.log(`✓ sample admin accounts disabled: ${disabled.count} (sessions revoked: ${revoked.count})`);
  return phone;
}

async function updateStoreContact(): Promise<void> {
  const phone = required('GO_LIVE_STORE_PHONE');
  const row = await prisma.setting.findUnique({ where: { key: 'store' } });
  const current = storeSettingsSchema.parse(row?.value ?? { name: 'آیفونی‌ها', phone });

  const next = storeSettingsSchema.parse({
    ...current,
    phone,
    email: current.email === SAMPLE_CONTACT.email ? null : current.email,
    address: current.address === SAMPLE_CONTACT.address ? '' : current.address,
    instagram: current.instagram === SAMPLE_CONTACT.instagram ? null : current.instagram,
  });
  await prisma.setting.upsert({
    where: { key: 'store' },
    create: { key: 'store', value: next as object },
    update: { value: next as object },
  });
  console.log(`✓ store phone set to ${phone}; sample email, address and instagram cleared`);
}

async function clearSampleDataOnce(): Promise<void> {
  const marker = await prisma.setting.findUnique({ where: { key: GO_LIVE_KEY } });
  if (marker) {
    console.log('– sample data was already cleared on an earlier run — stock and ratings left untouched');
    return;
  }

  const ratings = await prisma.product.updateMany({ data: { ratingAvg: null, ratingCount: 0 } });
  const coupons = await prisma.coupon.updateMany({ where: { code: 'WELCOME5' }, data: { isActive: false } });
  await prisma.discount.updateMany({ where: { id: 'seed-welcome-discount' }, data: { isActive: false } });
  // out of stock until the owner enters real numbers; `reserved` stays valid (stock >= reserved)
  const stock = await prisma.$executeRaw`UPDATE "Inventory" SET "stock" = "reserved"`;

  await prisma.setting.create({
    data: { key: GO_LIVE_KEY, value: { sampleDataClearedAt: new Date().toISOString() } },
  });
  console.log(`✓ sample ratings removed from ${ratings.count} products`);
  console.log(`✓ sample coupon WELCOME5 disabled (${coupons.count})`);
  console.log(`✓ ${stock} variants set to out of stock — enter real stock and prices in the admin panel`);
}

/** The storefront caches settings and catalogue in Redis; bump both so the change shows at once. */
async function bustCaches(): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) return;
  const redis = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: true });
  try {
    await redis.connect();
    await redis.incr('ver:settings');
    await redis.incr('ver:catalog');
    console.log('✓ storefront caches refreshed');
  } catch (error) {
    console.log(`! could not refresh the cache (${String(error)}) — it expires on its own within minutes`);
  } finally {
    redis.disconnect();
  }
}

async function main(): Promise<void> {
  await upsertOwner();
  await updateStoreContact();
  await clearSampleDataOnce();
  await bustCaches();
}

main()
  .catch((error) => {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
