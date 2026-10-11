import { Injectable } from '@nestjs/common';
import { Prisma, type Coupon, type Discount } from '@prisma/client';
import { PrismaService, type PrismaTx } from '../../infra/prisma/prisma.service';
import { Errors } from '../../common/errors';
import { toNumber } from '../../common/bigint';

export interface CouponEvaluation {
  valid: boolean;
  code: string;
  amount: number;
  message: string | null;
  couponId: string | null;
}

@Injectable()
export class DiscountsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Discount amount for a basket total, honouring caps and minimums. */
  static amountFor(discount: Discount, base: number): number {
    if (discount.type === 'PERCENT') {
      const raw = Math.round((base * Number(discount.value)) / 100);
      const cap = discount.maxDiscount ? toNumber(discount.maxDiscount) : null;
      return Math.max(0, Math.min(raw, cap ?? raw, base));
    }
    return Math.max(0, Math.min(toNumber(discount.value), base));
  }

  /**
   * Evaluates a coupon for a customer without consuming it.
   * Returns `valid: false` with a Persian reason instead of throwing, so the
   * cart can show the message inline.
   */
  async evaluate(code: string, userId: string | null, base: number): Promise<CouponEvaluation> {
    const invalid = (message: string): CouponEvaluation => ({
      valid: false,
      code,
      amount: 0,
      message,
      couponId: null,
    });

    const coupon = await this.prisma.coupon.findUnique({ where: { code }, include: { discount: true } });
    if (!coupon || !coupon.isActive) return invalid('کد تخفیف معتبر نیست');
    const discount = coupon.discount;
    if (!discount.isActive) return invalid('این کد تخفیف غیرفعال است');

    const now = new Date();
    if (discount.startsAt && discount.startsAt > now) return invalid('این کد تخفیف هنوز فعال نشده است');
    if (discount.endsAt && discount.endsAt < now) return invalid('مهلت استفاده از این کد تخفیف گذشته است');
    if (discount.minOrderAmount && base < toNumber(discount.minOrderAmount)) {
      return invalid(
        `این کد برای سفارش‌های بالای ${toNumber(discount.minOrderAmount).toLocaleString('fa-IR')} تومان است`,
      );
    }
    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
      return invalid('ظرفیت استفاده از این کد تخفیف تمام شده است');
    }
    if (userId) {
      const used = await this.prisma.couponRedemption.count({
        where: { couponId: coupon.id, userId, status: 'ACTIVE' },
      });
      if (used >= coupon.perUserLimit) return invalid('شما قبلاً از این کد تخفیف استفاده کرده‌اید');
    }

    const amount = DiscountsService.amountFor(discount, base);
    if (amount <= 0) return invalid('این کد برای سبد فعلی تخفیفی ندارد');
    return { valid: true, code: coupon.code, amount, message: null, couponId: coupon.id };
  }

  /** Consumes the coupon inside the checkout transaction. */
  async redeem(
    tx: PrismaTx,
    couponId: string,
    userId: string,
    orderId: string,
    amount: number,
  ): Promise<void> {
    const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      UPDATE "Coupon"
      SET "usedCount" = "usedCount" + 1, "updatedAt" = NOW()
      WHERE "id" = ${couponId}
        AND "isActive" = true
        AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")
      RETURNING "id"
    `);
    if (!rows.length) throw Errors.conflict('COUPON_EXHAUSTED', 'ظرفیت استفاده از این کد تخفیف تمام شد');
    await tx.couponRedemption.create({
      data: { couponId, userId, orderId, amount: BigInt(amount), status: 'ACTIVE' },
    });
  }

  /** Gives the coupon back when an order is cancelled or refunded. */
  async releaseRedemption(orderId: string): Promise<void> {
    const redemption = await this.prisma.couponRedemption.findUnique({ where: { orderId } });
    if (!redemption || redemption.status === 'RELEASED') return;
    await this.prisma.transaction(async (tx) => {
      const claimed = await tx.couponRedemption.updateMany({
        where: { id: redemption.id, status: 'ACTIVE' },
        data: { status: 'RELEASED' },
      });
      if (!claimed.count) return;
      await tx.coupon.update({
        where: { id: redemption.couponId },
        data: { usedCount: { decrement: 1 } },
      });
    });
  }

  findCoupon(code: string): Promise<(Coupon & { discount: Discount }) | null> {
    return this.prisma.coupon.findUnique({ where: { code }, include: { discount: true } });
  }
}
