import 'server-only';
import type { ArticleSummaryDto, ProductCardDto, StorefrontConfigDto } from '@iphoneha/shared';
import { getLatestArticles, getStorefrontConfig, listProducts } from './api/endpoints';
import type { PriceTableModel } from '@/components/credit/model-price-table';

export interface CreditPageData {
  config: StorefrontConfigDto;
  /** models on sale, in the shop's featured order */
  products: ProductCardDto[];
  models: PriceTableModel[];
  articles: ArticleSummaryDto[];
  heroImage: { src: string; alt: string } | null;
}

/**
 * What the three instalment pages render from: the live terms, the models on
 * sale with their prices, and the magazine. A failed product request throws on
 * purpose — during a revalidation Next keeps serving the last good page rather
 * than caching one without prices.
 */
export async function creditPageData(): Promise<CreditPageData> {
  const [config, list, articles] = await Promise.all([
    getStorefrontConfig(),
    listProducts({ pageSize: 24, sort: 'featured' }),
    getLatestArticles(12),
  ]);
  const products = list.items.filter((product) => product.minPrice > 0);
  const hero = products.find((product) => product.variant.image?.url);
  return {
    config,
    products,
    models: products.map((product) => ({
      slug: product.slug,
      name: product.name,
      price: product.minPrice,
      image: product.variant.image?.url ?? null,
    })),
    articles,
    heroImage: hero ? { src: hero.variant.image!.url, alt: hero.name } : null,
  };
}
