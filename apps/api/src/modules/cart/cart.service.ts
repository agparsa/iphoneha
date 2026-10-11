import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  SHIPPING_TIME_LABELS,
  calcCartTotals,
  stockStatusOf,
  type CartDto,
  type CartIssueDto,
  type CartItemDto,
  type CartSummaryDto,
} from '@iphoneha/shared';
import { APP_CONFIG, type AppConfig } from '../../config/env.config';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { Errors } from '../../common/errors';
import { sha256, randomToken } from '../../common/utils';
import { toNullableNumber, toNumber } from '../../common/bigint';
import { DiscountsService } from '../discounts/discounts.service';

export interface CartContext {
  userId: string | null;
  guestToken: string | null;
}

export interface CartResult {
  cart: CartDto;
  /** Set when a new guest cart cookie has to be issued. */
  newGuestToken?: string;
}

const cartInclude = {
  items: {
    include: {
      variant: {
        include: {
          color: true,
          storage: true,
          inventory: true,
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              isActive: true,
              images: { select: { url: true, colorId: true }, orderBy: { sortOrder: 'asc' as const } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.CartInclude;

type CartWithItems = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly discounts: DiscountsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ─── Cart resolution ───────────────────────────────────────────────────────

  private async findCart(ctx: CartContext): Promise<CartWithItems | null> {
    if (ctx.userId) {
      return this.prisma.cart.findUnique({ where: { userId: ctx.userId }, include: cartInclude });
    }
    if (ctx.guestToken) {
      return this.prisma.cart.findUnique({
        where: { guestTokenHash: sha256(ctx.guestToken) },
        include: cartInclude,
      });
    }
    return null;
  }

  private async createCart(ctx: CartContext): Promise<{ cart: CartWithItems; newGuestToken?: string }> {
    if (ctx.userId) {
      const cart = await this.prisma.cart.create({ data: { userId: ctx.userId }, include: cartInclude });
      return { cart };
    }
    const token = ctx.guestToken ?? randomToken(24);
    const cart = await this.prisma.cart.create({
      data: {
        guestTokenHash: sha256(token),
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      },
      include: cartInclude,
    });
    return { cart, newGuestToken: ctx.guestToken ? undefined : token };
  }

  private async ensureCart(ctx: CartContext): Promise<{ cart: CartWithItems; newGuestToken?: string }> {
    const existing = await this.findCart(ctx);
    if (existing) return { cart: existing };
    return this.createCart(ctx);
  }

  private reload(cartId: string): Promise<CartWithItems> {
    return this.prisma.cart.findUniqueOrThrow({ where: { id: cartId }, include: cartInclude });
  }

  // ─── Queries ───────────────────────────────────────────────────────────────

  async get(ctx: CartContext): Promise<CartResult> {
    const cart = await this.findCart(ctx);
    if (!cart) {
      return { cart: CartService.emptyCart() };
    }
    return { cart: await this.toDto(cart, ctx.userId) };
  }

  static emptyCart(): CartDto {
    return {
      id: null,
      items: [],
      couponCode: null,
      summary: {
        itemsCount: 0,
        subtotal: 0,
        itemsDiscount: 0,
        couponDiscount: 0,
        discount: 0,
        shipping: null,
        total: 0,
      },
      issues: [],
    };
  }

  /** Items in a shape the checkout service can price and reserve. */
  async itemsForCheckout(userId: string) {
    const cart = await this.prisma.cart.findUnique({ where: { userId }, include: cartInclude });
    return cart;
  }

  // ─── Mutations ─────────────────────────────────────────────────────────────

  async addItem(ctx: CartContext, variantId: string, quantity: number): Promise<CartResult> {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { inventory: true, product: { select: { isActive: true, name: true } } },
    });
    if (!variant) throw Errors.notFound('این مدل پیدا نشد');
    if (!variant.isActive || !variant.product.isActive) {
      throw Errors.badRequest('VARIANT_INACTIVE', 'این مدل در حال حاضر قابل سفارش نیست');
    }

    const available = Math.max(0, (variant.inventory?.stock ?? 0) - (variant.inventory?.reserved ?? 0));
    if (available <= 0) throw Errors.conflict('OUT_OF_STOCK', 'این مدل ناموجود است');

    const { cart, newGuestToken } = await this.ensureCart(ctx);
    const existing = cart.items.find((item) => item.variantId === variantId);
    const maxQuantity = Math.min(available, this.config.MAX_QTY_PER_ITEM);
    const desired = (existing?.quantity ?? 0) + quantity;

    if (desired > maxQuantity) {
      if ((existing?.quantity ?? 0) >= maxQuantity) {
        throw Errors.conflict(
          'MAX_QUANTITY',
          available < this.config.MAX_QTY_PER_ITEM
            ? `بیشتر از ${available} عدد از این مدل موجود نیست`
            : `حداکثر ${this.config.MAX_QTY_PER_ITEM} عدد از هر مدل در هر سفارش`,
        );
      }
    }
    const finalQuantity = Math.min(desired, maxQuantity);

    await this.prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId: cart.id, variantId } },
      create: { cartId: cart.id, variantId, quantity: finalQuantity, priceAtAdd: variant.price },
      update: { quantity: finalQuantity },
    });
    await this.touch(cart.id);

    return { cart: await this.toDto(await this.reload(cart.id), ctx.userId), newGuestToken };
  }

  async updateItem(ctx: CartContext, itemId: string, quantity: number): Promise<CartResult> {
    const cart = await this.findCart(ctx);
    if (!cart) throw Errors.notFound('سبد خرید پیدا نشد');
    const item = cart.items.find((i) => i.id === itemId);
    if (!item) throw Errors.notFound('این کالا در سبد خرید نیست');

    const available = Math.max(
      0,
      (item.variant.inventory?.stock ?? 0) - (item.variant.inventory?.reserved ?? 0),
    );
    const maxQuantity = Math.min(available, this.config.MAX_QTY_PER_ITEM);
    if (quantity > maxQuantity) {
      throw Errors.conflict(
        'MAX_QUANTITY',
        available < this.config.MAX_QTY_PER_ITEM
          ? `بیشتر از ${available} عدد از این مدل موجود نیست`
          : `حداکثر ${this.config.MAX_QTY_PER_ITEM} عدد از هر مدل در هر سفارش`,
      );
    }

    await this.prisma.cartItem.update({ where: { id: itemId }, data: { quantity } });
    await this.touch(cart.id);
    return { cart: await this.toDto(await this.reload(cart.id), ctx.userId) };
  }

  async removeItem(ctx: CartContext, itemId: string): Promise<CartResult> {
    const cart = await this.findCart(ctx);
    if (!cart) throw Errors.notFound('سبد خرید پیدا نشد');
    if (!cart.items.some((i) => i.id === itemId)) throw Errors.notFound('این کالا در سبد خرید نیست');
    await this.prisma.cartItem.delete({ where: { id: itemId } });
    await this.touch(cart.id);
    return { cart: await this.toDto(await this.reload(cart.id), ctx.userId) };
  }

  async clear(ctx: CartContext): Promise<CartResult> {
    const cart = await this.findCart(ctx);
    if (!cart) return { cart: CartService.emptyCart() };
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    await this.prisma.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
    return { cart: await this.toDto(await this.reload(cart.id), ctx.userId) };
  }

  async applyCoupon(ctx: CartContext, code: string): Promise<CartResult> {
    const cart = await this.findCart(ctx);
    if (!cart || !cart.items.length) throw Errors.badRequest('EMPTY_CART', 'سبد خرید خالی است');
    const totals = this.lineTotals(cart);
    const evaluation = await this.discounts.evaluate(code, ctx.userId, totals.itemsTotal);
    if (!evaluation.valid)
      throw Errors.badRequest('INVALID_COUPON', evaluation.message ?? 'کد تخفیف معتبر نیست');
    await this.prisma.cart.update({ where: { id: cart.id }, data: { couponCode: evaluation.code } });
    return { cart: await this.toDto(await this.reload(cart.id), ctx.userId) };
  }

  async removeCoupon(ctx: CartContext): Promise<CartResult> {
    const cart = await this.findCart(ctx);
    if (!cart) return { cart: CartService.emptyCart() };
    await this.prisma.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
    return { cart: await this.toDto(await this.reload(cart.id), ctx.userId) };
  }

  /** Called right after a successful login. */
  async mergeGuestCartIntoUser(guestToken: string, userId: string): Promise<void> {
    const guestCart = await this.prisma.cart.findUnique({
      where: { guestTokenHash: sha256(guestToken) },
      include: cartInclude,
    });
    if (!guestCart) return;

    const userCart =
      (await this.prisma.cart.findUnique({ where: { userId }, include: cartInclude })) ??
      (await this.prisma.cart.create({ data: { userId }, include: cartInclude }));

    for (const item of guestCart.items) {
      const existing = userCart.items.find((i) => i.variantId === item.variantId);
      const available = Math.max(
        0,
        (item.variant.inventory?.stock ?? 0) - (item.variant.inventory?.reserved ?? 0),
      );
      const maxQuantity = Math.min(available, this.config.MAX_QTY_PER_ITEM);
      if (maxQuantity <= 0) continue;
      const quantity = Math.min((existing?.quantity ?? 0) + item.quantity, maxQuantity);
      await this.prisma.cartItem.upsert({
        where: { cartId_variantId: { cartId: userCart.id, variantId: item.variantId } },
        create: { cartId: userCart.id, variantId: item.variantId, quantity, priceAtAdd: item.priceAtAdd },
        update: { quantity },
      });
    }

    if (guestCart.couponCode && !userCart.couponCode) {
      await this.prisma.cart.update({
        where: { id: userCart.id },
        data: { couponCode: guestCart.couponCode },
      });
    }
    await this.prisma.cart.delete({ where: { id: guestCart.id } });
  }

  /** Empties the cart after a successful checkout (inside its transaction). */
  async clearAfterCheckout(cartId: string): Promise<void> {
    await this.prisma.cartItem.deleteMany({ where: { cartId } });
    await this.prisma.cart.update({ where: { id: cartId }, data: { couponCode: null } });
  }

  private async touch(cartId: string): Promise<void> {
    await this.prisma.cart.update({
      where: { id: cartId },
      data: { expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000) },
    });
  }

  /** Deletes abandoned guest carts. */
  async purgeExpired(): Promise<number> {
    const result = await this.prisma.cart.deleteMany({
      where: { userId: null, expiresAt: { lt: new Date() } },
    });
    return result.count;
  }

  // ─── Mapping ───────────────────────────────────────────────────────────────

  private lineTotals(cart: CartWithItems) {
    return calcCartTotals(
      cart.items.map((item) => ({
        price: toNumber(item.variant.price),
        compareAtPrice: toNullableNumber(item.variant.compareAtPrice),
        quantity: item.quantity,
      })),
    );
  }

  async toDto(cart: CartWithItems, userId: string | null): Promise<CartDto> {
    const issues: CartIssueDto[] = [];
    const items: CartItemDto[] = cart.items.map((item) => {
      const variant = item.variant;
      const available = Math.max(0, (variant.inventory?.stock ?? 0) - (variant.inventory?.reserved ?? 0));
      const unitPrice = toNumber(variant.price);
      const compareAtPrice = toNullableNumber(variant.compareAtPrice);
      const previousUnitPrice = toNumber(item.priceAtAdd);
      const isAvailable = variant.isActive && variant.product.isActive && available >= item.quantity;
      const image =
        variant.product.images.find((i) => i.colorId === variant.colorId)?.url ??
        variant.product.images.find((i) => i.colorId === null)?.url ??
        variant.product.images[0]?.url ??
        null;

      if (!variant.isActive || !variant.product.isActive) {
        issues.push({
          itemId: item.id,
          code: 'INACTIVE',
          message: `«${variant.product.name}» دیگر قابل سفارش نیست`,
        });
      } else if (available <= 0) {
        issues.push({
          itemId: item.id,
          code: 'OUT_OF_STOCK',
          message: `«${variant.product.name}» ناموجود شد`,
        });
      } else if (available < item.quantity) {
        issues.push({
          itemId: item.id,
          code: 'INSUFFICIENT_STOCK',
          message: `از «${variant.product.name}» فقط ${available} عدد موجود است`,
        });
      }
      if (previousUnitPrice !== unitPrice) {
        issues.push({
          itemId: item.id,
          code: 'PRICE_CHANGED',
          message: `قیمت «${variant.product.name}» تغییر کرد`,
        });
      }

      return {
        id: item.id,
        variantId: variant.id,
        productId: variant.product.id,
        productName: variant.product.name,
        productSlug: variant.product.slug,
        sku: variant.sku,
        color: {
          id: variant.color.id,
          code: variant.color.code,
          name: variant.color.name,
          hex: variant.color.hex,
        },
        storage: {
          id: variant.storage.id,
          label: variant.storage.label,
          labelFa: variant.storage.labelFa,
          capacityGb: variant.storage.capacityGb,
        },
        image,
        quantity: item.quantity,
        unitPrice,
        compareAtPrice,
        discountPercent: variant.discountPercent,
        lineDiscount:
          compareAtPrice && compareAtPrice > unitPrice ? (compareAtPrice - unitPrice) * item.quantity : 0,
        lineTotal: unitPrice * item.quantity,
        availableStock: available,
        maxQuantity: Math.min(available, this.config.MAX_QTY_PER_ITEM),
        shippingTime: variant.shippingTime,
        shippingTimeLabel: SHIPPING_TIME_LABELS[variant.shippingTime],
        isAvailable,
        priceChanged: previousUnitPrice !== unitPrice,
        previousUnitPrice: previousUnitPrice !== unitPrice ? previousUnitPrice : null,
        stockStatus: stockStatusOf(available, variant.inventory?.lowStockThreshold ?? 2),
      };
    });

    const totals = calcCartTotals(
      items.map((i) => ({ price: i.unitPrice, compareAtPrice: i.compareAtPrice, quantity: i.quantity })),
    );

    let couponDiscount = 0;
    let couponCode: string | null = cart.couponCode;
    if (couponCode && totals.itemsTotal > 0) {
      const evaluation = await this.discounts.evaluate(couponCode, userId, totals.itemsTotal);
      if (evaluation.valid) {
        couponDiscount = evaluation.amount;
      } else {
        couponCode = null;
      }
    }

    const summary: CartSummaryDto = {
      itemsCount: totals.itemsCount,
      subtotal: totals.subtotal,
      itemsDiscount: totals.itemsDiscount,
      couponDiscount,
      discount: totals.itemsDiscount + couponDiscount,
      shipping: null,
      total: Math.max(0, totals.itemsTotal - couponDiscount),
    };

    return { id: cart.id, items, couponCode, summary, issues };
  }

  /** Used by the checkout flow to fail fast on stale carts. */
  static blockingIssues(cart: CartDto): CartIssueDto[] {
    return cart.issues.filter((issue) => issue.code !== 'PRICE_CHANGED');
  }
}
