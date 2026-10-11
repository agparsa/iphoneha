import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, Optional } from '@nestjs/common';
import type { Job } from 'bullmq';
import { maskPhone } from '@iphoneha/shared';
import { JOB_SEND_BOT, QUEUE_NOTIFICATIONS } from '../../infra/queue/queue.constants';
import { SMS_PROVIDER, type SmsProvider } from './sms/sms-provider.interface';
import { ALERT_BOT, type AlertBot } from './bot/alert-bot';
import type { SendBotJob, SendSmsJob } from './notification.service';

/** Sends what NotificationService queued: SMS to anyone, bot messages to the staff chat. */
@Processor(QUEUE_NOTIFICATIONS)
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    @Inject(SMS_PROVIDER) private readonly provider: SmsProvider,
    @Optional() @Inject(ALERT_BOT) private readonly bot: AlertBot | null = null,
  ) {
    super();
  }

  async process(job: Job<SendSmsJob | SendBotJob>): Promise<void> {
    if (job.name === JOB_SEND_BOT) {
      // the bot was removed from .env after the job was queued
      if (!this.bot) return;
      await this.bot.send((job.data as SendBotJob).text);
      return;
    }

    const { to, message } = job.data as SendSmsJob;
    try {
      await this.provider.send(to, message);
    } catch (error) {
      this.logger.error(`SMS to ${maskPhone(to)} failed (attempt ${job.attemptsMade + 1}): ${String(error)}`);
      throw error;
    }
  }
}
