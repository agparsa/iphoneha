import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  CHEQUE_STATUS_LABELS,
  CONTRACT_STATUS_LABELS,
  CREDIT_METHOD_LABELS,
  DEVICE_UNIT_STATUS_LABELS,
  INSTALLMENT_STATUS_LABELS,
  ORDER_SOURCE_LABELS,
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  PAID_ORDER_STATUSES,
  addDaysIso,
  dateToIso,
  daysBetweenIso,
  formatJalaliInput,
  paymentMethodName,
  roleHasPermission,
  tehranDayStart,
  tehranToday,
  type ExportQuery,
  type OrderStatus,
} from '@iphoneha/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { Errors } from '../../common/errors';
import { toNumber } from '../../common/bigint';
import type { AuthAdmin } from '../../types/express';
import { ReportsService, tehranDayOf } from './reports.service';
import { buildXlsx, type SheetSpec } from './xlsx';

export const EXPORT_KINDS = ['orders', 'customers', 'installments', 'cheques', 'devices', 'sales'] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

/** Far more than the store sells; keeps one careless click from building a huge file. */
const MAX_ROWS = 50_000;

/** '1405/07/04' — Jalali day of an instant, in Tehran. */
function jalaliDay(instant: Date | null | undefined): string | null {
  return instant ? formatJalaliInput(tehranDayOf(instant)) : null;
}

/** '14:05' in Tehran. */
function tehranTime(instant: Date): string {
  const shifted = new Date(instant.getTime() + 3.5 * 3_600_000);
  return `${String(shifted.getUTCHours()).padStart(2, '0')}:${String(shifted.getUTCMinutes()).padStart(2, '0')}`;
}

export interface ExportFile {
  filename: string;
  data: Buffer;
}

/** «خروجی اکسل» of the panel's lists, one workbook per kind. */
@Injectable()
export class ExportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
  ) {}

  async build(kind: ExportKind, query: ExportQuery, admin: AuthAdmin): Promise<ExportFile> {
    if (
      (kind === 'installments' || kind === 'cheques') &&
      !roleHasPermission(admin.role, 'installments.read')
    ) {
      throw Errors.forbidden();
    }
    const stamp = formatJalaliInput(tehranToday()).replace(/\//g, '-');
    const sheets = await this.sheets(kind, query);
    return { filename: `iphoneha-${kind}-${stamp}.xlsx`, data: buildXlsx(sheets, `iphoneha ${kind}`) };
  }

  private range(query: ExportQuery): { gte: Date; lt: Date } | undefined {
    if (!query.from && !query.to) return undefined;
    const from = query.from ?? query.to!;
    const to = query.to ?? query.from!;
    if (daysBetweenIso(from, to) < 0)
      throw Errors.badRequest('INVALID_RANGE', 'پایان بازه پیش از شروع آن است');
    return { gte: tehranDayStart(from), lt: tehranDayStart(addDaysIso(to, 1)) };
  }

  private async sheets(kind: ExportKind, query: ExportQuery): Promise<SheetSpec[]> {
    switch (kind) {
      case 'orders':
        return [await this.orders(query)];
      case 'customers':
        return [await this.customers()];
      case 'installments':
        return [await this.installments()];
      case 'cheques':
        return [await this.cheques()];
      case 'devices':
        return [await this.devices()];
      case 'sales':
        return this.sales(query);
    }
  }

  private async orders(query: ExportQuery): Promise<SheetSpec> {
    const where: Prisma.OrderWhereInput = {};
    const createdAt = this.range(query);
    if (createdAt) where.createdAt = createdAt;
    const statuses = query.status.filter((s): s is OrderStatus =>
      (ORDER_STATUSES as readonly string[]).includes(s),
    );
    if (statuses.length) where.status = { in: statuses };
    const orders = await this.prisma.order.findMany({
      where,
      include: {
        items: { include: { devices: { select: { imei: true } } } },
        createdBy: { select: { name: true } },
        contract: { select: { number: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_ROWS,
    });
    return {
      name: 'سفارش‌ها',
      columns: [
        { header: 'شماره سفارش', width: 12 },
        { header: 'تاریخ', width: 11 },
        { header: 'ساعت', width: 7 },
        { header: 'مشتری', width: 20 },
        { header: 'موبایل', width: 13 },
        { header: 'منبع', width: 8 },
        { header: 'روش پرداخت', width: 18 },
        { header: 'وضعیت', width: 14 },
        { header: 'کالاها', width: 48 },
        { header: 'تعداد', type: 'number', width: 7 },
        { header: 'جمع کالاها (تومان)', type: 'number', width: 16 },
        { header: 'تخفیف (تومان)', type: 'number', width: 14 },
        { header: 'ارسال (تومان)', type: 'number', width: 13 },
        { header: 'مبلغ کل (تومان)', type: 'number', width: 16 },
        { header: 'استان', width: 12 },
        { header: 'شهر', width: 12 },
        { header: 'کد رهگیری', width: 16 },
        { header: 'IMEI', width: 34 },
        { header: 'قرارداد اقساط', type: 'number', width: 10 },
        { header: 'ثبت‌کننده', width: 14 },
      ],
      rows: orders.map((order) => {
        const address = (order.shippingAddress ?? {}) as { province?: string; city?: string };
        return [
          order.orderNumber,
          jalaliDay(order.createdAt),
          tehranTime(order.createdAt),
          order.customerName,
          order.customerPhone,
          ORDER_SOURCE_LABELS[order.source],
          paymentMethodName(order.paymentMethod),
          ORDER_STATUS_LABELS[order.status],
          order.items
            .map(
              (item) =>
                `${item.productName} ${item.variantTitle}${item.quantity > 1 ? ` ×${item.quantity}` : ''}`,
            )
            .join('، '),
          order.items.reduce((sum, item) => sum + item.quantity, 0),
          toNumber(order.subtotal),
          toNumber(order.discountTotal),
          toNumber(order.shippingCost),
          toNumber(order.total),
          address.province || null,
          address.city || null,
          order.trackingCode,
          order.items.flatMap((item) => item.devices.map((device) => device.imei)).join(' '),
          order.contract?.number ?? null,
          order.createdBy?.name ?? null,
        ];
      }),
    };
  }

  private async customers(): Promise<SheetSpec> {
    const [users, stats, ledger] = await Promise.all([
      this.prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: MAX_ROWS }),
      this.prisma.order.groupBy({
        by: ['userId'],
        where: { status: { in: [...PAID_ORDER_STATUSES] } },
        _count: { _all: true },
        _sum: { total: true },
        _max: { createdAt: true },
      }),
      this.prisma.$queryRaw<{ phone: string; remaining: bigint }[]>`
        SELECT c."customerPhone" AS phone, SUM(i."amount" - i."paidAmount")::bigint AS remaining
        FROM "Installment" i JOIN "InstallmentContract" c ON c."id" = i."contractId"
        WHERE i."status" = 'PENDING' AND c."status" IN ('ACTIVE', 'DEFAULTED')
        GROUP BY c."customerPhone"`,
    ]);
    const byUser = new Map(stats.map((row) => [row.userId, row]));
    const owed = new Map(ledger.map((row) => [row.phone, toNumber(row.remaining)]));
    return {
      name: 'مشتری‌ها',
      columns: [
        { header: 'موبایل', width: 13 },
        { header: 'نام', width: 14 },
        { header: 'نام خانوادگی', width: 16 },
        { header: 'عضویت', width: 11 },
        { header: 'آخرین ورود', width: 11 },
        { header: 'سفارش پرداخت‌شده', type: 'number', width: 10 },
        { header: 'جمع خرید (تومان)', type: 'number', width: 16 },
        { header: 'آخرین خرید', width: 11 },
        { header: 'ماندهٔ اقساط (تومان)', type: 'number', width: 16 },
        { header: 'وضعیت', width: 8 },
      ],
      rows: users.map((user) => {
        const row = byUser.get(user.id);
        return [
          user.phone,
          user.firstName,
          user.lastName,
          jalaliDay(user.createdAt),
          jalaliDay(user.lastLoginAt),
          row?._count._all ?? 0,
          toNumber(row?._sum.total ?? 0n),
          jalaliDay(row?._max.createdAt),
          owed.get(user.phone) ?? 0,
          user.isActive ? 'فعال' : 'مسدود',
        ];
      }),
    };
  }

  private async installments(): Promise<SheetSpec> {
    const today = tehranToday();
    const rows = await this.prisma.installment.findMany({
      include: {
        contract: {
          select: {
            number: true,
            method: true,
            status: true,
            customerName: true,
            customerPhone: true,
            months: true,
          },
        },
        cheque: { select: { bankName: true, sayadId: true, status: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { index: 'asc' }],
      take: MAX_ROWS,
    });
    return {
      name: 'اقساط',
      columns: [
        { header: 'قرارداد', type: 'number', width: 9 },
        { header: 'مشتری', width: 20 },
        { header: 'موبایل', width: 13 },
        { header: 'روش', width: 10 },
        { header: 'وضعیت قرارداد', width: 12 },
        { header: 'قسط', width: 8 },
        { header: 'سررسید', width: 11 },
        { header: 'مبلغ (تومان)', type: 'number', width: 14 },
        { header: 'پرداخت‌شده (تومان)', type: 'number', width: 14 },
        { header: 'مانده (تومان)', type: 'number', width: 14 },
        { header: 'وضعیت قسط', width: 10 },
        { header: 'روز تأخیر', type: 'number', width: 9 },
        { header: 'چک', width: 26 },
      ],
      rows: rows.map((row) => {
        const due = dateToIso(row.dueDate);
        const open = row.status === 'PENDING';
        const overdue = open && due < today;
        return [
          row.contract.number,
          row.contract.customerName,
          row.contract.customerPhone,
          CREDIT_METHOD_LABELS[row.contract.method],
          CONTRACT_STATUS_LABELS[row.contract.status],
          `${row.index} از ${row.contract.months}`,
          formatJalaliInput(due),
          toNumber(row.amount),
          toNumber(row.paidAmount),
          open ? toNumber(row.amount) - toNumber(row.paidAmount) : 0,
          INSTALLMENT_STATUS_LABELS[overdue ? 'OVERDUE' : row.status],
          overdue ? daysBetweenIso(due, today) : null,
          row.cheque
            ? `${row.cheque.bankName} — ${row.cheque.sayadId} (${CHEQUE_STATUS_LABELS[row.cheque.status]})`
            : null,
        ];
      }),
    };
  }

  private async cheques(): Promise<SheetSpec> {
    const rows = await this.prisma.cheque.findMany({
      include: {
        contract: { select: { number: true, customerName: true, customerPhone: true } },
        installment: { select: { index: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      take: MAX_ROWS,
    });
    return {
      name: 'چک‌ها',
      columns: [
        { header: 'قرارداد', type: 'number', width: 9 },
        { header: 'مشتری', width: 20 },
        { header: 'موبایل', width: 13 },
        { header: 'قسط', type: 'number', width: 6 },
        { header: 'شناسهٔ صیادی', width: 19 },
        { header: 'سریال', width: 12 },
        { header: 'بانک', width: 12 },
        { header: 'شعبه', width: 12 },
        { header: 'صادرکننده', width: 18 },
        { header: 'مبلغ (تومان)', type: 'number', width: 14 },
        { header: 'سررسید', width: 11 },
        { header: 'وضعیت', width: 12 },
        { header: 'ثبت در صیاد', width: 10 },
      ],
      rows: rows.map((row) => [
        row.contract.number,
        row.contract.customerName,
        row.contract.customerPhone,
        row.installment?.index ?? null,
        row.sayadId,
        row.serial,
        row.bankName,
        row.branch,
        row.drawerName,
        toNumber(row.amount),
        formatJalaliInput(dateToIso(row.dueDate)),
        CHEQUE_STATUS_LABELS[row.status],
        row.sayadConfirmed ? 'بله' : 'خیر',
      ]),
    };
  }

  private async devices(): Promise<SheetSpec> {
    const rows = await this.prisma.deviceUnit.findMany({
      include: {
        variant: {
          select: {
            sku: true,
            product: { select: { name: true } },
            color: { select: { name: true } },
            storage: { select: { labelFa: true } },
          },
        },
        orderItem: { select: { order: { select: { orderNumber: true, customerName: true } } } },
      },
      orderBy: { receivedAt: 'desc' },
      take: MAX_ROWS,
    });
    return {
      name: 'گوشی‌ها (IMEI)',
      columns: [
        { header: 'IMEI', width: 17 },
        { header: 'IMEI دوم', width: 17 },
        { header: 'سریال', width: 14 },
        { header: 'مدل', width: 20 },
        { header: 'حافظه', width: 10 },
        { header: 'رنگ', width: 12 },
        { header: 'SKU', width: 16 },
        { header: 'وضعیت', width: 10 },
        { header: 'قیمت خرید (تومان)', type: 'number', width: 15 },
        { header: 'تأمین‌کننده', width: 16 },
        { header: 'تاریخ ورود', width: 11 },
        { header: 'سفارش', width: 11 },
        { header: 'خریدار', width: 18 },
        { header: 'تاریخ فروش', width: 11 },
        { header: 'یادداشت', width: 24 },
      ],
      rows: rows.map((row) => [
        row.imei,
        row.imei2,
        row.serialNumber,
        row.variant.product.name,
        row.variant.storage.labelFa,
        row.variant.color.name,
        row.variant.sku,
        DEVICE_UNIT_STATUS_LABELS[row.status],
        row.costPrice === null ? null : toNumber(row.costPrice),
        row.supplier,
        jalaliDay(row.receivedAt),
        row.orderItem?.order.orderNumber ?? null,
        row.orderItem?.order.customerName ?? null,
        jalaliDay(row.soldAt),
        row.note,
      ]),
    };
  }

  private async sales(query: ExportQuery): Promise<SheetSpec[]> {
    const to = query.to ?? query.from ?? tehranToday();
    const from = query.from ?? addDaysIso(to, -29);
    if (daysBetweenIso(from, to) < 0 || daysBetweenIso(from, to) > 731) {
      throw Errors.badRequest('INVALID_RANGE', 'بازهٔ گزارش باید حداکثر دو سال و به ترتیب باشد');
    }
    const report = await this.reports.sales({ from, to });
    const breakdown = (name: string, rows: typeof report.byModel): SheetSpec => ({
      name,
      columns: [
        { header: 'عنوان', width: 30 },
        { header: 'سفارش', type: 'number', width: 9 },
        { header: 'تعداد', type: 'number', width: 9 },
        { header: 'فروش (تومان)', type: 'number', width: 16 },
      ],
      rows: rows.map((row) => [row.label, row.orders, row.units, row.revenue]),
    });
    const t = report.totals;
    return [
      {
        name: 'خلاصه',
        columns: [
          { header: 'شاخص', width: 34 },
          { header: 'مقدار', type: 'number', width: 18 },
        ],
        rows: [
          ['از تاریخ', formatJalaliInput(from)],
          ['تا تاریخ', formatJalaliInput(to)],
          ['فروش (تومان)', t.revenue],
          ['سفارش‌های پرداخت‌شده', t.orders],
          ['تعداد گوشی', t.units],
          ['میانگین سفارش (تومان)', t.averageOrderValue],
          ['تخفیف‌ها (تومان)', t.discount],
          ['هزینهٔ ارسال (تومان)', t.shipping],
          ['سفارش‌های لغوشده', t.cancelledOrders],
          ['مبلغ بازپرداخت‌شده (تومان)', t.refundedAmount],
          ['بهای خرید گوشی‌های فروخته (تومان)', t.costOfGoods],
          ['سود ناخالص (تومان)', t.grossProfit],
          ['گوشی‌های دارای قیمت خرید', `${t.costCoverage.unitsWithCost} از ${t.costCoverage.units}`],
          ['وصولی اقساط (تومان)', report.ledger.collected],
          ['قرارداد تازه', report.ledger.newContracts],
          ['اصل اقساط تازه (تومان)', report.ledger.financed],
          ['کارمزد اقساط تازه (تومان)', report.ledger.markup],
        ],
      },
      {
        name: 'روزانه',
        columns: [
          { header: 'تاریخ', width: 12 },
          { header: 'سفارش', type: 'number', width: 9 },
          { header: 'فروش (تومان)', type: 'number', width: 16 },
        ],
        rows: report.byDay.map((row) => [formatJalaliInput(row.date), row.orders, row.revenue]),
      },
      breakdown('مدل', report.byModel),
      breakdown('حافظه', report.byStorage),
      breakdown('رنگ', report.byColor),
      breakdown('روش پرداخت', report.byPaymentMethod),
      breakdown('منبع سفارش', report.bySource),
      breakdown('استان', report.byProvince),
    ];
  }
}
