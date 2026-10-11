import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_ORDERS } from '../../infra/queue/queue.constants';
import { CartModule } from '../cart/cart.module';
import { DevicesModule } from '../devices/devices.module';
import { LedgerModule } from '../ledger/ledger.module';
import { DiscountsModule } from '../discounts/discounts.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PaymentsModule } from '../payments/payments.module';
import { ShippingModule } from '../shipping/shipping.module';
import { UsersModule } from '../users/users.module';
import { CheckoutService } from './checkout.service';
import { ManualOrdersService } from './manual-orders.service';
import { OrderNumberService } from './order-number.service';
import { OrdersController } from './orders.controller';
import { OrdersProcessor } from './orders.processor';
import { OrdersScheduler } from './orders.scheduler';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_ORDERS }),
    CartModule,
    ShippingModule,
    DiscountsModule,
    InventoryModule,
    PaymentsModule,
    UsersModule,
    DevicesModule,
    LedgerModule,
  ],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    CheckoutService,
    ManualOrdersService,
    OrderNumberService,
    OrdersProcessor,
    OrdersScheduler,
  ],
  exports: [OrdersService, CheckoutService, ManualOrdersService],
})
export class OrdersModule {}
