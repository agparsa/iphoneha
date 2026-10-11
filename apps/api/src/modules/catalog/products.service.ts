import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  SHIPPING_TIMES,
  SHIPPING_TIME_LABELS,
  parseSearchQuery,
  type CatalogFacets,
  type CatalogMetaDto,
  type ProductCardDto,
  type ProductDetailDto,
  type ProductListQuery,
  type ProductListResponse,
  type SearchColorKeyword,
  type SearchSuggestionDto,
  type ShippingTime,
} from '@iphoneha/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { Errors } from '../../common/errors';
import { toNumber } from '../../common/bigint';
import { CatalogCacheService } from './catalog-cache.service';
import { productInclude } from './catalog.types';
import { toColorDto, toProductCard, toProductDetail, toStorageDto } from './catalog.mapper';

interface PoolFilters {
  storages?: number[];
  colorCodes?: string[];
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  discounted?: boolean;
  shippingTimes?: ShippingTime[];
  featured?: boolean;
  series?: string[];
  modelSlugs?: string[];
  textTokens?: string[];
}

interface RankedRow {
  product_id: string;
  variant_id: string;
}

/** The LIKE metacharacters of a search token, escaped for `ESCAPE '\\'`. */
const escapeLike = (token: string): string => token.replace(/[\\%_]/g, (c) => `\\${c}`);

const SORT_ORDER: Record<ProductListQuery['sort'], string> = {
  featured: '"is_featured" DESC, "sort_order" ASC, "release_year" DESC, "price" ASC',
  newest: '"release_year" DESC, "created_at" DESC, "price" ASC',
  price_asc: '"price" ASC',
  price_desc: '"price" DESC',
  discount_desc: '"discount_percent" DESC, "price" ASC',
};

const PICK_ORDER: Record<ProductListQuery['sort'], string> = {
  featured: '(available > 0) DESC, price ASC',
  newest: '(available > 0) DESC, price ASC',
  price_asc: '(available > 0) DESC, price ASC',
  price_desc: '(available > 0) DESC, price ASC',
  discount_desc: '(available > 0) DESC, discount_percent DESC, price ASC',
};

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CatalogCacheService,
  ) {}

  // ─── Search helpers ────────────────────────────────────────────────────────

  /** Colour names/aliases used to turn «مشکی» or «Deep Blue» into a colour filter. */
  private async colorKeywords(): Promise<SearchColorKeyword[]> {
    const colors = await this.prisma.color.findMany({
      select: { code: true, name: true, nameEn: true, aliases: true },
    });
    return colors.map((c) => ({ code: c.code, keywords: [c.name, c.nameEn, ...c.aliases] }));
  }

  private async buildFilters(query: ProductListQuery): Promise<PoolFilters> {
    const filters: PoolFilters = {
      storages: query.storage?.length ? query.storage : undefined,
      colorCodes: query.color?.length ? query.color : undefined,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      inStock: query.inStock,
      discounted: query.discounted,
      shippingTimes: query.shippingTime?.length ? query.shippingTime : undefined,
      featured: query.featured,
      series: query.series?.length ? query.series : undefined,
      modelSlugs: query.model?.length ? query.model : undefined,
    };

    if (query.q?.trim()) {
      const parsed = parseSearchQuery(query.q, await this.colorKeywords());
      filters.textTokens = parsed.textTokens;
      if (parsed.storages.length)
        filters.storages = [...new Set([...(filters.storages ?? []), ...parsed.storages])];
      if (parsed.colorCodes.length)
        filters.colorCodes = [...new Set([...(filters.colorCodes ?? []), ...parsed.colorCodes])];
    }
    return filters;
  }

  private poolSql(filters: PoolFilters): Prisma.Sql {
    const where: Prisma.Sql[] = [Prisma.sql`v."isActive" = true`, Prisma.sql`p."isActive" = true`];

    if (filters.storages?.length) where.push(Prisma.sql`s."capacityGb" = ANY(${filters.storages}::int[])`);
    if (filters.colorCodes?.length) where.push(Prisma.sql`c."code" = ANY(${filters.colorCodes}::text[])`);
    if (filters.minPrice !== undefined) where.push(Prisma.sql`v."price" >= ${BigInt(filters.minPrice)}`);
    if (filters.maxPrice !== undefined) where.push(Prisma.sql`v."price" <= ${BigInt(filters.maxPrice)}`);
    if (filters.inStock) where.push(Prisma.sql`(i."stock" - i."reserved") > 0`);
    if (filters.discounted) where.push(Prisma.sql`v."discountPercent" > 0`);
    if (filters.shippingTimes?.length)
      where.push(Prisma.sql`v."shippingTime"::text = ANY(${filters.shippingTimes}::text[])`);
    if (filters.featured) where.push(Prisma.sql`p."isFeatured" = true`);
    if (filters.series?.length) where.push(Prisma.sql`p."series" = ANY(${filters.series}::text[])`);
    if (filters.modelSlugs?.length) where.push(Prisma.sql`p."slug" = ANY(${filters.modelSlugs}::text[])`);
    for (const token of filters.textTokens ?? []) {
      // a «%» or «_» typed by the visitor is a character to find, not a wildcard
      where.push(Prisma.sql`p."searchText" LIKE ${'%' + escapeLike(token) + '%'} ESCAPE '\\'`);
    }

    return Prisma.sql`
      SELECT v."id" AS variant_id,
             v."productId" AS product_id,
             v."price" AS price,
             v."discountPercent" AS discount_percent,
             (i."stock" - i."reserved") AS available,
             p."isFeatured" AS is_featured,
             p."sortOrder" AS sort_order,
             p."releaseYear" AS release_year,
             p."createdAt" AS created_at
      FROM "ProductVariant" v
      JOIN "Product" p ON p."id" = v."productId"
      JOIN "Inventory" i ON i."variantId" = v."id"
      JOIN "Color" c ON c."id" = v."colorId"
      JOIN "Storage" s ON s."id" = v."storageId"
      WHERE ${Prisma.join(where, ' AND ')}
    `;
  }

  async list(query: ProductListQuery): Promise<ProductListResponse> {
    const cacheKey = await this.cache.listKey(query);
    const cached = await this.cache.get<ProductListResponse>(cacheKey);
    if (cached) return cached;

    const filters = await this.buildFilters(query);
    const pool = this.poolSql(filters);
    const skip = (query.page - 1) * query.pageSize;

    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRaw<RankedRow[]>(Prisma.sql`
        WITH pool AS (${pool}),
        ranked AS (
          SELECT DISTINCT ON (product_id) *
          FROM pool
          ORDER BY product_id, ${Prisma.raw(PICK_ORDER[query.sort])}
        )
        SELECT product_id, variant_id
        FROM ranked
        ORDER BY ${Prisma.raw(SORT_ORDER[query.sort])}
        LIMIT ${query.pageSize} OFFSET ${skip}
      `),
      this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
        WITH pool AS (${pool})
        SELECT COUNT(DISTINCT product_id)::bigint AS count FROM pool
      `),
    ]);

    const total = Number(countRows[0]?.count ?? 0);
    const products = rows.length
      ? await this.prisma.product.findMany({
          where: { id: { in: rows.map((r) => r.product_id) } },
          include: productInclude,
        })
      : [];
    const byId = new Map(products.map((p) => [p.id, p]));
    const items: ProductCardDto[] = rows
      .map((row) => {
        const product = byId.get(row.product_id);
        return product ? toProductCard(product, row.variant_id) : null;
      })
      .filter((p): p is ProductCardDto => p !== null);

    const response: ProductListResponse = {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      facets: await this.facets(filters),
    };

    await this.cache.set(cacheKey, response, CatalogCacheService.LIST_TTL);
    return response;
  }

  /** Facet counts ignore their own dimension so customers can switch values. */
  private async facets(filters: PoolFilters): Promise<CatalogFacets> {
    const colorPool = this.poolSql({ ...filters, colorCodes: undefined });
    const storagePool = this.poolSql({ ...filters, storages: undefined });
    const modelPool = this.poolSql({ ...filters, modelSlugs: undefined, series: undefined });

    const [colorRows, storageRows, modelRows, priceRow] = await Promise.all([
      this.prisma.$queryRaw<{ color_id: string; count: bigint }[]>(Prisma.sql`
        WITH pool AS (${colorPool})
        SELECT v."colorId" AS color_id, COUNT(DISTINCT pool.product_id)::bigint AS count
        FROM pool JOIN "ProductVariant" v ON v."id" = pool.variant_id
        GROUP BY v."colorId"
      `),
      this.prisma.$queryRaw<{ storage_id: string; count: bigint }[]>(Prisma.sql`
        WITH pool AS (${storagePool})
        SELECT v."storageId" AS storage_id, COUNT(DISTINCT pool.product_id)::bigint AS count
        FROM pool JOIN "ProductVariant" v ON v."id" = pool.variant_id
        GROUP BY v."storageId"
      `),
      this.prisma.$queryRaw<{ slug: string; name: string; series: string; count: bigint }[]>(Prisma.sql`
        WITH pool AS (${modelPool})
        SELECT p."slug", p."name", p."series", COUNT(DISTINCT pool.product_id)::bigint AS count
        FROM pool JOIN "Product" p ON p."id" = pool.product_id
        GROUP BY p."slug", p."name", p."series"
        ORDER BY p."name"
      `),
      this.prisma.$queryRaw<{ min: bigint | null; max: bigint | null }[]>(Prisma.sql`
        WITH pool AS (${this.poolSql({ ...filters, minPrice: undefined, maxPrice: undefined })})
        SELECT MIN(price) AS min, MAX(price) AS max FROM pool
      `),
    ]);

    const colorsCount = new Map(colorRows.map((r) => [r.color_id, Number(r.count)]));
    const storagesCount = new Map(storageRows.map((r) => [r.storage_id, Number(r.count)]));
    const [colors, storages] = await Promise.all([
      this.prisma.color.findMany({
        where: { id: { in: [...colorsCount.keys()] } },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.storage.findMany({
        where: { id: { in: [...storagesCount.keys()] } },
        orderBy: { capacityGb: 'asc' },
      }),
    ]);

    const seriesCount = new Map<string, number>();
    for (const row of modelRows) {
      seriesCount.set(row.series, (seriesCount.get(row.series) ?? 0) + Number(row.count));
    }

    return {
      colors: colors.map((c) => ({ ...toColorDto(c), count: colorsCount.get(c.id) ?? 0 })),
      storages: storages.map((s) => ({ ...toStorageDto(s), count: storagesCount.get(s.id) ?? 0 })),
      series: [...seriesCount.entries()].map(([value, count]) => ({ value, count })),
      models: modelRows.map((r) => ({ slug: r.slug, name: r.name, count: Number(r.count) })),
      priceRange: {
        min: priceRow[0]?.min ? Number(priceRow[0].min) : 0,
        max: priceRow[0]?.max ? Number(priceRow[0].max) : 0,
      },
    };
  }

  async detailBySlug(slug: string): Promise<ProductDetailDto> {
    const cacheKey = await this.cache.detailKey(slug);
    const cached = await this.cache.get<ProductDetailDto>(cacheKey);
    if (cached) return cached;

    const product = await this.prisma.product.findFirst({
      where: { slug, isActive: true },
      include: productInclude,
    });
    if (!product) throw Errors.notFound('محصول مورد نظر پیدا نشد');

    const detail = toProductDetail(product);
    await this.cache.set(cacheKey, detail, CatalogCacheService.DETAIL_TTL);
    return detail;
  }

  async relatedProducts(slug: string, limit = 4): Promise<ProductCardDto[]> {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      select: { id: true, series: true },
    });
    if (!product) return [];
    const products = await this.prisma.product.findMany({
      where: { isActive: true, id: { not: product.id } },
      include: productInclude,
      orderBy: [{ series: product.series ? 'asc' : 'desc' }, { isFeatured: 'desc' }, { releaseYear: 'desc' }],
      take: limit,
    });
    return products
      .map((p) => {
        const variant =
          p.variants.filter((v) => v.isActive).sort((a, b) => toNumber(a.price) - toNumber(b.price))[0] ??
          null;
        return variant ? toProductCard(p, variant.id) : null;
      })
      .filter((p): p is ProductCardDto => p !== null);
  }

  async suggest(q: string, limit: number): Promise<SearchSuggestionDto[]> {
    const filters = await this.buildFilters({
      q,
      model: [],
      series: [],
      storage: [],
      color: [],
      shippingTime: [],
      sort: 'featured',
      page: 1,
      pageSize: limit,
    } as unknown as ProductListQuery);

    const rows = await this.prisma.$queryRaw<RankedRow[]>(Prisma.sql`
      WITH pool AS (${this.poolSql(filters)}),
      ranked AS (
        SELECT DISTINCT ON (product_id) * FROM pool
        ORDER BY product_id, (available > 0) DESC, price ASC
      )
      SELECT product_id, variant_id FROM ranked
      ORDER BY "is_featured" DESC, "release_year" DESC, "price" ASC
      LIMIT ${limit}
    `);
    if (!rows.length) return [];

    const products = await this.prisma.product.findMany({
      where: { id: { in: rows.map((r) => r.product_id) } },
      include: productInclude,
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    return rows.flatMap((row) => {
      const product = byId.get(row.product_id);
      if (!product) return [];
      const card = toProductCard(product, row.variant_id);
      return [
        {
          productId: product.id,
          slug: product.slug,
          name: product.name,
          nameEn: product.nameEn,
          variantId: card.variant.id,
          label: `${card.variant.storage.labelFa} — ${card.variant.color.name}`,
          price: card.variant.price,
          image: card.variant.image?.url ?? null,
          href: `/iphone/${product.slug}`,
        },
      ];
    });
  }

  async meta(): Promise<CatalogMetaDto> {
    const cacheKey = await this.cache.metaKey();
    const cached = await this.cache.get<CatalogMetaDto>(cacheKey);
    if (cached) return cached;

    const [colors, storages, products, priceRow] = await Promise.all([
      this.prisma.color.findMany({ orderBy: { sortOrder: 'asc' } }),
      this.prisma.storage.findMany({ orderBy: { capacityGb: 'asc' } }),
      this.prisma.product.findMany({
        where: { isActive: true },
        select: { slug: true, name: true, nameEn: true, series: true },
        orderBy: [{ sortOrder: 'asc' }, { releaseYear: 'desc' }],
      }),
      this.prisma.$queryRaw<{ min: bigint | null; max: bigint | null }[]>(Prisma.sql`
        SELECT MIN(v."price") AS min, MAX(v."price") AS max
        FROM "ProductVariant" v JOIN "Product" p ON p."id" = v."productId"
        WHERE v."isActive" = true AND p."isActive" = true
      `),
    ]);

    const meta: CatalogMetaDto = {
      colors: colors.map(toColorDto),
      storages: storages.map(toStorageDto),
      series: [...new Set(products.map((p) => p.series))],
      models: products,
      shippingTimes: SHIPPING_TIMES.map((value) => ({ value, label: SHIPPING_TIME_LABELS[value] })),
      priceRange: {
        min: priceRow[0]?.min ? Number(priceRow[0].min) : 0,
        max: priceRow[0]?.max ? Number(priceRow[0].max) : 0,
      },
    };
    await this.cache.set(cacheKey, meta, 300);
    return meta;
  }
}
