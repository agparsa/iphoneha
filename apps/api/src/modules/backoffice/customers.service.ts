import { Injectable } from '@nestjs/common';
import {
  CREDIT_REQUEST_STATUS_LABELS,
  PAID_ORDER_STATUSES,
  roleHasPermission,
  type AdminCustomerDto,
  type CustomerNoteDto,
} from '@iphoneha/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { Errors } from '../../common/errors';
import { toNumber } from '../../common/bigint';
import type { ClientInfo } from '../../common/utils';
import type { AuthAdmin } from '../../types/express';
import { AuditService } from '../audit/audit.service';
import { LedgerService } from '../ledger/ledger.service';
import { toOrderSummary } from '../orders/orders.mapper';
import { UsersService } from '../users/users.service';

/** One customer on one page: orders, instalments, requests, addresses and the staff's notes. */
@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
  ) {}

  async get(id: string, admin: AuthAdmin): Promise<AdminCustomerDto> {
    const user = await this.prisma.user.findFirst({
      where: /^09\d{9}$/.test(id) ? { phone: id } : { id },
      include: {
        addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] },
        notes: { orderBy: { createdAt: 'desc' }, include: { author: { select: { name: true } } }, take: 100 },
      },
    });
    if (!user) throw Errors.notFound('مشتری پیدا نشد');

    const canSeeLedger = roleHasPermission(admin.role, 'installments.read');
    const [orders, ordersCount, paid, requests, contracts] = await Promise.all([
      this.prisma.order.findMany({
        where: { userId: user.id },
        include: { items: true, payments: { orderBy: { createdAt: 'desc' }, take: 1 } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.order.count({ where: { userId: user.id } }),
      this.prisma.order.aggregate({
        where: { userId: user.id, status: { in: [...PAID_ORDER_STATUSES] } },
        _count: { _all: true },
        _sum: { total: true },
        _max: { createdAt: true },
      }),
      this.prisma.creditRequest.findMany({
        where: { OR: [{ userId: user.id }, { phone: user.phone }] },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      canSeeLedger ? this.ledger.forCustomer(user.id, user.phone) : Promise.resolve([]),
    ]);

    return {
      id: user.id,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: [user.firstName, user.lastName].filter(Boolean).join(' ') || null,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      stats: {
        ordersCount,
        paidOrders: paid._count._all,
        totalSpent: toNumber(paid._sum.total ?? 0n),
        lastOrderAt: orders[0]?.createdAt.toISOString() ?? null,
        ledgerOutstanding: contracts.reduce((sum, contract) => sum + contract.remaining, 0),
        ledgerOverdue: contracts.reduce((sum, contract) => sum + contract.overdueAmount, 0),
      },
      orders: orders.map((order) => ({
        ...toOrderSummary(order),
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        paymentStatus: order.payments[0]?.status ?? null,
      })),
      contracts,
      creditRequests: requests.map((request) => ({
        id: request.id,
        number: request.number,
        method: request.method,
        status: request.status,
        statusLabel: CREDIT_REQUEST_STATUS_LABELS[request.status],
        productName: request.productName,
        createdAt: request.createdAt.toISOString(),
      })),
      addresses: user.addresses.map(UsersService.toAddressDto),
      notes: user.notes.map((note) => ({
        id: note.id,
        body: note.body,
        authorName: note.author?.name ?? null,
        createdAt: note.createdAt.toISOString(),
      })),
    };
  }

  async addNote(
    userId: string,
    body: string,
    admin: AuthAdmin,
    client?: ClientInfo,
  ): Promise<CustomerNoteDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw Errors.notFound('مشتری پیدا نشد');
    const note = await this.prisma.customerNote.create({ data: { userId, body, authorId: admin.id } });
    await this.audit.log({
      adminUserId: admin.id,
      action: 'customer.note.add',
      entityType: 'User',
      entityId: userId,
      client,
    });
    return { id: note.id, body: note.body, authorName: admin.name, createdAt: note.createdAt.toISOString() };
  }

  /** The author removes their own note; a manager or the owner any note. */
  async deleteNote(noteId: string, admin: AuthAdmin, client?: ClientInfo): Promise<void> {
    const note = await this.prisma.customerNote.findUnique({ where: { id: noteId } });
    if (!note) throw Errors.notFound('یادداشت پیدا نشد');
    if (note.authorId !== admin.id && !roleHasPermission(admin.role, 'users.write')) {
      throw Errors.forbidden('فقط نویسندهٔ یادداشت یا مدیر آن را پاک می‌کند');
    }
    await this.prisma.customerNote.delete({ where: { id: noteId } });
    await this.audit.log({
      adminUserId: admin.id,
      action: 'customer.note.delete',
      entityType: 'User',
      entityId: note.userId,
      before: { body: note.body },
      client,
    });
  }
}
