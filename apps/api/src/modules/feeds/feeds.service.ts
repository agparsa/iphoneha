import { Inject, Injectable } from '@nestjs/common';
import { REGISTRY_STATUS_LABELS } from '@iphoneha/shared';
import { APP_CONFIG, type AppConfig } from '../../config/env.config';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { toNumber } from '../../common/bigint';
import { availabilityOf, imageForColor } from '../catalog/catalog.mapper';
import {
  productInclude,
  type ProductWithRelations,
  type VariantWithRelations,
} from '../catalog/catalog.types';

/**
 * One sellable colour × capacity, in the item format the Iranian price
 * comparison sites read (Torob's API v3 and the Emalls extractor use the same
 * field names). Every value is already public on the product page.
 */
export interface FeedItem {
  /** stable per colour × capacity: the variant's SKU */
  page_unique: string;
  /** the product page, opened on this colour and capacity */
  page_url: string;
  title: string;
  /** Latin name, which the comparison sites match models by */
  subtitle: string;
  /** Toman, what the customer pays today */
  current_price: number;
  /** Toman, the price before the discount; null when there is none */
  old_price: number | null;
  availability: 'instock' | 'outofstock';
  category_name: string;
  image_link: string | null;
  image_links: string[];
  short_desc: string;
  spec: Record<string, string>;
  registry: string;
  guarantee: string;
  date_added: string;
  date_updated: string;
}

export type FeedSort = 'date_added_desc' | 'date_updated_desc';

export const FEED_PAGE_SIZE = 100;
const CATEGORY = 'گوشی موبایل';

/** A page address as the comparison sites send it back: scheme, `www.`, trailing slash and parameter order don't matter. */
export function normalizePageUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    const host = url.host.toLowerCase().replace(/^www\./, '');
    const path = decodeURIComponent(url.pathname).replace(/\/+$/, '') || '/';
    const params = [...url.searchParams.entries()]
      .filter(([key]) => key === 'color' || key === 'storage')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, param]) => `${key}=${param}`)
      .join('&');
    return `${host}${path}${params ? `?${params}` : ''}`;
  } catch {
    return null;
  }
}

@Injectable()
export class FeedsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private absolute(path: string): string {
    return new URL(path, this.config.WEB_URL).toString();
  }

  private toItem(product: ProductWithRelations, variant: VariantWithRelations): FeedItem {
    const { color, storage } = variant;
    const price = toNumber(variant.price);
    const compareAt = toNumber(variant.compareAtPrice);
    const photos = product.images.filter((image) => image.colorId === variant.colorId);
    const shared = product.images.filter((image) => image.colorId === null);
    const images = (photos.length > 0 ? [...photos, ...shared] : shared).map((image) =>
      this.absolute(image.url),
    );
    const cover = imageForColor(product.images, variant.colorId);
    const specs = Array.isArray(product.specs)
      ? (product.specs as unknown as { key: string; value: string }[])
      : [];
    const updated = [product.updatedAt, variant.updatedAt, variant.inventory?.updatedAt].reduce<Date>(
      (latest, date) => (date && date > latest ? date : latest),
      variant.createdAt,
    );

    return {
      page_unique: variant.sku,
      page_url: this.absolute(
        `/iphone/${product.slug}?color=${encodeURIComponent(color.code)}&storage=${storage.capacityGb}`,
      ),
      title: `${product.name} ${storage.labelFa} ${color.name}`,
      subtitle: `Apple ${product.nameEn} ${storage.label} ${color.nameEn}`,
      current_price: price,
      old_price: compareAt > price ? compareAt : null,
      availability: availabilityOf(variant).available > 0 ? 'instock' : 'outofstock',
      category_name: CATEGORY,
      image_link: cover ? this.absolute(cover.url) : (images[0] ?? null),
      image_links: images,
      short_desc: product.shortDescription ?? product.tagline ?? '',
      spec: {
        ...Object.fromEntries(specs.map((spec) => [spec.key, spec.value])),
        رنگ: color.name,
        'حافظه داخلی': storage.labelFa,
      },
      registry: REGISTRY_STATUS_LABELS[product.registryStatus],
      guarantee: product.warranty,
      date_added: variant.createdAt.toISOString(),
      date_updated: updated.toISOString(),
    };
  }

  /** Everything on sale: active models, their active and priced colours × capacities. */
  async items(sort: FeedSort = 'date_added_desc'): Promise<FeedItem[]> {
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      include: productInclude,
      orderBy: [{ sortOrder: 'asc' }, { releaseYear: 'desc' }],
    });
    const items = products.flatMap((product) =>
      product.variants
        .filter((variant) => variant.isActive && toNumber(variant.price) > 0)
        .map((variant) => this.toItem(product, variant)),
    );
    const key = sort === 'date_updated_desc' ? 'date_updated' : 'date_added';
    // newest first; the SKU keeps the order stable between two page requests
    return items.sort((a, b) => b[key].localeCompare(a[key]) || a.page_unique.localeCompare(b.page_unique));
  }

  /** The items for specific pages or SKUs, as a comparison site re-checks them. */
  async lookup(pageUrls: string[], pageUniques: string[]): Promise<FeedItem[]> {
    const items = await this.items();
    const uniques = new Set(pageUniques.map((unique) => unique.trim()));
    const wanted = new Set(pageUrls.map(normalizePageUrl).filter((url): url is string => url !== null));

    return items.filter((item) => {
      if (uniques.has(item.page_unique)) return true;
      const exact = normalizePageUrl(item.page_url);
      if (exact && wanted.has(exact)) return true;
      // the bare product page (no colour or capacity) stands for all of them
      const bare = exact?.split('?')[0];
      return bare !== undefined && wanted.has(bare);
    });
  }
}
