import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { LedgerModule } from '../ledger/ledger.module';
import { BackofficeController } from './backoffice.controller';
import { CustomersService } from './customers.service';
import { ExportsService } from './exports.service';
import { PricingService } from './pricing.service';
import { ReportsService } from './reports.service';

@Module({
  imports: [CatalogModule, LedgerModule],
  controllers: [BackofficeController],
  providers: [CustomersService, PricingService, ReportsService, ExportsService],
  exports: [PricingService, ReportsService],
})
export class BackofficeModule {}
