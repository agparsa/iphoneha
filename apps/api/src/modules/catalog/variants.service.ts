import { Injectable } from '@nestjs/common';
import type { VariantDto } from '@iphoneha/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { Errors } from '../../common/errors';
import { variantInclude, type VariantWithRelations } from './catalog.types';
import { availabilityOf, toVariantDto } from './catalog.mapper';

export type SellableVariant = VariantWithRelations & {
  product: {
    id: string;
    slug: string;
    name: string;
    isActive: boolean;
    images: { url: string; colorId: string | null }[];
  };
};

@Injectable()
export class VariantsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Always reads through to the database — stock must never come from a cache. */
  async listByProduct(productId: string): Promise<VariantDto[]> {
    const variants = await this.prisma.productVariant.findMany({
      where: { productId, isActive: true },
      include: variantInclude,
      orderBy: [{ price: 'asc' }],
    });
    if (!variants.length) {
      const exists = await this.prisma.product.count({ where: { id: productId } });
      if (!exists) throw Errors.notFound('محصول پیدا نشد');
    }
    return variants.map(toVariantDto);
  }

  async listBySlug(slug: string): Promise<VariantDto[]> {
    const product = await this.prisma.product.findUnique({ where: { slug }, select: { id: true } });
    if (!product) throw Errors.notFound('محصول پیدا نشد');
    return this.listByProduct(product.id);
  }

  async findSellable(variantId: string): Promise<SellableVariant> {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: {
        ...variantInclude,
        product: {
          select: {
            id: true,
            slug: true,
            name: true,
            isActive: true,
            images: { select: { url: true, colorId: true }, orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });
    if (!variant) throw Errors.notFound('این مدل پیدا نشد');
    if (!variant.isActive || !variant.product.isActive) {
      throw Errors.badRequest('VARIANT_INACTIVE', 'این مدل در حال حاضر قابل سفارش نیست');
    }
    return variant as SellableVariant;
  }

  availabilityOf(variant: VariantWithRelations): number {
    return availabilityOf(variant).available;
  }
}
