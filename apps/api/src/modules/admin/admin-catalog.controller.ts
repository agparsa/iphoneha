import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import {
  adminProductListQuerySchema,
  adminVariantListQuerySchema,
  colorSchema,
  createProductSchema,
  createVariantSchema,
  imageMetaSchema,
  inventoryAdjustSchema,
  paginationQuerySchema,
  storageSchema,
  updateProductSchema,
  updateVariantSchema,
  type ColorInput,
  type CreateProductInput,
  type CreateVariantInput,
  type InventoryAdjustInput,
  type StorageInput,
  type UpdateProductInput,
  type UpdateVariantInput,
} from '@iphoneha/shared';
import { AdminAuthGuard, PermissionsGuard } from '../../common/guards';
import { Client, CurrentAdmin, RequirePermissions } from '../../common/decorators';
import { ZodBody, ZodQuery } from '../../common/zod-validation.pipe';
import { Errors } from '../../common/errors';
import type { ClientInfo } from '../../common/utils';
import type { AuthAdmin } from '../../types/express';
import { InventoryService } from '../inventory/inventory.service';
import { AdminProductsService } from './admin-products.service';

@ApiTags('admin-catalog')
@Controller('admin')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminCatalogController {
  constructor(
    private readonly products: AdminProductsService,
    private readonly inventory: InventoryService,
  ) {}

  // ─── Products ──────────────────────────────────────────────────────────────

  @Get('products')
  @RequirePermissions('products.read')
  listProducts(@Query(new ZodQuery(adminProductListQuerySchema)) query: never) {
    return this.products.list(query);
  }

  @Get('products/:id')
  @RequirePermissions('products.read')
  getProduct(@Param('id') id: string) {
    return this.products.get(id);
  }

  @Post('products')
  @RequirePermissions('products.write')
  createProduct(
    @Body(new ZodBody(createProductSchema)) body: CreateProductInput,
    @CurrentAdmin() admin: AuthAdmin,
    @Client() client: ClientInfo,
  ) {
    return this.products.create(body, admin, client);
  }

  @Patch('products/:id')
  @RequirePermissions('products.write')
  updateProduct(
    @Param('id') id: string,
    @Body(new ZodBody(updateProductSchema)) body: UpdateProductInput,
    @CurrentAdmin() admin: AuthAdmin,
    @Client() client: ClientInfo,
  ) {
    return this.products.update(id, body, admin, client);
  }

  @Delete('products/:id')
  @RequirePermissions('products.write')
  deleteProduct(@Param('id') id: string, @CurrentAdmin() admin: AuthAdmin, @Client() client: ClientInfo) {
    return this.products.remove(id, admin, client);
  }

  // ─── Variants ──────────────────────────────────────────────────────────────

  @Get('variants')
  @RequirePermissions('products.read')
  listVariants(@Query(new ZodQuery(adminVariantListQuerySchema)) query: never) {
    return this.products.listVariants(query);
  }

  @Post('products/:id/variants')
  @RequirePermissions('products.write')
  createVariant(
    @Param('id') productId: string,
    @Body(new ZodBody(createVariantSchema)) body: CreateVariantInput,
    @CurrentAdmin() admin: AuthAdmin,
    @Client() client: ClientInfo,
  ) {
    return this.products.createVariant(productId, body, admin, client);
  }

  @Patch('variants/:id')
  @RequirePermissions('products.write')
  updateVariant(
    @Param('id') id: string,
    @Body(new ZodBody(updateVariantSchema)) body: UpdateVariantInput,
    @CurrentAdmin() admin: AuthAdmin,
    @Client() client: ClientInfo,
  ) {
    return this.products.updateVariant(id, body, admin, client);
  }

  @Delete('variants/:id')
  @RequirePermissions('products.write')
  deleteVariant(@Param('id') id: string, @CurrentAdmin() admin: AuthAdmin, @Client() client: ClientInfo) {
    return this.products.deleteVariant(id, admin, client);
  }

  // ─── Inventory ─────────────────────────────────────────────────────────────

  @Get('inventory')
  @RequirePermissions('inventory.read')
  inventoryList(@Query(new ZodQuery(adminVariantListQuerySchema)) query: never) {
    return this.products.listVariants(query);
  }

  @Get('inventory/low-stock')
  @RequirePermissions('inventory.read')
  lowStock() {
    return this.inventory.lowStock(50);
  }

  @Post('inventory/:variantId/adjust')
  @RequirePermissions('inventory.write')
  adjust(
    @Param('variantId') variantId: string,
    @Body(new ZodBody(inventoryAdjustSchema)) body: InventoryAdjustInput,
    @CurrentAdmin() admin: AuthAdmin,
  ) {
    return this.inventory.adjust(variantId, body, admin.id);
  }

  @Get('inventory/:variantId/movements')
  @RequirePermissions('inventory.read')
  movements(
    @Param('variantId') variantId: string,
    @Query(new ZodQuery(paginationQuerySchema)) query: { page: number; pageSize: number },
  ) {
    return this.inventory.movements(variantId, query.page, query.pageSize);
  }

  // ─── Images ────────────────────────────────────────────────────────────────

  @Post('products/:id/images')
  @RequirePermissions('products.write')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }))
  async uploadImage(
    @Param('id') productId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(new ZodBody(imageMetaSchema))
    meta: { colorId?: string | null; alt?: string | null; sortOrder?: number; kind?: 'DEVICE' | 'DETAIL' },
    @CurrentAdmin() admin: AuthAdmin,
    @Client() client: ClientInfo,
  ) {
    if (!file) throw Errors.badRequest('NO_FILE', 'فایلی ارسال نشده است');
    return this.products.addImage(productId, file, meta, admin, client);
  }

  @Delete('images/:id')
  @RequirePermissions('products.write')
  deleteImage(@Param('id') id: string, @CurrentAdmin() admin: AuthAdmin, @Client() client: ClientInfo) {
    return this.products.deleteImage(id, admin, client);
  }

  // ─── Colours & capacities ──────────────────────────────────────────────────

  @Get('colors')
  @RequirePermissions('products.read')
  colors() {
    return this.products.listColors();
  }

  @Post('colors')
  @RequirePermissions('products.write')
  createColor(
    @Body(new ZodBody(colorSchema)) body: ColorInput,
    @CurrentAdmin() admin: AuthAdmin,
    @Client() client: ClientInfo,
  ) {
    return this.products.createColor(body, admin, client);
  }

  @Patch('colors/:id')
  @RequirePermissions('products.write')
  updateColor(
    @Param('id') id: string,
    @Body(new ZodBody(colorSchema)) body: ColorInput,
    @CurrentAdmin() admin: AuthAdmin,
    @Client() client: ClientInfo,
  ) {
    return this.products.updateColor(id, body, admin, client);
  }

  @Get('storages')
  @RequirePermissions('products.read')
  storages() {
    return this.products.listStorages();
  }

  @Post('storages')
  @RequirePermissions('products.write')
  createStorage(
    @Body(new ZodBody(storageSchema)) body: StorageInput,
    @CurrentAdmin() admin: AuthAdmin,
    @Client() client: ClientInfo,
  ) {
    return this.products.createStorage(body, admin, client);
  }

  @Patch('storages/:id')
  @RequirePermissions('products.write')
  updateStorage(
    @Param('id') id: string,
    @Body(new ZodBody(storageSchema)) body: StorageInput,
    @CurrentAdmin() admin: AuthAdmin,
    @Client() client: ClientInfo,
  ) {
    return this.products.updateStorage(id, body, admin, client);
  }
}
