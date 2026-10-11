import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

/**
 * Small JSON cache with namespace versioning: bumping a namespace version
 * invalidates every key built from it, without scanning Redis.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (error) {
      this.logger.warn(`cache get failed for ${key}: ${String(error)}`);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      this.logger.warn(`cache set failed for ${key}: ${String(error)}`);
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length) await this.redis.del(...keys);
  }

  /** Cache-aside helper. */
  async wrap<T>(key: string, ttlSeconds: number, factory: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const value = await factory();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  /**
   * Current namespace version. Defaults to 0 (not 1) so that the very first
   * `bumpVersion` — which INCRs a missing key to 1 — really does change every
   * key built from it; otherwise the first invalidation after a flush is a no-op.
   */
  async version(namespace: string): Promise<number> {
    const raw = await this.redis.get(`ver:${namespace}`);
    return raw ? Number(raw) : 0;
  }

  async bumpVersion(namespace: string): Promise<number> {
    return this.redis.incr(`ver:${namespace}`);
  }

  /** Builds a versioned cache key, e.g. `catalog:v3:list:<hash>` */
  async versionedKey(namespace: string, suffix: string): Promise<string> {
    const version = await this.version(namespace);
    return `${namespace}:v${version}:${suffix}`;
  }

  async flushNamespaceCounters(): Promise<void> {
    const keys = await this.redis.keys('ver:*');
    if (keys.length) await this.redis.del(...keys);
  }
}
