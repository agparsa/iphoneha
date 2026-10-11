import { Injectable } from '@nestjs/common';
import { Prisma, type DeviceUnit } from '@prisma/client';
import {
  DEVICE_UNIT_STATUS_LABELS,
  PAID_ORDER_STATUSES,
  digitsOnly,
  type DeviceListQuery,
  type DeviceReceiveInput,
  type DeviceReceiveResultDto,
  type DeviceUnitDto,
  type DeviceUpdateInput,
  type OrderDevicesInput,
  type Paginated,
} from '@iphoneha/shared';
import { PrismaService, type PrismaTx } from '../../infra/prisma/prisma.service';
import { Errors } from '../../common/errors';
import { paginate, skipTake, type ClientInfo } from '../../common/utils';
import { toNullableNumber } from '../../common/bigint';
import { InventoryService } from '../inventory/inventory.service';
import { AuditService } from '../audit/audit.service';
import type { AuthAdmin } from '../../types/express';

const unitInclude = {
  variant: { include: { product: { select: { name: true } }, color: true, storage: true } },
  orderItem: {
    select: { order: { select: { id: true, orderNumber: true, customerName: true, customerPhone: true } } },
  },
  receivedBy: { select: { name: true } },
} satisfies Prisma.DeviceUnitInclude;

type UnitWithRelations = Prisma.DeviceUnitGetPayload<{ include: typeof unitInclude }>;

/**
 * The IMEI registry: which physical phone came in, and which order line it
 * left on. The numeric stock stays the source of availability — receiving
 * phones by IMEI raises it, and a phone found faulty lowers it.
 */
@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
  ) {}

  static toDto(unit: UnitWithRelations): DeviceUnitDto {
    const order = unit.orderItem?.order ?? null;
    return {
      id: unit.id,
      variantId: unit.variantId,
      sku: unit.variant.sku,
      productName: unit.variant.product.name,
      variantTitle: `${unit.variant.storage.labelFa} — ${unit.variant.color.name}`,
      imei: unit.imei,
      imei2: unit.imei2,
      serialNumber: unit.serialNumber,
      status: unit.status,
      statusLabel: DEVICE_UNIT_STATUS_LABELS[unit.status],
      costPrice: toNullableNumber(unit.costPrice),
      supplier: unit.supplier,
      note: unit.note,
      receivedAt: unit.receivedAt.toISOString(),
      receivedByName: unit.receivedBy?.name ?? null,
      soldAt: unit.soldAt?.toISOString() ?? null,
      order: order
        ? {
            id: order.id,
            orderNumber: order.orderNumber,
            customerName: order.customerName,
            customerPhone: order.customerPhone,
          }
        : null,
    };
  }

  /** Phones received with their IMEIs: one registry row each, and the stock up by as many. */
  async receive(
    input: DeviceReceiveInput,
    admin: AuthAdmin,
    client?: ClientInfo,
  ): Promise<DeviceReceiveResultDto> {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: input.variantId },
      include: { product: { select: { name: true } }, color: true, storage: true },
    });
    if (!variant) throw Errors.notFound('مدل کالا پیدا نشد');

    const numbers = input.units.flatMap((unit) =>
      [unit.imei, unit.imei2].filter((v): v is string => Boolean(v)),
    );
    const clash = await this.prisma.deviceUnit.findMany({
      where: { OR: [{ imei: { in: numbers } }, { imei2: { in: numbers } }] },
      select: { imei: true, imei2: true },
    });
    if (clash.length > 0) {
      const taken = new Set(clash.flatMap((row) => [row.imei, row.imei2]).filter(Boolean));
      const duplicates = numbers.filter((imei) => taken.has(imei));
      throw Errors.conflict('IMEI_EXISTS', `این IMEI قبلاً ثبت شده است: ${duplicates.join('، ')}`, {
        imeis: duplicates,
      });
    }
    const serials = input.units.map((unit) => unit.serialNumber).filter((v): v is string => Boolean(v));
    if (serials.length > 0) {
      const taken = await this.prisma.deviceUnit.findMany({
        where: { serialNumber: { in: serials } },
        select: { serialNumber: true },
      });
      if (taken.length > 0) {
        throw Errors.conflict(
          'SERIAL_EXISTS',
          `این سریال قبلاً ثبت شده است: ${taken.map((t) => t.serialNumber).join('، ')}`,
        );
      }
    }

    const title = `${variant.product.name} ${variant.storage.labelFa} ${variant.color.name}`;
    const reason = `ورود ${input.units.length} گوشی با IMEI${input.supplier ? ` از ${input.supplier}` : ''}`;
    const snapshot = await this.prisma
      .transaction(async (tx) => {
        await tx.deviceUnit.createMany({
          data: input.units.map((unit) => ({
            variantId: variant.id,
            imei: unit.imei,
            imei2: unit.imei2,
            serialNumber: unit.serialNumber,
            costPrice: input.costPrice === null ? null : BigInt(input.costPrice),
            supplier: input.supplier,
            note: input.note,
            receivedById: admin.id,
          })),
        });
        return this.inventory.changeStockInTx(tx, variant.id, input.units.length, admin.id, reason);
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw Errors.conflict(
            'IMEI_EXISTS',
            'یکی از این IMEIها یا سریال‌ها هم‌زمان ثبت شد؛ دوباره بررسی کن',
          );
        }
        throw error;
      });
    await this.inventory.notifyChanged([variant.id]);
    await this.audit.log({
      adminUserId: admin.id,
      action: 'devices.receive',
      entityType: 'ProductVariant',
      entityId: variant.id,
      after: {
        title,
        count: input.units.length,
        imeis: input.units.map((u) => u.imei),
        supplier: input.supplier,
      },
      client,
    });
    const unitsInStock = await this.prisma.deviceUnit.count({
      where: { variantId: variant.id, status: 'IN_STOCK' },
    });
    return { created: input.units.length, ...snapshot, unitsInStock };
  }

  async list(query: DeviceListQuery): Promise<Paginated<DeviceUnitDto>> {
    const where: Prisma.DeviceUnitWhereInput = {};
    if (query.variantId) where.variantId = query.variantId;
    if (query.status.length) where.status = { in: query.status };
    if (query.q) {
      const q = query.q.trim();
      const digits = digitsOnly(q);
      where.OR = [
        ...(digits.length >= 4 ? [{ imei: { contains: digits } }, { imei2: { contains: digits } }] : []),
        { serialNumber: { contains: q, mode: 'insensitive' } },
        { variant: { sku: { contains: q, mode: 'insensitive' } } },
        { variant: { product: { name: { contains: q, mode: 'insensitive' } } } },
        { supplier: { contains: q, mode: 'insensitive' } },
      ];
    }
    const [units, total] = await Promise.all([
      this.prisma.deviceUnit.findMany({
        where,
        include: unitInclude,
        orderBy: [{ receivedAt: 'desc' }, { imei: 'asc' }],
        ...skipTake(query.page, query.pageSize),
      }),
      this.prisma.deviceUnit.count({ where }),
    ]);
    return paginate(units.map(DevicesService.toDto), total, query.page, query.pageSize);
  }

  async get(id: string): Promise<DeviceUnitDto> {
    const unit = await this.prisma.deviceUnit.findUnique({ where: { id }, include: unitInclude });
    if (!unit) throw Errors.notFound('دستگاه پیدا نشد');
    return DevicesService.toDto(unit);
  }

  /** The phone with exactly this IMEI (either slot) or serial number, for the search box. */
  async findExact(value: string): Promise<DeviceUnitDto | null> {
    const digits = digitsOnly(value);
    const unit = await this.prisma.deviceUnit.findFirst({
      where: {
        OR: [
          ...(digits.length === 15 ? [{ imei: digits }, { imei2: digits }] : []),
          { serialNumber: { equals: value.trim(), mode: 'insensitive' } },
        ],
      },
      include: unitInclude,
    });
    return unit ? DevicesService.toDto(unit) : null;
  }

  /**
   * A unit's condition, cost or note. Marking a shelf phone faulty takes it
   * out of the stock; putting a faulty one back returns it.
   */
  async update(
    id: string,
    input: DeviceUpdateInput,
    admin: AuthAdmin,
    client?: ClientInfo,
  ): Promise<DeviceUnitDto> {
    const unit = await this.prisma.deviceUnit.findUnique({ where: { id } });
    if (!unit) throw Errors.notFound('دستگاه پیدا نشد');
    if (input.status && unit.status === 'SOLD') {
      throw Errors.conflict('DEVICE_SOLD', 'این گوشی روی یک سفارش است؛ وضعیتش از همان سفارش تغییر می‌کند');
    }
    const target = input.status ?? unit.status;
    // IN_STOCK and RETURNED are both counted in the stock; DEFECTIVE is not
    const countedBefore = unit.status !== 'DEFECTIVE';
    const countedAfter = target !== 'DEFECTIVE';
    await this.prisma.transaction(async (tx) => {
      const updated = await tx.deviceUnit.updateMany({
        where: { id, status: unit.status },
        data: {
          status: target,
          ...(input.costPrice !== undefined
            ? { costPrice: input.costPrice === null ? null : BigInt(input.costPrice) }
            : {}),
          ...(input.supplier !== undefined ? { supplier: input.supplier } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
        },
      });
      if (!updated.count)
        throw Errors.conflict('DEVICE_CHANGED', 'وضعیت این گوشی هم‌زمان تغییر کرد؛ صفحه را تازه کن');
      if (countedBefore !== countedAfter) {
        await this.inventory.changeStockInTx(
          tx,
          unit.variantId,
          countedAfter ? 1 : -1,
          admin.id,
          countedAfter ? `گوشی ${unit.imei} به انبار برگشت` : `گوشی ${unit.imei} معیوب است`,
        );
      }
    });
    if (countedBefore !== countedAfter) await this.inventory.notifyChanged([unit.variantId]);
    await this.audit.log({
      adminUserId: admin.id,
      action: 'devices.update',
      entityType: 'DeviceUnit',
      entityId: id,
      before: { status: unit.status, costPrice: unit.costPrice?.toString() ?? null, note: unit.note },
      after: input,
      client,
    });
    return this.get(id);
  }

  /** An IMEI typed wrong: the row goes, and the stock it added with it. Only for a phone never sold. */
  async remove(id: string, admin: AuthAdmin, client?: ClientInfo): Promise<void> {
    const unit = await this.prisma.deviceUnit.findUnique({ where: { id } });
    if (!unit) throw Errors.notFound('دستگاه پیدا نشد');
    if (unit.status !== 'IN_STOCK' || unit.orderItemId) {
      throw Errors.conflict('DEVICE_IN_USE', 'فقط گوشی داخل انبار که هیچ‌وقت فروخته نشده حذف می‌شود');
    }
    await this.prisma.transaction(async (tx) => {
      const deleted = await tx.deviceUnit.deleteMany({
        where: { id, status: 'IN_STOCK', orderItemId: null },
      });
      if (!deleted.count) throw Errors.conflict('DEVICE_CHANGED', 'وضعیت این گوشی هم‌زمان تغییر کرد');
      await this.inventory.changeStockInTx(tx, unit.variantId, -1, admin.id, `حذف IMEI اشتباه ${unit.imei}`);
    });
    await this.inventory.notifyChanged([unit.variantId]);
    await this.audit.log({
      adminUserId: admin.id,
      action: 'devices.delete',
      entityType: 'DeviceUnit',
      entityId: id,
      before: { imei: unit.imei, variantId: unit.variantId },
      client,
    });
  }

  /**
   * The phones handed over on an order's lines. Each assignment replaces the
   * line's set: phones dropped from it go back on the shelf.
   */
  async assignToOrder(
    orderId: string,
    input: OrderDevicesInput,
    admin: AuthAdmin,
    client?: ClientInfo,
  ): Promise<void> {
    const order = await this.prisma.order.findFirst({
      where: { OR: [{ id: orderId }, { orderNumber: orderId }] },
      include: { items: { include: { devices: true } } },
    });
    if (!order) throw Errors.notFound('سفارش پیدا نشد');
    if (!PAID_ORDER_STATUSES.includes(order.status)) {
      throw Errors.conflict('ORDER_NOT_PAID', 'IMEI فقط برای سفارش پرداخت‌شده ثبت می‌شود');
    }
    await this.prisma.transaction(async (tx) => {
      for (const assignment of input.assignments) {
        const item = order.items.find((row) => row.id === assignment.orderItemId);
        if (!item) throw Errors.badRequest('ORDER_ITEM_NOT_FOUND', 'این ردیف در این سفارش نیست');
        await this.assignInTx(tx, item, assignment.deviceIds);
      }
    });
    await this.audit.log({
      adminUserId: admin.id,
      action: 'order.devices',
      entityType: 'Order',
      entityId: order.id,
      after: input.assignments,
      client,
    });
  }

  /** Sets exactly these phones on an order line, inside the caller's transaction. */
  async assignInTx(
    tx: PrismaTx,
    item: {
      id: string;
      variantId: string | null;
      quantity: number;
      productName: string;
      devices?: DeviceUnit[];
    },
    deviceIds: string[],
  ): Promise<void> {
    const unique = [...new Set(deviceIds)];
    if (unique.length > item.quantity) {
      throw Errors.badRequest(
        'TOO_MANY_DEVICES',
        `برای «${item.productName}» بیشتر از ${item.quantity} گوشی انتخاب شده`,
      );
    }
    const current =
      item.devices ?? (await tx.deviceUnit.findMany({ where: { orderItemId: item.id, status: 'SOLD' } }));
    const keep = new Set(unique);
    const released = current
      .filter((unit) => unit.status === 'SOLD' && !keep.has(unit.id))
      .map((unit) => unit.id);
    if (released.length) {
      await tx.deviceUnit.updateMany({
        where: { id: { in: released }, orderItemId: item.id, status: 'SOLD' },
        data: { status: 'IN_STOCK', orderItemId: null, soldAt: null },
      });
    }
    const already = new Set(current.filter((unit) => unit.status === 'SOLD').map((unit) => unit.id));
    const added = unique.filter((id) => !already.has(id));
    if (!added.length) return;
    const units = await tx.deviceUnit.findMany({ where: { id: { in: added } } });
    for (const id of added) {
      const unit = units.find((row) => row.id === id);
      if (!unit) throw Errors.badRequest('DEVICE_NOT_FOUND', 'یکی از گوشی‌های انتخاب‌شده پیدا نشد');
      if (unit.variantId !== item.variantId) {
        throw Errors.badRequest(
          'DEVICE_WRONG_VARIANT',
          `گوشی ${unit.imei} از مدل «${item.productName}» با این رنگ و حافظه نیست`,
        );
      }
      if (unit.status !== 'IN_STOCK') {
        throw Errors.conflict(
          'DEVICE_NOT_IN_STOCK',
          `گوشی ${unit.imei} در انبار نیست (${DEVICE_UNIT_STATUS_LABELS[unit.status]})`,
        );
      }
    }
    const sold = await tx.deviceUnit.updateMany({
      where: { id: { in: added }, status: 'IN_STOCK' },
      data: { status: 'SOLD', orderItemId: item.id, soldAt: new Date() },
    });
    if (sold.count !== added.length) {
      throw Errors.conflict(
        'DEVICE_NOT_IN_STOCK',
        'یکی از گوشی‌ها هم‌زمان روی سفارش دیگری رفت؛ دوباره انتخاب کن',
      );
    }
  }

  /**
   * An order was cancelled or refunded: its phones leave it. Before shipping
   * they are simply back on the shelf; after, they came back from the
   * customer and wait to be checked (the order stays on record).
   */
  async releaseForOrder(orderId: string, returnedByCustomer: boolean): Promise<number> {
    const result = await this.prisma.deviceUnit.updateMany({
      where: { status: 'SOLD', orderItem: { orderId } },
      data: returnedByCustomer
        ? { status: 'RETURNED' }
        : { status: 'IN_STOCK', orderItemId: null, soldAt: null },
    });
    return result.count;
  }

  /** How many phones of each variant are on the shelf with an IMEI on record. */
  async unitsInStock(variantIds: string[]): Promise<Map<string, number>> {
    if (!variantIds.length) return new Map();
    const rows = await this.prisma.deviceUnit.groupBy({
      by: ['variantId'],
      where: { variantId: { in: variantIds }, status: 'IN_STOCK' },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.variantId, row._count._all]));
  }
}
