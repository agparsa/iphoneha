import { Injectable } from '@nestjs/common';
import { CacheService } from '../../infra/redis/cache.service';
import { PubSubService } from '../../infra/redis/pubsub.service';
import { hashObject } from '../../common/utils';

export const INVENTORY_CHANNEL = 'inventory:updates';

export interface InventoryUpdateEvent {
  productId: string;
  productSlug: string;
  variantId: string;
  availableStock: number;
  price: number;
  at: string;
}

/**
 * Versioned catalog cache. Any product/price/stock change bumps the version,
 * which invalidates every cached list/detail payload at once.
 */
@Injectable()
export class CatalogCacheService {
  static readonly NAMESPACE = 'catalog';
  static readonly LIST_TTL = 60;
  static readonly DETAIL_TTL = 60;

  constructor(
    private readonly cache: CacheService,
    private readonly pubsub: PubSubService,
  ) {}

  async listKey(query: unknown): Promise<string> {
    return this.cache.versionedKey(CatalogCacheService.NAMESPACE, `list:${hashObject(query)}`);
  }

  async detailKey(slug: string): Promise<string> {
    return this.cache.versionedKey(CatalogCacheService.NAMESPACE, `detail:${slug}`);
  }

  async metaKey(): Promise<string> {
    return this.cache.versionedKey(CatalogCacheService.NAMESPACE, 'meta');
  }

  get<T>(key: string): Promise<T | null> {
    return this.cache.get<T>(key);
  }

  set(key: string, value: unknown, ttl: number): Promise<void> {
    return this.cache.set(key, value, ttl);
  }

  /** Invalidates every cached catalog payload. */
  async invalidate(): Promise<void> {
    await this.cache.bumpVersion(CatalogCacheService.NAMESPACE);
  }

  /** Invalidate + notify connected clients (SSE) about a stock/price change. */
  async publishInventoryUpdate(event: InventoryUpdateEvent): Promise<void> {
    await this.invalidate();
    await this.pubsub.publish(INVENTORY_CHANNEL, event);
  }

  observeInventory() {
    return this.pubsub.observe<InventoryUpdateEvent>(INVENTORY_CHANNEL);
  }
}
