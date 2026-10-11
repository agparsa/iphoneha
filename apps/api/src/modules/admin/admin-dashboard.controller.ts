import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { paymentMethodName, roleHasPermission, type AdminDashboardDto } from '@iphoneha/shared';
import { AdminAuthGuard, PermissionsGuard } from '../../common/guards';
import { CurrentAdmin, RequirePermissions } from '../../common/decorators';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { OrdersService } from '../orders/orders.service';
import { LedgerService } from '../ledger/ledger.service';
import type { AuthAdmin } from '../../types/express';

@ApiTags('admin-dashboard')
@Controller('admin')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminDashboardController {
  constructor(
    private readonly orders: OrdersService,
    private readonly inventory: InventoryService,
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  @Get('dashboard')
  @RequirePermissions('dashboard.read')
  async dashboard(@CurrentAdmin() admin: AuthAdmin): Promise<AdminDashboardDto> {
    const [stats, lowStock, usersCount, activeReservations, ledger] = await Promise.all([
      this.orders.statsForDashboard(),
      this.inventory.lowStock(8),
      this.prisma.user.count(),
      this.prisma.inventoryReservation.count({ where: { status: 'ACTIVE' } }),
      // the instalment book only for those who may read it
      roleHasPermission(admin.role, 'installments.read') ? this.ledger.summary() : Promise.resolve(null),
    ]);

    return {
      ...stats,
      paymentsByMethod: stats.paymentsByMethod.map((row) => ({
        ...row,
        name: paymentMethodName(row.method),
      })),
      lowStock,
      usersCount,
      activeReservations,
      ledger,
    };
  }
}
