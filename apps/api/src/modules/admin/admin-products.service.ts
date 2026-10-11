import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  buildSearchText,
  calcDiscountPercent,
  SHIPPING_TIME_LABELS,
  stockStatusOf,
  type AdminProductDetailDto,
  type AdminProductListItem,
  type AdminVariantDto,
  type AdminColorDto,
  type AdminStorageDto,
  type ColorDto,
  type ColorInput,
  type CreateProductInput,
  type CreateVariantInput,
  type ImageDto,
  type Paginated,
  type SpecDto,
  type StorageDto,
  type StorageInput,
  type UpdateProductInput,
  type UpdateVariantInput,
} from '@iphoneha/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { Errors } from '../../common/errors';
import { paginate, skipTake, type ClientInfo } from '../../common/utils';
import { toNullableNumber, toNumber } from '../../common/bigint';
import { AuditService } from '../audit/audit.service';
import { CatalogCacheService } from '../catalog/catalog-cache.service';
import { PricingService } from '../backoffice/pricing.service';
import { StorageService } from '../storage/storage.service';
import { toColorDto, toImageDto, toStorageDto } from '../catalog/catalog.mapper';
import type { AuthAdmin } from '../../types/express';

const detailInclude = {
  images: { orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }] },
  variants: {
    include: { color: true, storage: true, inventory: true },
    orderBy: [{ price: 'asc' as const }],
  },
} satisfies Prisma.ProductInclude;

@Injectable()
export class AdminProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CatalogCacheService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  // ─── Products ──────────────────────────────────────────────────────────────

  async list(query: {
    q?: string;
    status: 'active' | 'inactive' | 'all';
    page: number;
    pageSize: number;
  }): Promise<Paginated<AdminProductListItem>> {
    const where: Prisma.ProductWhereInput = {};
    if (query.status === 'active') where.isActive = true;
    if (query.status === 'inactive') where.isActive = false;
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { nameEn: { contains: query.q, mode: 'insensitive' } },
        { slug: { contains: query.q, mode: 'insensitive' } },
        { variants: { some: { sku: { contains: query.q, mode: 'insensitive' } } } },
      ];
    }

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: detailInclude,
        orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
        ...skipTake(query.page, query.pageSize),
      }),
      this.prisma.product.count({ where }),
    ]);

    return paginate(
      products.map((product) => {
        const active = product.variants.filter((v) => v.isActive);
        const prices = active.map((v) => toNumber(v.price));
        return {
          id: product.id,
          slug: product.slug,
          name: product.name,
          nameEn: product.nameEn,
          series: product.series,
          releaseYear: product.releaseYear,
          isActive: product.isActive,
          isFeatured: product.isFeatured,
          variantsCount: product.variants.length,
          activeVariants: active.length,
          unpricedVariants: product.variants.filter((v) => toNumber(v.price) <= 0).length,
          totalAvailable: product.variants.reduce(
            (sum, v) => sum + Math.max(0, (v.inventory?.stock ?? 0) - (v.inventory?.reserved ?? 0)),
            0,
          ),
          minPrice: prices.length ? Math.min(...prices) : null,
          image: product.images[0]?.url ?? null,
          updatedAt: product.updatedAt.toISOString(),
        };
      }),
      total,
      query.page,
      query.pageSize,
    );
  }

  private toVariantDto(
    variant: Prisma.ProductVariantGetPayload<{ include: { color: true; storage: true; inventory: true } }>,
    product: { name: string; slug: string },
  ): AdminVariantDto {
    const stock = variant.inventory?.stock ?? 0;
    const reserved = variant.inventory?.reserved ?? 0;
    const available = Math.max(0, stock - reserved);
    return {
      id: variant.id,
      productId: variant.productId,
      productName: product.name,
      productSlug: product.slug,
      colorId: variant.colorId,
      storageId: variant.storageId,
      color: toColorDto(variant.color),
      storage: toStorageDto(variant.storage),
      sku: variant.sku,
      price: toNumber(variant.price),
      compareAtPrice: toNullableNumber(variant.compareAtPrice),
      discountPercent: variant.discountPercent,
      stock,
      reservedStock: reserved,
      availableStock: available,
      sold: variant.inventory?.sold ?? 0,
      lowStockThreshold: variant.inventory?.lowStockThreshold ?? 2,
      stockStatus: stockStatusOf(available, variant.inventory?.lowStockThreshold ?? 2),
      shippingTime: variant.shippingTime,
      shippingTimeLabel: SHIPPING_TIME_LABELS[variant.shippingTime],
      active: variant.isActive,
      updatedAt: variant.updatedAt.toISOString(),
    };
  }

  async get(id: string): Promise<AdminProductDetailDto> {
    const product = await this.prisma.product.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      include: detailInclude,
    });
    if (!product) throw Errors.notFound('محصول پیدا نشد');
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
      basePrice: toNumber(product.basePrice),
      specs: Array.isArray(product.specs) ? (product.specs as unknown as SpecDto[]) : [],
      isActive: product.isActive,
      isFeatured: product.isFeatured,
      sortOrder: product.sortOrder,
      ratingAvg: product.ratingAvg,
      ratingCount: product.ratingCount,
      seoTitle: product.seoTitle,
      seoDescription: product.seoDescription,
      images: product.images.map(toImageDto),
      variants: product.variants.map((v) => this.toVariantDto(v, product)),
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  }

  async create(
    input: CreateProductInput,
    admin: AuthAdmin,
    client: ClientInfo,
  ): Promise<AdminProductDetailDto> {
    const exists = await this.prisma.product.findUnique({ where: { slug: input.slug } });
    if (exists) throw Errors.conflict('SLUG_TAKEN', 'این اسلاگ قبلاً استفاده شده است');

    const product = await this.prisma.product.create({
      data: {
        ...input,
        basePrice: BigInt(input.basePrice),
        specs: input.specs as unknown as Prisma.InputJsonValue,
        searchText: '',
      },
    });
    await this.refreshSearchText(product.id);
    await this.cache.invalidate();
    await this.audit.log({
      adminUserId: admin.id,
      action: 'product.create',
      entityType: 'Product',
      entityId: product.id,
      after: { slug: product.slug, name: product.name },
      client,
    });
    return this.get(product.id);
  }

  async update(
    id: string,
    input: UpdateProductInput,
    admin: AuthAdmin,
    client: ClientInfo,
  ): Promise<AdminProductDetailDto> {
    const before = await this.prisma.product.findUnique({ where: { id } });
    if (!before) throw Errors.notFound('محصول پیدا نشد');
    if (input.slug && input.slug !== before.slug) {
      const taken = await this.prisma.product.findUnique({ where: { slug: input.slug } });
      if (taken) throw Errors.conflict('SLUG_TAKEN', 'این اسلاگ قبلاً استفاده شده است');
    }

    if (input.isActive === true && !before.isActive) {
      // a model without a single priced colour/capacity would show up with nothing to buy
      const priced = await this.prisma.productVariant.count({
        where: { productId: id, isActive: true, price: { gt: 0 } },
      });
      if (!priced) {
        throw Errors.badRequest(
          'PRODUCT_NOT_PRICED',
          'این محصول هنوز هیچ رنگ و حافظهٔ قیمت‌داری ندارد؛ اول قیمت حداقل یکی را وارد کنید',
        );
      }
    }

    const data: Prisma.ProductUpdateInput = { ...input } as Prisma.ProductUpdateInput;
    if (input.basePrice !== undefined) data.basePrice = BigInt(input.basePrice);
    if (input.specs !== undefined) data.specs = input.specs as unknown as Prisma.InputJsonValue;

    const after = await this.prisma.product.update({ where: { id }, data });
    await this.refreshSearchText(id);
    await this.cache.invalidate();
    await this.audit.log({
      adminUserId: admin.id,
      action: 'product.update',
      entityType: 'Product',
      entityId: id,
      before: { name: before.name, isActive: before.isActive, slug: before.slug },
      after: { name: after.name, isActive: after.isActive, slug: after.slug },
      client,
    });
    return this.get(id);
  }

  /** Deletes a product that was never ordered, otherwise deactivates it. */
  async remove(
    id: string,
    admin: AuthAdmin,
    client: ClientInfo,
  ): Promise<{ deleted: boolean; deactivated: boolean }> {
    const product = await this.prisma.product.findUnique({ where: { id }, include: { variants: true } });
    if (!product) throw Errors.notFound('محصول پیدا نشد');
    const ordered = await this.prisma.orderItem.count({ where: { productId: id } });

    if (ordered > 0) {
      await this.prisma.product.update({ where: { id }, data: { isActive: false } });
      await this.cache.invalidate();
      await this.audit.log({
        adminUserId: admin.id,
        action: 'product.deactivate',
        entityType: 'Product',
        entityId: id,
        before: { isActive: true },
        after: { isActive: false },
        client,
      });
      return { deleted: false, deactivated: true };
    }

    await this.prisma.product.delete({ where: { id } });
    await this.cache.invalidate();
    await this.audit.log({
      adminUserId: admin.id,
      action: 'product.delete',
      entityType: 'Product',
      entityId: id,
      before: { slug: product.slug, name: product.name },
      client,
    });
    return { deleted: true, deactivated: false };
  }

  // ─── Variants ──────────────────────────────────────────────────────────────

  async createVariant(
    productId: string,
    input: CreateVariantInput,
    admin: AuthAdmin,
    client: ClientInfo,
  ): Promise<AdminVariantDto> {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw Errors.notFound('محصول پیدا نشد');

    const duplicate = await this.prisma.productVariant.findUnique({
      where: {
        productId_colorId_storageId: { productId, colorId: input.colorId, storageId: input.storageId },
      },
    });
    if (duplicate) throw Errors.conflict('VARIANT_EXISTS', 'برای این رنگ و ظرفیت قبلاً مدلی ثبت شده است');
    const skuTaken = await this.prisma.productVariant.findUnique({ where: { sku: input.sku } });
    if (skuTaken) throw Errors.conflict('SKU_TAKEN', 'این SKU قبلاً استفاده شده است');

    const variant = await this.prisma.productVariant.create({
      data: {
        productId,
        colorId: input.colorId,
        storageId: input.storageId,
        sku: input.sku,
        price: BigInt(input.price),
        compareAtPrice: input.compareAtPrice ? BigInt(input.compareAtPrice) : null,
        discountPercent: calcDiscountPercent(input.price, input.compareAtPrice ?? null),
        shippingTime: input.shippingTime,
        isActive: input.isActive,
        inventory: {
          create: { stock: input.stock, lowStockThreshold: input.lowStockThreshold },
        },
      },
      include: { color: true, storage: true, inventory: true },
    });

    if (variant.isActive) await this.publishIfFirstPrice(productId, variant.price);

    if (input.stock > 0) {
      await this.prisma.inventoryMovement.create({
        data: {
          variantId: variant.id,
          type: 'RESTOCK',
          quantity: input.stock,
          stockAfter: input.stock,
          reservedAfter: 0,
          adminUserId: admin.id,
          reason: 'موجودی اولیه',
        },
      });
    }

    await this.refreshSearchText(productId);
    await this.cache.invalidate();
    await this.audit.log({
      adminUserId: admin.id,
      action: 'variant.create',
      entityType: 'ProductVariant',
      entityId: variant.id,
      after: { sku: variant.sku, price: toNumber(variant.price) },
      client,
    });
    return this.toVariantDto(variant, product);
  }

  async updateVariant(
    variantId: string,
    input: UpdateVariantInput,
    admin: AuthAdmin,
    client: ClientInfo,
  ): Promise<AdminVariantDto> {
    const before = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { color: true, storage: true, inventory: true, product: true },
    });
    if (!before) throw Errors.notFound('مدل کالا پیدا نشد');
    if (input.sku && input.sku !== before.sku) {
      const taken = await this.prisma.productVariant.findUnique({ where: { sku: input.sku } });
      if (taken) throw Errors.conflict('SKU_TAKEN', 'این SKU قبلاً استفاده شده است');
    }

    const beforePrice = toNumber(before.price);
    const price = input.price ?? beforePrice;
    const compareAt =
      input.compareAtPrice === undefined ? toNullableNumber(before.compareAtPrice) : input.compareAtPrice;
    // A colour/capacity added by the catalogue has no price (0) and is hidden.
    // Its first price puts it on sale, unless the same edit says otherwise;
    // nothing can be on sale without a price.
    const isActive = input.isActive ?? (beforePrice === 0 && price > 0 ? true : before.isActive);
    if (isActive && price <= 0) {
      throw Errors.badRequest('VARIANT_NOT_PRICED', 'برای نمایش این مدل در سایت، اول قیمتش را وارد کنید');
    }

    const variant = await this.prisma.productVariant.update({
      where: { id: variantId },
      data: {
        ...(input.sku !== undefined ? { sku: input.sku } : {}),
        ...(input.price !== undefined ? { price: BigInt(input.price) } : {}),
        ...(input.compareAtPrice !== undefined
          ? { compareAtPrice: input.compareAtPrice ? BigInt(input.compareAtPrice) : null }
          : {}),
        ...(input.shippingTime !== undefined ? { shippingTime: input.shippingTime } : {}),
        ...(isActive !== before.isActive ? { isActive } : {}),
        discountPercent: calcDiscountPercent(price, compareAt),
      },
      include: { color: true, storage: true, inventory: true, product: true },
    });
    if (variant.isActive) await this.publishIfFirstPrice(variant.productId, variant.price);
    // «تاریخچهٔ قیمت» in the price table
    await PricingService.record(this.prisma, {
      variantId,
      oldPrice: beforePrice,
      newPrice: toNumber(variant.price),
      oldCompareAt: toNullableNumber(before.compareAtPrice),
      newCompareAt: toNullableNumber(variant.compareAtPrice),
      adminUserId: admin.id,
    });

    await this.cache.invalidate();
    await this.audit.log({
      adminUserId: admin.id,
      action: 'variant.update',
      entityType: 'ProductVariant',
      entityId: variantId,
      before: {
        price: toNumber(before.price),
        compareAtPrice: toNullableNumber(before.compareAtPrice),
        isActive: before.isActive,
      },
      after: {
        price: toNumber(variant.price),
        compareAtPrice: toNullableNumber(variant.compareAtPrice),
        isActive: variant.isActive,
      },
      client,
    });
    return this.toVariantDto(variant, variant.product);
  }

  /**
   * A model the catalogue added is created unpriced (basePrice 0) and hidden.
   * Its first priced colour/capacity puts the model itself on the storefront.
   * A model the owner switched off after pricing it is never switched back on.
   */
  private async publishIfFirstPrice(productId: string, price: bigint): Promise<void> {
    await this.prisma.product.updateMany({
      where: { id: productId, basePrice: 0n, isActive: false },
      data: { isActive: true, basePrice: price },
    });
  }

  async deleteVariant(
    variantId: string,
    admin: AuthAdmin,
    client: ClientInfo,
  ): Promise<{ deleted: boolean }> {
    const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!variant) throw Errors.notFound('مدل کالا پیدا نشد');
    const used = await this.prisma.orderItem.count({ where: { variantId } });
    if (used > 0) {
      await this.prisma.productVariant.update({ where: { id: variantId }, data: { isActive: false } });
      await this.cache.invalidate();
      await this.audit.log({
        adminUserId: admin.id,
        action: 'variant.deactivate',
        entityType: 'ProductVariant',
        entityId: variantId,
        client,
      });
      return { deleted: false };
    }
    await this.prisma.productVariant.delete({ where: { id: variantId } });
    await this.refreshSearchText(variant.productId);
    await this.cache.invalidate();
    await this.audit.log({
      adminUserId: admin.id,
      action: 'variant.delete',
      entityType: 'ProductVariant',
      entityId: variantId,
      before: { sku: variant.sku },
      client,
    });
    return { deleted: true };
  }

  async listVariants(query: {
    q?: string;
    productId?: string;
    stock: 'all' | 'in' | 'low' | 'out';
    page: number;
    pageSize: number;
  }): Promise<Paginated<AdminVariantDto>> {
    const where: Prisma.ProductVariantWhereInput = {};
    if (query.productId) where.productId = query.productId;
    if (query.q) {
      where.OR = [
        { sku: { contains: query.q, mode: 'insensitive' } },
        { product: { name: { contains: query.q, mode: 'insensitive' } } },
        { product: { nameEn: { contains: query.q, mode: 'insensitive' } } },
      ];
    }

    const [variants, total] = await Promise.all([
      this.prisma.productVariant.findMany({
        where,
        include: { color: true, storage: true, inventory: true, product: true },
        orderBy: [{ product: { name: 'asc' } }, { price: 'asc' }],
        ...skipTake(query.page, query.pageSize),
      }),
      this.prisma.productVariant.count({ where }),
    ]);

    let items = variants.map((v) => this.toVariantDto(v, v.product));
    if (query.stock !== 'all') {
      items = items.filter((item) =>
        query.stock === 'out'
          ? item.availableStock <= 0
          : query.stock === 'low'
            ? item.availableStock > 0 && item.availableStock <= item.lowStockThreshold
            : item.availableStock > item.lowStockThreshold,
      );
    }
    return paginate(items, query.stock === 'all' ? total : items.length, query.page, query.pageSize);
  }

  // ─── Images ────────────────────────────────────────────────────────────────

  async addImage(
    productId: string,
    file: { buffer: Buffer; mimetype: string; size: number },
    meta: { colorId?: string | null; alt?: string | null; sortOrder?: number; kind?: 'DEVICE' | 'DETAIL' },
    admin: AuthAdmin,
    client: ClientInfo,
  ): Promise<ImageDto> {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw Errors.notFound('محصول پیدا نشد');

    const stored = await this.storage.putProductImage(productId, file);
    const image = await this.prisma.productImage.create({
      data: {
        productId,
        colorId: meta.colorId ?? null,
        storageKey: stored.key,
        url: stored.url,
        alt: meta.alt ?? product.name,
        width: stored.width,
        height: stored.height,
        kind: meta.kind ?? 'DEVICE',
        sortOrder: meta.sortOrder ?? 0,
      },
    });
    await this.cache.invalidate();
    await this.audit.log({
      adminUserId: admin.id,
      action: 'product.image.add',
      entityType: 'ProductImage',
      entityId: image.id,
      after: { productId, key: stored.key },
      client,
    });
    return toImageDto(image);
  }

  async deleteImage(imageId: string, admin: AuthAdmin, client: ClientInfo): Promise<{ deleted: true }> {
    const image = await this.prisma.productImage.findUnique({ where: { id: imageId } });
    if (!image) throw Errors.notFound('تصویر پیدا نشد');
    await this.prisma.productImage.delete({ where: { id: imageId } });
    await this.storage.delete(image.storageKey);
    await this.cache.invalidate();
    await this.audit.log({
      adminUserId: admin.id,
      action: 'product.image.delete',
      entityType: 'ProductImage',
      entityId: imageId,
      before: { productId: image.productId, key: image.storageKey },
      client,
    });
    return { deleted: true };
  }

  // ─── Colors & storages ─────────────────────────────────────────────────────

  async listColors(): Promise<AdminColorDto[]> {
    const colors = await this.prisma.color.findMany({ orderBy: { sortOrder: 'asc' } });
    return colors.map((color) => ({
      ...toColorDto(color),
      aliases: color.aliases,
      sortOrder: color.sortOrder,
    }));
  }

  async createColor(input: ColorInput, admin: AuthAdmin, client: ClientInfo): Promise<ColorDto> {
    const exists = await this.prisma.color.findUnique({ where: { code: input.code } });
    if (exists) throw Errors.conflict('COLOR_EXISTS', 'این کد رنگ قبلاً ثبت شده است');
    const color = await this.prisma.color.create({ data: input });
    await this.cache.invalidate();
    await this.audit.log({
      adminUserId: admin.id,
      action: 'color.create',
      entityType: 'Color',
      entityId: color.id,
      after: input,
      client,
    });
    return toColorDto(color);
  }

  async updateColor(id: string, input: ColorInput, admin: AuthAdmin, client: ClientInfo): Promise<ColorDto> {
    const before = await this.prisma.color.findUnique({ where: { id } });
    if (!before) throw Errors.notFound('رنگ پیدا نشد');
    const color = await this.prisma.color.update({ where: { id }, data: input });
    await this.cache.invalidate();
    await this.audit.log({
      adminUserId: admin.id,
      action: 'color.update',
      entityType: 'Color',
      entityId: id,
      before: { code: before.code, name: before.name },
      after: input,
      client,
    });
    return toColorDto(color);
  }

  async listStorages(): Promise<AdminStorageDto[]> {
    const storages = await this.prisma.storage.findMany({ orderBy: { capacityGb: 'asc' } });
    return storages.map((storage) => ({ ...toStorageDto(storage), sortOrder: storage.sortOrder }));
  }

  async createStorage(input: StorageInput, admin: AuthAdmin, client: ClientInfo): Promise<StorageDto> {
    const exists = await this.prisma.storage.findUnique({ where: { capacityGb: input.capacityGb } });
    if (exists) throw Errors.conflict('STORAGE_EXISTS', 'این ظرفیت قبلاً ثبت شده است');
    const storage = await this.prisma.storage.create({ data: input });
    await this.cache.invalidate();
    await this.audit.log({
      adminUserId: admin.id,
      action: 'storage.create',
      entityType: 'Storage',
      entityId: storage.id,
      after: input,
      client,
    });
    return toStorageDto(storage);
  }

  async updateStorage(
    id: string,
    input: StorageInput,
    admin: AuthAdmin,
    client: ClientInfo,
  ): Promise<StorageDto> {
    const before = await this.prisma.storage.findUnique({ where: { id } });
    if (!before) throw Errors.notFound('ظرفیت پیدا نشد');
    if (input.capacityGb !== before.capacityGb) {
      const taken = await this.prisma.storage.findUnique({ where: { capacityGb: input.capacityGb } });
      if (taken) throw Errors.conflict('STORAGE_EXISTS', 'این ظرفیت قبلاً ثبت شده است');
    }
    const storage = await this.prisma.storage.update({ where: { id }, data: input });
    await this.cache.invalidate();
    await this.audit.log({
      adminUserId: admin.id,
      action: 'storage.update',
      entityType: 'Storage',
      entityId: id,
      before: { capacityGb: before.capacityGb, label: before.label },
      after: input,
      client,
    });
    return toStorageDto(storage);
  }

  /** Keeps Product.searchText in sync with names, colours and capacities. */
  async refreshSearchText(productId: string): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { variants: { include: { color: true, storage: true } } },
    });
    if (!product) return;
    const parts: (string | number)[] = [
      product.name,
      product.nameEn,
      product.model,
      product.series,
      product.releaseYear,
      product.tagline ?? '',
    ];
    for (const variant of product.variants) {
      parts.push(variant.color.name, variant.color.nameEn, ...variant.color.aliases);
      parts.push(variant.storage.label, variant.storage.labelFa, variant.storage.capacityGb, variant.sku);
    }
    await this.prisma.product.update({
      where: { id: productId },
      data: { searchText: buildSearchText(parts) },
    });
  }
}
