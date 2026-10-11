import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  INVENTORY_MOVEMENT_LABELS,
  stockStatusOf,
  type InventoryAdjustInput,
  type InventoryMovementDto,
  type Paginated,
} from '@iphoneha/shared';
import { PrismaService, type PrismaTx } from '../../infra/prisma/prisma.service';
import { Errors } from '../../common/errors';
import { paginate, skipTake } from '../../common/utils';
import { toNumber } from '../../common/bigint';
import { CatalogCacheService } from '../catalog/catalog-cache.service';

export interface ReservationItem {
  variantId: string;
  quantity: number;
  title: string;
}

export interface StockSnapshot {
  stock: number;
  reserved: number;
  available: number;
}

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogCache: CatalogCacheService,
  ) {}

  async availability(variantId: string): Promise<StockSnapshot> {
    const inventory = await this.prisma.inventory.findUnique({ where: { variantId } });
    const stock = inventory?.stock ?? 0;
    const reserved = inventory?.reserved ?? 0;
    return { stock, reserved, available: Math.max(0, stock - reserved) };
  }

  /**
   * Atomically reserves stock for an order **inside the checkout transaction**.
   *
   * The conditional UPDATE takes a row lock and only succeeds while
   * `stock - reserved >= quantity`, so two concurrent checkouts can never both
   * take the last unit. A CHECK constraint (`reserved <= stock`) is the second
   * line of defence at the database level.
   */
  async reserve(tx: PrismaTx, orderId: string, items: ReservationItem[], expiresAt: Date): Promise<void> {
    // Deterministic order avoids deadlocks between concurrent checkouts.
    const sorted = [...items].sort((a, b) => a.variantId.localeCompare(b.variantId));
    for (const item of sorted) {
      const rows = await tx.$queryRaw<{ stock: number; reserved: number }[]>(Prisma.sql`
        UPDATE "Inventory"
        SET "reserved" = "reserved" + ${item.quantity}, "updatedAt" = NOW()
        WHERE "variantId" = ${item.variantId} AND ("stock" - "reserved") >= ${item.quantity}
        RETURNING "stock", "reserved"
      `);
      const row = rows[0];
      if (!row) {
        const snapshot = await this.availability(item.variantId);
        throw Errors.conflict(
          'INSUFFICIENT_STOCK',
          snapshot.available <= 0
            ? `«${item.title}» ناموجود شد`
            : `موجودی «${item.title}» فقط ${snapshot.available} عدد است`,
          { variantId: item.variantId, available: snapshot.available },
        );
      }
      await tx.inventoryReservation.create({
        data: { orderId, variantId: item.variantId, quantity: item.quantity, status: 'ACTIVE', expiresAt },
      });
      await tx.inventoryMovement.create({
        data: {
          variantId: item.variantId,
          type: 'RESERVE',
          quantity: item.quantity,
          stockAfter: row.stock,
          reservedAfter: row.reserved,
          orderId,
          reason: 'رزرو سفارش',
        },
      });
    }
  }

  /** Payment succeeded: reservation → sale. Idempotent. */
  async commit(orderId: string): Promise<void> {
    const touched = await this.prisma.transaction(async (tx) => {
      const reservations = await tx.inventoryReservation.findMany({ where: { orderId, status: 'ACTIVE' } });
      const variantIds: string[] = [];
      for (const reservation of reservations) {
        const claimed = await tx.inventoryReservation.updateMany({
          where: { id: reservation.id, status: 'ACTIVE' },
          data: { status: 'COMMITTED' },
        });
        if (!claimed.count) continue;
        const rows = await tx.$queryRaw<{ stock: number; reserved: number }[]>(Prisma.sql`
          UPDATE "Inventory"
          SET "stock" = "stock" - ${reservation.quantity},
              "reserved" = "reserved" - ${reservation.quantity},
              "sold" = "sold" + ${reservation.quantity},
              "updatedAt" = NOW()
          WHERE "variantId" = ${reservation.variantId} AND "reserved" >= ${reservation.quantity}
          RETURNING "stock", "reserved"
        `);
        const row = rows[0];
        if (!row) {
          throw Errors.internal(`موجودی برای سفارش ${orderId} قابل تسویه نیست`);
        }
        await tx.inventoryMovement.create({
          data: {
            variantId: reservation.variantId,
            type: 'SALE',
            quantity: reservation.quantity,
            stockAfter: row.stock,
            reservedAfter: row.reserved,
            orderId,
            reason: 'فروش',
          },
        });
        variantIds.push(reservation.variantId);
      }
      return variantIds;
    });
    await this.publishUpdates(touched);
  }

  /** Payment failed / timed out / order cancelled before payment. Idempotent. */
  async release(orderId: string, reason: string): Promise<number> {
    const { released, variantIds } = await this.prisma.transaction(async (tx) => {
      const reservations = await tx.inventoryReservation.findMany({ where: { orderId, status: 'ACTIVE' } });
      const variantIds: string[] = [];
      let released = 0;
      for (const reservation of reservations) {
        const claimed = await tx.inventoryReservation.updateMany({
          where: { id: reservation.id, status: 'ACTIVE' },
          data: { status: 'RELEASED' },
        });
        if (!claimed.count) continue;
        const rows = await tx.$queryRaw<{ stock: number; reserved: number }[]>(Prisma.sql`
          UPDATE "Inventory"
          SET "reserved" = GREATEST("reserved" - ${reservation.quantity}, 0), "updatedAt" = NOW()
          WHERE "variantId" = ${reservation.variantId}
          RETURNING "stock", "reserved"
        `);
        const row = rows[0];
        if (row) {
          await tx.inventoryMovement.create({
            data: {
              variantId: reservation.variantId,
              type: 'RELEASE',
              quantity: reservation.quantity,
              stockAfter: row.stock,
              reservedAfter: row.reserved,
              orderId,
              reason,
            },
          });
        }
        variantIds.push(reservation.variantId);
        released += 1;
      }
      return { released, variantIds };
    });
    await this.publishUpdates(variantIds);
    return released;
  }

  /** Refund/return of a paid order: units go back on the shelf. Idempotent. */
  async restock(orderId: string, reason: string): Promise<void> {
    const variantIds = await this.prisma.transaction(async (tx) => {
      const reservations = await tx.inventoryReservation.findMany({
        where: { orderId, status: 'COMMITTED' },
      });
      const touched: string[] = [];
      for (const reservation of reservations) {
        const claimed = await tx.inventoryReservation.updateMany({
          where: { id: reservation.id, status: 'COMMITTED' },
          data: { status: 'RELEASED' },
        });
        if (!claimed.count) continue;
        const rows = await tx.$queryRaw<{ stock: number; reserved: number }[]>(Prisma.sql`
          UPDATE "Inventory"
          SET "stock" = "stock" + ${reservation.quantity},
              "sold" = GREATEST("sold" - ${reservation.quantity}, 0),
              "updatedAt" = NOW()
          WHERE "variantId" = ${reservation.variantId}
          RETURNING "stock", "reserved"
        `);
        const row = rows[0];
        if (row) {
          await tx.inventoryMovement.create({
            data: {
              variantId: reservation.variantId,
              type: 'RETURN',
              quantity: reservation.quantity,
              stockAfter: row.stock,
              reservedAfter: row.reserved,
              orderId,
              reason,
            },
          });
        }
        touched.push(reservation.variantId);
      }
      return touched;
    });
    await this.publishUpdates(variantIds);
  }

  /** Re-reserves stock for a late payment whose reservation already expired. */
  async reReserveForOrder(orderId: string, expiresAt: Date): Promise<boolean> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) return false;
    try {
      await this.prisma.transaction(async (tx) => {
        await tx.inventoryReservation.deleteMany({ where: { orderId, status: { in: ['RELEASED'] } } });
        const items: ReservationItem[] = order.items
          .filter((i) => i.variantId)
          .map((i) => ({ variantId: i.variantId!, quantity: i.quantity, title: i.productName }));
        await this.reserve(tx, orderId, items, expiresAt);
      });
      return true;
    } catch (error) {
      this.logger.warn(`re-reservation failed for order ${orderId}: ${String(error)}`);
      return false;
    }
  }

  /**
   * A phone or in-store sale: stock leaves the shelf at once. It is recorded
   * as a reservation that is already committed, so a later cancellation or
   * refund restocks it the same way as a website order. Runs inside the
   * caller's transaction; never sells more than is available.
   */
  async sellInTx(tx: PrismaTx, orderId: string, items: ReservationItem[]): Promise<void> {
    const sorted = [...items].sort((a, b) => a.variantId.localeCompare(b.variantId));
    for (const item of sorted) {
      const rows = await tx.$queryRaw<{ stock: number; reserved: number }[]>(Prisma.sql`
        UPDATE "Inventory"
        SET "stock" = "stock" - ${item.quantity}, "sold" = "sold" + ${item.quantity}, "updatedAt" = NOW()
        WHERE "variantId" = ${item.variantId} AND ("stock" - "reserved") >= ${item.quantity}
        RETURNING "stock", "reserved"
      `);
      const row = rows[0];
      if (!row) {
        const inventory = await tx.inventory.findUnique({ where: { variantId: item.variantId } });
        const available = Math.max(0, (inventory?.stock ?? 0) - (inventory?.reserved ?? 0));
        throw Errors.conflict(
          'INSUFFICIENT_STOCK',
          available <= 0
            ? `«${item.title}» در انبار نیست`
            : `موجودی «${item.title}» فقط ${available} عدد است`,
          { variantId: item.variantId, available },
        );
      }
      await tx.inventoryReservation.create({
        data: {
          orderId,
          variantId: item.variantId,
          quantity: item.quantity,
          status: 'COMMITTED',
          expiresAt: new Date(),
        },
      });
      await tx.inventoryMovement.create({
        data: {
          variantId: item.variantId,
          type: 'SALE',
          quantity: item.quantity,
          stockAfter: row.stock,
          reservedAfter: row.reserved,
          orderId,
          reason: 'فروش حضوری یا تلفنی',
        },
      });
    }
  }

  /** Stock arriving or leaving outside an order (phones received by IMEI, one found faulty), in the caller's transaction. */
  async changeStockInTx(
    tx: PrismaTx,
    variantId: string,
    quantity: number,
    adminUserId: string | null,
    reason: string,
  ): Promise<StockSnapshot> {
    await tx.inventory.upsert({ where: { variantId }, create: { variantId, stock: 0 }, update: {} });
    const rows = await tx.$queryRaw<{ stock: number; reserved: number }[]>(Prisma.sql`
      UPDATE "Inventory"
      SET "stock" = "stock" + ${quantity}, "updatedAt" = NOW()
      WHERE "variantId" = ${variantId} AND "stock" + ${quantity} >= "reserved"
      RETURNING "stock", "reserved"
    `);
    const row = rows[0];
    if (!row) {
      throw Errors.conflict('STOCK_BELOW_RESERVED', 'این کار موجودی را از تعداد رزروشده کمتر می‌کند');
    }
    await tx.inventoryMovement.create({
      data: {
        variantId,
        type: quantity > 0 ? 'RESTOCK' : 'ADJUSTMENT',
        quantity,
        stockAfter: row.stock,
        reservedAfter: row.reserved,
        adminUserId,
        reason,
      },
    });
    return { stock: row.stock, reserved: row.reserved, available: row.stock - row.reserved };
  }

  /** Tells the catalog cache and live product pages that these variants' stock changed. */
  async notifyChanged(variantIds: string[]): Promise<void> {
    await this.publishUpdates(variantIds);
  }

  // ─── Admin operations ──────────────────────────────────────────────────────

  async adjust(
    variantId: string,
    input: InventoryAdjustInput,
    adminUserId: string | null,
  ): Promise<StockSnapshot> {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { inventory: true },
    });
    if (!variant) throw Errors.notFound('مدل کالا پیدا نشد');

    const current = variant.inventory ?? { stock: 0, reserved: 0, sold: 0, lowStockThreshold: 2 };
    const nextStock = input.mode === 'set' ? input.value : current.stock + input.value;
    if (nextStock < 0) throw Errors.badRequest('INVALID_STOCK', 'موجودی نمی‌تواند منفی شود');
    if (nextStock < current.reserved) {
      throw Errors.badRequest(
        'STOCK_BELOW_RESERVED',
        `موجودی نمی‌تواند کمتر از ${current.reserved} عدد رزروشده باشد`,
      );
    }

    const inventory = await this.prisma.inventory.upsert({
      where: { variantId },
      create: {
        variantId,
        stock: nextStock,
        lowStockThreshold: input.lowStockThreshold ?? current.lowStockThreshold,
      },
      update: {
        stock: nextStock,
        ...(input.lowStockThreshold !== undefined ? { lowStockThreshold: input.lowStockThreshold } : {}),
      },
    });

    await this.prisma.inventoryMovement.create({
      data: {
        variantId,
        type: input.mode === 'set' ? 'ADJUSTMENT' : input.value > 0 ? 'RESTOCK' : 'ADJUSTMENT',
        quantity: nextStock - current.stock,
        stockAfter: inventory.stock,
        reservedAfter: inventory.reserved,
        adminUserId,
        reason: input.reason,
      },
    });

    await this.publishUpdates([variantId]);
    return {
      stock: inventory.stock,
      reserved: inventory.reserved,
      available: inventory.stock - inventory.reserved,
    };
  }

  async movements(
    variantId: string,
    page: number,
    pageSize: number,
  ): Promise<Paginated<InventoryMovementDto>> {
    const [items, total] = await Promise.all([
      this.prisma.inventoryMovement.findMany({
        where: { variantId },
        orderBy: { createdAt: 'desc' },
        ...skipTake(page, pageSize),
      }),
      this.prisma.inventoryMovement.count({ where: { variantId } }),
    ]);
    return paginate(
      items.map((m) => ({
        id: m.id,
        variantId: m.variantId,
        type: m.type,
        typeLabel: INVENTORY_MOVEMENT_LABELS[m.type],
        quantity: m.quantity,
        stockAfter: m.stockAfter,
        reservedAfter: m.reservedAfter,
        orderId: m.orderId,
        adminUserId: m.adminUserId,
        reason: m.reason,
        createdAt: m.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    );
  }

  async lowStock(limit = 20) {
    const rows = await this.prisma.inventory.findMany({
      where: { variant: { isActive: true, product: { isActive: true } } },
      include: { variant: { include: { product: true, color: true, storage: true } } },
      orderBy: { stock: 'asc' },
      take: 200,
    });
    return rows
      .map((row) => ({
        variantId: row.variantId,
        productName: row.variant.product.name,
        title: `${row.variant.storage.labelFa} — ${row.variant.color.name}`,
        sku: row.variant.sku,
        available: Math.max(0, row.stock - row.reserved),
        threshold: row.lowStockThreshold,
        status: stockStatusOf(Math.max(0, row.stock - row.reserved), row.lowStockThreshold),
      }))
      .filter((row) => row.available <= row.threshold)
      .slice(0, limit);
  }

  /** Bumps the catalog cache and notifies SSE listeners. */
  private async publishUpdates(variantIds: string[]): Promise<void> {
    if (!variantIds.length) return;
    const unique = [...new Set(variantIds)];
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: unique } },
      include: { inventory: true, product: { select: { id: true, slug: true } } },
    });
    await this.catalogCache.invalidate();
    for (const variant of variants) {
      await this.catalogCache.publishInventoryUpdate({
        productId: variant.product.id,
        productSlug: variant.product.slug,
        variantId: variant.id,
        availableStock: Math.max(0, (variant.inventory?.stock ?? 0) - (variant.inventory?.reserved ?? 0)),
        price: toNumber(variant.price),
        at: new Date().toISOString(),
      });
    }
  }
}
