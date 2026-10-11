import { Inject, Injectable } from '@nestjs/common';
import {
  DEFAULT_INSTALLMENT_TERMS,
  INSTALLMENT_METHODS,
  estimateInstallment,
  type CompareRowDto,
  type CompareTableDto,
  type HeroSlideDto,
  type InstallmentMethod,
  type InstallmentTerms,
  type PaymentMethod,
  type ProductCardDto,
  type StorefrontConfigDto,
  type StorefrontHomeDto,
  type StorefrontSitemapDto,
} from '@iphoneha/shared';
import { APP_CONFIG, unavailablePaymentMethods, type AppConfig } from '../../config/env.config';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CacheService } from '../../infra/redis/cache.service';
import { CatalogCacheService } from '../catalog/catalog-cache.service';
import { ProductsService } from '../catalog/products.service';
import { ARTICLES_CACHE_NAMESPACE, ArticlesService } from '../content/articles.service';
import { SettingsService } from '../settings/settings.service';

const HOME_TTL = 120;
const CONFIG_TTL = 120;
/** Bump when a cached storefront payload gains or loses a field. */
const PAYLOAD_SHAPE = 'v3';

/** Rows of the comparison table, in the order buyers care about. */
const COMPARE_KEYS = [
  'نمایشگر',
  'تراشه',
  'دوربین اصلی',
  'دوربین سلفی',
  'باتری',
  'بدنه',
  'مقاومت',
  'گارانتی',
] as const;
const COMPARE_COLUMNS = 4;

@Injectable()
export class StorefrontService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly settings: SettingsService,
    private readonly cache: CacheService,
    private readonly articles: ArticlesService,
    @Inject(APP_CONFIG) private readonly appConfig: AppConfig,
  ) {}

  /**
   * Methods a customer cannot use: switched off in settings or env, or still
   * wired to the mock gateway where mocks are not allowed (production). Every
   * storefront surface that advertises a payment service goes through this.
   */
  private disabledMethods(settingsDisabled: readonly PaymentMethod[]): PaymentMethod[] {
    return [
      ...new Set([
        ...settingsDisabled,
        ...this.appConfig.PAYMENT_DISABLED_METHODS,
        ...unavailablePaymentMethods(this.appConfig),
      ]),
    ];
  }

  /**
   * Keyed on the catalog and settings versions, so either change busts it, and
   * on the services customers can use: a service connected in .env (by
   * installments.sh, then a restart) shows up at once, not after the TTL.
   */
  private async cacheKey(suffix: string): Promise<string> {
    const [catalogVersion, settingsVersion] = await Promise.all([
      this.cache.version(CatalogCacheService.NAMESPACE),
      this.cache.version('settings'),
    ]);
    const unavailable = unavailablePaymentMethods(this.appConfig).join('.') || 'none';
    // the shape tag keeps a payload cached by the previous release (without
    // fields this one added) from reaching the new storefront after a deploy
    return `storefront:${PAYLOAD_SHAPE}:c${catalogVersion}:s${settingsVersion}:u${unavailable}:${suffix}`;
  }

  /** Terms of the services a customer can actually use, falling back to the shipped defaults. */
  async installmentTerms(): Promise<InstallmentTerms[]> {
    const payments = await this.settings.get('payments');
    const configured = new Map(payments.installmentTerms.map((t) => [t.method, t]));
    const disabled = this.disabledMethods(payments.disabledMethods);
    return INSTALLMENT_METHODS.filter((m) => !disabled.includes(m)).map(
      (method) => configured.get(method) ?? DEFAULT_INSTALLMENT_TERMS[method],
    );
  }

  async config(): Promise<StorefrontConfigDto> {
    const cacheKey = await this.cacheKey('config');
    const cached = await this.cache.get<StorefrontConfigDto>(cacheKey);
    if (cached) return cached;

    const [store, commerce, payments, seo, credit, meta, installments] = await Promise.all([
      this.settings.get('store'),
      this.settings.get('commerce'),
      this.settings.get('payments'),
      this.settings.get('seo'),
      this.settings.get('credit'),
      this.products.meta(),
      this.installmentTerms(),
    ]);

    const config: StorefrontConfigDto = {
      store,
      commerce,
      installments,
      disabledMethods: this.disabledMethods(payments.disabledMethods),
      models: meta.models,
      series: meta.series,
      seo,
      credit,
    };
    await this.cache.set(cacheKey, config, CONFIG_TTL);
    return config;
  }

  /** Cheapest monthly instalment across the enabled services, for «از ماهانه …». */
  private cheapestMonthly(price: number, terms: InstallmentTerms[]): number | null {
    let best: number | null = null;
    for (const term of terms) {
      const { monthly } = estimateInstallment(price, term, { months: term.maxInstallments });
      if (best === null || monthly < best) best = monthly;
    }
    return best;
  }

  async home(): Promise<StorefrontHomeDto> {
    const cacheKey = await this.cacheKey('home');
    const cached = await this.cache.get<StorefrontHomeDto>(cacheKey);
    if (cached) return cached;

    const [homeSettings, terms] = await Promise.all([this.settings.get('home'), this.installmentTerms()]);

    const bannerSlugs = homeSettings.heroBanners.map((b) => b.productSlug);
    const categorySlugs = homeSettings.categorySlugs;

    const [
      bannerProducts,
      bannerImages,
      categoryProducts,
      featured,
      discounted,
      variantsCount,
      productsCount,
      ratings,
    ] = await Promise.all([
      this.cardsForSlugs(bannerSlugs),
      this.imagesByColor(bannerSlugs),
      this.cardsForSlugs(categorySlugs),
      this.products
        .list({
          featured: true,
          sort: 'featured',
          page: 1,
          pageSize: 8,
          model: [],
          series: [],
          storage: [],
          color: [],
          shippingTime: [],
        })
        .then((r) => r.items),
      this.products
        .list({
          discounted: true,
          sort: 'discount_desc',
          page: 1,
          pageSize: 8,
          model: [],
          series: [],
          storage: [],
          color: [],
          shippingTime: [],
        })
        .then((r) => r.items),
      this.prisma.productVariant.count({ where: { isActive: true, product: { isActive: true } } }),
      this.prisma.product.count({ where: { isActive: true } }),
      this.ratingSummary(),
    ]);

    const hero: HeroSlideDto[] = homeSettings.heroBanners.map((banner) => {
      const product = bannerProducts.get(banner.productSlug) ?? null;
      const colorCode = banner.colorCode ?? product?.variant.color.code ?? null;
      const image =
        (colorCode ? bannerImages.get(`${banner.productSlug}:${colorCode}`) : undefined) ??
        product?.variant.image?.url ??
        null;
      const price = product?.minPrice ?? null;
      return {
        id: banner.id,
        eyebrow: banner.eyebrow,
        title: banner.title,
        subtitle: banner.subtitle,
        ctaLabel: banner.ctaLabel,
        theme: banner.theme,
        href: product ? `/iphone/${product.slug}` : '/shop',
        colorCode,
        image,
        price,
        monthly: price !== null ? this.cheapestMonthly(price, terms) : null,
        product,
      };
    });

    const categories = categorySlugs
      .map((slug) => categoryProducts.get(slug))
      .filter((p): p is ProductCardDto => p !== undefined);

    const home: StorefrontHomeDto = {
      hero,
      categories,
      featured,
      discounted,
      compare: await this.compareTable(categories.length > 0 ? categories : featured, terms),
      stats: {
        products: productsCount,
        variants: variantsCount,
        installmentServices: terms.length,
        ratingAvg: ratings.average,
        ratingCount: ratings.count,
      },
    };

    await this.cache.set(cacheKey, home, HOME_TTL);
    return home;
  }

  /** `slug:colorCode` → image url, so a hero banner shows the colour it advertises. */
  private async imagesByColor(slugs: string[]): Promise<Map<string, string>> {
    if (slugs.length === 0) return new Map();
    const images = await this.prisma.productImage.findMany({
      where: { product: { slug: { in: slugs } }, colorId: { not: null } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { url: true, product: { select: { slug: true } }, color: { select: { code: true } } },
    });
    const map = new Map<string, string>();
    for (const image of images) {
      if (!image.color) continue;
      const key = `${image.product.slug}:${image.color.code}`;
      if (!map.has(key)) map.set(key, image.url);
    }
    return map;
  }

  /** One catalog query for a set of slugs, keyed by slug. */
  private async cardsForSlugs(slugs: string[]): Promise<Map<string, ProductCardDto>> {
    if (slugs.length === 0) return new Map();
    const { items } = await this.products.list({
      model: slugs,
      sort: 'featured',
      page: 1,
      pageSize: Math.min(48, Math.max(slugs.length, 1)),
      series: [],
      storage: [],
      color: [],
      shippingTime: [],
    });
    return new Map(items.map((item) => [item.slug, item]));
  }

  /**
   * Slugs + `updatedAt` for the sitemap. Kept separate from `config` so the
   * sitemap can carry real `lastModified` dates instead of "now".
   */
  async sitemap(): Promise<StorefrontSitemapDto> {
    // the article list has its own version: publishing one must not wait for the TTL
    const cacheKey = await this.cacheKey(`sitemap:a${await this.cache.version(ARTICLES_CACHE_NAMESPACE)}`);
    const cached = await this.cache.get<StorefrontSitemapDto>(cacheKey);
    if (cached) return cached;

    const rows = await this.prisma.product.findMany({
      where: { isActive: true },
      select: {
        slug: true,
        updatedAt: true,
        images: {
          select: { url: true, colorId: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
        variants: { where: { isActive: true }, select: { colorId: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { releaseYear: 'desc' }],
    });

    const products = rows.map((row) => {
      // only photos a visitor can reach: shared ones and the colours on sale
      const colors = new Set(row.variants.map((variant) => variant.colorId));
      return {
        slug: row.slug,
        updatedAt: row.updatedAt.toISOString(),
        images: row.images
          .filter((image) => image.colorId === null || colors.has(image.colorId))
          .map((image) => image.url),
      };
    });
    const newest = rows.reduce<Date | null>(
      (latest, row) => (latest === null || row.updatedAt > latest ? row.updatedAt : latest),
      null,
    );

    const payload: StorefrontSitemapDto = {
      products,
      articles: await this.articles.sitemapEntries(),
      catalogUpdatedAt: (newest ?? new Date()).toISOString(),
    };
    await this.cache.set(cacheKey, payload, CONFIG_TTL);
    return payload;
  }

  /** Store-wide rating, weighted by how many ratings each product has. */
  private async ratingSummary(): Promise<{ average: number | null; count: number }> {
    const [row] = await this.prisma.$queryRaw<{ total: number | null; weighted: number | null }[]>`
      SELECT SUM("ratingCount")::int AS total,
             SUM("ratingAvg" * "ratingCount")::float AS weighted
      FROM "Product"
      WHERE "isActive" = true AND "ratingAvg" IS NOT NULL AND "ratingCount" > 0
    `;
    const total = row?.total ?? 0;
    if (!total || row?.weighted == null) return { average: null, count: 0 };
    return { average: Math.round((row.weighted / total) * 10) / 10, count: total };
  }

  /**
   * «مقایسه مدل‌ها»: built from the products' own `specs`, keeping only the rows
   * that at least two of the compared models actually define.
   */
  private async compareTable(
    candidates: ProductCardDto[],
    terms: InstallmentTerms[],
  ): Promise<CompareTableDto> {
    const columns = candidates.slice(0, COMPARE_COLUMNS);
    if (columns.length < 2) return { products: [], rows: [] };

    const specRows = await this.prisma.product.findMany({
      where: { slug: { in: columns.map((c) => c.slug) }, isActive: true },
      select: { slug: true, specs: true },
    });
    const specsBySlug = new Map(
      specRows.map((row) => {
        const entries = Array.isArray(row.specs) ? (row.specs as { key?: unknown; value?: unknown }[]) : [];
        const map = new Map<string, string>();
        for (const entry of entries) {
          if (typeof entry?.key === 'string' && typeof entry?.value === 'string')
            map.set(entry.key, entry.value);
        }
        return [row.slug, map] as const;
      }),
    );

    const rows: CompareRowDto[] = [];
    for (const key of COMPARE_KEYS) {
      const values = columns.map((column) => specsBySlug.get(column.slug)?.get(key) ?? null);
      if (values.filter((value) => value !== null).length >= 2) rows.push({ key, values });
    }

    return {
      products: columns.map((column) => ({
        slug: column.slug,
        name: column.name,
        nameEn: column.nameEn,
        href: `/iphone/${column.slug}`,
        image: column.variant.image?.url ?? null,
        price: column.minPrice,
        monthly: this.cheapestMonthly(column.minPrice, terms),
        ratingAvg: column.ratingAvg,
        ratingCount: column.ratingCount,
        inStock: column.inStock,
      })),
      rows,
    };
  }

  /** Monthly estimate per service for a given price (instalments page + product page). */
  estimatesFor(price: number, terms: InstallmentTerms[]): Record<InstallmentMethod, number> {
    const out = {} as Record<InstallmentMethod, number>;
    for (const term of terms) {
      out[term.method] = estimateInstallment(price, term, { months: term.maxInstallments }).monthly;
    }
    return out;
  }
}
