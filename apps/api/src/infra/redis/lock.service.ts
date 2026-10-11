import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { randomToken } from '../../common/utils';
import { REDIS_CLIENT } from './redis.constants';

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`;

/** Simple single-node Redis lock (SET NX PX + compare-and-delete release). */
@Injectable()
export class LockService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async acquire(key: string, ttlMs: number): Promise<string | null> {
    const token = randomToken(16);
    const result = await this.redis.set(key, token, 'PX', ttlMs, 'NX');
    return result === 'OK' ? token : null;
  }

  async release(key: string, token: string): Promise<void> {
    await this.redis.eval(RELEASE_SCRIPT, 1, key, token);
  }

  /** Runs `fn` while holding the lock; throws `onBusy()` when it cannot be taken. */
  async withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>, onBusy: () => Error): Promise<T> {
    const token = await this.acquire(key, ttlMs);
    if (!token) throw onBusy();
    try {
      return await fn();
    } finally {
      await this.release(key, token);
    }
  }
}
