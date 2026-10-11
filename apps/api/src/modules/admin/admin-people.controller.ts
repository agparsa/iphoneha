import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  adminUpdateUserSchema,
  adminUserListQuerySchema,
  adminUserSchema,
  auditListQuerySchema,
  type AdminUserInput,
} from '@iphoneha/shared';
import { AdminAuthGuard, PermissionsGuard } from '../../common/guards';
import { Client, CurrentAdmin, RequirePermissions } from '../../common/decorators';
import { ZodBody, ZodQuery } from '../../common/zod-validation.pipe';
import type { ClientInfo } from '../../common/utils';
import type { AuthAdmin } from '../../types/express';
import { AuditService } from '../audit/audit.service';
import { AdminPeopleService } from './admin-people.service';

@ApiTags('admin-people')
@Controller('admin')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminPeopleController {
  constructor(
    private readonly people: AdminPeopleService,
    private readonly audit: AuditService,
  ) {}

  @Get('users')
  @RequirePermissions('users.read')
  listUsers(
    @Query(new ZodQuery(adminUserListQuerySchema)) query: { q?: string; page: number; pageSize: number },
  ) {
    return this.people.listUsers(query);
  }

  @Patch('users/:id')
  @RequirePermissions('users.write')
  updateUser(
    @Param('id') id: string,
    @Body(new ZodBody(adminUpdateUserSchema))
    body: { isActive?: boolean; firstName?: string | null; lastName?: string | null },
    @CurrentAdmin() admin: AuthAdmin,
    @Client() client: ClientInfo,
  ) {
    return this.people.updateUser(id, body, admin, client);
  }

  @Get('admins')
  @RequirePermissions('admins.manage')
  listAdmins() {
    return this.people.listAdmins();
  }

  @Post('admins')
  @RequirePermissions('admins.manage')
  createAdmin(
    @Body(new ZodBody(adminUserSchema)) body: AdminUserInput,
    @CurrentAdmin() admin: AuthAdmin,
    @Client() client: ClientInfo,
  ) {
    return this.people.createAdmin(body, admin, client);
  }

  @Patch('admins/:id')
  @RequirePermissions('admins.manage')
  updateAdmin(
    @Param('id') id: string,
    @Body(new ZodBody(adminUserSchema.partial())) body: Partial<AdminUserInput>,
    @CurrentAdmin() admin: AuthAdmin,
    @Client() client: ClientInfo,
  ) {
    return this.people.updateAdmin(id, body, admin, client);
  }

  @Get('audit-logs')
  @RequirePermissions('audit.read')
  auditLogs(
    @Query(new ZodQuery(auditListQuerySchema))
    query: {
      entityType?: string;
      entityId?: string;
      adminUserId?: string;
      page: number;
      pageSize: number;
    },
  ) {
    return this.audit.list(query);
  }
}
