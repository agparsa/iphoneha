import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  ORDER_SOURCE_LABELS,
  PICKUP_METHOD,
  SHIPPING_TIME_LABELS,
  calcCartTotals,
  formatNumberFa,
  type AdminOrderDto,
  type ManualOrderInput,
} from '@iphoneha/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { Errors } from '../../common/errors';
import { toNumber } from '../../common/bigint';
import type { ClientInfo } from '../../common/utils';
import type { AuthAdmin } from '../../types/express';
import { AuditService } from '../audit/audit.service';
import { DevicesService } from '../devices/devices.service';
import { InventoryService } from '../inventory/inventory.service';
import { LedgerService } from '../ledger/ledger.service';
import { NotificationService } from '../notifications/notification.service';
import { MANUAL_PROVIDER } from '../payments/payments.service';
import { ShippingService } from '../shipping/shipping.service';
import { OrderNumberService } from './order-number.service';
import { OrdersService } from './orders.service';

/**
 * «ثبت سفارش تلفنی یا حضوری»: a sale the staff record in the panel. The
 * price always comes from the catalogue (less an optional discount), the
 * stock leaves the shelf at once, and the money is either taken at the
 * counter or written into the instalment book as a cheque or promissory-note
 * contract — all in one transaction.
 */
@Injectable()
export class ManualOrdersService {
  private readonly logger = new Logger(ManualOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly devices: DevicesService,
    private readonly ledger: LedgerService,
    private readonly shipping: ShippingService,
    private readonly orderNumbers: OrderNumberService,
    private readonly orders: OrdersService,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
  ) {}

  async create(input: ManualOrderInput, admin: AuthAdmin, client?: ClientInfo): Promise<AdminOrderDto> {
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: input.items.map((item) => item.variantId) } },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            images: { orderBy: { sortOrder: 'asc' }, select: { url: true, colorId: true } },
          },
        },
        color: { select: { name: true } },
        storage: { select: { labelFa: true } },
      },
    });
    const lines = input.items.map((item) => {
      const variant = variants.find((row) => row.id === item.variantId);
      if (!variant) throw Errors.badRequest('VARIANT_NOT_FOUND', 'یکی از کالاهای انتخاب‌شده پیدا نشد');
      const unitPrice = toNumber(variant.price);
      if (unitPrice <= 0) {
        throw Errors.badRequest(
          'NO_PRICE',
          `«${variant.product.name} ${variant.storage.labelFa} ${variant.color.name}» قیمت ندارد`,
        );
      }
      const compareAtPrice = variant.compareAtPrice ? toNumber(variant.compareAtPrice) : null;
      const images = variant.product.images;
      return {
        input: item,
        variantId: variant.id,
        productId: variant.product.id,
        productName: variant.product.name,
        productSlug: variant.product.slug,
        variantTitle: `${variant.storage.labelFa} — ${variant.color.name}`,
        colorName: variant.color.name,
        storageLabel: variant.storage.labelFa,
        sku: variant.sku,
        imageUrl:
          images.find((image) => image.colorId === variant.colorId)?.url ??
          images.find((image) => image.colorId === null)?.url ??
          images[0]?.url ??
          null,
        unitPrice,
        compareAtPrice,
        quantity: item.quantity,
        discount:
          compareAtPrice && compareAtPrice > unitPrice ? (compareAtPrice - unitPrice) * item.quantity : 0,
        finalPrice: unitPrice * item.quantity,
        shippingTime: variant.shippingTime,
      };
    });

    const totals = calcCartTotals(
      lines.map((line) => ({
        price: line.unitPrice,
        compareAtPrice: line.compareAtPrice,
        quantity: line.quantity,
      })),
    );
    if (input.discount > totals.itemsTotal) {
      throw Errors.badRequest('DISCOUNT_TOO_HIGH', 'تخفیف از جمع کالاها بیشتر است');
    }
    const afterDiscount = totals.itemsTotal - input.discount;

    let shippingCost = 0;
    let shippingMethodId: string | null = null;
    let shippingSnapshot: { code: string; name: string; etaLabel: string; cost: number };
    if (input.delivery.type === 'SHIP') {
      const quote = await this.shipping.quote(
        input.delivery.shippingMethodId,
        input.delivery.address.province,
        afterDiscount,
      );
      shippingCost = input.delivery.shippingCost ?? quote.cost;
      shippingMethodId = quote.method.id;
      shippingSnapshot = {
        code: quote.method.code,
        name: quote.method.name,
        etaLabel: quote.method.etaLabel,
        cost: shippingCost,
      };
    } else {
      shippingSnapshot = { ...PICKUP_METHOD, cost: 0 };
    }
    const total = afterDiscount + shippingCost;

    // the customer's account: found by mobile, or opened now (they can log in with it later)
    const existing = await this.prisma.user.findUnique({ where: { phone: input.customer.phone } });
    const firstName = input.customer.firstName ?? existing?.firstName ?? null;
    const lastName = input.customer.lastName ?? existing?.lastName ?? null;
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
    const payment = input.payment;
    if (payment.method !== 'IN_STORE' && !fullName) {
      throw Errors.badRequest('NAME_REQUIRED', 'برای قرارداد اقساطی نام و نام خانوادگی مشتری لازم است');
    }
    const customerName =
      fullName || (input.delivery.type === 'SHIP' ? input.delivery.address.recipientName : 'مشتری حضوری');

    const address =
      input.delivery.type === 'SHIP'
        ? {
            recipientName: input.delivery.address.recipientName,
            mobile: input.delivery.address.mobile,
            province: input.delivery.address.province,
            city: input.delivery.address.city,
            addressLine: input.delivery.address.addressLine,
            postalCode: input.delivery.address.postalCode,
            plaque: input.delivery.address.plaque ?? null,
            unit: input.delivery.address.unit ?? null,
            notes: input.delivery.address.notes ?? null,
          }
        : {
            recipientName: customerName,
            mobile: input.customer.phone,
            province: '',
            city: '',
            addressLine: PICKUP_METHOD.name,
            postalCode: '',
            plaque: null,
            unit: null,
            notes: null,
          };

    const now = new Date();
    const sourceLabel = ORDER_SOURCE_LABELS[input.source];
    const result = await this.prisma.transaction(
      async (tx) => {
        const user = existing
          ? await tx.user.update({
              where: { id: existing.id },
              data: {
                ...(!existing.firstName && firstName ? { firstName } : {}),
                ...(!existing.lastName && lastName ? { lastName } : {}),
              },
            })
          : await tx.user.create({ data: { phone: input.customer.phone, firstName, lastName } });

        const orderNumber = await this.orderNumbers.next(tx);
        const order = await tx.order.create({
          data: {
            orderNumber,
            userId: user.id,
            status: input.handedOver ? 'DELIVERED' : 'PAID',
            paymentMethod: payment.method,
            source: input.source,
            createdById: admin.id,
            adminNote: input.adminNote,
            customerName,
            customerPhone: input.customer.phone,
            shippingAddress: address as Prisma.InputJsonValue,
            shippingMethodId,
            shippingMethodSnapshot: shippingSnapshot as Prisma.InputJsonValue,
            subtotal: BigInt(totals.subtotal),
            itemsDiscount: BigInt(totals.itemsDiscount),
            couponDiscount: BigInt(input.discount),
            discountTotal: BigInt(totals.itemsDiscount + input.discount),
            shippingCost: BigInt(shippingCost),
            total: BigInt(total),
            paidAt: now,
            deliveredAt: input.handedOver ? now : null,
            items: {
              create: lines.map((line) => ({
                variantId: line.variantId,
                productId: line.productId,
                productName: line.productName,
                productSlug: line.productSlug,
                variantTitle: line.variantTitle,
                colorName: line.colorName,
                storageLabel: line.storageLabel,
                sku: line.sku,
                imageUrl: line.imageUrl,
                unitPrice: BigInt(line.unitPrice),
                compareAtPrice: line.compareAtPrice ? BigInt(line.compareAtPrice) : null,
                quantity: line.quantity,
                discount: BigInt(line.discount),
                finalPrice: BigInt(line.finalPrice),
                shippingTime: line.shippingTime,
                shippingTimeLabel: SHIPPING_TIME_LABELS[line.shippingTime],
              })),
            },
            statusHistory: {
              create: [
                {
                  toStatus: 'PAID',
                  actor: 'ADMIN',
                  adminUserId: admin.id,
                  note: `ثبت سفارش ${sourceLabel} در پنل`,
                },
                ...(input.handedOver
                  ? [
                      {
                        fromStatus: 'PAID' as const,
                        toStatus: 'DELIVERED' as const,
                        actor: 'ADMIN' as const,
                        adminUserId: admin.id,
                        note: 'تحویل حضوری در فروشگاه',
                      },
                    ]
                  : []),
              ],
            },
          },
          include: { items: true },
        });

        await this.inventory.sellInTx(
          tx,
          order.id,
          lines.map((line) => ({
            variantId: line.variantId,
            quantity: line.quantity,
            title: `${line.productName} ${line.variantTitle}`,
          })),
        );
        for (const line of lines) {
          if (!line.input.deviceIds.length) continue;
          const item = order.items.find((row) => row.variantId === line.variantId);
          if (item) await this.devices.assignInTx(tx, { ...item, devices: [] }, line.input.deviceIds);
        }

        let contractNumber: number | null = null;
        let contractId: string | null = null;
        if (payment.method !== 'IN_STORE') {
          const contract = await this.ledger.createInTx(
            tx,
            {
              method: payment.method,
              userId: user.id,
              orderId: order.id,
              creditRequestId: null,
              customerName,
              customerPhone: input.customer.phone,
              itemDescription:
                payment.contract.itemDescription ??
                lines
                  .map(
                    (line) =>
                      `${line.productName} ${line.variantTitle}${line.quantity > 1 ? ` × ${formatNumberFa(line.quantity)}` : ''}`,
                  )
                  .join('، '),
              cashPrice: total,
            },
            payment.contract,
            admin.id,
          );
          contractNumber = contract.number;
          contractId = contract.id;
        }

        await tx.payment.create({
          data: {
            orderId: order.id,
            method: payment.method,
            provider: MANUAL_PROVIDER,
            amount: BigInt(total),
            status: 'SUCCEEDED',
            trackingCode:
              payment.method === 'IN_STORE'
                ? payment.reference
                : contractNumber
                  ? `قرارداد ${contractNumber}`
                  : null,
            paidAt: now,
            meta: (payment.method === 'IN_STORE'
              ? { channel: payment.channel, recordedBy: admin.name }
              : { contractNumber, recordedBy: admin.name }) as Prisma.InputJsonValue,
          },
        });
        return { orderId: order.id, orderNumber: order.orderNumber, contractNumber, contractId };
      },
      { timeoutMs: 30_000 },
    );

    await this.inventory.notifyChanged(lines.map((line) => line.variantId)).catch((error: unknown) => {
      this.logger.warn(`stock update broadcast failed: ${String(error)}`);
    });
    await this.audit.log({
      adminUserId: admin.id,
      action: 'orders.create',
      entityType: 'Order',
      entityId: result.orderId,
      after: {
        orderNumber: result.orderNumber,
        source: input.source,
        paymentMethod: payment.method,
        total,
        contractNumber: result.contractNumber,
        items: input.items.map((item) => ({
          variantId: item.variantId,
          quantity: item.quantity,
          devices: item.deviceIds.length,
        })),
      },
      client,
    });
    if (input.notifyCustomer) {
      await this.notifications.sendOrderConfirmed(
        input.customer.phone,
        result.orderNumber,
        formatNumberFa(total),
      );
      if (result.contractId) await this.ledger.notifyIssued(result.contractId);
    }
    return this.orders.adminGet(result.orderId, admin.role);
  }
}
