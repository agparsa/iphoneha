import type { Color, ProductImage, Storage } from '@prisma/client';
import {
  REGISTRY_STATUS_LABELS,
  SHIPPING_TIME_LABELS,
  calcDiscountPercent,
  stockStatusOf,
  type BreadcrumbDto,
  type ColorDto,
  type ImageDto,
  type ProductCardDto,
  type ProductCardVariant,
  type ProductDetailDto,
  type SpecDto,
  type StorageDto,
  type VariantDto,
} from '@iphoneha/shared';
import { toNullableNumber, toNumber } from '../../common/bigint';
import type { ProductWithRelations, VariantWithRelations } from './catalog.types';

export function toColorDto(color: Color): ColorDto {
  return {
    id: color.id,
    code: color.code,
    name: color.name,
    nameEn: color.nameEn,
    hex: color.hex,
    finish: color.finish,
  };
}

export function toStorageDto(storage: Storage): StorageDto {
  return {
    id: storage.id,
    capacityGb: storage.capacityGb,
    label: storage.label,
    labelFa: storage.labelFa,
  };
}

export function toImageDto(image: ProductImage): ImageDto {
  return {
    id: image.id,
    url: image.url,
    alt: image.alt,
    colorId: image.colorId,
    width: image.width,
    height: image.height,
    kind: image.kind,
  };
}

export function availabilityOf(variant: VariantWithRelations): {
  stock: number;
  reserved: number;
  available: number;
} {
  const stock = variant.inventory?.stock ?? 0;
  const reserved = variant.inventory?.reserved ?? 0;
  return { stock, reserved, available: Math.max(0, stock - reserved) };
}

export function toVariantDto(variant: VariantWithRelations): VariantDto {
  const { stock, reserved, available } = availabilityOf(variant);
  return {
    id: variant.id,
    productId: variant.productId,
    colorId: variant.colorId,
    storageId: variant.storageId,
    sku: variant.sku,
    price: toNumber(variant.price),
    compareAtPrice: toNullableNumber(variant.compareAtPrice),
    discountPercent: variant.discountPercent,
    stock,
    reservedStock: reserved,
    availableStock: available,
    stockStatus: stockStatusOf(available, variant.inventory?.lowStockThreshold ?? 2),
    shippingTime: variant.shippingTime,
    shippingTimeLabel: SHIPPING_TIME_LABELS[variant.shippingTime],
    active: variant.isActive,
  };
}

/** Picks the image that belongs to a colour, falling back to the shared gallery. */
export function imageForColor(images: ProductImage[], colorId: string | null): ProductImage | null {
  if (colorId) {
    const match = images.find((i) => i.colorId === colorId);
    if (match) return match;
  }
  return images.find((i) => i.colorId === null) ?? images[0] ?? null;
}

export function toCardVariant(variant: VariantWithRelations, images: ProductImage[]): ProductCardVariant {
  const { available } = availabilityOf(variant);
  const image = imageForColor(images, variant.colorId);
  return {
    id: variant.id,
    sku: variant.sku,
    color: toColorDto(variant.color),
    storage: toStorageDto(variant.storage),
    price: toNumber(variant.price),
    compareAtPrice: toNullableNumber(variant.compareAtPrice),
    discountPercent: variant.discountPercent,
    availableStock: available,
    stockStatus: stockStatusOf(available, variant.inventory?.lowStockThreshold ?? 2),
    shippingTime: variant.shippingTime,
    shippingTimeLabel: SHIPPING_TIME_LABELS[variant.shippingTime],
    image: image ? toImageDto(image) : null,
  };
}

function uniqueBy<T, K>(items: T[], key: (item: T) => K): T[] {
  const seen = new Set<K>();
  const result: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    result.push(item);
  }
  return result;
}

export function toProductCard(product: ProductWithRelations, matchedVariantId: string): ProductCardDto {
  const activeVariants = product.variants.filter((v) => v.isActive);
  const matched = activeVariants.find((v) => v.id === matchedVariantId) ?? activeVariants[0]!;
  const colors = uniqueBy(
    activeVariants.map((v) => v.color),
    (c) => c.id,
  ).sort((a, b) => a.sortOrder - b.sortOrder);
  const storages = uniqueBy(
    activeVariants.map((v) => v.storage),
    (s) => s.id,
  ).sort((a, b) => a.capacityGb - b.capacityGb);
  const prices = activeVariants.map((v) => toNumber(v.price));

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    nameEn: product.nameEn,
    series: product.series,
    releaseYear: product.releaseYear,
    ratingAvg: product.ratingAvg,
    ratingCount: product.ratingCount,
    variant: toCardVariant(matched, product.images),
    colors: colors.map(toColorDto),
    storages: storages.map(toStorageDto),
    minPrice: prices.length ? Math.min(...prices) : 0,
    maxDiscountPercent: activeVariants.reduce((max, v) => Math.max(max, v.discountPercent), 0),
    inStock: activeVariants.some((v) => availabilityOf(v).available > 0),
  };
}

/**
 * What a search result shows for a model when the admin has not written its
 * own: the price, cash-or-instalment and cheque/promissory-note words people
 * search with («قیمت آیفون ۱۷»، «آیفون ۱۷ قسطی»، «خرید آیفون با چک»).
 */
export function defaultSeoTitle(name: string): string {
  return `قیمت و خرید ${name} نقد و قسطی | آیفونی‌ها`;
}

export function defaultSeoDescription(name: string, shortDescription: string | null): string {
  const lead = `خرید ${name} آکبند و اصل با قیمت روز، نقد یا قسطی با چک و سفته`;
  const full = shortDescription ? `${lead}؛ ${shortDescription}` : '';
  return full && full.length <= 170 ? full : `${lead}؛ ارسال به سراسر ایران.`;
}

export function toProductDetail(product: ProductWithRelations): ProductDetailDto {
  const activeVariants = product.variants.filter((v) => v.isActive);
  const colors = uniqueBy(
    activeVariants.map((v) => v.color),
    (c) => c.id,
  ).sort((a, b) => a.sortOrder - b.sortOrder);
  const storages = uniqueBy(
    activeVariants.map((v) => v.storage),
    (s) => s.id,
  ).sort((a, b) => a.capacityGb - b.capacityGb);
  const prices = activeVariants.map((v) => toNumber(v.price));
  const inStockVariants = activeVariants.filter((v) => availabilityOf(v).available > 0);
  const defaultVariant =
    inStockVariants.slice().sort((a, b) => toNumber(a.price) - toNumber(b.price))[0] ??
    activeVariants.slice().sort((a, b) => toNumber(a.price) - toNumber(b.price))[0] ??
    null;

  const specs = Array.isArray(product.specs) ? (product.specs as unknown as SpecDto[]) : [];
  const breadcrumbs: BreadcrumbDto[] = [
    { name: 'آیفونی‌ها', href: '/' },
    // the listing lives at /shop (there is no /iphone index page)
    { name: 'فروشگاه', href: '/shop' },
    { name: product.series, href: `/shop?series=${encodeURIComponent(product.series)}` },
    { name: product.name, href: `/iphone/${product.slug}` },
  ];

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    nameEn: product.nameEn,
    model: product.model,
    series: product.series,
    releaseYear: product.releaseYear,
    tagline: product.tagline,
    shortDescription: product.shortDescription,
    description: product.description,
    warranty: product.warranty,
    registryStatus: product.registryStatus,
    registryLabel: REGISTRY_STATUS_LABELS[product.registryStatus],
    basePrice: toNumber(product.basePrice),
    specs,
    ratingAvg: product.ratingAvg,
    ratingCount: product.ratingCount,
    seoTitle: product.seoTitle ?? defaultSeoTitle(product.name),
    seoDescription: product.seoDescription ?? defaultSeoDescription(product.name, product.shortDescription),
    images: product.images.map(toImageDto),
    colors: colors.map(toColorDto),
    storages: storages.map(toStorageDto),
    variants: activeVariants.map(toVariantDto),
    defaultVariantId: defaultVariant?.id ?? null,
    priceRange: {
      min: prices.length ? Math.min(...prices) : 0,
      max: prices.length ? Math.max(...prices) : 0,
    },
    inStock: inStockVariants.length > 0,
    breadcrumbs,
    updatedAt: product.updatedAt.toISOString(),
  };
}

/** Recomputes the stored discount percentage from price/compareAtPrice. */
export function discountPercentFor(price: number, compareAtPrice: number | null | undefined): number {
  return calcDiscountPercent(price, compareAtPrice ?? null);
}
