import { Controller, Get, Param, Query, Sse } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Observable, filter, map } from 'rxjs';
import {
  productListQuerySchema,
  searchSuggestQuerySchema,
  type CatalogMetaDto,
  type ProductCardDto,
  type ProductDetailDto,
  type ProductListQuery,
  type ProductListResponse,
  type SearchSuggestionDto,
  type VariantDto,
} from '@iphoneha/shared';
import { ZodQuery } from '../../common/zod-validation.pipe';
import { ProductsService } from './products.service';
import { VariantsService } from './variants.service';
import { CatalogCacheService, type InventoryUpdateEvent } from './catalog-cache.service';

@ApiTags('catalog')
@Controller()
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly variants: VariantsService,
    private readonly cache: CatalogCacheService,
  ) {}

  @Get('products')
  list(@Query(new ZodQuery(productListQuerySchema)) query: ProductListQuery): Promise<ProductListResponse> {
    return this.products.list(query);
  }

  @Get('products/search/suggest')
  suggest(
    @Query(new ZodQuery(searchSuggestQuerySchema)) query: { q: string; limit: number },
  ): Promise<SearchSuggestionDto[]> {
    return this.products.suggest(query.q, query.limit);
  }

  @Get('catalog/meta')
  meta(): Promise<CatalogMetaDto> {
    return this.products.meta();
  }

  @Get('products/:slug')
  detail(@Param('slug') slug: string): Promise<ProductDetailDto> {
    return this.products.detailBySlug(slug);
  }

  @Get('products/:slug/related')
  related(@Param('slug') slug: string): Promise<ProductCardDto[]> {
    return this.products.relatedProducts(slug);
  }

  /** Live (uncached) variant availability — used by the product page. */
  @Get('products/:slug/variants')
  variantsBySlug(@Param('slug') slug: string): Promise<VariantDto[]> {
    return this.variants.listBySlug(slug);
  }

  @Get('products/id/:id/variants')
  variantsById(@Param('id') id: string): Promise<VariantDto[]> {
    return this.variants.listByProduct(id);
  }

  /** Server-sent events with stock/price changes for one product. */
  @Sse('products/:slug/stream')
  stream(@Param('slug') slug: string): Observable<{ data: InventoryUpdateEvent }> {
    return this.cache.observeInventory().pipe(
      filter((event) => event.productSlug === slug),
      map((event) => ({ data: event })),
    );
  }
}
