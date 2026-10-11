import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuditLogDto, Paginated } from '@iphoneha/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { paginate, skipTake, type ClientInfo } from '../../common/utils';

export interface AuditInput {
  adminUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  client?: ClientInfo | null;
}

/** Append-only log of everything an administrator changes. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          adminUserId: input.adminUserId,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId ?? null,
          before: (input.before ?? null) as Prisma.InputJsonValue,
          after: (input.after ?? null) as Prisma.InputJsonValue,
          ip: input.client?.ip ?? null,
          userAgent: input.client?.userAgent ?? null,
        },
      });
    } catch (error) {
      this.logger.error(`failed to write audit log for ${input.action}: ${String(error)}`);
    }
  }

  async list(query: {
    entityType?: string;
    entityId?: string;
    adminUserId?: string;
    page: number;
    pageSize: number;
  }): Promise<Paginated<AuditLogDto>> {
    const where = {
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.adminUserId ? { adminUserId: query.adminUserId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { adminUser: { select: { id: true, name: true, phone: true } } },
        orderBy: { createdAt: 'desc' },
        ...skipTake(query.page, query.pageSize),
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginate(
      rows.map((row) => ({
        id: row.id,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        before: row.before,
        after: row.after,
        ip: row.ip,
        userAgent: row.userAgent,
        createdAt: row.createdAt.toISOString(),
        admin: row.adminUser
          ? { id: row.adminUser.id, name: row.adminUser.name, phone: row.adminUser.phone }
          : null,
      })),
      total,
      query.page,
      query.pageSize,
    );
  }
}
