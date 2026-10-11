import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ADMIN_ORDER_TRANSITIONS,
  CONTRACT_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  canAdminTransition,
  roleCanSetOrderStatus,
  roleHasPermission,
  addDaysIso,
  tehranDayStart,
  toLatinDigits,
  tehranToday,
  transitionRequiresRefund,
  transitionRestocks,
  type AdminOrderDto,
  type AdminOrderListItem,
  type AdminOrderListQuery,
  type BulkOrderStatusInput,
  type BulkOrderStatusResultDto,
  type OrderDto,
  type OrderStatus,
  type OrderSummaryDto,
  type Paginated,
  type UpdateOrderStatusInput,
} from '@iphoneha/shared';
import type { Prisma } from '@prisma/client';
import { APP_CONFIG, type AppConfig } from '../../config/env.config';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { Errors } from '../../common/errors';
import { paginate, skipTake } from '../../common/utils';
import { toNumber } from '../../common/bigint';
import { InventoryService } from '../inventory/inventory.service';
import { DiscountsService } from '../discounts/discounts.service';
import { PaymentsService } from '../payments/payments.service';
import { NotificationService } from '../notifications/notification.service';
import { DevicesService } from '../devices/devices.service';
import { LedgerService } from '../ledger/ledger.service';
import { orderInclude, toOrderDto, toOrderSummary } from './orders.mapper';
import type { AuthAdmin } from '../../types/express';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly discounts: DiscountsService,
    private readonly payments: PaymentsService,
    private readonly notifications: NotificationService,
    private readonly devices: DevicesService,
    private readonly ledger: LedgerService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ─── Customer ──────────────────────────────────────────────────────────────

  async listForUser(userId: string, page: number, pageSize: number): Promise<Paginated<OrderSummaryDto>> {
    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where: { userId },
        include: { items: true },
        orderBy: { createdAt: 'desc' },
        ...skipTake(page, pageSize),
      }),
      this.prisma.order.count({ where: { userId } }),
    ]);
    return paginate(orders.map(toOrderSummary), total, page, pageSize);
  }

  async getForUser(userId: string, idOrNumber: string): Promise<OrderDto> {
    const order = await this.prisma.order.findFirst({
      where: { userId, OR: [{ id: idOrNumber }, { orderNumber: idOrNumber }] },
      include: orderInclude,
    });
    if (!order) throw Errors.notFound('سفارش پیدا نشد');
    return toOrderDto(order);
  }

  /** Customer cancels an order that has not been paid yet. */
  async cancelByUser(userId: string, orderId: string): Promise<OrderDto> {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, userId } });
    if (!order) throw Errors.notFound('سفارش پیدا نشد');
    if (!['PENDING', 'PAYMENT_PENDING'].includes(order.status)) {
      throw Errors.conflict('ORDER_NOT_CANCELLABLE', 'این سفارش قابل لغو نیست');
    }
    const cancelled = await this.prisma.order.updateMany({
      where: { id: orderId, status: { in: ['PENDING', 'PAYMENT_PENDING'] } },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: 'لغو توسط مشتری' },
    });
    if (cancelled.count) {
      await this.inventory.release(orderId, 'لغو سفارش توسط مشتری');
      await this.discounts.releaseRedemption(orderId);
      await this.payments.expirePendingPayments(orderId);
      await this.prisma.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: 'CANCELLED',
          actor: 'USER',
          note: 'لغو توسط مشتری',
        },
      });
    }
    return this.getForUser(userId, orderId);
  }

  // ─── Expiry ────────────────────────────────────────────────────────────────

  /**
   * Cancels an unpaid order once its reservation window is over.
   * The provider is asked first, so a payment whose callback never arrived is
   * still honoured instead of being cancelled.
   */
  async expireOrder(orderId: string): Promise<'PAID' | 'CANCELLED' | 'SKIPPED'> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return 'SKIPPED';
    if (!['PENDING', 'PAYMENT_PENDING'].includes(order.status)) return 'SKIPPED';

    const paid = await this.payments.reconcileOrder(orderId);
    if (paid) return 'PAID';

    const cancelled = await this.prisma.order.updateMany({
      where: { id: orderId, status: { in: ['PENDING', 'PAYMENT_PENDING'] } },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: 'پایان مهلت پرداخت' },
    });
    if (!cancelled.count) return 'SKIPPED';

    await this.inventory.release(orderId, 'پایان مهلت پرداخت');
    await this.discounts.releaseRedemption(orderId);
    await this.payments.expirePendingPayments(orderId);
    await this.prisma.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: order.status,
        toStatus: 'CANCELLED',
        actor: 'SYSTEM',
        note: 'پایان مهلت پرداخت',
      },
    });
    this.logger.log(`order ${order.orderNumber} expired and its stock was released`);
    return 'CANCELLED';
  }

  /** Safety net for reservations whose delayed job was lost. */
  async sweepExpiredReservations(limit = 50): Promise<number> {
    const orders = await this.prisma.order.findMany({
      where: {
        status: { in: ['PENDING', 'PAYMENT_PENDING'] },
        reservationExpiresAt: { lt: new Date(Date.now() - 30_000) },
      },
      select: { id: true },
      take: limit,
    });
    let count = 0;
    for (const order of orders) {
      const result = await this.expireOrder(order.id);
      if (result !== 'SKIPPED') count += 1;
    }
    return count;
  }

  // ─── Admin ─────────────────────────────────────────────────────────────────

  async adminList(query: AdminOrderListQuery): Promise<Paginated<AdminOrderListItem>> {
    const where: Prisma.OrderWhereInput = {};
    if (query.status.length) where.status = { in: query.status };
    if (query.paymentMethod.length) where.paymentMethod = { in: query.paymentMethod };
    if (query.source.length) where.source = { in: query.source };
    if (query.from || query.to) {
      // whole Tehran days, both ends included
      where.createdAt = {
        ...(query.from ? { gte: tehranDayStart(query.from) } : {}),
        ...(query.to ? { lt: tehranDayStart(addDaysIso(query.to, 1)) } : {}),
      };
    }
    if (query.q) {
      const q = query.q.trim();
      const digits = toLatinDigits(q).replace(/\D/g, '');
      where.OR = [
        { orderNumber: { contains: toLatinDigits(q), mode: 'insensitive' } },
        { customerPhone: { contains: digits || q } },
        { customerName: { contains: q, mode: 'insensitive' } },
        { items: { some: { sku: { contains: q, mode: 'insensitive' } } } },
        // a phone's IMEI or serial number finds the order it left on
        ...(digits.length >= 6
          ? [
              {
                items: {
                  some: {
                    devices: {
                      some: {
                        OR: [
                          { imei: { contains: digits } },
                          { imei2: { contains: digits } },
                          { serialNumber: { contains: q, mode: 'insensitive' as const } },
                        ],
                      },
                    },
                  },
                },
              },
            ]
          : []),
      ];
    }

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: { items: true, payments: { orderBy: { createdAt: 'desc' }, take: 1 } },
        orderBy: { createdAt: 'desc' },
        ...skipTake(query.page, query.pageSize),
      }),
      this.prisma.order.count({ where }),
    ]);

    return paginate(
      orders.map((order) => ({
        ...toOrderSummary(order),
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        paymentStatus: order.payments[0]?.status ?? null,
      })),
      total,
      query.page,
      query.pageSize,
    );
  }

  async adminGet(orderId: string, role: AuthAdmin['role']): Promise<AdminOrderDto> {
    const order = await this.prisma.order.findFirst({
      where: { OR: [{ id: orderId }, { orderNumber: orderId }] },
      include: {
        ...orderInclude,
        items: { include: { devices: { orderBy: { imei: 'asc' } } } },
        user: { select: { id: true, phone: true, firstName: true, lastName: true } },
        createdBy: { select: { name: true } },
        contract: { select: { id: true, number: true, status: true } },
      },
    });
    if (!order) throw Errors.notFound('سفارش پیدا نشد');

    const allowed = ADMIN_ORDER_TRANSITIONS[order.status].filter((status) =>
      roleCanSetOrderStatus(role, status),
    );
    return {
      ...toOrderDto(order),
      user: {
        id: order.user.id,
        phone: order.user.phone,
        fullName: [order.user.firstName, order.user.lastName].filter(Boolean).join(' ') || null,
      },
      allowedTransitions: allowed,
      reservations: order.reservations.map((r) => ({
        variantId: r.variantId,
        sku: r.variant.sku,
        quantity: r.quantity,
        status: r.status,
        expiresAt: r.expiresAt.toISOString(),
      })),
      adminNote: order.adminNote,
      createdByName: order.createdBy?.name ?? null,
      contract: order.contract
        ? {
            id: order.contract.id,
            number: order.contract.number,
            status: order.contract.status,
            statusLabel: CONTRACT_STATUS_LABELS[order.contract.status],
          }
        : null,
      devices: order.items.flatMap((item) =>
        item.devices.map((device) => ({
          id: device.id,
          orderItemId: item.id,
          imei: device.imei,
          imei2: device.imei2,
          serialNumber: device.serialNumber,
        })),
      ),
    };
  }

  /** Admin status change with refund/restock side effects. */
  async adminChangeStatus(
    admin: AuthAdmin,
    orderId: string,
    input: UpdateOrderStatusInput,
  ): Promise<AdminOrderDto> {
    const order = await this.prisma.order.findFirst({
      where: { OR: [{ id: orderId }, { orderNumber: orderId }] },
    });
    if (!order) throw Errors.notFound('سفارش پیدا نشد');

    const target: OrderStatus = input.status;
    if (order.status === target) return this.adminGet(order.id, admin.role);
    if (!canAdminTransition(order.status, target)) {
      throw Errors.conflict(
        'INVALID_TRANSITION',
        `تغییر وضعیت از «${ORDER_STATUS_LABELS[order.status]}» به «${ORDER_STATUS_LABELS[target]}» مجاز نیست`,
      );
    }
    if (!roleCanSetOrderStatus(admin.role, target)) {
      throw Errors.forbidden('برای این تغییر وضعیت دسترسی ندارید');
    }
    if (transitionRequiresRefund(order.status, target) && !roleHasPermission(admin.role, 'payments.refund')) {
      throw Errors.forbidden('لغو یا استرداد سفارش پرداخت‌شده نیاز به دسترسی بازپرداخت دارد');
    }

    const now = new Date();
    const data: Prisma.OrderUpdateInput = { status: target };
    // a status change without a code keeps the one already given
    if (input.trackingCode) data.trackingCode = input.trackingCode;
    if (target === 'SHIPPED') data.shippedAt = now;
    if (target === 'DELIVERED') data.deliveredAt = now;
    if (target === 'CANCELLED') {
      data.cancelledAt = now;
      data.cancelReason = input.note ?? 'لغو توسط مدیر';
    }

    const updated = await this.prisma.order.updateMany({
      where: { id: order.id, status: order.status },
      data,
    });
    if (!updated.count)
      throw Errors.conflict('ORDER_CHANGED', 'وضعیت سفارش هم‌زمان تغییر کرده است. صفحه را تازه کنید');

    await this.prisma.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: target,
        actor: 'ADMIN',
        adminUserId: admin.id,
        note: input.note ?? null,
      },
    });

    if (transitionRestocks(order.status, target)) {
      await this.payments.refundOrder(order.id, input.note ?? 'لغو سفارش توسط مدیر');
      await this.inventory.restock(order.id, 'برگشت کالا به انبار');
      await this.discounts.releaseRedemption(order.id);
    } else if (target === 'CANCELLED') {
      await this.inventory.release(order.id, 'لغو سفارش توسط مدیر');
      await this.discounts.releaseRedemption(order.id);
      await this.payments.expirePendingPayments(order.id);
    }
    if (target === 'CANCELLED' || target === 'REFUNDED') {
      // phones that had left the store come back as «مرجوعی»; the rest are simply back on the shelf
      const handedOver = order.status === 'SHIPPED' || order.status === 'DELIVERED';
      await this.devices.releaseForOrder(order.id, handedOver);
      await this.ledger.cancelForOrder(
        order.id,
        `سفارش ${order.orderNumber} ${target === 'CANCELLED' ? 'لغو' : 'مرجوع'} شد${input.note ? `: ${input.note}` : ''}`,
      );
    }

    if (target === 'SHIPPED') {
      await this.notifications.sendOrderShipped(
        order.customerPhone,
        order.orderNumber,
        input.trackingCode ?? null,
      );
    }
    if (target === 'DELIVERED') {
      // credit services that settle only on delivery (DigiPay) are told now
      await this.payments.confirmDelivery(order.id);
    }

    return this.adminGet(order.id, admin.role);
  }

  /** The staff's internal note on an order (never shown to the customer). */
  async adminSetNote(orderId: string, adminNote: string | null, admin: AuthAdmin): Promise<AdminOrderDto> {
    const order = await this.prisma.order.findFirst({
      where: { OR: [{ id: orderId }, { orderNumber: orderId }] },
    });
    if (!order) throw Errors.notFound('سفارش پیدا نشد');
    await this.prisma.order.update({ where: { id: order.id }, data: { adminNote } });
    return this.adminGet(order.id, admin.role);
  }

  /**
   * «تغییر وضعیت گروهی»: each order goes through the same checks as one by one;
   * those that cannot move are listed with the reason, the rest move.
   */
  async adminBulkStatus(admin: AuthAdmin, input: BulkOrderStatusInput): Promise<BulkOrderStatusResultDto> {
    const result: BulkOrderStatusResultDto = { updated: [], failed: [] };
    for (const orderId of [...new Set(input.orderIds)]) {
      try {
        const order = await this.adminChangeStatus(admin, orderId, {
          status: input.status,
          note: input.note,
          trackingCode: null,
        });
        result.updated.push(order.orderNumber);
      } catch (error) {
        const known = await this.prisma.order.findUnique({
          where: { id: orderId },
          select: { orderNumber: true },
        });
        result.failed.push({
          orderId,
          orderNumber: known?.orderNumber ?? null,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return result;
  }

  // ─── Dashboard helpers ─────────────────────────────────────────────────────

  async statsForDashboard() {
    const now = new Date();
    // the store's day is Tehran's day, whatever the server's clock zone
    const startOfToday = tehranDayStart(tehranToday(now));
    const last30 = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
    const paidStatuses: OrderStatus[] = ['PAID', 'PROCESSING', 'READY_TO_SHIP', 'SHIPPED', 'DELIVERED'];

    const [todayOrders, todayPaid, monthOrders, monthPaid, byStatus, recent, salesByDay, paymentsByMethod] =
      await Promise.all([
        this.prisma.order.count({ where: { createdAt: { gte: startOfToday } } }),
        this.prisma.order.aggregate({
          where: { createdAt: { gte: startOfToday }, status: { in: paidStatuses } },
          _count: true,
          _sum: { total: true },
        }),
        this.prisma.order.count({ where: { createdAt: { gte: last30 } } }),
        this.prisma.order.aggregate({
          where: { createdAt: { gte: last30 }, status: { in: paidStatuses } },
          _count: true,
          _sum: { total: true },
        }),
        this.prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
        this.prisma.order.findMany({ include: { items: true }, orderBy: { createdAt: 'desc' }, take: 8 }),
        this.prisma.$queryRaw<{ day: Date; revenue: bigint | null; orders: bigint }[]>`
          SELECT date_trunc('day', "createdAt" + interval '3 hours 30 minutes') AS day,
                 SUM("total") FILTER (WHERE "status" = ANY(ARRAY['PAID','PROCESSING','READY_TO_SHIP','SHIPPED','DELIVERED']::"OrderStatus"[])) AS revenue,
                 COUNT(*)::bigint AS orders
          FROM "Order"
          WHERE "createdAt" >= ${last30}
          GROUP BY 1 ORDER BY 1`,
        this.prisma.payment.groupBy({
          by: ['method'],
          where: { status: 'SUCCEEDED' },
          _count: { _all: true },
          _sum: { amount: true },
        }),
      ]);

    return {
      today: {
        orders: todayOrders,
        paidOrders: todayPaid._count,
        revenue: toNumber(todayPaid._sum.total ?? BigInt(0)),
      },
      last30Days: {
        orders: monthOrders,
        paidOrders: monthPaid._count,
        revenue: toNumber(monthPaid._sum.total ?? BigInt(0)),
        averageOrderValue: monthPaid._count
          ? Math.round(toNumber(monthPaid._sum.total ?? BigInt(0)) / monthPaid._count)
          : 0,
      },
      ordersByStatus: byStatus.map((row) => ({
        status: row.status,
        label: ORDER_STATUS_LABELS[row.status],
        count: row._count._all,
      })),
      salesByDay: salesByDay.map((row) => ({
        date: row.day.toISOString().slice(0, 10),
        revenue: row.revenue ? Number(row.revenue) : 0,
        orders: Number(row.orders),
      })),
      paymentsByMethod: paymentsByMethod.map((row) => ({
        method: row.method,
        count: row._count._all,
        amount: toNumber(row._sum.amount ?? BigInt(0)),
      })),
      recentOrders: recent.map(toOrderSummary),
    };
  }
}
