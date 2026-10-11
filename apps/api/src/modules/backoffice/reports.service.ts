import { Injectable } from '@nestjs/common';
import {
  JALALI_MONTHS,
  ORDER_SOURCE_LABELS,
  PAID_ORDER_STATUSES,
  addDaysIso,
  dateToIso,
  daysBetweenIso,
  isoToDate,
  isoToJalali,
  paymentMethodName,
  tehranDayStart,
  toPersianDigits,
  type OrderPaymentMethod,
  type OrderSource,
  type ReportQuery,
  type ReportRow,
  type SalesReportDto,
} from '@iphoneha/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { toNumber } from '../../common/bigint';

/** The Tehran day of an instant, as 'YYYY-MM-DD'. */
export function tehranDayOf(instant: Date): string {
  return dateToIso(new Date(instant.getTime() + 3.5 * 3_600_000));
}

class Buckets {
  private readonly rows = new Map<string, ReportRow & { orderIds: Set<string> }>();

  add(key: string, label: string, orderId: string, units: number, revenue: number): void {
    let row = this.rows.get(key);
    if (!row) {
      row = { key, label, orders: 0, units: 0, revenue: 0, orderIds: new Set() };
      this.rows.set(key, row);
    }
    row.orderIds.add(orderId);
    row.units += units;
    row.revenue += revenue;
  }

  list(limit?: number): ReportRow[] {
    const rows = [...this.rows.values()]
      .map(({ orderIds, ...row }) => ({ ...row, orders: orderIds.size }))
      .sort((a, b) => b.revenue - a.revenue || b.units - a.units);
    return limit ? rows.slice(0, limit) : rows;
  }
}

/** «گزارش فروش»: paid orders placed in a range of Tehran days, cut every useful way. */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async sales(query: ReportQuery): Promise<SalesReportDto> {
    const start = tehranDayStart(query.from);
    const end = tehranDayStart(addDaysIso(query.to, 1));
    const createdAt = { gte: start, lt: end };

    const [orders, cancelledOrders, refunds, collected, contracts] = await Promise.all([
      this.prisma.order.findMany({
        where: { createdAt, status: { in: [...PAID_ORDER_STATUSES] } },
        select: {
          id: true,
          createdAt: true,
          paymentMethod: true,
          source: true,
          total: true,
          discountTotal: true,
          shippingCost: true,
          shippingAddress: true,
          items: {
            select: {
              productId: true,
              productName: true,
              variantId: true,
              variantTitle: true,
              storageLabel: true,
              colorName: true,
              sku: true,
              quantity: true,
              finalPrice: true,
              devices: { select: { costPrice: true } },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.order.count({ where: { createdAt, status: 'CANCELLED' } }),
      this.prisma.payment.aggregate({
        where: { status: 'REFUNDED', refundedAt: { gte: start, lt: end } },
        _sum: { amount: true },
      }),
      this.prisma.installmentPayment.aggregate({
        where: { voidedAt: null, paidAt: { gte: start, lt: end } },
        _sum: { amount: true },
      }),
      this.prisma.installmentContract.aggregate({
        where: {
          contractDate: { gte: isoToDate(query.from), lte: isoToDate(query.to) },
          status: { not: 'CANCELLED' },
        },
        _count: { _all: true },
        _sum: { financed: true, markup: true },
      }),
    ]);

    const days = new Map<string, { revenue: number; orders: number }>();
    for (let day = query.from; day <= query.to; day = addDaysIso(day, 1))
      days.set(day, { revenue: 0, orders: 0 });

    const byModel = new Buckets();
    const byStorage = new Buckets();
    const byColor = new Buckets();
    const byPayment = new Buckets();
    const bySource = new Buckets();
    const byProvince = new Buckets();
    const byVariant = new Buckets();

    let revenue = 0;
    let units = 0;
    let discount = 0;
    let shipping = 0;
    let costOfGoods = 0;
    let unitsWithCost = 0;
    for (const order of orders) {
      const total = toNumber(order.total);
      const orderUnits = order.items.reduce((sum, item) => sum + item.quantity, 0);
      revenue += total;
      units += orderUnits;
      discount += toNumber(order.discountTotal);
      shipping += toNumber(order.shippingCost);

      const day = days.get(tehranDayOf(order.createdAt));
      if (day) {
        day.revenue += total;
        day.orders += 1;
      }
      byPayment.add(order.paymentMethod, paymentMethodName(order.paymentMethod), order.id, orderUnits, total);
      bySource.add(order.source, ORDER_SOURCE_LABELS[order.source], order.id, orderUnits, total);
      const province = ((order.shippingAddress ?? {}) as { province?: string }).province?.trim() || '';
      byProvince.add(province || 'pickup', province || 'تحویل حضوری', order.id, orderUnits, total);

      for (const item of order.items) {
        const itemRevenue = toNumber(item.finalPrice);
        byModel.add(
          item.productId ?? item.productName,
          item.productName,
          order.id,
          item.quantity,
          itemRevenue,
        );
        byStorage.add(item.storageLabel, item.storageLabel, order.id, item.quantity, itemRevenue);
        byColor.add(item.colorName, item.colorName, order.id, item.quantity, itemRevenue);
        byVariant.add(
          item.variantId ?? item.sku,
          `${item.productName} ${item.variantTitle}`,
          order.id,
          item.quantity,
          itemRevenue,
        );
        for (const device of item.devices) {
          if (device.costPrice === null) continue;
          unitsWithCost += 1;
          costOfGoods += toNumber(device.costPrice);
        }
      }
    }

    // a long range reads better by month
    const byMonth = new Map<string, { key: string; label: string; revenue: number; orders: number }>();
    for (const [date, row] of days) {
      const { jy, jm } = isoToJalali(date);
      const key = `${jy}-${String(jm).padStart(2, '0')}`;
      const month = byMonth.get(key) ?? {
        key,
        label: `${JALALI_MONTHS[jm - 1]} ${toPersianDigits(jy)}`,
        revenue: 0,
        orders: 0,
      };
      month.revenue += row.revenue;
      month.orders += row.orders;
      byMonth.set(key, month);
    }

    const covered = units > 0 && unitsWithCost >= units;
    return {
      from: query.from,
      to: query.to,
      days: daysBetweenIso(query.from, query.to) + 1,
      totals: {
        revenue,
        orders: orders.length,
        units,
        averageOrderValue: orders.length ? Math.round(revenue / orders.length) : 0,
        discount,
        shipping,
        cancelledOrders,
        refundedAmount: toNumber(refunds._sum.amount ?? 0n),
        costOfGoods: unitsWithCost ? costOfGoods : null,
        grossProfit: covered ? revenue - shipping - costOfGoods : null,
        costCoverage: { unitsWithCost, units },
      },
      byDay: [...days].map(([date, row]) => ({ date, ...row })),
      byMonth: [...byMonth.values()],
      byModel: byModel.list(),
      byStorage: byStorage.list(),
      byColor: byColor.list(),
      byPaymentMethod: byPayment.list().map((row) => ({ ...row, method: row.key as OrderPaymentMethod })),
      bySource: bySource.list().map((row) => ({ ...row, source: row.key as OrderSource })),
      byProvince: byProvince.list(),
      topVariants: byVariant.list(10),
      ledger: {
        collected: toNumber(collected._sum.amount ?? 0n),
        newContracts: contracts._count._all,
        financed: toNumber(contracts._sum.financed ?? 0n),
        markup: toNumber(contracts._sum.markup ?? 0n),
      },
    };
  }
}
