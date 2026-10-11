import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import {
  bulkPriceSchema,
  customerNoteSchema,
  exportQuerySchema,
  pricingQuerySchema,
  reportQuerySchema,
  type BulkPriceInput,
  type CustomerNoteInput,
  type ExportQuery,
  type PricingQuery,
  type ReportQuery,
} from '@iphoneha/shared';
import { AdminAuthGuard, PermissionsGuard } from '../../common/guards';
import { Client, CurrentAdmin, RequirePermissions } from '../../common/decorators';
import { ZodBody, ZodQuery } from '../../common/zod-validation.pipe';
import { Errors } from '../../common/errors';
import type { ClientInfo } from '../../common/utils';
import type { AuthAdmin } from '../../types/express';
import { CustomersService } from './customers.service';
import { EXPORT_KINDS, ExportsService, type ExportKind } from './exports.service';
import { PricingService } from './pricing.service';
import { ReportsService } from './reports.service';

const historyQuerySchema = z.object({ variantId: z.string().trim().min(1).max(40).optional() });

/** The panel's back office: customer pages, the price table, sales reports and Excel exports. */
@ApiTags('admin-backoffice')
@Controller('admin')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class BackofficeController {
  constructor(
    private readonly customers: CustomersService,
    private readonly pricing: PricingService,
    private readonly reports: ReportsService,
    private readonly exports: ExportsService,
  ) {}

  /** By id, or by the customer's mobile. */
  @Get('customers/:id')
  @RequirePermissions('users.read')
  customer(@Param('id') id: string, @CurrentAdmin() admin: AuthAdmin) {
    return this.customers.get(id, admin);
  }

  @Post('customers/:id/notes')
  @RequirePermissions('users.notes')
  addNote(
    @Param('id') id: string,
    @Body(new ZodBody(customerNoteSchema)) body: CustomerNoteInput,
    @CurrentAdmin() admin: AuthAdmin,
    @Client() client: ClientInfo,
  ) {
    return this.customers.addNote(id, body.body, admin, client);
  }

  @Delete('customer-notes/:id')
  @HttpCode(204)
  @RequirePermissions('users.notes')
  async deleteNote(@Param('id') id: string, @CurrentAdmin() admin: AuthAdmin, @Client() client: ClientInfo) {
    await this.customers.deleteNote(id, admin, client);
  }

  @Get('pricing')
  @RequirePermissions('products.read')
  pricingTable(@Query(new ZodQuery(pricingQuerySchema)) query: PricingQuery) {
    return this.pricing.list(query);
  }

  /** Preview (dryRun, the default) or apply a change to many prices at once. */
  @Post('pricing/bulk')
  @RequirePermissions('products.write')
  bulkPrice(
    @Body(new ZodBody(bulkPriceSchema)) body: BulkPriceInput,
    @CurrentAdmin() admin: AuthAdmin,
    @Client() client: ClientInfo,
  ) {
    return this.pricing.bulk(body, admin, client);
  }

  @Get('pricing/history')
  @RequirePermissions('products.read')
  priceHistory(@Query(new ZodQuery(historyQuerySchema)) query: { variantId?: string }) {
    return this.pricing.history(query.variantId);
  }

  @Get('reports/sales')
  @RequirePermissions('reports.read')
  sales(@Query(new ZodQuery(reportQuerySchema)) query: ReportQuery) {
    return this.reports.sales(query);
  }

  /** An .xlsx file: orders, customers, instalments, cheques, phones (IMEI) or the sales report. */
  @Get('exports/:kind')
  @RequirePermissions('reports.read')
  async export(
    @Param('kind') kind: string,
    @Query(new ZodQuery(exportQuerySchema)) query: ExportQuery,
    @CurrentAdmin() admin: AuthAdmin,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const name = kind.replace(/\.xlsx$/, '');
    if (!(EXPORT_KINDS as readonly string[]).includes(name)) throw Errors.notFound('چنین خروجی‌ای نداریم');
    const file = await this.exports.build(name as ExportKind, query, admin);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(file.data);
  }
}
