import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { Observable, Subject } from 'rxjs';
import { REDIS_CLIENT, REDIS_SUBSCRIBER } from './redis.constants';

/** Cross-instance events (inventory/price updates feeding the SSE endpoint). */
@Injectable()
export class PubSubService {
  private readonly logger = new Logger(PubSubService.name);
  private readonly subjects = new Map<string, Subject<unknown>>();

  constructor(
    @Inject(REDIS_CLIENT) private readonly publisher: Redis,
    @Inject(REDIS_SUBSCRIBER) private readonly subscriber: Redis,
  ) {
    this.subscriber.on('message', (channel: string, message: string) => {
      const subject = this.subjects.get(channel);
      if (!subject) return;
      try {
        subject.next(JSON.parse(message));
      } catch {
        this.logger.warn(`invalid pubsub payload on ${channel}`);
      }
    });
  }

  async publish(channel: string, payload: unknown): Promise<void> {
    await this.publisher.publish(channel, JSON.stringify(payload));
  }

  observe<T>(channel: string): Observable<T> {
    let subject = this.subjects.get(channel) as Subject<T> | undefined;
    if (!subject) {
      subject = new Subject<T>();
      this.subjects.set(channel, subject as Subject<unknown>);
      void this.subscriber.subscribe(channel).catch((error) => {
        this.logger.error(`failed to subscribe to ${channel}: ${String(error)}`);
      });
    }
    return subject.asObservable();
  }
}
