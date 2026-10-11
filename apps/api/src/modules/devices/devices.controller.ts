import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  deviceListQuerySchema,
  deviceReceiveSchema,
  deviceUpdateSchema,
  orderDevicesSchema,
  type DeviceListQuery,
  type DeviceReceiveInput,
  type DeviceUpdateInput,
  type OrderDevicesInput,
} from '@iphoneha/shared';
import { AdminAuthGuard, PermissionsGuard } from '../../common/guards';
import { Client, CurrentAdmin, RequirePermissions } from '../../common/decorators';
import { ZodBody, ZodQuery } from '../../common/zod-validation.pipe';
import type { ClientInfo } from '../../common/utils';
import type { AuthAdmin } from '../../types/express';
import { DevicesService } from './devices.service';

const lookupSchema = z.object({ q: z.string().trim().min(1).max(60) });

/** The IMEI registry in the panel: receiving phones, their condition, and which order they left on. */
@ApiTags('admin-devices')
@Controller('admin')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get('devices')
  @RequirePermissions('inventory.read')
  list(@Query(new ZodQuery(deviceListQuerySchema)) query: DeviceListQuery) {
    return this.devices.list(query);
  }

  /** Exactly this IMEI or serial number (null when unknown). */
  @Get('devices/lookup')
  @RequirePermissions('inventory.read')
  lookup(@Query(new ZodQuery(lookupSchema)) query: { q: string }) {
    return this.devices.findExact(query.q);
  }

  @Get('devices/:id')
  @RequirePermissions('inventory.read')
  get(@Param('id') id: string) {
    return this.devices.get(id);
  }

  @Post('devices/receive')
  @RequirePermissions('inventory.write')
  receive(
    @Body(new ZodBody(deviceReceiveSchema)) body: DeviceReceiveInput,
    @CurrentAdmin() admin: AuthAdmin,
    @Client() client: ClientInfo,
  ) {
    return this.devices.receive(body, admin, client);
  }

  @Patch('devices/:id')
  @RequirePermissions('inventory.write')
  update(
    @Param('id') id: string,
    @Body(new ZodBody(deviceUpdateSchema)) body: DeviceUpdateInput,
    @CurrentAdmin() admin: AuthAdmin,
    @Client() client: ClientInfo,
  ) {
    return this.devices.update(id, body, admin, client);
  }

  @Delete('devices/:id')
  @HttpCode(204)
  @RequirePermissions('inventory.write')
  async remove(@Param('id') id: string, @CurrentAdmin() admin: AuthAdmin, @Client() client: ClientInfo) {
    await this.devices.remove(id, admin, client);
  }

  /** The phones handed over on an order's lines (replaces each line's set). */
  @Put('orders/:id/devices')
  @RequirePermissions('orders.write', 'inventory.write')
  async assign(
    @Param('id') id: string,
    @Body(new ZodBody(orderDevicesSchema)) body: OrderDevicesInput,
    @CurrentAdmin() admin: AuthAdmin,
    @Client() client: ClientInfo,
  ) {
    await this.devices.assignToOrder(id, body, admin, client);
    return { ok: true };
  }
}
