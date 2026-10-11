import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

export interface RateLimitResult {
  allowed: boolean;
  current: number;
  limit: number;
  retryAfterSeconds: number;
}

/** Fixed-window counters used for OTP send/verify and other sensitive endpoints. */
@Injectable()
export class RateLimitService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async hit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const pipeline = this.redis.multi();
    pipeline.incr(key);
    pipeline.ttl(key);
    const results = await pipeline.exec();
    const current = Number(results?.[0]?.[1] ?? 0);
    let ttl = Number(results?.[1]?.[1] ?? -1);
    if (ttl < 0) {
      await this.redis.expire(key, windowSeconds);
      ttl = windowSeconds;
    }
    return { allowed: current <= limit, current, limit, retryAfterSeconds: ttl };
  }

  /** Reads the current counter without incrementing. */
  async peek(key: string): Promise<{ current: number; ttl: number }> {
    const [value, ttl] = await Promise.all([this.redis.get(key), this.redis.ttl(key)]);
    return { current: value ? Number(value) : 0, ttl };
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(key);
  }

  /** Marks a key as "cooling down" for `seconds`; returns false when it is already set. */
  async setCooldown(key: string, seconds: number): Promise<boolean> {
    const result = await this.redis.set(key, '1', 'EX', seconds, 'NX');
    return result === 'OK';
  }

  async cooldownRemaining(key: string): Promise<number> {
    const ttl = await this.redis.ttl(key);
    return ttl > 0 ? ttl : 0;
  }
}
