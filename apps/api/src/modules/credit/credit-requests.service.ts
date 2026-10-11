import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type CreditRequest } from '@prisma/client';
import {
  CREDIT_METHOD_LABELS,
  CREDIT_REQUEST_STATUSES,
  CREDIT_REQUEST_STATUS_LABELS,
  type CreateCreditRequestInput,
  type CreditRequestCreatedDto,
  type CreditRequestDto,
  type CreditRequestListDto,
  type CreditRequestListQuery,
  type CreditRequestSummaryDto,
  type CreditRequestStatus,
  type UpdateCreditRequestInput,
} from '@iphoneha/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { Errors } from '../../common/errors';
import type { ClientInfo } from '../../common/utils';
import type { AuthAdmin } from '../../types/express';
import { AuditService } from '../audit/audit.service';
import { AlertsService } from '../notifications/alerts.service';

const include = {
  product: { select: { slug: true, name: true } },
  handledBy: { select: { name: true } },
} satisfies Prisma.CreditRequestInclude;
type Row = Prisma.CreditRequestGetPayload<{ include: typeof include }>;

/** A second form from the same phone within this window is the same request. */
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

function toDto(row: Row): CreditRequestDto {
  return {
    id: row.id,
    number: row.number,
    name: row.name,
    phone: row.phone,
    city: row.city,
    method: row.method,
    methodLabel: CREDIT_METHOD_LABELS[row.method],
    product: row.product,
    productName: row.productName,
    months: row.months,
    note: row.note,
    source: row.source,
    status: row.status,
    statusLabel: CREDIT_REQUEST_STATUS_LABELS[row.status],
    adminNote: row.adminNote,
    handledBy: row.handledBy?.name ?? null,
    handledAt: row.handledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The fields an audit entry keeps: the workflow, not the customer's details. */
function auditView(row: Pick<CreditRequest, 'status' | 'adminNote'>) {
  return { status: row.status, adminNote: row.adminNote };
}

@Injectable()
export class CreditRequestsService {
  private readonly logger = new Logger(CreditRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly alerts: AlertsService,
  ) {}

  async create(input: CreateCreditRequestInput, userId: string | null): Promise<CreditRequestCreatedDto> {
    // the honeypot: people never see the field, bots fill in everything
    if (input.website) {
      this.logger.warn('credit request dropped: honeypot field was filled in');
      return { number: null, duplicate: false };
    }

    const open = await this.prisma.creditRequest.findFirst({
      where: {
        phone: input.phone,
        status: { in: ['NEW', 'CONTACTED'] },
        createdAt: { gt: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (open) return { number: open.number, duplicate: true };

    const product = input.productSlug
      ? await this.prisma.product.findFirst({
          where: { slug: input.productSlug, isActive: true },
          select: { id: true, name: true },
        })
      : null;

    const created = await this.prisma.creditRequest.create({
      data: {
        name: input.name,
        phone: input.phone,
        city: input.city,
        method: input.method,
        productId: product?.id ?? null,
        productName: product?.name ?? null,
        months: input.months ?? null,
        note: input.note,
        source: input.source ?? null,
        userId,
      },
    });
    this.logger.log(`credit request #${created.number} (${created.method})`);
    // queued, never awaited on the network: the visitor gets the number right away
    await this.alerts.creditRequestCreated({
      number: created.number,
      method: created.method,
      productName: created.productName,
      months: created.months,
    });
    return { number: created.number, duplicate: false };
  }

  async list(query: CreditRequestListQuery): Promise<CreditRequestListDto> {
    const where: Prisma.CreditRequestWhereInput = query.status ? { status: query.status } : {};
    const [rows, total, grouped] = await Promise.all([
      this.prisma.creditRequest.findMany({
        where,
        include,
        orderBy: [{ createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.creditRequest.count({ where }),
      this.prisma.creditRequest.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    const counts = Object.fromEntries(CREDIT_REQUEST_STATUSES.map((status) => [status, 0])) as Record<
      CreditRequestStatus,
      number
    >;
    for (const group of grouped) counts[group.status] = group._count._all;

    return {
      items: rows.map(toDto),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      counts,
    };
  }

  /** One request, for writing its contract. */
  async get(id: string): Promise<CreditRequestDto> {
    const row = await this.prisma.creditRequest.findUnique({ where: { id }, include });
    if (!row) throw Errors.notFound('درخواست پیدا نشد');
    return toDto(row);
  }

  async summary(): Promise<CreditRequestSummaryDto> {
    const [waiting, latest] = await Promise.all([
      this.prisma.creditRequest.count({ where: { status: 'NEW' } }),
      this.prisma.creditRequest.aggregate({ _max: { number: true } }),
    ]);
    return { new: waiting, latestNumber: latest._max.number ?? null };
  }

  async update(
    id: string,
    input: UpdateCreditRequestInput,
    admin: AuthAdmin,
    client: ClientInfo,
  ): Promise<CreditRequestDto> {
    const before = await this.prisma.creditRequest.findUnique({ where: { id } });
    if (!before) throw Errors.notFound('درخواست پیدا نشد');

    const statusChanged = input.status !== undefined && input.status !== before.status;
    const after = await this.prisma.creditRequest.update({
      where: { id },
      data: {
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.adminNote !== undefined ? { adminNote: input.adminNote } : {}),
        ...(statusChanged ? { handledById: admin.id, handledAt: new Date() } : {}),
      },
      include,
    });
    await this.audit.log({
      adminUserId: admin.id,
      action: 'credit_request.update',
      entityType: 'CreditRequest',
      entityId: id,
      before: auditView(before),
      after: auditView(after),
      client,
    });
    return toDto(after);
  }
}
