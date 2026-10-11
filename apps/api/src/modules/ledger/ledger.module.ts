import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_LEDGER } from '../../infra/queue/queue.constants';
import { LedgerController } from './ledger.controller';
import { LedgerProcessor, LedgerScheduler } from './ledger.processor';
import { LedgerService } from './ledger.service';
import { MyInstallmentsController } from './my-installments.controller';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_LEDGER })],
  controllers: [LedgerController, MyInstallmentsController],
  providers: [LedgerService, LedgerProcessor, LedgerScheduler],
  exports: [LedgerService],
})
export class LedgerModule {}
