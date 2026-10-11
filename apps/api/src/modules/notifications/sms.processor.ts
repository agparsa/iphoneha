import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { maskPhone } from '@iphoneha/shared';
import { QUEUE_NOTIFICATIONS } from '../../infra/queue/queue.constants';
import { SMS_PROVIDER, type SmsProvider } from './sms/sms-provider.interface';
import type { SendSmsJob } from './notification.service';

@Processor(QUEUE_NOTIFICATIONS)
export class SmsProcessor extends WorkerHost {
  private readonly logger = new Logger(SmsProcessor.name);

  constructor(@Inject(SMS_PROVIDER) private readonly provider: SmsProvider) {
    super();
  }

  async process(job: Job<SendSmsJob>): Promise<void> {
    const { to, message } = job.data;
    try {
      await this.provider.send(to, message);
    } catch (error) {
      this.logger.error(`SMS to ${maskPhone(to)} failed (attempt ${job.attemptsMade + 1}): ${String(error)}`);
      throw error;
    }
  }
}
