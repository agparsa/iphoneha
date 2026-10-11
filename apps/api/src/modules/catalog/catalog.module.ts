import { Module } from '@nestjs/common';
import { CatalogCacheService } from './catalog-cache.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { VariantsService } from './variants.service';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, VariantsService, CatalogCacheService],
  exports: [ProductsService, VariantsService, CatalogCacheService],
})
export class CatalogModule {}
