import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  creditRequestListQuerySchema,
  updateCreditRequestSchema,
  type CreditRequestListQuery,
  type UpdateCreditRequestInput,
} from '@iphoneha/shared';
import { AdminAuthGuard, PermissionsGuard } from '../../common/guards';
import { Client, CurrentAdmin, RequirePermissions } from '../../common/decorators';
import { ZodBody, ZodQuery } from '../../common/zod-validation.pipe';
import type { ClientInfo } from '../../common/utils';
import type { AuthAdmin } from '../../types/express';
import { CreditRequestsService } from './credit-requests.service';

@ApiTags('admin-credit')
@Controller('admin/credit-requests')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminCreditRequestsController {
  constructor(private readonly requests: CreditRequestsService) {}

  @Get()
  @RequirePermissions('leads.read')
  list(@Query(new ZodQuery(creditRequestListQuerySchema)) query: CreditRequestListQuery) {
    return this.requests.list(query);
  }

  /** For the badge next to «درخواست‌های اقساط» in the menu; the open panel polls it for new requests. */
  @Get('summary')
  @RequirePermissions('leads.read')
  summary() {
    return this.requests.summary();
  }

  @Get(':id')
  @RequirePermissions('leads.read')
  get(@Param('id') id: string) {
    return this.requests.get(id);
  }

  @Patch(':id')
  @RequirePermissions('leads.write')
  update(
    @Param('id') id: string,
    @Body(new ZodBody(updateCreditRequestSchema)) body: UpdateCreditRequestInput,
    @CurrentAdmin() admin: AuthAdmin,
    @Client() client: ClientInfo,
  ) {
    return this.requests.update(id, body, admin, client);
  }
}
