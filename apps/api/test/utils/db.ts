import { Prisma } from '@prisma/client';
import { DEFAULT_INSTALLMENT_TERMS, INSTALLMENT_METHODS } from '@iphoneha/shared';
import type Redis from 'ioredis';
import type { PrismaService } from '../../src/infra/prisma/prisma.service';
import { CATALOG } from '../../prisma/catalog/catalog';
import { ARTICLES } from '../../prisma/content/articles';
import { catalogSku } from '../../prisma/catalog/sync';
import { SAMPLE_PRODUCTS, SEED_SHIPPING_METHODS } from '../../prisma/seed-data';

const TRANSACTIONAL_TABLES = [
  'InstallmentPayment',
  'Cheque',
  'PromissoryNote',
  'Installment',
  'InstallmentContract',
  'DeviceUnit',
  'PriceChange',
  'CustomerNote',
  'CreditRequest',
  'AuditLog',
  'IdempotencyRecord',
  'CouponRedemption',
  'PaymentTransaction',
  'Payment',
  'OrderStatusHistory',
  'InventoryReservation',
  'InventoryMovement',
  'OrderItem',
  'Order',
  'CartItem',
  'Cart',
  'Address',
  'Session',
  'OtpCode',
  'User',
];

/** Clears everything a test can create and restores seeded stock levels. */
export async function resetDb(prisma: PrismaService, redis?: Redis): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TRANSACTIONAL_TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
  await prisma.$executeRaw`UPDATE "Inventory" SET "reserved" = 0, "sold" = 0`;
  await prisma.$executeRaw`UPDATE "Coupon" SET "usedCount" = 0`;

  // Remove catalogue rows created by tests so suites stay independent.
  const seededSlugs = CATALOG.map((p) => p.slug);
  await prisma.product.deleteMany({ where: { slug: { notIn: seededSlugs } } });
  await prisma.article.deleteMany({ where: { slug: { notIn: ARTICLES.map((a) => a.slug) } } });
  await prisma.coupon.deleteMany({ where: { code: { not: 'WELCOME5' } } });
  await prisma.shippingMethod.deleteMany({
    where: { code: { notIn: SEED_SHIPPING_METHODS.map((m) => m.code) } },
  });
  await prisma.adminUser.deleteMany({ where: { phone: { notIn: ['09120000000', '09120000001'] } } });
  await prisma.discount.deleteMany({ where: { id: { not: 'seed-welcome-discount' } } });
  // payment settings as seeded (every method on, default terms): a suite that disables a method or lifts a ceiling does not leak into the next
  const payments = {
    disabledMethods: [],
    installmentTerms: INSTALLMENT_METHODS.map((method) => DEFAULT_INSTALLMENT_TERMS[method]),
  } as unknown as Prisma.InputJsonValue;
  await prisma.setting.upsert({
    where: { key: 'payments' },
    create: { key: 'payments', value: payments },
    update: { value: payments },
  });

  // Restore the seeded stock for every variant.
  const variants = await prisma.productVariant.findMany({ select: { id: true, sku: true } });
  const stockBySku = new Map<string, number>();
  for (const product of SAMPLE_PRODUCTS) {
    for (const variant of product.variants) {
      stockBySku.set(catalogSku(product.slug, variant.storage, variant.color), variant.stock);
    }
  }
  for (const variant of variants) {
    const stock = stockBySku.get(variant.sku);
    if (stock !== undefined) {
      await prisma.inventory.update({ where: { variantId: variant.id }, data: { stock } });
    }
  }

  if (redis) await redis.flushdb();
}

export async function setStock(prisma: PrismaService, variantId: string, stock: number): Promise<void> {
  await prisma.inventory.update({ where: { variantId }, data: { stock, reserved: 0 } });
}

export async function stockOf(prisma: PrismaService, variantId: string) {
  const inventory = await prisma.inventory.findUniqueOrThrow({ where: { variantId } });
  return {
    stock: inventory.stock,
    reserved: inventory.reserved,
    sold: inventory.sold,
    available: inventory.stock - inventory.reserved,
  };
}

export const sql = Prisma.sql;
