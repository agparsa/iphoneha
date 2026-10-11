import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  SETTINGS_KEYS,
  couponSchema,
  discountSchema,
  paginationQuerySchema,
  shippingMethodSchema,
  type CouponInput,
  type DiscountInput,
  type SettingsKey,
  type ShippingMethodInput,
} from '@iphoneha/shared';
import { AdminAuthGuard, PermissionsGuard } from '../../common/guards';
import { Client, CurrentAdmin, RequirePermissions } from '../../common/decorators';
import { ZodBody, ZodQuery } from '../../common/zod-validation.pipe';
import { Errors } from '../../common/errors';
import type { ClientInfo } from '../../common/utils';
import type { AuthAdmin } from '../../types/express';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { AlertsService } from '../notifications/alerts.service';
import { PaymentProviderRegistry } from '../payments/provider-registry.service';
import { AdminCommerceService } from './admin-commerce.service';

@ApiTags('admin-commerce')
@Controller('admin')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminCommerceController {
  constructor(
    private readonly commerce: AdminCommerceService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly alerts: AlertsService,
    private readonly payments: PaymentProviderRegistry,
  ) {}

  // ─── Discounts & coupons ───────────────────────────────────────────────────

  @Get('discounts')
  @RequirePermissions('discounts.read')
  listDiscounts(@Query(new ZodQuery(paginationQuerySchema)) query: { page: number; pageSize: number }) {
    return this.commerce.listDiscounts(query.page, query.pageSize);
  }

  @Post('discounts')
  @RequirePermissions('discounts.write')
  createDiscount(
    @Body(new ZodBody(discountSchema)) body: DiscountInput,
    @CurrentAdmin() admin: AuthAdmin,
    @Client() client: ClientInfo,
  ) {
    return this.commerce.createDiscount(body, admin, client);
  }

  @Patch('discounts/:id')
  @RequirePermissions('discounts.write')
  updateDiscount(
    @Param('id') id: string,
    @Body(new ZodBody(discountSchema)) body: DiscountInput,
    @CurrentAdmin() admin: AuthAdmin,
    @Client() client: ClientInfo,
  ) {
    return this.commerce.updateDiscount(id, body, admin, client);
  }

  @Delete('discounts/:id')
  @RequirePermissions('discounts.write')
  deleteDiscount(@Param('id') id: string, @CurrentAdmin() admin: AuthAdmin, @Client() client: ClientInfo) {
    return this.commerce.deleteDiscount(id, admin, client);
  }

  @Get('coupons')
  @RequirePermissions('discounts.read')
  listCoupons(@Query(new ZodQuery(paginationQuerySchema)) query: { page: number; pageSize: number }) {
    return this.commerce.listCoupons(query.page, query.pageSize);
  }

  @Post('coupons')
  @RequirePermissions('discounts.write')
  createCoupon(
    @Body(new ZodBody(couponSchema)) body: CouponInput,
    @CurrentAdmin() admin: AuthAdmin,
    @Client() client: ClientInfo,
  ) {
    return this.commerce.createCoupon(body, admin, client);
  }

  @Patch('coupons/:id')
  @RequirePermissions('discounts.write')
  updateCoupon(
    @Param('id') id: string,
    @Body(new ZodBody(couponSchema.partial())) body: Partial<CouponInput>,
    @CurrentAdmin() admin: AuthAdmin,
    @Client() client: ClientInfo,
  ) {
    return this.commerce.updateCoupon(id, body, admin, client);
  }

  // ─── Shipping ──────────────────────────────────────────────────────────────

  @Get('shipping-methods')
  @RequirePermissions('shipping.read')
  listShipping() {
    return this.commerce.listShipping();
  }

  @Post('shipping-methods')
  @RequirePermissions('shipping.write')
  createShipping(
    @Body(new ZodBody(shippingMethodSchema)) body: ShippingMethodInput,
    @CurrentAdmin() admin: AuthAdmin,
    @Client() client: ClientInfo,
  ) {
    return this.commerce.createShipping(body, admin, client);
  }

  @Patch('shipping-methods/:id')
  @RequirePermissions('shipping.write')
  updateShipping(
    @Param('id') id: string,
    @Body(new ZodBody(shippingMethodSchema)) body: ShippingMethodInput,
    @CurrentAdmin() admin: AuthAdmin,
    @Client() client: ClientInfo,
  ) {
    return this.commerce.updateShipping(id, body, admin, client);
  }

  @Delete('shipping-methods/:id')
  @RequirePermissions('shipping.write')
  deleteShipping(@Param('id') id: string, @CurrentAdmin() admin: AuthAdmin, @Client() client: ClientInfo) {
    return this.commerce.deleteShipping(id, admin, client);
  }

  // ─── Settings ──────────────────────────────────────────────────────────────

  @Get('settings')
  @RequirePermissions('settings.read')
  allSettings() {
    return this.settings.all();
  }

  /** Which alert channels this server has and who gets the SMS, for «تنظیمات ← هشدارها». */
  @Get('alerts')
  @RequirePermissions('settings.read')
  alertStatus() {
    return this.alerts.status();
  }

  /** How each payment method is connected on this server, for «تنظیمات ← پرداخت» (no keys, only their names). */
  @Get('payment-connections')
  @RequirePermissions('settings.read')
  paymentConnections() {
    return this.payments.connections();
  }

  /** «پیام آزمایشی»: one alert through every channel that is set up, answered with each result. */
  @Post('alerts/test')
  @HttpCode(200)
  @RequirePermissions('settings.write')
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  async testAlert(@CurrentAdmin() admin: AuthAdmin, @Client() client: ClientInfo) {
    const result = await this.alerts.sendTest();
    await this.audit.log({
      adminUserId: admin.id,
      action: 'alerts.test',
      entityType: 'Setting',
      entityId: 'alerts',
      after: { sms: result.sms.map(({ ok }) => ok), bot: result.bot?.ok ?? null },
      client,
    });
    return result;
  }

  @Patch('settings/:key')
  @RequirePermissions('settings.write')
  async updateSettings(
    @Param('key') key: string,
    @Body() body: unknown,
    @CurrentAdmin() admin: AuthAdmin,
    @Client() client: ClientInfo,
  ) {
    if (!SETTINGS_KEYS.includes(key as SettingsKey)) throw Errors.notFound('این بخش تنظیمات وجود ندارد');
    const before = await this.settings.get(key as SettingsKey);
    const after = await this.settings.set(key as SettingsKey, body);
    await this.audit.log({
      adminUserId: admin.id,
      action: 'settings.update',
      entityType: 'Setting',
      entityId: key,
      before,
      after,
      client,
    });
    return after;
  }
}
