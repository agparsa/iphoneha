import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../../config/env.config';
import { REDIS_CLIENT, REDIS_SUBSCRIBER } from './redis.constants';
import { CacheService } from './cache.service';
import { LockService } from './lock.service';
import { RateLimitService } from './rate-limit.service';
import { PubSubService } from './pubsub.service';

const createClient = (config: AppConfig, role: string) =>
  new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
    connectionName: `iphoneha-${role}`,
  });

@Global()
@Module({
  providers: [
    { provide: REDIS_CLIENT, inject: [APP_CONFIG], useFactory: (c: AppConfig) => createClient(c, 'main') },
    { provide: REDIS_SUBSCRIBER, inject: [APP_CONFIG], useFactory: (c: AppConfig) => createClient(c, 'sub') },
    CacheService,
    LockService,
    RateLimitService,
    PubSubService,
  ],
  exports: [REDIS_CLIENT, REDIS_SUBSCRIBER, CacheService, LockService, RateLimitService, PubSubService],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(
    @Inject(REDIS_CLIENT) private readonly client: Redis,
    @Inject(REDIS_SUBSCRIBER) private readonly subscriber: Redis,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([this.client.quit(), this.subscriber.quit()]);
  }
}
