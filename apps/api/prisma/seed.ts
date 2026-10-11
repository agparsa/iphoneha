import { PrismaClient } from '@prisma/client';
import {
  DEFAULT_INSTALLMENT_TERMS,
  INSTALLMENT_METHODS,
  calcDiscountPercent,
  normalizePhone,
} from '@iphoneha/shared';
import { loadRootEnv } from './seed-env';
import { SAMPLE_PRODUCTS, SEED_COLORS, SEED_SHIPPING_METHODS, SEED_STORAGES } from './seed-data';
import { colorFinish, syncCatalog } from './catalog/sync';
import { syncArticles } from './content/sync';

loadRootEnv();

const prisma = new PrismaClient();

/**
 * A production seed builds the catalogue structure only: every model, colour
 * and capacity with Apple's product photos, but no price — so nothing shows
 * on the storefront until the owner prices it in the admin panel. No sample
 * ratings, no sample coupon and no placeholder admins either. Sample data
 * must never be something a real customer can buy, use or read as genuine.
 */
const PRODUCTION = process.env.NODE_ENV === 'production';

async function seedColorsAndStorages() {
  for (const color of SEED_COLORS) {
    const finish = colorFinish(color.stops);
    await prisma.color.upsert({
      where: { code: color.code },
      create: {
        code: color.code,
        name: color.name,
        nameEn: color.nameEn,
        hex: color.hex,
        finish,
        aliases: color.aliases,
        sortOrder: SEED_COLORS.indexOf(color),
      },
      update: { name: color.name, nameEn: color.nameEn, hex: color.hex, finish, aliases: color.aliases },
    });
  }
  for (const storage of SEED_STORAGES) {
    await prisma.storage.upsert({
      where: { capacityGb: storage.capacityGb },
      create: storage,
      update: { label: storage.label, labelFa: storage.labelFa, sortOrder: storage.sortOrder },
    });
  }
  console.log(`✓ ${SEED_COLORS.length} colours, ${SEED_STORAGES.length} capacities`);
}

async function seedCatalog() {
  const report = await syncCatalog(prisma, (line) => console.log(line));
  console.log(
    `✓ catalogue: ${report.productsCreated.length} models and ${report.variantsCreated} colour × capacity combinations added, ${report.imagesUpdated.length} colours with product photos`,
  );
}

/** Development and tests only: prices, stock and ratings so the store can be browsed and bought from. */
async function seedSamples() {
  if (PRODUCTION) {
    console.log(
      '– sample prices and stock skipped (production): the owner prices each model in the admin panel',
    );
    return;
  }
  const colors = new Map((await prisma.color.findMany()).map((c) => [c.code, c]));
  const storages = new Map((await prisma.storage.findMany()).map((s) => [s.capacityGb, s]));

  for (const sample of SAMPLE_PRODUCTS) {
    const product = await prisma.product.update({
      where: { slug: sample.slug },
      data: {
        isActive: true,
        basePrice: BigInt(sample.basePrice),
        ratingAvg: sample.ratingAvg ?? null,
        ratingCount: sample.ratingCount ?? 0,
      },
    });
    for (const variant of sample.variants) {
      const color = colors.get(variant.color);
      const storage = storages.get(variant.storage);
      if (!color || !storage)
        throw new Error(`unknown colour/storage for ${sample.slug}: ${variant.color}/${variant.storage}`);
      const updated = await prisma.productVariant.update({
        where: {
          productId_colorId_storageId: { productId: product.id, colorId: color.id, storageId: storage.id },
        },
        data: {
          price: BigInt(variant.price),
          compareAtPrice: variant.compareAtPrice ? BigInt(variant.compareAtPrice) : null,
          discountPercent: calcDiscountPercent(variant.price, variant.compareAtPrice ?? null),
          shippingTime: variant.shippingTime,
          isActive: variant.isActive ?? true,
        },
      });
      // Re-seeding must not pull stock below what is already reserved for open
      // orders (the DB enforces `reserved <= stock`), so the sample value is a
      // floor of what those reservations need.
      await prisma.$executeRaw`
        UPDATE "Inventory"
        SET "stock" = GREATEST(${variant.stock}::int, "reserved")
        WHERE "variantId" = ${updated.id}
      `;
    }
    console.log(`✓ ${sample.slug}: ${sample.variants.length} sample variants priced`);
  }
}

async function seedShipping() {
  for (const method of SEED_SHIPPING_METHODS) {
    await prisma.shippingMethod.upsert({
      where: { code: method.code },
      create: {
        ...method,
        baseCost: BigInt(method.baseCost),
        freeThreshold: method.freeThreshold ? BigInt(method.freeThreshold) : null,
      },
      update: {
        name: method.name,
        description: method.description,
        baseCost: BigInt(method.baseCost),
        freeThreshold: method.freeThreshold ? BigInt(method.freeThreshold) : null,
        etaLabel: method.etaLabel,
        allowedProvinces: method.allowedProvinces,
        isActive: true,
      },
    });
  }
  console.log(`✓ ${SEED_SHIPPING_METHODS.length} shipping methods`);
}

async function seedDiscounts() {
  if (PRODUCTION) {
    console.log('– sample coupon skipped (production)');
    return;
  }
  const discount = await prisma.discount.upsert({
    where: { id: 'seed-welcome-discount' },
    create: {
      id: 'seed-welcome-discount',
      name: 'خوش‌آمدگویی ۵٪',
      type: 'PERCENT',
      value: BigInt(5),
      maxDiscount: BigInt(3_000_000),
      minOrderAmount: BigInt(20_000_000),
      isActive: true,
    },
    update: {},
  });
  await prisma.coupon.upsert({
    where: { code: 'WELCOME5' },
    create: { code: 'WELCOME5', discountId: discount.id, usageLimit: 500, perUserLimit: 1, isActive: true },
    update: { isActive: true },
  });
  console.log('✓ discount + coupon WELCOME5');
}

async function seedSettings() {
  const settings: Record<string, unknown> = {
    store: {
      name: 'آیفونی‌ها',
      tagline: 'مرجع تخصصی خرید آیفون',
      phone: '۰۲۱-۹۱۰۰۲۲۳۳',
      supportMobile: null,
      email: null,
      address: '',
      workingHours: 'شنبه تا پنجشنبه، ۱۰ تا ۲۰',
      instagram: null,
      telegram: null,
      announcement: 'ارسال رایگان سفارش‌های بالای ۵۰ میلیون تومان به سراسر ایران',
      legalName: '',
      warrantyMonths: 18,
      returnDays: 7,
      enamadId: null,
      enamadCode: null,
    },
    home: {
      heroBanners: [
        {
          id: 'hero-17-pro-max',
          eyebrow: 'Beyond Brilliant',
          title: 'آیفون ۱۷ پرو مکس',
          subtitle: 'نمایشگر ۶.۹ اینچی، تراشه A19 Pro و باتری ۳۹ ساعته — آکبند با ضمانت اصالت.',
          productSlug: 'iphone-17-pro-max',
          colorCode: 'cosmic-orange',
          ctaLabel: 'مشاهده و خرید',
          theme: 'light',
        },
        {
          id: 'hero-air',
          eyebrow: 'Thin. Light. Air.',
          title: 'آیفون ایر',
          subtitle: 'نازک‌ترین آیفون تاریخ با بدنه تیتانیومی ۵.۶ میلی‌متری.',
          productSlug: 'iphone-air',
          colorCode: 'sky-blue',
          ctaLabel: 'بیشتر بدانید',
          theme: 'light',
        },
        {
          id: 'hero-17',
          eyebrow: 'Brighter than ever',
          title: 'آیفون ۱۷',
          subtitle: 'نمایشگر ۱۲۰ هرتز و حافظه ۲۵۶ گیگابایتی، با قیمت ورودی نسل جدید.',
          productSlug: 'iphone-17',
          colorCode: 'lavender',
          ctaLabel: 'خرید آیفون ۱۷',
          theme: 'light',
        },
      ],
      categorySlugs: ['iphone-17', 'iphone-17-pro', 'iphone-17-pro-max', 'iphone-air'],
    },
    payments: {
      disabledMethods: [],
      installmentTerms: INSTALLMENT_METHODS.map((method) => DEFAULT_INSTALLMENT_TERMS[method]),
    },
    commerce: { freeShippingThreshold: 50_000_000, maxQtyPerItem: 5 },
  };

  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: value as object },
      // in production the owner's settings are never overwritten by a re-seed
      update: PRODUCTION ? {} : { value: value as object },
    });
  }
  console.log('✓ store settings');
}

async function seedAdmins() {
  if (PRODUCTION) {
    // the owner's account is created by deploy/go-live.sh with the owner's own number
    const ownerPhone = normalizePhone(process.env.SEED_ADMIN_PHONE ?? '');
    if (!ownerPhone || ownerPhone === '09120000000') {
      console.log('– no admin created (production): run deploy/go-live.sh to add the owner');
      return;
    }
    const ownerName = process.env.SEED_ADMIN_NAME ?? 'مدیر فروشگاه';
    await prisma.adminUser.upsert({
      where: { phone: ownerPhone },
      create: { phone: ownerPhone, name: ownerName, role: 'SUPER_ADMIN', isActive: true },
      update: { role: 'SUPER_ADMIN', isActive: true },
    });
    console.log(`✓ admin ${ownerPhone} (SUPER_ADMIN)`);
    return;
  }
  const phone = normalizePhone(process.env.SEED_ADMIN_PHONE ?? '09120000000') ?? '09120000000';
  const name = process.env.SEED_ADMIN_NAME ?? 'مدیر فروشگاه';
  await prisma.adminUser.upsert({
    where: { phone },
    create: { phone, name, role: 'SUPER_ADMIN', isActive: true },
    update: { name, role: 'SUPER_ADMIN', isActive: true },
  });

  // A limited account so permission behaviour can be checked from day one.
  const warehousePhone = normalizePhone('09120000001')!;
  await prisma.adminUser.upsert({
    where: { phone: warehousePhone },
    create: { phone: warehousePhone, name: 'انباردار نمونه', role: 'WAREHOUSE', isActive: true },
    update: {},
  });
  console.log(`✓ admin ${phone} (SUPER_ADMIN) and ${warehousePhone} (WAREHOUSE)`);
}

async function seedArticles() {
  const report = await syncArticles(prisma);
  console.log(`✓ magazine: ${report.added.length} article(s)`);
}

async function main() {
  console.log('Seeding iPhoneHa …');
  await seedColorsAndStorages();
  // settings first: new models take their warranty line from the store settings
  await seedSettings();
  await seedCatalog();
  await seedArticles();
  await seedSamples();
  await seedShipping();
  await seedDiscounts();
  await seedAdmins();
  console.log('Done.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
