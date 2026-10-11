import { Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  checkoutQuoteSchema,
  checkoutSchema,
  createOrderSchema,
  idempotencyKeySchema,
  paginationQuerySchema,
  type CheckoutQuoteDto,
  type CheckoutResponseDto,
  type CreateOrderInput,
  type OrderDto,
  type OrderSummaryDto,
  type Paginated,
} from '@iphoneha/shared';
import { AuthGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators';
import { ZodBody, ZodQuery } from '../../common/zod-validation.pipe';
import { Errors } from '../../common/errors';
import { clientIp } from '../../common/utils/http.util';
import type { AuthUser } from '../../types/express';
import { CheckoutService } from './checkout.service';
import { OrdersService } from './orders.service';

const idempotency = (value: string | undefined): string => {
  const parsed = idempotencyKeySchema.safeParse(value);
  if (!parsed.success) {
    throw Errors.badRequest('IDEMPOTENCY_REQUIRED', 'درخواست نامعتبر است (کلید یکتا ارسال نشده)');
  }
  return parsed.data;
};

@ApiTags('orders')
@Controller()
@UseGuards(AuthGuard)
export class OrdersController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly orders: OrdersService,
  ) {}

  @Post('checkout/quote')
  quote(
    @CurrentUser() user: AuthUser,
    @Body(new ZodBody(checkoutQuoteSchema)) body: z.infer<typeof checkoutQuoteSchema>,
  ): Promise<CheckoutQuoteDto> {
    return this.checkout.quote(user, body);
  }

  /** Creates the order and starts the payment in one call. */
  @Post('checkout')
  checkoutOrder(
    @CurrentUser() user: AuthUser,
    @Body(new ZodBody(checkoutSchema)) body: CreateOrderInput,
    @Req() req: Request,
    @Headers('idempotency-key') key?: string,
  ): Promise<CheckoutResponseDto> {
    return this.checkout.checkout(user, body, idempotency(key), { customerIp: clientIp(req) });
  }

  /** Creates the order only (payment can be started later). */
  @Post('orders')
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodBody(createOrderSchema)) body: CreateOrderInput,
    @Headers('idempotency-key') key?: string,
  ): Promise<OrderDto> {
    return this.checkout.createOrder(user, body, idempotency(key));
  }

  @Get('orders')
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodQuery(paginationQuerySchema)) query: { page: number; pageSize: number },
  ): Promise<Paginated<OrderSummaryDto>> {
    return this.orders.listForUser(user.id, query.page, query.pageSize);
  }

  @Get('orders/:id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<OrderDto> {
    return this.orders.getForUser(user.id, id);
  }

  @Post('orders/:id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<OrderDto> {
    return this.orders.cancelByUser(user.id, id);
  }
}
