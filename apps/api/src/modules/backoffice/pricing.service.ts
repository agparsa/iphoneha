import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  calcDiscountPercent,
  type BulkPriceInput,
  type BulkPricePreviewDto,
  type PriceChangeDto,
  type PricingQuery,
  type PricingRowDto,
} from '@iphoneha/shared';
import { PrismaService, type PrismaTx } from '../../infra/prisma/prisma.service';
import { toNullableNumber, toNumber } from '../../common/bigint';
import type { ClientInfo } from '../../common/utils';
import type { AuthAdmin } from '../../types/express';
import { AuditService } from '../audit/audit.service';
import { CatalogCacheService } from '../catalog/catalog-cache.service';

export interface PriceChangeRecord {
  variantId: string;
  oldPrice: number;
  newPrice: number;
  oldCompareAt: number | null;
  newCompareAt: number | null;
  batchId?: string | null;
  adminUserId: string | null;
}

/** «جدول قیمت‌ها»: every colour and capacity on one page, bulk changes with a preview, and the history of each price. */
@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cache: CatalogCacheService,
  ) {}

  /** Writes one history row when a price or «before discount» price actually changed. */
  static async record(db: PrismaTx, change: PriceChangeRecord): Promise<void> {
    if (change.oldPrice === change.newPrice && change.oldCompareAt === change.newCompareAt) return;
    await db.priceChange.create({
      data: {
        variantId: change.variantId,
        oldPrice: BigInt(change.oldPrice),
        newPrice: BigInt(change.newPrice),
        oldCompareAt: change.oldCompareAt === null ? null : BigInt(change.oldCompareAt),
        newCompareAt: change.newCompareAt === null ? null : BigInt(change.newCompareAt),
        batchId: change.batchId ?? null,
        adminUserId: change.adminUserId,
      },
    });
  }

  async list(query: PricingQuery): Promise<PricingRowDto[]> {
    const where: Prisma.ProductVariantWhereInput = {};
    if (query.productId) where.productId = query.productId;
    if (query.q) {
      const q = query.q.trim();
      where.OR = [
        { sku: { contains: q, mode: 'insensitive' } },
        { product: { name: { contains: q, mode: 'insensitive' } } },
        { color: { name: { contains: q, mode: 'insensitive' } } },
        { storage: { labelFa: { contains: q } } },
      ];
    }
    const variants = await this.prisma.productVariant.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, slug: true, isActive: true, sortOrder: true } },
        color: { select: { name: true, hex: true } },
        storage: { select: { labelFa: true, capacityGb: true } },
        inventory: { select: { stock: true, reserved: true } },
        priceChanges: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { admin: { select: { name: true } } },
        },
      },
      orderBy: [
        { product: { sortOrder: 'asc' } },
        { product: { name: 'asc' } },
        { storage: { capacityGb: 'asc' } },
        { color: { name: 'asc' } },
      ],
      take: 2000,
    });
    return variants.map((variant) => {
      const last = variant.priceChanges[0];
      const stock = variant.inventory?.stock ?? 0;
      return {
        variantId: variant.id,
        productId: variant.product.id,
        productName: variant.product.name,
        productSlug: variant.product.slug,
        colorName: variant.color.name,
        colorHex: variant.color.hex,
        storageLabel: variant.storage.labelFa,
        capacityGb: variant.storage.capacityGb,
        sku: variant.sku,
        price: toNumber(variant.price),
        compareAtPrice: toNullableNumber(variant.compareAtPrice),
        discountPercent: variant.discountPercent,
        active: variant.isActive,
        productActive: variant.product.isActive,
        stock,
        available: Math.max(0, stock - (variant.inventory?.reserved ?? 0)),
        updatedAt: variant.updatedAt.toISOString(),
        lastChange: last
          ? {
              at: last.createdAt.toISOString(),
              oldPrice: toNumber(last.oldPrice),
              adminName: last.admin?.name ?? null,
            }
          : null,
      };
    });
  }

  /**
   * «تغییر گروهی قیمت». With `dryRun` (the default) only the preview comes
   * back; otherwise the same rows are written in one transaction, with one
   * history row each under a shared batch id.
   */
  async bulk(input: BulkPriceInput, admin: AuthAdmin, client?: ClientInfo): Promise<BulkPricePreviewDto> {
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: input.variantIds } },
      include: {
        product: { select: { name: true } },
        color: { select: { name: true } },
        storage: { select: { labelFa: true } },
      },
    });
    const round = (value: number) =>
      input.rounding > 0 ? Math.round(value / input.rounding) * input.rounding : Math.round(value);
    const next = (base: number) =>
      input.mode === 'PERCENT'
        ? base * (1 + input.value / 100)
        : input.mode === 'AMOUNT'
          ? base + input.value
          : input.value;

    const preview: BulkPricePreviewDto = { applied: false, batchId: null, rows: [], skipped: [] };
    const writes: {
      id: string;
      price: number;
      compareAt: number | null;
      oldPrice: number;
      oldCompareAt: number | null;
    }[] = [];
    for (const variant of variants) {
      const title = `${variant.product.name} ${variant.storage.labelFa} ${variant.color.name}`;
      const price = toNumber(variant.price);
      const compareAt = toNullableNumber(variant.compareAtPrice);
      const skip = (reason: string) =>
        preview.skipped.push({ variantId: variant.id, sku: variant.sku, reason });

      if (input.target === 'PRICE') {
        if (price <= 0 && input.mode !== 'SET') {
          skip('هنوز قیمت ندارد؛ قیمتش را مستقیم وارد کن');
          continue;
        }
        const newPrice = round(next(price));
        if (newPrice <= 0) {
          skip('قیمت صفر یا منفی می‌شود');
          continue;
        }
        const compareAtCleared = compareAt !== null && newPrice >= compareAt;
        const newCompareAt = compareAtCleared ? null : compareAt;
        preview.rows.push({
          variantId: variant.id,
          sku: variant.sku,
          title,
          oldValue: price,
          newValue: newPrice,
          compareAtCleared,
        });
        writes.push({
          id: variant.id,
          price: newPrice,
          compareAt: newCompareAt,
          oldPrice: price,
          oldCompareAt: compareAt,
        });
      } else {
        if (price <= 0) {
          skip('هنوز قیمت فروش ندارد');
          continue;
        }
        // «before discount» 0 (or less) with SET removes the discount
        const raw = next(compareAt ?? price);
        const newCompareAt = input.mode === 'SET' && input.value <= 0 ? null : round(raw);
        if (newCompareAt !== null && newCompareAt <= price) {
          skip('قیمت قبل از تخفیف باید از قیمت فروش بیشتر باشد');
          continue;
        }
        preview.rows.push({
          variantId: variant.id,
          sku: variant.sku,
          title,
          oldValue: compareAt,
          newValue: newCompareAt,
          compareAtCleared: false,
        });
        writes.push({
          id: variant.id,
          price,
          compareAt: newCompareAt,
          oldPrice: price,
          oldCompareAt: compareAt,
        });
      }
    }
    for (const id of input.variantIds) {
      if (!variants.some((variant) => variant.id === id))
        preview.skipped.push({ variantId: id, sku: '', reason: 'پیدا نشد' });
    }
    if (input.dryRun || !writes.length) return preview;

    const batchId = randomUUID();
    await this.prisma.transaction(
      async (tx) => {
        for (const row of writes) {
          await tx.productVariant.update({
            where: { id: row.id },
            data: {
              price: BigInt(row.price),
              compareAtPrice: row.compareAt === null ? null : BigInt(row.compareAt),
              discountPercent: calcDiscountPercent(row.price, row.compareAt),
            },
          });
          await PricingService.record(tx, {
            variantId: row.id,
            oldPrice: row.oldPrice,
            newPrice: row.price,
            oldCompareAt: row.oldCompareAt,
            newCompareAt: row.compareAt,
            batchId,
            adminUserId: admin.id,
          });
        }
      },
      { timeoutMs: 60_000 },
    );
    await this.cache.invalidate();
    await this.audit.log({
      adminUserId: admin.id,
      action: 'pricing.bulk',
      entityType: 'ProductVariant',
      entityId: batchId,
      after: {
        target: input.target,
        mode: input.mode,
        value: input.value,
        rounding: input.rounding,
        count: writes.length,
      },
      client,
    });
    return { ...preview, applied: true, batchId };
  }

  async history(variantId: string | undefined, limit = 200): Promise<PriceChangeDto[]> {
    const rows = await this.prisma.priceChange.findMany({
      where: variantId ? { variantId } : {},
      include: {
        admin: { select: { name: true } },
        variant: {
          select: {
            sku: true,
            product: { select: { name: true } },
            color: { select: { name: true } },
            storage: { select: { labelFa: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      variantId: row.variantId,
      sku: row.variant.sku,
      title: `${row.variant.product.name} ${row.variant.storage.labelFa} ${row.variant.color.name}`,
      oldPrice: toNumber(row.oldPrice),
      newPrice: toNumber(row.newPrice),
      oldCompareAt: toNullableNumber(row.oldCompareAt),
      newCompareAt: toNullableNumber(row.newCompareAt),
      batchId: row.batchId,
      adminName: row.admin?.name ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
