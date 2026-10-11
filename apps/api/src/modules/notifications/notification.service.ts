import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../../config/env.config';
import { JOB_SEND_BOT, JOB_SEND_SMS, QUEUE_NOTIFICATIONS } from '../../infra/queue/queue.constants';
import { REDIS_CLIENT } from '../../infra/redis/redis.constants';
import type { SmsMessage } from './sms/sms-provider.interface';

export interface SendSmsJob {
  to: string;
  message: SmsMessage;
}

/** Only the text travels through Redis; the token stays in the server's .env. */
export interface SendBotJob {
  text: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectQueue(QUEUE_NOTIFICATIONS) private readonly queue: Queue,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private async enqueue(job: SendSmsJob): Promise<void> {
    try {
      await this.queue.add(JOB_SEND_SMS, job, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 3_000 },
      });
    } catch (error) {
      this.logger.error(`failed to enqueue SMS: ${String(error)}`);
    }
  }

  /** An alert SMS to a member of staff (see AlertsService). */
  async sendStaffSms(phone: string, message: SmsMessage): Promise<void> {
    await this.enqueue({ to: phone, message });
  }

  /** An alert to the staff chat of the bot set up on the server. */
  async sendBotMessage(text: string): Promise<void> {
    try {
      const job: SendBotJob = { text };
      await this.queue.add(JOB_SEND_BOT, job, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
      });
    } catch (error) {
      this.logger.error(`failed to enqueue a bot alert: ${String(error)}`);
    }
  }

  async sendOtp(phone: string, code: string): Promise<void> {
    // Development helper used by the local login page and the e2e tests.
    if (this.config.exposeOtp) {
      await this.redis.set(`dev:otp:${phone}`, code, 'EX', this.config.OTP_TTL_SECONDS);
    }
    await this.enqueue({ to: phone, message: { kind: 'otp', code } });
  }

  async sendOrderPaid(phone: string, orderNumber: string): Promise<void> {
    await this.enqueue({ to: phone, message: { kind: 'order-paid', orderNumber } });
  }

  /** «سفارش موفق»: placed and paid (online, by phone or in the store); falls back to the PAYMENT pattern. */
  async sendOrderConfirmed(phone: string, orderNumber: string, amount: string): Promise<void> {
    await this.enqueue({ to: phone, message: { kind: 'order-confirmed', orderNumber, amount } });
  }

  /** An instalment of the store's own ledger coming due, or past its due date. */
  async sendInstallmentReminder(
    phone: string,
    reminder: { contractNumber: string; amount: string; dueDate: string },
    overdue = false,
  ): Promise<void> {
    await this.enqueue({
      to: phone,
      message: { kind: overdue ? 'installment-overdue' : 'installment-reminder', ...reminder },
    });
  }

  /** «پرداخت موفق» of an instalment, with what is still owed on the contract. */
  async sendInstallmentPaid(
    phone: string,
    paid: { index: string; contractNumber: string; amount: string; remaining: string },
  ): Promise<void> {
    await this.enqueue({ to: phone, message: { kind: 'installment-paid', ...paid } });
  }

  /** The instalment booklet of a new contract. */
  async sendContractIssued(
    phone: string,
    booklet: { contractNumber: string; months: string; monthly: string; firstDue: string },
  ): Promise<void> {
    await this.enqueue({ to: phone, message: { kind: 'contract-issued', ...booklet } });
  }

  async sendOrderShipped(phone: string, orderNumber: string, trackingCode?: string | null): Promise<void> {
    await this.enqueue({ to: phone, message: { kind: 'order-shipped', orderNumber, trackingCode } });
  }

  /** Dev/e2e only: returns the last OTP sent to a phone. */
  async peekDevOtp(phone: string): Promise<string | null> {
    if (!this.config.exposeOtp) return null;
    return this.redis.get(`dev:otp:${phone}`);
  }
}
