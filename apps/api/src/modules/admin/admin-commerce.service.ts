import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  DISCOUNT_TYPE_LABELS,
  type CouponDto,
  type CouponInput,
  type DiscountDto,
  type DiscountInput,
  type Paginated,
  type ShippingMethodAdminDto,
  type ShippingMethodInput,
} from '@iphoneha/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { Errors } from '../../common/errors';
import { paginate, skipTake, type ClientInfo } from '../../common/utils';
import { toNullableNumber, toNumber } from '../../common/bigint';
import { AuditService } from '../audit/audit.service';
import type { AuthAdmin } from '../../types/express';

@Injectable()
export class AdminCommerceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─── Discounts ─────────────────────────────────────────────────────────────

  private toDiscountDto(
    discount: Prisma.DiscountGetPayload<{ include: { _count: { select: { coupons: true } } } }>,
  ): DiscountDto {
    return {
      id: discount.id,
      name: discount.name,
      type: discount.type,
      value: toNumber(discount.value),
      maxDiscount: toNullableNumber(discount.maxDiscount),
      minOrderAmount: toNullableNumber(discount.minOrderAmount),
      startsAt: discount.startsAt?.toISOString() ?? null,
      endsAt: discount.endsAt?.toISOString() ?? null,
      isActive: discount.isActive,
      couponsCount: discount._count.coupons,
      createdAt: discount.createdAt.toISOString(),
    };
  }

  async listDiscounts(page: number, pageSize: number): Promise<Paginated<DiscountDto>> {
    const [rows, total] = await Promise.all([
      this.prisma.discount.findMany({
        include: { _count: { select: { coupons: true } } },
        orderBy: { createdAt: 'desc' },
        ...skipTake(page, pageSize),
      }),
      this.prisma.discount.count(),
    ]);
    return paginate(
      rows.map((r) => this.toDiscountDto(r)),
      total,
      page,
      pageSize,
    );
  }

  async createDiscount(input: DiscountInput, admin: AuthAdmin, client: ClientInfo): Promise<DiscountDto> {
    const discount = await this.prisma.discount.create({
      data: {
        name: input.name,
        type: input.type,
        value: BigInt(input.value),
        maxDiscount: input.maxDiscount ? BigInt(input.maxDiscount) : null,
        minOrderAmount: input.minOrderAmount ? BigInt(input.minOrderAmount) : null,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        isActive: input.isActive,
      },
      include: { _count: { select: { coupons: true } } },
    });
    await this.audit.log({
      adminUserId: admin.id,
      action: 'discount.create',
      entityType: 'Discount',
      entityId: discount.id,
      after: { name: input.name, type: input.type, value: input.value },
      client,
    });
    return this.toDiscountDto(discount);
  }

  async updateDiscount(
    id: string,
    input: DiscountInput,
    admin: AuthAdmin,
    client: ClientInfo,
  ): Promise<DiscountDto> {
    const before = await this.prisma.discount.findUnique({ where: { id } });
    if (!before) throw Errors.notFound('تخفیف پیدا نشد');
    const discount = await this.prisma.discount.update({
      where: { id },
      data: {
        name: input.name,
        type: input.type,
        value: BigInt(input.value),
        maxDiscount: input.maxDiscount ? BigInt(input.maxDiscount) : null,
        minOrderAmount: input.minOrderAmount ? BigInt(input.minOrderAmount) : null,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        isActive: input.isActive,
      },
      include: { _count: { select: { coupons: true } } },
    });
    await this.audit.log({
      adminUserId: admin.id,
      action: 'discount.update',
      entityType: 'Discount',
      entityId: id,
      before: { name: before.name, isActive: before.isActive },
      after: { name: input.name, isActive: input.isActive },
      client,
    });
    return this.toDiscountDto(discount);
  }

  async deleteDiscount(id: string, admin: AuthAdmin, client: ClientInfo): Promise<{ deleted: boolean }> {
    const used = await this.prisma.couponRedemption.count({ where: { coupon: { discountId: id } } });
    if (used > 0) {
      await this.prisma.discount.update({ where: { id }, data: { isActive: false } });
      await this.audit.log({
        adminUserId: admin.id,
        action: 'discount.deactivate',
        entityType: 'Discount',
        entityId: id,
        client,
      });
      return { deleted: false };
    }
    await this.prisma.discount.delete({ where: { id } });
    await this.audit.log({
      adminUserId: admin.id,
      action: 'discount.delete',
      entityType: 'Discount',
      entityId: id,
      client,
    });
    return { deleted: true };
  }

  // ─── Coupons ───────────────────────────────────────────────────────────────

  async listCoupons(page: number, pageSize: number): Promise<Paginated<CouponDto>> {
    const [rows, total] = await Promise.all([
      this.prisma.coupon.findMany({
        include: { discount: true },
        orderBy: { createdAt: 'desc' },
        ...skipTake(page, pageSize),
      }),
      this.prisma.coupon.count(),
    ]);
    return paginate(
      rows.map((coupon) => ({
        id: coupon.id,
        code: coupon.code,
        discountId: coupon.discountId,
        discountName: `${coupon.discount.name} (${DISCOUNT_TYPE_LABELS[coupon.discount.type]})`,
        usageLimit: coupon.usageLimit,
        perUserLimit: coupon.perUserLimit,
        usedCount: coupon.usedCount,
        isActive: coupon.isActive,
        createdAt: coupon.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    );
  }

  async createCoupon(input: CouponInput, admin: AuthAdmin, client: ClientInfo): Promise<CouponDto> {
    const exists = await this.prisma.coupon.findUnique({ where: { code: input.code } });
    if (exists) throw Errors.conflict('COUPON_EXISTS', 'این کد تخفیف قبلاً ثبت شده است');
    const discount = await this.prisma.discount.findUnique({ where: { id: input.discountId } });
    if (!discount) throw Errors.notFound('تخفیف انتخابی پیدا نشد');

    const coupon = await this.prisma.coupon.create({ data: input, include: { discount: true } });
    await this.audit.log({
      adminUserId: admin.id,
      action: 'coupon.create',
      entityType: 'Coupon',
      entityId: coupon.id,
      after: { code: coupon.code },
      client,
    });
    return {
      id: coupon.id,
      code: coupon.code,
      discountId: coupon.discountId,
      discountName: coupon.discount.name,
      usageLimit: coupon.usageLimit,
      perUserLimit: coupon.perUserLimit,
      usedCount: coupon.usedCount,
      isActive: coupon.isActive,
      createdAt: coupon.createdAt.toISOString(),
    };
  }

  async updateCoupon(
    id: string,
    input: Partial<CouponInput>,
    admin: AuthAdmin,
    client: ClientInfo,
  ): Promise<CouponDto> {
    const before = await this.prisma.coupon.findUnique({ where: { id } });
    if (!before) throw Errors.notFound('کد تخفیف پیدا نشد');
    const coupon = await this.prisma.coupon.update({
      where: { id },
      data: {
        ...(input.usageLimit !== undefined ? { usageLimit: input.usageLimit } : {}),
        ...(input.perUserLimit !== undefined ? { perUserLimit: input.perUserLimit } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      include: { discount: true },
    });
    await this.audit.log({
      adminUserId: admin.id,
      action: 'coupon.update',
      entityType: 'Coupon',
      entityId: id,
      before: { isActive: before.isActive, usageLimit: before.usageLimit },
      after: { isActive: coupon.isActive, usageLimit: coupon.usageLimit },
      client,
    });
    return {
      id: coupon.id,
      code: coupon.code,
      discountId: coupon.discountId,
      discountName: coupon.discount.name,
      usageLimit: coupon.usageLimit,
      perUserLimit: coupon.perUserLimit,
      usedCount: coupon.usedCount,
      isActive: coupon.isActive,
      createdAt: coupon.createdAt.toISOString(),
    };
  }

  // ─── Shipping methods ──────────────────────────────────────────────────────

  private toShippingDto(method: Prisma.ShippingMethodGetPayload<object>): ShippingMethodAdminDto {
    return {
      id: method.id,
      code: method.code,
      name: method.name,
      description: method.description,
      calculator: method.calculator,
      baseCost: toNumber(method.baseCost),
      freeThreshold: toNullableNumber(method.freeThreshold),
      etaLabel: method.etaLabel,
      allowedProvinces: method.allowedProvinces,
      isActive: method.isActive,
      sortOrder: method.sortOrder,
    };
  }

  async listShipping(): Promise<ShippingMethodAdminDto[]> {
    const methods = await this.prisma.shippingMethod.findMany({ orderBy: { sortOrder: 'asc' } });
    return methods.map((m) => this.toShippingDto(m));
  }

  async createShipping(
    input: ShippingMethodInput,
    admin: AuthAdmin,
    client: ClientInfo,
  ): Promise<ShippingMethodAdminDto> {
    const exists = await this.prisma.shippingMethod.findUnique({ where: { code: input.code } });
    if (exists) throw Errors.conflict('SHIPPING_EXISTS', 'این کد روش ارسال قبلاً ثبت شده است');
    const method = await this.prisma.shippingMethod.create({
      data: {
        ...input,
        baseCost: BigInt(input.baseCost),
        freeThreshold: input.freeThreshold ? BigInt(input.freeThreshold) : null,
      },
    });
    await this.audit.log({
      adminUserId: admin.id,
      action: 'shipping.create',
      entityType: 'ShippingMethod',
      entityId: method.id,
      after: { code: input.code, name: input.name },
      client,
    });
    return this.toShippingDto(method);
  }

  async updateShipping(
    id: string,
    input: ShippingMethodInput,
    admin: AuthAdmin,
    client: ClientInfo,
  ): Promise<ShippingMethodAdminDto> {
    const before = await this.prisma.shippingMethod.findUnique({ where: { id } });
    if (!before) throw Errors.notFound('روش ارسال پیدا نشد');
    const method = await this.prisma.shippingMethod.update({
      where: { id },
      data: {
        ...input,
        baseCost: BigInt(input.baseCost),
        freeThreshold: input.freeThreshold ? BigInt(input.freeThreshold) : null,
      },
    });
    await this.audit.log({
      adminUserId: admin.id,
      action: 'shipping.update',
      entityType: 'ShippingMethod',
      entityId: id,
      before: { name: before.name, baseCost: toNumber(before.baseCost), isActive: before.isActive },
      after: { name: input.name, baseCost: input.baseCost, isActive: input.isActive },
      client,
    });
    return this.toShippingDto(method);
  }

  async deleteShipping(id: string, admin: AuthAdmin, client: ClientInfo): Promise<{ deleted: boolean }> {
    const used = await this.prisma.order.count({ where: { shippingMethodId: id } });
    if (used > 0) {
      await this.prisma.shippingMethod.update({ where: { id }, data: { isActive: false } });
      await this.audit.log({
        adminUserId: admin.id,
        action: 'shipping.deactivate',
        entityType: 'ShippingMethod',
        entityId: id,
        client,
      });
      return { deleted: false };
    }
    await this.prisma.shippingMethod.delete({ where: { id } });
    await this.audit.log({
      adminUserId: admin.id,
      action: 'shipping.delete',
      entityType: 'ShippingMethod',
      entityId: id,
      client,
    });
    return { deleted: true };
  }
}
