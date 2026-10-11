import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  AdminPaymentListItem,
  AdminPaymentListQuery,
  Paginated,
  PaymentDto,
  PaymentTransactionDto,
} from '@iphoneha/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { Errors } from '../../common/errors';
import { paginate, skipTake, type ClientInfo } from '../../common/utils';
import { toNumber } from '../../common/bigint';
import { AuditService } from '../audit/audit.service';
import { PaymentsService } from '../payments/payments.service';
import type { AuthAdmin } from '../../types/express';

@Injectable()
export class AdminPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly audit: AuditService,
  ) {}

  async list(query: AdminPaymentListQuery): Promise<Paginated<AdminPaymentListItem>> {
    const where: Prisma.PaymentWhereInput = {};
    if (query.status.length) where.status = { in: query.status };
    if (query.method.length) where.method = { in: query.method };
    if (query.q) {
      where.OR = [
        { providerRef: { contains: query.q, mode: 'insensitive' } },
        { trackingCode: { contains: query.q, mode: 'insensitive' } },
        { order: { orderNumber: { contains: query.q, mode: 'insensitive' } } },
        { order: { customerPhone: { contains: query.q } } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: { order: { select: { id: true, orderNumber: true, customerPhone: true } } },
        orderBy: { createdAt: 'desc' },
        ...skipTake(query.page, query.pageSize),
      }),
      this.prisma.payment.count({ where }),
    ]);

    return paginate(
      rows.map((payment) => ({
        ...PaymentsService.toDto(payment),
        orderId: payment.order.id,
        orderNumber: payment.order.orderNumber,
        customerPhone: payment.order.customerPhone,
      })),
      total,
      query.page,
      query.pageSize,
    );
  }

  async transactions(paymentId: string): Promise<PaymentTransactionDto[]> {
    const rows = await this.prisma.paymentTransaction.findMany({
      where: { paymentId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      success: row.success,
      requestPayload: row.requestPayload,
      responsePayload: row.responsePayload,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async refund(paymentId: string, reason: string, admin: AuthAdmin, client: ClientInfo): Promise<PaymentDto> {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw Errors.notFound('تراکنش پیدا نشد');
    const result = await this.payments.refund(paymentId, toNumber(payment.amount), reason);
    await this.audit.log({
      adminUserId: admin.id,
      action: 'payment.refund',
      entityType: 'Payment',
      entityId: paymentId,
      before: { status: payment.status },
      after: { status: result.status, reason },
      client,
    });
    return result;
  }
}
