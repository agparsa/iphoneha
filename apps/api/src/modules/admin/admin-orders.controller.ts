import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  adminOrderListQuerySchema,
  adminPaymentListQuerySchema,
  bulkOrderStatusSchema,
  manualOrderSchema,
  orderNoteSchema,
  updateOrderStatusSchema,
  type AdminOrderListQuery,
  type AdminPaymentListQuery,
  type BulkOrderStatusInput,
  type ManualOrderInput,
  type OrderNoteInput,
  type UpdateOrderStatusInput,
} from '@iphoneha/shared';
import { AdminAuthGuard, PermissionsGuard } from '../../common/guards';
import { Client, CurrentAdmin, RequirePermissions } from '../../common/decorators';
import { ZodBody, ZodQuery } from '../../common/zod-validation.pipe';
import type { ClientInfo } from '../../common/utils';
import type { AuthAdmin } from '../../types/express';
import { OrdersService } from '../orders/orders.service';
import { ManualOrdersService } from '../orders/manual-orders.service';
import { AdminPaymentsService } from './admin-payments.service';

const refundSchema = z.object({ reason: z.string().trim().min(2).max(200) });

@ApiTags('admin-orders')
@Controller('admin')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminOrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly manualOrders: ManualOrdersService,
    private readonly payments: AdminPaymentsService,
  ) {}

  @Get('orders')
  @RequirePermissions('orders.read')
  list(@Query(new ZodQuery(adminOrderListQuerySchema)) query: AdminOrderListQuery) {
    return this.orders.adminList(query);
  }

  /** «ثبت سفارش تلفنی یا حضوری» */
  @Post('orders')
  @RequirePermissions('orders.create')
  createManual(
    @Body(new ZodBody(manualOrderSchema)) body: ManualOrderInput,
    @CurrentAdmin() admin: AuthAdmin,
    @Client() client: ClientInfo,
  ) {
    return this.manualOrders.create(body, admin, client);
  }

  /** Several orders to one status; each is checked like a single change. */
  @Post('orders/bulk-status')
  @RequirePermissions('orders.write')
  bulkStatus(
    @Body(new ZodBody(bulkOrderStatusSchema)) body: BulkOrderStatusInput,
    @CurrentAdmin() admin: AuthAdmin,
  ) {
    return this.orders.adminBulkStatus(admin, body);
  }

  @Patch('orders/:id/note')
  @RequirePermissions('orders.write')
  setNote(
    @Param('id') id: string,
    @Body(new ZodBody(orderNoteSchema)) body: OrderNoteInput,
    @CurrentAdmin() admin: AuthAdmin,
  ) {
    return this.orders.adminSetNote(id, body.adminNote, admin);
  }

  @Get('orders/:id')
  @RequirePermissions('orders.read')
  get(@Param('id') id: string, @CurrentAdmin() admin: AuthAdmin) {
    return this.orders.adminGet(id, admin.role);
  }

  @Patch('orders/:id')
  @RequirePermissions('orders.write')
  updateStatus(
    @Param('id') id: string,
    @Body(new ZodBody(updateOrderStatusSchema)) body: UpdateOrderStatusInput,
    @CurrentAdmin() admin: AuthAdmin,
  ) {
    return this.orders.adminChangeStatus(admin, id, body);
  }

  @Get('payments')
  @RequirePermissions('payments.read')
  listPayments(@Query(new ZodQuery(adminPaymentListQuerySchema)) query: AdminPaymentListQuery) {
    return this.payments.list(query);
  }

  @Get('payments/:id/transactions')
  @RequirePermissions('payments.read')
  transactions(@Param('id') id: string) {
    return this.payments.transactions(id);
  }

  @Post('payments/:id/refund')
  @RequirePermissions('payments.refund')
  refund(
    @Param('id') id: string,
    @Body(new ZodBody(refundSchema)) body: { reason: string },
    @CurrentAdmin() admin: AuthAdmin,
    @Client() client: ClientInfo,
  ) {
    return this.payments.refund(id, body.reason, admin, client);
  }
}
