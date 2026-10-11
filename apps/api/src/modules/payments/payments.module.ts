import { Module } from '@nestjs/common';
import { DiscountsModule } from '../discounts/discounts.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentProviderRegistry } from './provider-registry.service';
import { MockGatewayService } from './providers/mock-gateway.service';

@Module({
  imports: [InventoryModule, DiscountsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentProviderRegistry, MockGatewayService],
  exports: [PaymentsService, PaymentProviderRegistry],
})
export class PaymentsModule {}
