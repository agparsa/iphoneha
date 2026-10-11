import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { JOB_INSTALLMENT_REMINDERS, QUEUE_LEDGER } from '../../infra/queue/queue.constants';
import { LedgerService } from './ledger.service';

/** 10:00 Tehran time: late enough not to wake anyone, early enough to pay the same day. */
export const REMINDER_CRON = '0 10 * * *';
export const REMINDER_TZ = 'Asia/Tehran';

@Processor(QUEUE_LEDGER)
export class LedgerProcessor extends WorkerHost {
  private readonly logger = new Logger(LedgerProcessor.name);

  constructor(private readonly ledger: LedgerService) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    if (job.name === JOB_INSTALLMENT_REMINDERS) return this.ledger.runDailyReminders();
    this.logger.warn(`unknown job ${job.name}`);
    return null;
  }
}

/** Registers the daily reminder run on boot (it does nothing until reminders are turned on). */
@Injectable()
export class LedgerScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(LedgerScheduler.name);

  constructor(@InjectQueue(QUEUE_LEDGER) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.queue.add(
        JOB_INSTALLMENT_REMINDERS,
        {},
        {
          repeat: { pattern: REMINDER_CRON, tz: REMINDER_TZ },
          jobId: 'installment-reminders',
          removeOnComplete: true,
          attempts: 1,
        },
      );
    } catch (error) {
      this.logger.error(`failed to register the reminder job: ${String(error)}`);
    }
  }
}
