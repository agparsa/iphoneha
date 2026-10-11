import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
  JOB_CLEANUP,
  JOB_EXPIRE_ORDER,
  JOB_SWEEP_RESERVATIONS,
  QUEUE_ORDERS,
} from '../../infra/queue/queue.constants';
import { CartService } from '../cart/cart.service';
import { OtpService } from '../auth/otp.service';
import { SessionService } from '../auth/session.service';
import { OrdersService } from './orders.service';

@Processor(QUEUE_ORDERS)
export class OrdersProcessor extends WorkerHost {
  private readonly logger = new Logger(OrdersProcessor.name);

  constructor(
    private readonly orders: OrdersService,
    private readonly carts: CartService,
    private readonly sessions: SessionService,
    private readonly otp: OtpService,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case JOB_EXPIRE_ORDER: {
        const { orderId } = job.data as { orderId: string };
        return this.orders.expireOrder(orderId);
      }
      case JOB_SWEEP_RESERVATIONS: {
        const count = await this.orders.sweepExpiredReservations();
        if (count) this.logger.log(`swept ${count} expired reservations`);
        return count;
      }
      case JOB_CLEANUP: {
        const [carts, sessions, otps] = await Promise.all([
          this.carts.purgeExpired(),
          this.sessions.purgeExpired(),
          this.otp.purgeExpired(),
        ]);
        return { carts, sessions, otps };
      }
      default:
        this.logger.warn(`unknown job ${job.name}`);
        return null;
    }
  }
}
