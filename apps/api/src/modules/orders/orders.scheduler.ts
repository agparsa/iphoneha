import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { JOB_CLEANUP, JOB_SWEEP_RESERVATIONS, QUEUE_ORDERS } from '../../infra/queue/queue.constants';

/** Registers the repeatable safety-net jobs on boot. */
@Injectable()
export class OrdersScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(OrdersScheduler.name);

  constructor(@InjectQueue(QUEUE_ORDERS) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.queue.add(
        JOB_SWEEP_RESERVATIONS,
        {},
        { repeat: { every: 60_000 }, jobId: 'sweep-reservations', removeOnComplete: true },
      );
      await this.queue.add(
        JOB_CLEANUP,
        {},
        { repeat: { every: 6 * 3600_000 }, jobId: 'cleanup', removeOnComplete: true },
      );
    } catch (error) {
      this.logger.error(`failed to register repeatable jobs: ${String(error)}`);
    }
  }
}
