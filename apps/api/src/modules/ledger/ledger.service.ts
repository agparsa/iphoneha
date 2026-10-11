import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  type Cheque,
  type Installment,
  type InstallmentContract,
  type PromissoryNote,
} from '@prisma/client';
import {
  CHEQUE_STATUS_LABELS,
  CONTRACT_STATUS_LABELS,
  CREDIT_METHOD_LABELS,
  INSTALLMENT_STATUS_LABELS,
  MANUAL_PAYMENT_CHANNEL_LABELS,
  SAFTE_STATUS_LABELS,
  addDaysIso,
  dateToIso,
  daysBetweenIso,
  formatJalali,
  formatNumberFa,
  formatToman,
  isoToDate,
  tehranDayStart,
  tehranToday,
  toPersianDigits,
  type ChequeAction,
  type ChequeActionInput,
  type ChequeCreateInput,
  type ChequeDto,
  type ChequeInput,
  type ChequeListQuery,
  type ContractCreateInput,
  type ContractDetailDto,
  type ContractListQuery,
  type ContractPaymentInput,
  type ContractStatusInput,
  type ContractSummaryDto,
  type ContractUpdateInput,
  type CreditMethod,
  type DueListQuery,
  type DueRowDto,
  type InstallmentDto,
  type InstallmentPaymentDto,
  type InstallmentUpdateInput,
  type LedgerSummaryDto,
  type ManualPaymentChannel,
  type MyContractDto,
  type OrderContractInput,
  type Paginated,
  type PromissoryNoteDto,
  type SafteActionInput,
  type SafteInput,
} from '@iphoneha/shared';
import { APP_CONFIG, type AppConfig } from '../../config/env.config';
import { PrismaService, type PrismaTx } from '../../infra/prisma/prisma.service';
import { Errors } from '../../common/errors';
import { paginate, skipTake, type ClientInfo } from '../../common/utils';
import { toNumber } from '../../common/bigint';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notification.service';
import { SettingsService } from '../settings/settings.service';
import type { AuthAdmin } from '../../types/express';

const detailInclude = {
  installments: { orderBy: { index: 'asc' }, include: { cheque: true } },
  cheques: {
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    include: { installment: { select: { index: true } } },
  },
  saftes: { orderBy: { createdAt: 'asc' } },
  payments: {
    orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }],
    include: { installment: { select: { index: true } }, recordedBy: { select: { name: true } } },
  },
  order: {
    select: {
      orderNumber: true,
      items: {
        select: {
          productName: true,
          variantTitle: true,
          devices: { select: { imei: true, imei2: true, serialNumber: true } },
        },
      },
    },
  },
  creditRequest: { select: { number: true } },
  createdBy: { select: { name: true } },
} satisfies Prisma.InstallmentContractInclude;

type ContractWithDetail = Prisma.InstallmentContractGetPayload<{ include: typeof detailInclude }>;

const summaryInclude = {
  installments: {
    select: { id: true, index: true, dueDate: true, amount: true, paidAmount: true, status: true },
  },
  payments: { select: { amount: true, voidedAt: true } },
} satisfies Prisma.InstallmentContractInclude;

type ContractForSummary = InstallmentContract & {
  installments: Pick<Installment, 'id' | 'index' | 'dueDate' | 'amount' | 'paidAmount' | 'status'>[];
  payments: { amount: bigint; voidedAt: Date | null }[];
};

/** Contracts whose dues are still being collected. */
const COLLECTING = ['ACTIVE', 'DEFAULTED'] as const;

/** The cheque moves each action allows, from → to. */
const CHEQUE_MOVES: Record<
  Exclude<ChequeAction, 'CONFIRM_SAYAD'>,
  { from: Cheque['status'][]; to: Cheque['status'] }
> = {
  DEPOSIT: { from: ['IN_HAND', 'BOUNCED'], to: 'DEPOSITED' },
  CLEAR: { from: ['IN_HAND', 'DEPOSITED'], to: 'CLEARED' },
  BOUNCE: { from: ['IN_HAND', 'DEPOSITED'], to: 'BOUNCED' },
  RETURN: { from: ['IN_HAND', 'BOUNCED'], to: 'RETURNED' },
  BACK_IN_HAND: { from: ['DEPOSITED'], to: 'IN_HAND' },
};

/** What a contract needs besides its terms: whose it is and what was sold. */
export interface ContractParties {
  method: CreditMethod;
  userId: string | null;
  orderId: string | null;
  creditRequestId: string | null;
  customerName: string;
  customerPhone: string;
  itemDescription: string;
  cashPrice: number;
}

interface MoneyIn {
  channel: ManualPaymentChannel;
  reference: string | null;
  paidAt: Date;
  note: string | null;
  recordedById: string | null;
  chequeId?: string | null;
}

/**
 * The store's own instalment sales (چک و سفته): contracts, their schedule
 * of dues, the cheques and promissory notes that secure them, and every
 * payment received. Each change runs in a transaction that holds the
 * contract row, so two people recording money at once never double-count.
 */
@Injectable()
export class LedgerService {
  private readonly logger = new Logger('Ledger');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    private readonly settings: SettingsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ─── Reading ───────────────────────────────────────────────────────────────

  static installmentDto(row: Installment & { cheque?: Cheque | null }, today: string): InstallmentDto {
    const dueDate = dateToIso(row.dueDate);
    const remaining = row.status === 'PENDING' ? toNumber(row.amount) - toNumber(row.paidAmount) : 0;
    const overdue = row.status === 'PENDING' && dueDate < today;
    return {
      id: row.id,
      index: row.index,
      dueDate,
      amount: toNumber(row.amount),
      paidAmount: toNumber(row.paidAmount),
      remaining,
      status: row.status,
      overdue,
      daysLate: row.status === 'PENDING' ? daysBetweenIso(dueDate, today) : 0,
      statusLabel: INSTALLMENT_STATUS_LABELS[overdue ? 'OVERDUE' : row.status],
      paidAt: row.paidAt?.toISOString() ?? null,
      remindedAt: row.remindedAt?.toISOString() ?? null,
      note: row.note,
      cheque: row.cheque
        ? {
            id: row.cheque.id,
            status: row.cheque.status,
            statusLabel: CHEQUE_STATUS_LABELS[row.cheque.status],
            bankName: row.cheque.bankName,
            sayadId: row.cheque.sayadId,
          }
        : null,
    };
  }

  static chequeDto(
    cheque: Cheque & {
      installment?: { index: number } | null;
      contract?: { number: number; customerName: string; customerPhone: string } | null;
    },
    today: string,
    contract?: { number: number; customerName: string; customerPhone: string },
  ): ChequeDto {
    const owner = cheque.contract ?? contract ?? { number: 0, customerName: '', customerPhone: '' };
    const dueDate = dateToIso(cheque.dueDate);
    const waiting = cheque.status === 'IN_HAND' || cheque.status === 'DEPOSITED';
    return {
      id: cheque.id,
      contractId: cheque.contractId,
      contractNumber: owner.number,
      customerName: owner.customerName,
      customerPhone: owner.customerPhone,
      installmentId: cheque.installmentId,
      installmentIndex: cheque.installment?.index ?? null,
      sayadId: cheque.sayadId,
      serial: cheque.serial,
      bankName: cheque.bankName,
      branch: cheque.branch,
      drawerName: cheque.drawerName,
      amount: toNumber(cheque.amount),
      dueDate,
      status: cheque.status,
      statusLabel: CHEQUE_STATUS_LABELS[cheque.status],
      sayadConfirmed: cheque.sayadConfirmed,
      daysLate: waiting ? Math.max(0, daysBetweenIso(dueDate, today)) : 0,
      depositedAt: cheque.depositedAt?.toISOString() ?? null,
      clearedAt: cheque.clearedAt?.toISOString() ?? null,
      bouncedAt: cheque.bouncedAt?.toISOString() ?? null,
      returnedAt: cheque.returnedAt?.toISOString() ?? null,
      note: cheque.note,
    };
  }

  static safteDto(note: PromissoryNote): PromissoryNoteDto {
    return {
      id: note.id,
      serial: note.serial,
      amount: toNumber(note.amount),
      electronic: note.electronic,
      status: note.status,
      statusLabel: SAFTE_STATUS_LABELS[note.status],
      dueDate: note.dueDate ? dateToIso(note.dueDate) : null,
      returnedAt: note.returnedAt?.toISOString() ?? null,
      note: note.note,
    };
  }

  static summaryDto(contract: ContractForSummary, today: string): ContractSummaryDto {
    const paid = contract.payments.filter((p) => !p.voidedAt).reduce((sum, p) => sum + toNumber(p.amount), 0);
    const collecting = (COLLECTING as readonly string[]).includes(contract.status);
    const open = contract.installments
      .filter((row) => row.status === 'PENDING')
      .sort((a, b) => a.index - b.index);
    const left = (row: (typeof open)[number]) => toNumber(row.amount) - toNumber(row.paidAmount);
    const overdue = collecting ? open.filter((row) => dateToIso(row.dueDate) < today) : [];
    const next = collecting ? open[0] : undefined;
    return {
      id: contract.id,
      number: contract.number,
      method: contract.method,
      methodLabel: CREDIT_METHOD_LABELS[contract.method],
      status: contract.status,
      statusLabel: CONTRACT_STATUS_LABELS[contract.status],
      customerName: contract.customerName,
      customerPhone: contract.customerPhone,
      itemDescription: contract.itemDescription,
      totalPayable: toNumber(contract.totalPayable),
      paid,
      remaining: collecting ? open.reduce((sum, row) => sum + left(row), 0) : 0,
      overdueAmount: overdue.reduce((sum, row) => sum + left(row), 0),
      overdueCount: overdue.length,
      nextDue: next ? { dueDate: dateToIso(next.dueDate), amount: left(next) } : null,
      contractDate: dateToIso(contract.contractDate),
      createdAt: contract.createdAt.toISOString(),
    };
  }

  private detailDto(contract: ContractWithDetail, terms: string): ContractDetailDto {
    const today = tehranToday();
    const owner = {
      number: contract.number,
      customerName: contract.customerName,
      customerPhone: contract.customerPhone,
    };
    const payments: InstallmentPaymentDto[] = contract.payments.map((p) => ({
      id: p.id,
      installmentId: p.installmentId,
      installmentIndex: p.installment?.index ?? null,
      chequeId: p.chequeId,
      amount: toNumber(p.amount),
      channel: p.channel,
      channelLabel: MANUAL_PAYMENT_CHANNEL_LABELS[p.channel],
      reference: p.reference,
      paidAt: p.paidAt.toISOString(),
      note: p.note,
      recordedByName: p.recordedBy?.name ?? null,
      voidedAt: p.voidedAt?.toISOString() ?? null,
    }));
    return {
      ...LedgerService.summaryDto(contract, today),
      userId: contract.userId,
      orderId: contract.orderId,
      orderNumber: contract.order?.orderNumber ?? null,
      creditRequestId: contract.creditRequestId,
      creditRequestNumber: contract.creditRequest?.number ?? null,
      nationalId: contract.nationalId,
      customerAddress: contract.customerAddress,
      guarantorName: contract.guarantorName,
      guarantorPhone: contract.guarantorPhone,
      guarantorNationalId: contract.guarantorNationalId,
      cashPrice: toNumber(contract.cashPrice),
      downPayment: toNumber(contract.downPayment),
      financed: toNumber(contract.financed),
      markup: toNumber(contract.markup),
      months: contract.months,
      monthlyFeePercent: contract.monthlyFeePercent === null ? null : Number(contract.monthlyFeePercent),
      note: contract.note,
      createdByName: contract.createdBy?.name ?? null,
      completedAt: contract.completedAt?.toISOString() ?? null,
      cancelledAt: contract.cancelledAt?.toISOString() ?? null,
      cancelReason: contract.cancelReason,
      installments: contract.installments.map((row) => LedgerService.installmentDto(row, today)),
      cheques: contract.cheques.map((cheque) => LedgerService.chequeDto(cheque, today, owner)),
      saftes: contract.saftes.map(LedgerService.safteDto),
      payments,
      devices: (contract.order?.items ?? []).flatMap((item) =>
        item.devices.map((device) => ({ ...device, title: `${item.productName} — ${item.variantTitle}` })),
      ),
      terms,
    };
  }

  async get(id: string): Promise<ContractDetailDto> {
    const contract = await this.prisma.installmentContract.findFirst({
      where: /^\d+$/.test(id) ? { number: Number(id) } : { id },
      include: detailInclude,
    });
    if (!contract) throw Errors.notFound('قرارداد پیدا نشد');
    const { contractTerms } = await this.settings.get('ledger');
    return this.detailDto(contract, contractTerms);
  }

  async list(query: ContractListQuery): Promise<Paginated<ContractSummaryDto>> {
    const today = tehranToday();
    const where: Prisma.InstallmentContractWhereInput = {};
    if (query.status.length) where.status = { in: query.status };
    if (query.method.length) where.method = { in: query.method };
    if (query.overdue) {
      where.status = { in: [...COLLECTING] };
      where.installments = { some: { status: 'PENDING', dueDate: { lt: isoToDate(today) } } };
    }
    if (query.q) {
      const q = query.q.trim();
      const number = Number(q.replace(/\D/g, ''));
      where.OR = [
        { customerName: { contains: q, mode: 'insensitive' } },
        { customerPhone: { contains: q.replace(/\D/g, '') || q } },
        { itemDescription: { contains: q, mode: 'insensitive' } },
        { nationalId: { contains: q } },
        ...(Number.isInteger(number) && number > 0 && number < 2_000_000_000 ? [{ number }] : []),
        { cheques: { some: { sayadId: { contains: q.replace(/\D/g, '') || q } } } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.installmentContract.findMany({
        where,
        include: summaryInclude,
        orderBy: { createdAt: 'desc' },
        ...skipTake(query.page, query.pageSize),
      }),
      this.prisma.installmentContract.count({ where }),
    ]);
    return paginate(
      rows.map((row) => LedgerService.summaryDto(row, today)),
      total,
      query.page,
      query.pageSize,
    );
  }

  /** A customer's contracts (their profile page). */
  async forCustomer(userId: string, phone: string): Promise<ContractSummaryDto[]> {
    const today = tehranToday();
    const rows = await this.prisma.installmentContract.findMany({
      where: { OR: [{ userId }, { customerPhone: phone }] },
      include: summaryInclude,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((row) => LedgerService.summaryDto(row, today));
  }

  // ─── The customer's own booklet ────────────────────────────────────────────

  /** Contracts that belong to a signed-in customer: written for their account or their mobile. */
  private mineWhere(userId: string, phone: string): Prisma.InstallmentContractWhereInput {
    return { OR: [{ userId }, { customerPhone: phone }], status: { not: 'CANCELLED' } };
  }

  /** «دفترچه‌های اقساط من»: every booklet with its schedule, newest first. */
  async mine(userId: string, phone: string): Promise<MyContractDto[]> {
    const rows = await this.prisma.installmentContract.findMany({
      where: this.mineWhere(userId, phone),
      include: detailInclude,
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return rows.map((row) => this.myDto(row));
  }

  async mineByNumber(userId: string, phone: string, number: number): Promise<MyContractDto> {
    const row = Number.isInteger(number)
      ? await this.prisma.installmentContract.findFirst({
          where: { ...this.mineWhere(userId, phone), number },
          include: detailInclude,
        })
      : null;
    if (!row) throw Errors.notFound('دفترچهٔ اقساط پیدا نشد');
    return this.myDto(row);
  }

  /** The admin detail, cut down to what the customer may see (no staff names, notes or full Sayad IDs). */
  private myDto(contract: ContractWithDetail): MyContractDto {
    const detail = this.detailDto(contract, '');
    const next = contract.installments
      .filter((row) => row.status === 'PENDING')
      .sort((a, b) => a.index - b.index)[0];
    return {
      number: detail.number,
      method: detail.method,
      methodLabel: detail.methodLabel,
      status: detail.status,
      statusLabel: detail.statusLabel,
      itemDescription: detail.itemDescription,
      orderNumber: detail.orderNumber,
      contractDate: detail.contractDate,
      cashPrice: detail.cashPrice,
      downPayment: detail.downPayment,
      financed: detail.financed,
      markup: detail.markup,
      totalPayable: detail.totalPayable,
      months: detail.months,
      monthlyFeePercent: detail.monthlyFeePercent,
      paid: detail.paid,
      remaining: detail.remaining,
      overdueAmount: detail.overdueAmount,
      overdueCount: detail.overdueCount,
      nextDue:
        detail.nextDue && next
          ? { index: next.index, dueDate: detail.nextDue.dueDate, amount: detail.nextDue.amount }
          : null,
      paidCount: detail.installments.filter((row) => row.status !== 'PENDING').length,
      installments: detail.installments.map((row) => ({
        index: row.index,
        dueDate: row.dueDate,
        amount: row.amount,
        paidAmount: row.paidAmount,
        remaining: row.remaining,
        status: row.status,
        statusLabel: row.statusLabel,
        overdue: row.overdue,
        daysLate: row.daysLate,
        paidAt: row.paidAt,
        cheque: row.cheque
          ? {
              bankName: row.cheque.bankName,
              sayadTail: row.cheque.sayadId.slice(-4),
              statusLabel: row.cheque.statusLabel,
            }
          : null,
      })),
      payments: detail.payments
        .filter((payment) => !payment.voidedAt)
        .map((payment) => ({
          amount: payment.amount,
          channelLabel: payment.channelLabel,
          paidAt: payment.paidAt,
          installmentIndex: payment.installmentIndex,
          note: payment.note === 'پیش‌پرداخت' ? payment.note : null,
        })),
      saftes: detail.saftes.map((note) => ({
        serial: note.serial,
        amount: note.amount,
        statusLabel: note.statusLabel,
      })),
    };
  }

  /** Open instalments due within `days` (overdue ones first), for the «سررسیدها» list. */
  async dues(query: DueListQuery): Promise<Paginated<DueRowDto>> {
    const today = tehranToday();
    const where: Prisma.InstallmentWhereInput = {
      status: 'PENDING',
      dueDate: { lte: isoToDate(addDaysIso(today, query.days)) },
      contract: {
        status: { in: [...COLLECTING] },
        ...(query.method.length ? { method: { in: query.method } } : {}),
      },
    };
    const [rows, total] = await Promise.all([
      this.prisma.installment.findMany({
        where,
        include: {
          cheque: true,
          contract: {
            select: {
              id: true,
              number: true,
              method: true,
              customerName: true,
              customerPhone: true,
              months: true,
            },
          },
        },
        orderBy: [{ dueDate: 'asc' }, { index: 'asc' }],
        ...skipTake(query.page, query.pageSize),
      }),
      this.prisma.installment.count({ where }),
    ]);
    return paginate(
      rows.map((row) => {
        const dueDate = dateToIso(row.dueDate);
        return {
          installmentId: row.id,
          contractId: row.contract.id,
          contractNumber: row.contract.number,
          method: row.contract.method,
          customerName: row.contract.customerName,
          customerPhone: row.contract.customerPhone,
          index: row.index,
          months: row.contract.months,
          dueDate,
          amount: toNumber(row.amount),
          remaining: toNumber(row.amount) - toNumber(row.paidAmount),
          daysLate: daysBetweenIso(dueDate, today),
          cheque: row.cheque
            ? {
                id: row.cheque.id,
                status: row.cheque.status,
                statusLabel: CHEQUE_STATUS_LABELS[row.cheque.status],
                bankName: row.cheque.bankName,
              }
            : null,
          remindedAt: row.remindedAt?.toISOString() ?? null,
        };
      }),
      total,
      query.page,
      query.pageSize,
    );
  }

  async cheques(query: ChequeListQuery): Promise<Paginated<ChequeDto>> {
    const today = tehranToday();
    const where: Prisma.ChequeWhereInput = {};
    if (query.status.length) where.status = { in: query.status };
    if (query.dueWithin > 0) where.dueDate = { lte: isoToDate(addDaysIso(today, query.dueWithin)) };
    if (query.q) {
      const q = query.q.trim();
      const digits = q.replace(/\D/g, '');
      where.OR = [
        ...(digits ? [{ sayadId: { contains: digits } }] : []),
        { drawerName: { contains: q, mode: 'insensitive' } },
        { bankName: { contains: q, mode: 'insensitive' } },
        { contract: { customerName: { contains: q, mode: 'insensitive' } } },
        ...(digits ? [{ contract: { customerPhone: { contains: digits } } }] : []),
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.cheque.findMany({
        where,
        include: {
          installment: { select: { index: true } },
          contract: { select: { number: true, customerName: true, customerPhone: true } },
        },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
        ...skipTake(query.page, query.pageSize),
      }),
      this.prisma.cheque.count({ where }),
    ]);
    return paginate(
      rows.map((row) => LedgerService.chequeDto(row, today)),
      total,
      query.page,
      query.pageSize,
    );
  }

  /** Reminder SMS can reach customers with this server's SMS setup. */
  remindersReady(): boolean {
    if (this.config.SMS_DRIVER === 'melipayamak')
      return Boolean(this.config.MELIPAYAMAK_INSTALLMENT_REMINDER_BODY_ID);
    return true;
  }

  async summary(): Promise<LedgerSummaryDto> {
    const today = tehranToday();
    const in7 = addDaysIso(today, 7);
    const in30 = addDaysIso(today, 30);
    const [dues] = await this.prisma.$queryRaw<
      {
        outstanding: bigint | null;
        overdue_count: bigint;
        overdue_amount: bigint | null;
        next7_count: bigint;
        next7_amount: bigint | null;
        next30_count: bigint;
        next30_amount: bigint | null;
      }[]
    >(Prisma.sql`
      SELECT
        SUM(i."amount" - i."paidAmount")::bigint AS outstanding,
        COUNT(*) FILTER (WHERE i."dueDate" < ${today}::date) AS overdue_count,
        (SUM(i."amount" - i."paidAmount") FILTER (WHERE i."dueDate" < ${today}::date))::bigint AS overdue_amount,
        COUNT(*) FILTER (WHERE i."dueDate" >= ${today}::date AND i."dueDate" <= ${in7}::date) AS next7_count,
        (SUM(i."amount" - i."paidAmount") FILTER (WHERE i."dueDate" >= ${today}::date AND i."dueDate" <= ${in7}::date))::bigint AS next7_amount,
        COUNT(*) FILTER (WHERE i."dueDate" >= ${today}::date AND i."dueDate" <= ${in30}::date) AS next30_count,
        (SUM(i."amount" - i."paidAmount") FILTER (WHERE i."dueDate" >= ${today}::date AND i."dueDate" <= ${in30}::date))::bigint AS next30_amount
      FROM "Installment" i
      JOIN "InstallmentContract" c ON c."id" = i."contractId"
      WHERE i."status" = 'PENDING' AND c."status" IN ('ACTIVE', 'DEFAULTED')
    `);
    const [active, toDeposit, bounced] = await Promise.all([
      this.prisma.installmentContract.count({ where: { status: 'ACTIVE' } }),
      this.prisma.cheque.aggregate({
        where: {
          status: 'IN_HAND',
          dueDate: { lte: isoToDate(in7) },
          contract: { status: { in: [...COLLECTING] } },
        },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.cheque.aggregate({
        where: { status: 'BOUNCED' },
        _count: { _all: true },
        _sum: { amount: true },
      }),
    ]);
    return {
      activeContracts: active,
      outstanding: toNumber(dues?.outstanding ?? 0n),
      overdue: { count: Number(dues?.overdue_count ?? 0n), amount: toNumber(dues?.overdue_amount ?? 0n) },
      dueNext7Days: { count: Number(dues?.next7_count ?? 0n), amount: toNumber(dues?.next7_amount ?? 0n) },
      dueNext30Days: { count: Number(dues?.next30_count ?? 0n), amount: toNumber(dues?.next30_amount ?? 0n) },
      chequesToDeposit: { count: toDeposit._count._all, amount: toNumber(toDeposit._sum.amount ?? 0n) },
      bouncedCheques: { count: bounced._count._all, amount: toNumber(bounced._sum.amount ?? 0n) },
      remindersReady: this.remindersReady(),
    };
  }

  // ─── Writing a contract ────────────────────────────────────────────────────

  /**
   * Writes a contract with its schedule, cheques, promissory notes and the
   * down payment, inside the caller's transaction (a phone or in-store order
   * writes its contract in the same one).
   */
  async createInTx(
    tx: PrismaTx,
    parties: ContractParties,
    terms: OrderContractInput,
    createdById: string | null,
  ) {
    const sum = terms.installments.reduce((total, row) => total + row.amount, 0);
    const financed = parties.cashPrice - terms.downPayment;
    if (terms.downPayment > parties.cashPrice) {
      throw Errors.badRequest('DOWN_PAYMENT_TOO_HIGH', 'پیش‌پرداخت از قیمت کالا بیشتر است');
    }
    if (sum < financed) {
      throw Errors.badRequest(
        'SCHEDULE_TOO_LOW',
        `جمع اقساط (${formatToman(sum)}) از مانده پس از پیش‌پرداخت (${formatToman(financed)}) کمتر است`,
      );
    }
    let contract: InstallmentContract;
    try {
      contract = await tx.installmentContract.create({
        data: {
          method: parties.method,
          userId: parties.userId,
          orderId: parties.orderId,
          creditRequestId: parties.creditRequestId,
          customerName: parties.customerName,
          customerPhone: parties.customerPhone,
          nationalId: terms.nationalId,
          customerAddress: terms.customerAddress,
          guarantorName: terms.guarantor?.name ?? null,
          guarantorPhone: terms.guarantor?.phone ?? null,
          guarantorNationalId: terms.guarantor?.nationalId ?? null,
          itemDescription: parties.itemDescription,
          cashPrice: BigInt(parties.cashPrice),
          downPayment: BigInt(terms.downPayment),
          financed: BigInt(financed),
          markup: BigInt(sum - financed),
          totalPayable: BigInt(terms.downPayment + sum),
          months: terms.installments.length,
          monthlyFeePercent:
            terms.monthlyFeePercent === null ? null : new Prisma.Decimal(terms.monthlyFeePercent),
          contractDate: isoToDate(terms.contractDate),
          note: terms.note,
          createdById,
          installments: {
            create: terms.installments.map((row, index) => ({
              index: index + 1,
              dueDate: isoToDate(row.dueDate),
              amount: BigInt(row.amount),
            })),
          },
          saftes: {
            create: terms.saftes.map((note) => ({
              serial: note.serial,
              amount: BigInt(note.amount),
              electronic: note.electronic,
              dueDate: note.dueDate ? isoToDate(note.dueDate) : null,
              note: note.note,
            })),
          },
        },
      });
      if (terms.cheques.length) {
        const installments = await tx.installment.findMany({ where: { contractId: contract.id } });
        for (const cheque of terms.cheques) {
          const target = cheque.installmentIndex
            ? installments.find((row) => row.index === cheque.installmentIndex)
            : undefined;
          await tx.cheque.create({ data: this.chequeData(contract.id, cheque, target?.id ?? null) });
        }
      }
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = String((error.meta as { target?: unknown } | undefined)?.target ?? '');
        if (target.includes('sayadId')) {
          throw Errors.conflict(
            'CHEQUE_EXISTS',
            'یکی از این چک‌ها (شناسهٔ صیادی) قبلاً در قرارداد دیگری ثبت شده است',
          );
        }
        if (target.includes('creditRequestId')) {
          throw Errors.conflict('REQUEST_HAS_CONTRACT', 'برای این درخواست قبلاً قرارداد نوشته شده است');
        }
      }
      throw error;
    }

    if (terms.downPayment > 0) {
      await tx.installmentPayment.create({
        data: {
          contractId: contract.id,
          amount: BigInt(terms.downPayment),
          channel: terms.downPaymentChannel,
          reference: terms.downPaymentReference,
          paidAt: this.paidAtFor(terms.contractDate),
          note: 'پیش‌پرداخت',
          recordedById: createdById,
        },
      });
    }
    if (parties.creditRequestId) {
      await tx.creditRequest.updateMany({
        where: { id: parties.creditRequestId },
        data: { status: 'CONTRACTED', handledById: createdById, handledAt: new Date() },
      });
    }
    return contract;
  }

  /** A contract on its own (an older sale, or one written before the goods go out). */
  async create(
    input: ContractCreateInput,
    admin: AuthAdmin,
    client?: ClientInfo,
  ): Promise<ContractDetailDto> {
    let userId: string | null = null;
    const user = await this.prisma.user.findUnique({
      where: { phone: input.customer.phone },
      select: { id: true },
    });
    userId = user?.id ?? null;
    if (input.creditRequestId) {
      const request = await this.prisma.creditRequest.findUnique({ where: { id: input.creditRequestId } });
      if (!request) throw Errors.notFound('درخواست اقساط پیدا نشد');
      userId ??= request.userId;
    }
    const contract = await this.prisma.transaction(
      (tx) =>
        this.createInTx(
          tx,
          {
            method: input.method,
            userId,
            orderId: null,
            creditRequestId: input.creditRequestId,
            customerName: input.customer.name,
            customerPhone: input.customer.phone,
            itemDescription: input.itemDescription,
            cashPrice: input.cashPrice,
          },
          input,
          admin.id,
        ),
      { timeoutMs: 20_000 },
    );
    if (input.notifyCustomer) await this.notifyIssued(contract.id);
    await this.audit.log({
      adminUserId: admin.id,
      action: 'contract.create',
      entityType: 'InstallmentContract',
      entityId: contract.id,
      after: {
        number: contract.number,
        method: input.method,
        cashPrice: input.cashPrice,
        months: input.installments.length,
      },
      client,
    });
    return this.get(contract.id);
  }

  async update(
    id: string,
    input: ContractUpdateInput,
    admin: AuthAdmin,
    client?: ClientInfo,
  ): Promise<ContractDetailDto> {
    const before = await this.prisma.installmentContract.findUnique({ where: { id } });
    if (!before) throw Errors.notFound('قرارداد پیدا نشد');
    await this.prisma.installmentContract.update({
      where: { id },
      data: {
        ...(input.nationalId !== undefined ? { nationalId: input.nationalId } : {}),
        ...(input.customerAddress !== undefined ? { customerAddress: input.customerAddress } : {}),
        ...(input.guarantorName !== undefined ? { guarantorName: input.guarantorName } : {}),
        ...(input.guarantorPhone !== undefined ? { guarantorPhone: input.guarantorPhone } : {}),
        ...(input.guarantorNationalId !== undefined
          ? { guarantorNationalId: input.guarantorNationalId }
          : {}),
        ...(input.itemDescription !== undefined ? { itemDescription: input.itemDescription } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
      },
    });
    await this.audit.log({
      adminUserId: admin.id,
      action: 'contract.update',
      entityType: 'InstallmentContract',
      entityId: id,
      before: { nationalId: before.nationalId, guarantorName: before.guarantorName, note: before.note },
      after: input,
      client,
    });
    return this.get(id);
  }

  /** ACTIVE ↔ DEFAULTED, or CANCELLED (a sale reversed). A cancelled contract stops being collected. */
  async setStatus(
    id: string,
    input: ContractStatusInput,
    admin: AuthAdmin,
    client?: ClientInfo,
  ): Promise<ContractDetailDto> {
    const contract = await this.prisma.installmentContract.findUnique({ where: { id } });
    if (!contract) throw Errors.notFound('قرارداد پیدا نشد');
    if (contract.status === input.status) return this.get(id);
    if (contract.status === 'CANCELLED' || contract.status === 'COMPLETED') {
      throw Errors.conflict(
        'CONTRACT_CLOSED',
        `قرارداد «${CONTRACT_STATUS_LABELS[contract.status]}» است و وضعیتش عوض نمی‌شود`,
      );
    }
    if (input.status === 'CANCELLED' && !input.reason) {
      throw Errors.badRequest('REASON_REQUIRED', 'دلیل لغو قرارداد را بنویس');
    }
    await this.prisma.installmentContract.update({
      where: { id },
      data: {
        status: input.status,
        ...(input.status === 'CANCELLED' ? { cancelledAt: new Date(), cancelReason: input.reason } : {}),
      },
    });
    await this.audit.log({
      adminUserId: admin.id,
      action: 'contract.status',
      entityType: 'InstallmentContract',
      entityId: id,
      before: { status: contract.status },
      after: { status: input.status, reason: input.reason },
      client,
    });
    return this.get(id);
  }

  /** The order behind a contract was cancelled or refunded: the contract stops being collected. */
  async cancelForOrder(orderId: string, reason: string): Promise<void> {
    await this.prisma.installmentContract.updateMany({
      where: { orderId, status: { in: [...COLLECTING] } },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason },
    });
  }

  // ─── Money ─────────────────────────────────────────────────────────────────

  /** Holds the contract row for the rest of the transaction. */
  private async lock(tx: PrismaTx, contractId: string): Promise<InstallmentContract> {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "InstallmentContract" WHERE "id" = ${contractId} FOR UPDATE`,
    );
    const contract = await tx.installmentContract.findUnique({ where: { id: contractId } });
    if (!contract) throw Errors.notFound('قرارداد پیدا نشد');
    return contract;
  }

  /**
   * Spreads money over the open instalments — from `startId` when given, then
   * the next ones, then any older — one payment row per instalment touched.
   * Returns what did not fit (the contract is fully paid).
   */
  private async applyMoney(
    tx: PrismaTx,
    contractId: string,
    amount: number,
    startId: string | null,
    money: MoneyIn,
  ): Promise<number> {
    const open = (
      await tx.installment.findMany({ where: { contractId, status: 'PENDING' }, orderBy: { index: 'asc' } })
    ).filter((row) => row.paidAmount < row.amount);
    let ordered = open;
    if (startId) {
      const at = open.findIndex((row) => row.id === startId);
      if (at >= 0) ordered = [...open.slice(at), ...open.slice(0, at)];
    }
    let left = amount;
    for (const row of ordered) {
      if (left <= 0) break;
      const room = toNumber(row.amount) - toNumber(row.paidAmount);
      const part = Math.min(room, left);
      await tx.installmentPayment.create({
        data: {
          contractId,
          installmentId: row.id,
          amount: BigInt(part),
          ...money,
          chequeId: money.chequeId ?? null,
        },
      });
      const paidAmount = toNumber(row.paidAmount) + part;
      const full = paidAmount >= toNumber(row.amount);
      await tx.installment.update({
        where: { id: row.id },
        data: {
          paidAmount: BigInt(paidAmount),
          status: full ? 'PAID' : 'PENDING',
          paidAt: full ? money.paidAt : null,
        },
      });
      left -= part;
    }
    return left;
  }

  /** Completed when every instalment is paid or forgiven; back to active when one reopens. */
  private async refreshStatus(tx: PrismaTx, contractId: string): Promise<void> {
    const [contract, open] = await Promise.all([
      tx.installmentContract.findUnique({ where: { id: contractId }, select: { status: true } }),
      tx.installment.count({ where: { contractId, status: 'PENDING' } }),
    ]);
    if (!contract) return;
    if (open === 0 && (COLLECTING as readonly string[]).includes(contract.status)) {
      await tx.installmentContract.update({
        where: { id: contractId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
    } else if (open > 0 && contract.status === 'COMPLETED') {
      await tx.installmentContract.update({
        where: { id: contractId },
        data: { status: 'ACTIVE', completedAt: null },
      });
    }
  }

  /** Noon Tehran time of a day the staff chose (today: now). */
  private paidAtFor(day: string | null): Date {
    const today = tehranToday();
    if (!day || day === today) return new Date();
    return new Date(tehranDayStart(day).getTime() + 12 * 3_600_000);
  }

  async recordPayment(
    contractId: string,
    input: ContractPaymentInput,
    admin: AuthAdmin,
    client?: ClientInfo,
  ): Promise<ContractDetailDto> {
    let paidIndex: number | null = null;
    await this.prisma.transaction(async (tx) => {
      const contract = await this.lock(tx, contractId);
      if (!(COLLECTING as readonly string[]).includes(contract.status)) {
        throw Errors.conflict(
          'CONTRACT_CLOSED',
          `قرارداد «${CONTRACT_STATUS_LABELS[contract.status]}» است و پرداختی نمی‌گیرد`,
        );
      }
      if (input.installmentId) {
        const target = await tx.installment.findFirst({ where: { id: input.installmentId, contractId } });
        if (!target) throw Errors.badRequest('INSTALLMENT_NOT_FOUND', 'این قسط در این قرارداد نیست');
        if (target.status !== 'PENDING') throw Errors.conflict('INSTALLMENT_CLOSED', 'این قسط باز نیست');
        paidIndex = target.index;
      } else {
        paidIndex =
          (
            await tx.installment.findFirst({
              where: { contractId, status: 'PENDING' },
              orderBy: { index: 'asc' },
              select: { index: true },
            })
          )?.index ?? null;
      }
      const left = await this.applyMoney(tx, contractId, input.amount, input.installmentId, {
        channel: input.channel,
        reference: input.reference,
        paidAt: this.paidAtFor(input.paidAt),
        note: input.note,
        recordedById: admin.id,
      });
      if (left > 0) {
        throw Errors.conflict(
          'OVERPAYMENT',
          `این مبلغ ${formatToman(left)} از باقی‌ماندهٔ قرارداد بیشتر است`,
        );
      }
      await this.refreshStatus(tx, contractId);
    });
    if (input.notifyCustomer) await this.notifyPaid(contractId, input.amount, paidIndex);
    await this.audit.log({
      adminUserId: admin.id,
      action: 'contract.payment',
      entityType: 'InstallmentContract',
      entityId: contractId,
      after: input,
      client,
    });
    return this.get(contractId);
  }

  /** A payment recorded by mistake. A cleared cheque's payment goes back to «at the bank». */
  async voidPayment(paymentId: string, admin: AuthAdmin, client?: ClientInfo): Promise<ContractDetailDto> {
    const payment = await this.prisma.installmentPayment.findUnique({ where: { id: paymentId } });
    if (!payment) throw Errors.notFound('پرداخت پیدا نشد');
    await this.prisma.transaction(async (tx) => {
      await this.lock(tx, payment.contractId);
      // a cleared cheque may have paid several instalments: its rows go together
      const rows = payment.chequeId
        ? await tx.installmentPayment.findMany({ where: { chequeId: payment.chequeId, voidedAt: null } })
        : await tx.installmentPayment.findMany({ where: { id: paymentId, voidedAt: null } });
      if (!rows.length) throw Errors.conflict('PAYMENT_VOIDED', 'این پرداخت قبلاً باطل شده است');
      await tx.installmentPayment.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { voidedAt: new Date() },
      });
      for (const installmentId of new Set(
        rows.map((r) => r.installmentId).filter((v): v is string => Boolean(v)),
      )) {
        const installment = await tx.installment.findUnique({ where: { id: installmentId } });
        if (!installment) continue;
        const sum = await tx.installmentPayment.aggregate({
          where: { installmentId, voidedAt: null },
          _sum: { amount: true },
        });
        const paid = toNumber(sum._sum.amount ?? 0n);
        const full = paid >= toNumber(installment.amount);
        await tx.installment.update({
          where: { id: installmentId },
          data: {
            paidAmount: BigInt(Math.min(paid, toNumber(installment.amount))),
            ...(installment.status === 'WAIVED'
              ? {}
              : { status: full ? 'PAID' : 'PENDING', paidAt: full ? installment.paidAt : null }),
          },
        });
      }
      if (payment.chequeId) {
        await tx.cheque.updateMany({
          where: { id: payment.chequeId, status: 'CLEARED' },
          data: { status: 'DEPOSITED', clearedAt: null },
        });
      }
      await this.refreshStatus(tx, payment.contractId);
    });
    await this.audit.log({
      adminUserId: admin.id,
      action: 'contract.payment.void',
      entityType: 'InstallmentContract',
      entityId: payment.contractId,
      before: { paymentId, amount: toNumber(payment.amount), channel: payment.channel },
      client,
    });
    return this.get(payment.contractId);
  }

  /** A due date or amount moved, a note, or what is left forgiven. The contract's totals follow. */
  async updateInstallment(
    installmentId: string,
    input: InstallmentUpdateInput,
    admin: AuthAdmin,
    client?: ClientInfo,
  ): Promise<ContractDetailDto> {
    const installment = await this.prisma.installment.findUnique({ where: { id: installmentId } });
    if (!installment) throw Errors.notFound('قسط پیدا نشد');
    await this.prisma.transaction(async (tx) => {
      const contract = await this.lock(tx, installment.contractId);
      if (!(COLLECTING as readonly string[]).includes(contract.status)) {
        throw Errors.conflict('CONTRACT_CLOSED', 'قسط‌های قرارداد بسته‌شده تغییر نمی‌کنند');
      }
      const current = await tx.installment.findUniqueOrThrow({ where: { id: installmentId } });
      if (current.status !== 'PENDING') throw Errors.conflict('INSTALLMENT_CLOSED', 'این قسط باز نیست');
      if (input.amount !== undefined && input.amount < toNumber(current.paidAmount)) {
        throw Errors.badRequest(
          'AMOUNT_BELOW_PAID',
          `مبلغ قسط از پرداخت‌شده‌اش (${formatToman(toNumber(current.paidAmount))}) کمتر نمی‌شود`,
        );
      }
      await tx.installment.update({
        where: { id: installmentId },
        data: {
          ...(input.dueDate ? { dueDate: isoToDate(input.dueDate) } : {}),
          ...(input.amount !== undefined ? { amount: BigInt(input.amount) } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
          ...(input.waive ? { status: 'WAIVED' } : {}),
        },
      });
      if (input.amount !== undefined) {
        const sum = await tx.installment.aggregate({
          where: { contractId: contract.id },
          _sum: { amount: true },
        });
        const total = toNumber(sum._sum.amount ?? 0n);
        await tx.installmentContract.update({
          where: { id: contract.id },
          data: {
            markup: BigInt(total - toNumber(contract.financed)),
            totalPayable: BigInt(toNumber(contract.downPayment) + total),
          },
        });
        const updated = await tx.installment.findUniqueOrThrow({ where: { id: installmentId } });
        if (updated.status === 'PENDING' && updated.paidAmount >= updated.amount) {
          await tx.installment.update({
            where: { id: installmentId },
            data: { status: 'PAID', paidAt: new Date() },
          });
        }
      }
      await this.refreshStatus(tx, contract.id);
    });
    await this.audit.log({
      adminUserId: admin.id,
      action: input.waive ? 'contract.installment.waive' : 'contract.installment.update',
      entityType: 'Installment',
      entityId: installmentId,
      before: { dueDate: dateToIso(installment.dueDate), amount: toNumber(installment.amount) },
      after: input,
      client,
    });
    return this.get(installment.contractId);
  }

  // ─── Cheques and promissory notes ──────────────────────────────────────────

  private chequeData(
    contractId: string,
    cheque: ChequeInput | ChequeCreateInput,
    installmentId: string | null,
  ) {
    return {
      contractId,
      installmentId,
      sayadId: cheque.sayadId,
      serial: cheque.serial,
      bankName: cheque.bankName,
      branch: cheque.branch,
      drawerName: cheque.drawerName,
      amount: BigInt(cheque.amount),
      dueDate: isoToDate(cheque.dueDate),
      sayadConfirmed: cheque.sayadConfirmed,
      note: cheque.note,
    };
  }

  /** A cheque received later (a replacement for a bounced one, or one missing at signing). */
  async addCheque(
    contractId: string,
    input: ChequeCreateInput,
    admin: AuthAdmin,
    client?: ClientInfo,
  ): Promise<ContractDetailDto> {
    await this.prisma
      .transaction(async (tx) => {
        const contract = await this.lock(tx, contractId);
        if (contract.status === 'CANCELLED') throw Errors.conflict('CONTRACT_CLOSED', 'قرارداد لغو شده است');
        if (input.installmentId) {
          const installment = await tx.installment.findFirst({
            where: { id: input.installmentId, contractId },
            include: { cheque: true },
          });
          if (!installment) throw Errors.badRequest('INSTALLMENT_NOT_FOUND', 'این قسط در این قرارداد نیست');
          if (installment.cheque) {
            if (!['BOUNCED', 'RETURNED'].includes(installment.cheque.status)) {
              throw Errors.conflict('INSTALLMENT_HAS_CHEQUE', `قسط ${installment.index} چک دیگری دارد`);
            }
            // the bounced or returned cheque stays on the contract, no longer tied to this instalment
            await tx.cheque.update({ where: { id: installment.cheque.id }, data: { installmentId: null } });
          }
        }
        await tx.cheque.create({ data: this.chequeData(contractId, input, input.installmentId) });
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw Errors.conflict('CHEQUE_EXISTS', 'چکی با این شناسهٔ صیادی قبلاً ثبت شده است');
        }
        throw error;
      });
    await this.audit.log({
      adminUserId: admin.id,
      action: 'contract.cheque.add',
      entityType: 'InstallmentContract',
      entityId: contractId,
      after: { sayadId: input.sayadId, amount: input.amount, dueDate: input.dueDate },
      client,
    });
    return this.get(contractId);
  }

  /**
   * A cheque's life: confirmed in Sayad, deposited, cleared (its money pays
   * the instalment it was for, then the next open ones), bounced, returned.
   */
  async chequeAction(
    chequeId: string,
    input: ChequeActionInput,
    admin: AuthAdmin,
    client?: ClientInfo,
  ): Promise<ContractDetailDto> {
    const cheque = await this.prisma.cheque.findUnique({ where: { id: chequeId } });
    if (!cheque) throw Errors.notFound('چک پیدا نشد');
    const when = this.paidAtFor(input.date);
    let alertBounce = false;
    await this.prisma.transaction(async (tx) => {
      const contract = await this.lock(tx, cheque.contractId);
      const current = await tx.cheque.findUniqueOrThrow({ where: { id: chequeId } });
      if (input.action === 'CONFIRM_SAYAD') {
        await tx.cheque.update({ where: { id: chequeId }, data: { sayadConfirmed: true } });
        return;
      }
      const move = CHEQUE_MOVES[input.action];
      if (!move.from.includes(current.status)) {
        throw Errors.conflict(
          'CHEQUE_INVALID_MOVE',
          `چک «${CHEQUE_STATUS_LABELS[current.status]}» است؛ «${ACTION_LABELS[input.action]}» برایش ممکن نیست`,
        );
      }
      if (input.action === 'CLEAR' && contract.status === 'CANCELLED') {
        throw Errors.conflict('CONTRACT_CLOSED', 'قرارداد لغو شده است؛ چکش را «عودت به مشتری» بزن');
      }
      const stamp = {
        DEPOSIT: { depositedAt: when },
        CLEAR: { clearedAt: when },
        BOUNCE: { bouncedAt: when },
        RETURN: { returnedAt: when },
        BACK_IN_HAND: { depositedAt: null },
      }[input.action];
      await tx.cheque.update({
        where: { id: chequeId },
        data: {
          status: move.to,
          ...stamp,
          ...(input.note ? { note: [current.note, input.note].filter(Boolean).join('\n') } : {}),
        },
      });
      if (input.action === 'CLEAR') {
        const left = await this.applyMoney(tx, contract.id, toNumber(current.amount), current.installmentId, {
          channel: 'CHEQUE',
          reference: current.sayadId,
          paidAt: when,
          note: `وصول چک ${current.bankName}`,
          recordedById: admin.id,
          chequeId,
        });
        if (left > 0) {
          // more than the contract still owes: kept on record as a credit for the customer
          await tx.installmentPayment.create({
            data: {
              contractId: contract.id,
              amount: BigInt(left),
              channel: 'CHEQUE',
              reference: current.sayadId,
              paidAt: when,
              note: 'مازاد وصول چک (بستانکاری مشتری)',
              recordedById: admin.id,
              chequeId,
            },
          });
        }
        await this.refreshStatus(tx, contract.id);
      }
      alertBounce = input.action === 'BOUNCE';
    });
    await this.audit.log({
      adminUserId: admin.id,
      action: `contract.cheque.${input.action.toLowerCase()}`,
      entityType: 'Cheque',
      entityId: chequeId,
      before: { status: cheque.status },
      after: input,
      client,
    });
    if (alertBounce) this.logger.warn(`cheque ${cheque.sayadId} of contract ${cheque.contractId} bounced`);
    if (input.action === 'CLEAR') {
      const index = cheque.installmentId
        ? ((
            await this.prisma.installment.findUnique({
              where: { id: cheque.installmentId },
              select: { index: true },
            })
          )?.index ?? null)
        : null;
      // a cleared cheque is the customer's instalment paid
      await this.notifyPaid(cheque.contractId, toNumber(cheque.amount), index);
    }
    return this.get(cheque.contractId);
  }

  async addSafte(
    contractId: string,
    input: SafteInput,
    admin: AuthAdmin,
    client?: ClientInfo,
  ): Promise<ContractDetailDto> {
    const contract = await this.prisma.installmentContract.findUnique({ where: { id: contractId } });
    if (!contract) throw Errors.notFound('قرارداد پیدا نشد');
    await this.prisma.promissoryNote.create({
      data: {
        contractId,
        serial: input.serial,
        amount: BigInt(input.amount),
        electronic: input.electronic,
        dueDate: input.dueDate ? isoToDate(input.dueDate) : null,
        note: input.note,
      },
    });
    await this.audit.log({
      adminUserId: admin.id,
      action: 'contract.safte.add',
      entityType: 'InstallmentContract',
      entityId: contractId,
      after: { serial: input.serial, amount: input.amount },
      client,
    });
    return this.get(contractId);
  }

  async safteAction(
    safteId: string,
    input: SafteActionInput,
    admin: AuthAdmin,
    client?: ClientInfo,
  ): Promise<ContractDetailDto> {
    const note = await this.prisma.promissoryNote.findUnique({ where: { id: safteId } });
    if (!note) throw Errors.notFound('سفته پیدا نشد');
    const status = { HOLD: 'HELD', RETURN: 'RETURNED', CLAIM: 'CLAIMED' } as const;
    await this.prisma.promissoryNote.update({
      where: { id: safteId },
      data: {
        status: status[input.action],
        returnedAt: input.action === 'RETURN' ? new Date() : null,
        ...(input.note ? { note: [note.note, input.note].filter(Boolean).join('\n') } : {}),
      },
    });
    await this.audit.log({
      adminUserId: admin.id,
      action: `contract.safte.${input.action.toLowerCase()}`,
      entityType: 'PromissoryNote',
      entityId: safteId,
      before: { status: note.status },
      after: input,
      client,
    });
    return this.get(note.contractId);
  }

  // ─── Messages to the customer ──────────────────────────────────────────────

  /**
   * «دفترچهٔ اقساط صادر شد»: the number of instalments, the regular one and
   * the first due date, straight from the schedule just written. Never throws:
   * a message that cannot go out must not undo a signed contract.
   */
  async notifyIssued(contractId: string): Promise<void> {
    try {
      const contract = await this.prisma.installmentContract.findUnique({
        where: { id: contractId },
        include: { installments: { orderBy: { index: 'asc' } } },
      });
      const first = contract?.installments[0];
      if (!contract || !first) return;
      await this.notifications.sendContractIssued(contract.customerPhone, {
        contractNumber: toPersianDigits(contract.number),
        months: toPersianDigits(contract.installments.length),
        monthly: formatNumberFa(toNumber(first.amount)),
        firstDue: formatJalali(dateToIso(first.dueDate)),
      });
    } catch (error) {
      this.logger.error(`booklet SMS for contract ${contractId} failed: ${String(error)}`);
    }
  }

  /** «پرداخت قسط ثبت شد», with what is still owed on the whole contract. Never throws. */
  private async notifyPaid(contractId: string, amount: number, index: number | null): Promise<void> {
    try {
      const contract = await this.prisma.installmentContract.findUnique({
        where: { id: contractId },
        include: {
          installments: { where: { status: 'PENDING' }, select: { amount: true, paidAmount: true } },
        },
      });
      if (!contract) return;
      const remaining = contract.installments.reduce(
        (sum, row) => sum + toNumber(row.amount) - toNumber(row.paidAmount),
        0,
      );
      await this.notifications.sendInstallmentPaid(contract.customerPhone, {
        index: index === null ? '' : toPersianDigits(index),
        contractNumber: toPersianDigits(contract.number),
        amount: formatNumberFa(amount),
        remaining: formatNumberFa(remaining),
      });
    } catch (error) {
      this.logger.error(`payment SMS for contract ${contractId} failed: ${String(error)}`);
    }
  }

  // ─── Reminders ─────────────────────────────────────────────────────────────

  private async remind(installment: Installment & { contract: InstallmentContract }): Promise<void> {
    const remaining = toNumber(installment.amount) - toNumber(installment.paidAmount);
    const due = dateToIso(installment.dueDate);
    await this.notifications.sendInstallmentReminder(
      installment.contract.customerPhone,
      {
        contractNumber: toPersianDigits(installment.contract.number),
        amount: formatNumberFa(remaining),
        dueDate: formatJalali(due),
      },
      // past its due date: «قسط معوق» (the reminder pattern when no overdue one is set)
      daysBetweenIso(due, tehranToday()) > 0,
    );
    await this.prisma.installment.update({ where: { id: installment.id }, data: { remindedAt: new Date() } });
  }

  /** «ارسال یادآوری» on one instalment. */
  async sendReminder(installmentId: string, admin: AuthAdmin, client?: ClientInfo): Promise<{ ok: true }> {
    if (!this.remindersReady()) {
      throw Errors.conflict(
        'REMINDER_NOT_READY',
        'الگوی پیامک یادآوری قسط روی سرور تنظیم نشده است؛ کد الگو را با deploy/alerts.sh وارد کن',
      );
    }
    const installment = await this.prisma.installment.findUnique({
      where: { id: installmentId },
      include: { contract: true },
    });
    if (!installment) throw Errors.notFound('قسط پیدا نشد');
    if (
      installment.status !== 'PENDING' ||
      !(COLLECTING as readonly string[]).includes(installment.contract.status)
    ) {
      throw Errors.conflict('INSTALLMENT_CLOSED', 'این قسط باز نیست');
    }
    await this.remind(installment);
    await this.audit.log({
      adminUserId: admin.id,
      action: 'contract.reminder',
      entityType: 'Installment',
      entityId: installmentId,
      client,
    });
    return { ok: true };
  }

  /**
   * The daily run: an SMS a few days before each due date, and again every
   * few days while it is overdue. Off until the owner turns it on in the
   * panel and the reminder pattern is set on the server.
   */
  async runDailyReminders(now: Date = new Date()): Promise<number> {
    const settings = await this.settings.get('ledger');
    if (!settings.remindersEnabled || !this.remindersReady()) return 0;
    const today = tehranToday(now);
    const startOfToday = tehranDayStart(today);
    const notToday = { OR: [{ remindedAt: null }, { remindedAt: { lt: startOfToday } }] };
    const upcoming = await this.prisma.installment.findMany({
      where: {
        status: 'PENDING',
        dueDate: isoToDate(addDaysIso(today, settings.remindDaysBefore)),
        contract: { status: 'ACTIVE' },
        ...notToday,
      },
      include: { contract: true },
      take: 300,
    });
    const overdue =
      settings.overdueEveryDays > 0
        ? (
            await this.prisma.installment.findMany({
              where: {
                status: 'PENDING',
                dueDate: { lt: isoToDate(today) },
                contract: { status: { in: [...COLLECTING] } },
                ...notToday,
              },
              include: { contract: true },
              take: 1000,
            })
          ).filter((row) => daysBetweenIso(dateToIso(row.dueDate), today) % settings.overdueEveryDays === 0)
        : [];
    let sent = 0;
    for (const installment of [...upcoming, ...overdue].slice(0, 300)) {
      try {
        await this.remind(installment);
        sent += 1;
      } catch (error) {
        this.logger.error(`reminder for instalment ${installment.id} failed: ${String(error)}`);
      }
    }
    if (sent) this.logger.log(`sent ${sent} instalment reminder(s)`);
    return sent;
  }
}

const ACTION_LABELS: Record<ChequeAction, string> = {
  CONFIRM_SAYAD: 'تأیید در سامانهٔ صیاد',
  DEPOSIT: 'خواباندن به حساب',
  CLEAR: 'وصول',
  BOUNCE: 'برگشت',
  RETURN: 'عودت به مشتری',
  BACK_IN_HAND: 'برگشت از بانک',
};
