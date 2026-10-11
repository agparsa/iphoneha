import { Module } from '@nestjs/common';
import { AdminCreditRequestsController } from './admin-credit-requests.controller';
import { CreditRequestsController } from './credit-requests.controller';
import { CreditRequestsService } from './credit-requests.service';

@Module({
  controllers: [CreditRequestsController, AdminCreditRequestsController],
  providers: [CreditRequestsService],
})
export class CreditModule {}
