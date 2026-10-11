import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  ADMIN_ROLE_LABELS,
  type AdminUserDto,
  type AdminUserInput,
  type AdminUserListItem,
  type Paginated,
} from '@iphoneha/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { Errors } from '../../common/errors';
import { paginate, skipTake, type ClientInfo } from '../../common/utils';
import { toNumber } from '../../common/bigint';
import { AuditService } from '../audit/audit.service';
import { SessionService } from '../auth/session.service';
import type { AuthAdmin } from '../../types/express';

/** Customers and administrators management. */
@Injectable()
export class AdminPeopleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
  ) {}

  async listUsers(query: {
    q?: string;
    page: number;
    pageSize: number;
  }): Promise<Paginated<AdminUserListItem>> {
    const where: Prisma.UserWhereInput = query.q
      ? {
          OR: [
            { phone: { contains: query.q } },
            { firstName: { contains: query.q, mode: 'insensitive' } },
            { lastName: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: {
          orders: {
            where: { status: { in: ['PAID', 'PROCESSING', 'READY_TO_SHIP', 'SHIPPED', 'DELIVERED'] } },
            select: { total: true },
          },
          _count: { select: { orders: true } },
        },
        orderBy: { createdAt: 'desc' },
        ...skipTake(query.page, query.pageSize),
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginate(
      users.map((user) => ({
        id: user.id,
        phone: user.phone,
        fullName: [user.firstName, user.lastName].filter(Boolean).join(' ') || null,
        isActive: user.isActive,
        ordersCount: user._count.orders,
        totalSpent: user.orders.reduce((sum, order) => sum + toNumber(order.total), 0),
        createdAt: user.createdAt.toISOString(),
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      })),
      total,
      query.page,
      query.pageSize,
    );
  }

  async updateUser(
    id: string,
    input: { isActive?: boolean; firstName?: string | null; lastName?: string | null },
    admin: AuthAdmin,
    client: ClientInfo,
  ): Promise<AdminUserListItem> {
    const before = await this.prisma.user.findUnique({ where: { id } });
    if (!before) throw Errors.notFound('کاربر پیدا نشد');
    await this.prisma.user.update({ where: { id }, data: input });

    // Blocking a customer closes their sessions immediately.
    if (input.isActive === false) await this.sessions.revokeAllForSubject('USER', id);

    await this.audit.log({
      adminUserId: admin.id,
      action: 'user.update',
      entityType: 'User',
      entityId: id,
      before: { isActive: before.isActive },
      after: input,
      client,
    });
    const page = await this.listUsers({ q: before.phone, page: 1, pageSize: 1 });
    return page.items[0]!;
  }

  // ─── Administrators ────────────────────────────────────────────────────────

  private toAdminDto(admin: Prisma.AdminUserGetPayload<object>): AdminUserDto {
    return {
      id: admin.id,
      phone: admin.phone,
      name: admin.name,
      role: admin.role,
      roleLabel: ADMIN_ROLE_LABELS[admin.role],
      isActive: admin.isActive,
      lastLoginAt: admin.lastLoginAt?.toISOString() ?? null,
      createdAt: admin.createdAt.toISOString(),
    };
  }

  async listAdmins(): Promise<AdminUserDto[]> {
    const admins = await this.prisma.adminUser.findMany({ orderBy: { createdAt: 'asc' } });
    return admins.map((a) => this.toAdminDto(a));
  }

  async createAdmin(input: AdminUserInput, admin: AuthAdmin, client: ClientInfo): Promise<AdminUserDto> {
    const exists = await this.prisma.adminUser.findUnique({ where: { phone: input.phone } });
    if (exists) throw Errors.conflict('ADMIN_EXISTS', 'این شماره قبلاً به‌عنوان مدیر ثبت شده است');
    const created = await this.prisma.adminUser.create({ data: input });
    await this.audit.log({
      adminUserId: admin.id,
      action: 'admin.create',
      entityType: 'AdminUser',
      entityId: created.id,
      after: { phone: input.phone, role: input.role },
      client,
    });
    return this.toAdminDto(created);
  }

  async updateAdmin(
    id: string,
    input: Partial<AdminUserInput>,
    admin: AuthAdmin,
    client: ClientInfo,
  ): Promise<AdminUserDto> {
    const before = await this.prisma.adminUser.findUnique({ where: { id } });
    if (!before) throw Errors.notFound('مدیر پیدا نشد');
    if (before.id === admin.id && input.isActive === false) {
      throw Errors.badRequest('CANNOT_DISABLE_SELF', 'نمی‌توانید حساب خودتان را غیرفعال کنید');
    }
    const updated = await this.prisma.adminUser.update({ where: { id }, data: input });
    if (input.isActive === false || (input.role && input.role !== before.role)) {
      await this.sessions.revokeAllForSubject('ADMIN', id);
    }
    await this.audit.log({
      adminUserId: admin.id,
      action: 'admin.update',
      entityType: 'AdminUser',
      entityId: id,
      before: { role: before.role, isActive: before.isActive },
      after: input,
      client,
    });
    return this.toAdminDto(updated);
  }
}
