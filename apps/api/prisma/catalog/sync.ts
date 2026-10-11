import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { buildSearchText, formatNumberFa, storeSettingsSchema } from '@iphoneha/shared';
import { deleteMedia, putMedia } from '../media-store';
import { SEED_COLORS, SEED_STORAGES } from '../seed-data';
import { CATALOG } from './catalog';
import { LEGACY_SPECS } from './legacy';

interface ManifestEntry {
  file: string;
  kind: 'DEVICE' | 'DETAIL';
  width: number;
  height: number;
}
type Manifest = Record<string, Record<string, ManifestEntry[]>>;

export interface SyncReport {
  colorsCreated: string[];
  productsCreated: string[];
  variantsCreated: number;
  specsUpdated: string[];
  /** `slug/colour` whose images were set to the official ones */
  imagesUpdated: string[];
  /** `slug/colour` left alone because the owner uploaded their own photos */
  imagesKept: string[];
}

export const IMAGES_DIR = join(__dirname, 'images');

export function readManifest(): Manifest {
  return JSON.parse(readFileSync(join(IMAGES_DIR, 'manifest.json'), 'utf8')) as Manifest;
}

/** Same SKU scheme the seed has always used, e.g. IPHONE-17-PRO-256-COSMIC. */
export function catalogSku(slug: string, capacityGb: number, colorCode: string): string {
  return `${slug.replace(/[^a-z0-9]+/g, '-').toUpperCase()}-${capacityGb}-${colorCode.slice(0, 6).toUpperCase()}`;
}

export function colorFinish(stops: { offset: number; color: string }[]): string {
  return `linear-gradient(145deg, ${stops.map((s) => `${s.color} ${s.offset}%`).join(', ')})`;
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Specs as comparable text: jsonb does not keep key order, so compare pairs. */
const specsText = (specs: unknown) =>
  Array.isArray(specs)
    ? JSON.stringify(specs.map((s: { key?: unknown; value?: unknown }) => [s?.key, s?.value]))
    : '';

/**
 * Brings the database in line with the official catalogue, without ever
 * touching what the owner decides:
 *
 *  - missing colours, capacities, models and colour × capacity combinations are
 *    created — without a price, so hidden from the storefront until the owner
 *    prices them (a new model also starts inactive);
 *  - specs are refreshed only while they are still exactly what an earlier
 *    seed wrote; names, descriptions, prices, stock and flags are never changed;
 *  - each colour gets Apple's product renders, replacing the generated mockups
 *    of older seeds — unless the owner has uploaded photos for that colour.
 *
 * Safe to run on every deploy: a second run changes nothing.
 */
export async function syncCatalog(
  prisma: PrismaClient,
  log: (line: string) => void = () => {},
): Promise<SyncReport> {
  const report: SyncReport = {
    colorsCreated: [],
    productsCreated: [],
    variantsCreated: 0,
    specsUpdated: [],
    imagesUpdated: [],
    imagesKept: [],
  };
  const manifest = readManifest();

  // ── colours and capacities: create what is missing, never edit ─────────────
  const existingColors = new Set(
    (await prisma.color.findMany({ select: { code: true } })).map((c) => c.code),
  );
  for (const [index, color] of SEED_COLORS.entries()) {
    if (existingColors.has(color.code)) continue;
    await prisma.color.create({
      data: {
        code: color.code,
        name: color.name,
        nameEn: color.nameEn,
        hex: color.hex,
        finish: colorFinish(color.stops),
        aliases: color.aliases,
        sortOrder: index,
      },
    });
    report.colorsCreated.push(color.code);
  }
  const existingStorages = new Set(
    (await prisma.storage.findMany({ select: { capacityGb: true } })).map((s) => s.capacityGb),
  );
  for (const storage of SEED_STORAGES) {
    if (!existingStorages.has(storage.capacityGb)) await prisma.storage.create({ data: storage });
  }

  const colors = new Map((await prisma.color.findMany()).map((c) => [c.code, c]));
  const storages = new Map((await prisma.storage.findMany()).map((s) => [s.capacityGb, s]));

  const settings = await prisma.setting.findUnique({ where: { key: 'store' } });
  const store = storeSettingsSchema.safeParse(settings?.value ?? {});
  const months = store.success ? store.data.warrantyMonths : 18;
  const storeName = store.success ? store.data.name : 'آیفونی‌ها';
  const warranty = months > 0 ? `${formatNumberFa(months)} ماه گارانتی ${storeName}` : 'ضمانت اصالت کالا';

  for (const item of CATALOG) {
    // ── the model ────────────────────────────────────────────────────────────
    let product = await prisma.product.findUnique({ where: { slug: item.slug } });
    if (!product) {
      product = await prisma.product.create({
        data: {
          slug: item.slug,
          name: item.name,
          nameEn: item.nameEn,
          model: item.model,
          series: item.series,
          releaseYear: item.releaseYear,
          tagline: item.tagline,
          shortDescription: item.shortDescription,
          description: item.description,
          warranty,
          registryStatus: item.registryStatus,
          // a basePrice of 0 marks "never priced": the first price the owner
          // enters puts the model on the storefront (admin products service)
          basePrice: 0n,
          specs: item.specs,
          isActive: false,
          isFeatured: item.isFeatured,
          sortOrder: item.sortOrder,
        },
      });
      report.productsCreated.push(item.slug);
    } else if (
      (LEGACY_SPECS[item.slug] ?? []).some((legacy) => specsText(legacy) === specsText(product!.specs))
    ) {
      await prisma.product.update({ where: { id: product.id }, data: { specs: item.specs } });
      report.specsUpdated.push(item.slug);
    }

    // ── every colour × capacity Apple sells, unpriced when new ──────────────
    const variants = await prisma.productVariant.findMany({ where: { productId: product.id } });
    const present = new Set(variants.map((v) => `${v.colorId}:${v.storageId}`));
    for (const code of item.colors) {
      const color = colors.get(code);
      if (!color) throw new Error(`catalogue colour "${code}" is missing`);
      for (const capacity of item.capacities) {
        const storage = storages.get(capacity);
        if (!storage) throw new Error(`catalogue capacity ${capacity} is missing`);
        if (present.has(`${color.id}:${storage.id}`)) continue;

        let sku = catalogSku(item.slug, capacity, code);
        for (let n = 2; await prisma.productVariant.findUnique({ where: { sku } }); n++) {
          sku = `${catalogSku(item.slug, capacity, code)}-${n}`;
        }
        await prisma.productVariant.create({
          data: {
            productId: product.id,
            colorId: color.id,
            storageId: storage.id,
            sku,
            price: 0n,
            discountPercent: 0,
            isActive: false,
            inventory: { create: { stock: 0, lowStockThreshold: 2 } },
          },
        });
        report.variantsCreated++;
      }
    }

    // ── official renders per colour ──────────────────────────────────────────
    for (const [colorIndex, code] of item.colors.entries()) {
      const entries = manifest[item.slug]?.[code];
      const color = colors.get(code)!;
      if (!entries?.length) continue;

      const current = await prisma.productImage.findMany({
        where: { productId: product.id, colorId: color.id },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
      const mockupKey = `products/${item.slug}/${code}.webp`;
      const replaceable = (key: string) => key === mockupKey || key.startsWith('catalog/');
      if (current.some((image) => !replaceable(image.storageKey))) {
        report.imagesKept.push(`${item.slug}/${code}`);
        continue;
      }

      const wanted = entries.map((entry, n) => {
        const data = readFileSync(join(IMAGES_DIR, entry.file));
        const hash = createHash('sha256').update(data).digest('hex').slice(0, 10);
        return { ...entry, data, key: `catalog/${item.slug}/${code}-${n + 1}-${hash}.webp` };
      });
      if (
        sameJson(
          current.map((i) => i.storageKey),
          wanted.map((w) => w.key),
        )
      )
        continue;

      // new files first, then swap the rows, then remove the old files
      const urls = await Promise.all(wanted.map((w) => putMedia(w.key, w.data)));
      const colorName = color.name;
      await prisma.$transaction([
        prisma.productImage.deleteMany({ where: { id: { in: current.map((i) => i.id) } } }),
        ...wanted.map((w, n) =>
          prisma.productImage.create({
            data: {
              productId: product!.id,
              colorId: color.id,
              storageKey: w.key,
              url: urls[n]!,
              alt: `${item.name} رنگ ${colorName}${n === 0 ? '' : ` — نمای ${formatNumberFa(n + 1)}`}`,
              width: w.width,
              height: w.height,
              kind: w.kind,
              sortOrder: colorIndex * 10 + n,
            },
          }),
        ),
      ]);
      const kept = new Set(wanted.map((w) => w.key));
      for (const image of current) if (!kept.has(image.storageKey)) await deleteMedia(image.storageKey);
      report.imagesUpdated.push(`${item.slug}/${code}`);
    }

    // ── search keywords (same recipe as the admin panel) ─────────────────────
    const all = await prisma.productVariant.findMany({
      where: { productId: product.id },
      include: { color: true, storage: true },
    });
    const parts: (string | number)[] = [
      product.name,
      product.nameEn,
      product.model,
      product.series,
      product.releaseYear,
      product.tagline ?? '',
    ];
    for (const variant of all) {
      parts.push(variant.color.name, variant.color.nameEn, ...variant.color.aliases);
      parts.push(variant.storage.label, variant.storage.labelFa, variant.storage.capacityGb, variant.sku);
    }
    const searchText = buildSearchText(parts);
    // only when it changed: every update moves updatedAt, which the sitemap publishes
    if (searchText !== product.searchText) {
      await prisma.product.update({ where: { id: product.id }, data: { searchText } });
    }

    log(`✓ ${item.name}`);
  }

  return report;
}
