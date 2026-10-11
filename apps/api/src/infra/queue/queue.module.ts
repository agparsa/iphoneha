import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { APP_CONFIG, type AppConfig } from '../../config/env.config';
import { QUEUE_LEDGER, QUEUE_NOTIFICATIONS, QUEUE_ORDERS } from './queue.constants';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        connection: { url: config.REDIS_URL },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: { age: 3600, count: 1_000 },
          removeOnFail: { age: 24 * 3600, count: 5_000 },
        },
      }),
    }),
    BullModule.registerQueue({ name: QUEUE_NOTIFICATIONS }, { name: QUEUE_ORDERS }, { name: QUEUE_LEDGER }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
