import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { InventoryModule } from '../inventory/inventory.module';
import { LedgerModule } from '../ledger/ledger.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { AdminCatalogController } from './admin-catalog.controller';
import { AdminCommerceController } from './admin-commerce.controller';
import { AdminCommerceService } from './admin-commerce.service';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminPaymentsService } from './admin-payments.service';
import { AdminPeopleController } from './admin-people.controller';
import { AdminPeopleService } from './admin-people.service';
import { AdminProductsService } from './admin-products.service';

@Module({
  imports: [CatalogModule, InventoryModule, OrdersModule, PaymentsModule, LedgerModule],
  controllers: [
    AdminDashboardController,
    AdminCatalogController,
    AdminOrdersController,
    AdminCommerceController,
    AdminPeopleController,
  ],
  providers: [AdminProductsService, AdminCommerceService, AdminPeopleService, AdminPaymentsService],
  exports: [AdminProductsService],
})
export class AdminModule {}
