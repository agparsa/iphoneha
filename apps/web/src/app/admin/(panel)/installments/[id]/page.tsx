import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Printer } from 'lucide-react';
import {
  formatJalali,
  formatNumberFa,
  formatPercentFa,
  formatToman,
  toPersianDigits,
  type Permission,
} from '@iphoneha/shared';
import { getAdminMe, getContract, getLedgerSummary } from '@/lib/api/admin';
import { CHEQUE_TONE, CONTRACT_TONE, installmentTone } from '@/lib/backoffice';
import { formatDateFa, formatDateTimeFa } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { PageHeader, Panel, StatCard, Table, Td, Th } from '@/components/admin/ui';
import {
  AddChequeDialog,
  AddSafteDialog,
  ChequeActionDialog,
  ContractEditDialog,
  ContractStatusDialog,
  InstallmentEditDialog,
  RecordPaymentDialog,
  RemindButton,
  SafteActions,
  VoidPaymentButton,
} from '@/components/admin/backoffice/ledger-actions';

export const metadata = { title: 'قرارداد اقساط' };

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await getAdminMe();
  if (!admin?.permissions.includes('installments.read')) notFound();
  const [contract, summary] = await Promise.all([getContract(id), getLedgerSummary()]);
  if (!contract) notFound();
  const can = (permission: Permission) => Boolean(admin?.permissions.includes(permission));
  const collecting = contract.status === 'ACTIVE' || contract.status === 'DEFAULTED';
  const canWrite = can('installments.write');

  return (
    <div>
      <Link
        href="/admin/installments"
        className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-ink"
      >
        <ArrowRight className="size-4" aria-hidden />
        بازگشت به دفتر اقساط
      </Link>

      <PageHeader
        title={`قرارداد ${formatNumberFa(contract.number)} — ${contract.customerName}`}
        description={[
          contract.methodLabel,
          `تاریخ ${formatJalali(contract.contractDate, 'long')}`,
          contract.createdByName ? `ثبت: ${contract.createdByName}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={CONTRACT_TONE[contract.status]}>{contract.statusLabel}</Badge>
            <Link
              href={`/admin/print/contract/${contract.id}`}
              target="_blank"
              className="inline-flex h-9 items-center gap-2 rounded-pill border border-line-strong px-4 text-[13px] text-ink hover:bg-surface"
            >
              <Printer className="size-4" aria-hidden />
              چاپ قرارداد
            </Link>
            {canWrite ? <ContractStatusDialog contract={contract} /> : null}
            {canWrite && collecting ? (
              <RecordPaymentDialog contractId={contract.id} remaining={contract.remaining} />
            ) : null}
          </div>
        }
      />

      {contract.status === 'CANCELLED' ? (
        <p className="mb-4 rounded-2xl bg-surface px-4 py-3 text-[13px] text-muted">
          لغو شده{contract.cancelledAt ? ` در ${formatDateFa(contract.cancelledAt)}` : ''}
          {contract.cancelReason ? ` — ${contract.cancelReason}` : ''}
        </p>
      ) : null}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="کل پرداختی"
          value={formatToman(contract.totalPayable)}
          hint={`قیمت نقدی ${formatToman(contract.cashPrice)}`}
        />
        <StatCard
          label="دریافت‌شده"
          value={formatToman(contract.paid)}
          hint={`پیش‌پرداخت ${formatToman(contract.downPayment)}`}
          tone="success"
        />
        <StatCard
          label="مانده"
          value={formatToman(contract.remaining)}
          hint={`${formatNumberFa(contract.months)} قسط · کارمزد ${formatToman(contract.markup)}`}
        />
        <StatCard
          label="معوق"
          value={formatToman(contract.overdueAmount)}
          hint={contract.overdueCount ? `${formatNumberFa(contract.overdueCount)} قسط` : 'بدون تأخیر'}
          tone={contract.overdueCount ? 'danger' : 'neutral'}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 content-start gap-4">
          <Panel title="جدول اقساط">
            <Table className="border-0">
              <thead>
                <tr>
                  <Th>قسط</Th>
                  <Th>سررسید</Th>
                  <Th>مبلغ</Th>
                  <Th>وضعیت</Th>
                  <Th>چک</Th>
                  {canWrite && collecting ? <Th className="w-36" /> : null}
                </tr>
              </thead>
              <tbody>
                {contract.installments.map((row) => (
                  <tr key={row.id} className={cn(row.overdue && 'bg-danger-soft/30')}>
                    <Td className="tabular">{formatNumberFa(row.index)}</Td>
                    <Td className="text-[12px]">
                      {formatJalali(row.dueDate)}
                      {row.overdue ? (
                        <span className="block text-[11px] text-danger">
                          {formatNumberFa(row.daysLate)} روز تأخیر
                        </span>
                      ) : null}
                      {row.note ? <span className="block text-[11px] text-muted">{row.note}</span> : null}
                    </Td>
                    <Td className="whitespace-nowrap tabular">
                      {formatToman(row.amount)}
                      {row.paidAmount && row.status === 'PENDING' ? (
                        <span className="block text-[11px] text-muted">
                          پرداخت‌شده {formatToman(row.paidAmount)}
                        </span>
                      ) : null}
                    </Td>
                    <Td>
                      <Badge tone={installmentTone(row.status, row.overdue)}>{row.statusLabel}</Badge>
                    </Td>
                    <Td className="text-[12px]">
                      {row.cheque ? (
                        <>
                          <span className="block">{row.cheque.bankName}</span>
                          <Badge tone={CHEQUE_TONE[row.cheque.status]}>{row.cheque.statusLabel}</Badge>
                        </>
                      ) : (
                        '—'
                      )}
                    </Td>
                    {canWrite && collecting ? (
                      <Td>
                        {row.status === 'PENDING' ? (
                          <div className="flex items-center justify-end gap-1">
                            <RemindButton
                              installmentId={row.id}
                              ready={summary.remindersReady}
                              remindedAt={row.remindedAt}
                            />
                            <InstallmentEditDialog installment={row} />
                            <RecordPaymentDialog
                              contractId={contract.id}
                              installment={{ id: row.id, index: row.index, remaining: row.remaining }}
                              remaining={contract.remaining}
                            />
                          </div>
                        ) : null}
                      </Td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </Table>
          </Panel>

          <Panel
            title="چک‌ها"
            action={
              canWrite && contract.status !== 'CANCELLED' ? <AddChequeDialog contract={contract} /> : null
            }
          >
            {contract.cheques.length === 0 ? (
              <p className="text-[13px] text-muted">چکی ثبت نشده.</p>
            ) : (
              <ul className="grid gap-2">
                {contract.cheques.map((cheque) => (
                  <li
                    key={cheque.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3"
                  >
                    <div className="grid gap-0.5 text-[12px]">
                      <p className="text-[13px] text-ink">
                        {cheque.installmentIndex ? `قسط ${formatNumberFa(cheque.installmentIndex)}` : 'ضمانت'}{' '}
                        — {cheque.bankName}
                        {cheque.branch ? ` (${cheque.branch})` : ''} · {formatToman(cheque.amount)}
                      </p>
                      <p className="text-muted">
                        صیادی{' '}
                        <span className="font-display" dir="ltr">
                          {cheque.sayadId}
                        </span>
                        {cheque.serial ? ` · سریال ${toPersianDigits(cheque.serial)}` : ''} · سررسید{' '}
                        {formatJalali(cheque.dueDate)} · {cheque.drawerName}
                      </p>
                      {!cheque.sayadConfirmed ? (
                        <p className="text-warning">در سامانهٔ صیاد تأیید نشده</p>
                      ) : null}
                      {cheque.note ? <p className="text-muted">{cheque.note}</p> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={CHEQUE_TONE[cheque.status]}>{cheque.statusLabel}</Badge>
                      {canWrite ? <ChequeActionDialog cheque={cheque} /> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="پرداخت‌ها">
            {contract.payments.length === 0 ? (
              <p className="text-[13px] text-muted">هنوز پرداختی ثبت نشده.</p>
            ) : (
              <ul className="grid gap-2">
                {contract.payments.map((payment) => (
                  <li
                    key={payment.id}
                    className={cn(
                      'flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line px-4 py-2.5 text-[12px]',
                      payment.voidedAt && 'opacity-60',
                    )}
                  >
                    <div>
                      <p className={cn('text-[13px] text-ink tabular', payment.voidedAt && 'line-through')}>
                        {formatToman(payment.amount)} — {payment.channelLabel}
                        {payment.installmentIndex ? ` · قسط ${formatNumberFa(payment.installmentIndex)}` : ''}
                      </p>
                      <p className="text-muted">
                        {formatDateTimeFa(payment.paidAt)}
                        {payment.reference ? ` · ${payment.reference}` : ''}
                        {payment.note ? ` · ${payment.note}` : ''}
                        {payment.recordedByName ? ` · ${payment.recordedByName}` : ''}
                      </p>
                      {payment.voidedAt ? (
                        <p className="text-danger">باطل شد در {formatDateFa(payment.voidedAt)}</p>
                      ) : null}
                    </div>
                    {canWrite && !payment.voidedAt ? (
                      <VoidPaymentButton paymentId={payment.id} cheque={Boolean(payment.chequeId)} />
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="grid min-w-0 content-start gap-4">
          <Panel title="طرفین" action={canWrite ? <ContractEditDialog contract={contract} /> : null}>
            <dl className="grid gap-2 text-[13px]">
              <Info label="خریدار">
                {contract.userId && can('users.read') ? (
                  <Link href={`/admin/users/${contract.userId}`} className="text-ink hover:underline">
                    {contract.customerName}
                  </Link>
                ) : (
                  contract.customerName
                )}
              </Info>
              <Info label="موبایل">
                <a href={`tel:${contract.customerPhone}`} className="font-display" dir="ltr">
                  {contract.customerPhone}
                </a>
              </Info>
              {contract.nationalId ? (
                <Info label="کد ملی">{toPersianDigits(contract.nationalId)}</Info>
              ) : null}
              {contract.customerAddress ? <Info label="نشانی">{contract.customerAddress}</Info> : null}
              {contract.guarantorName ? (
                <Info label="ضامن">
                  {contract.guarantorName}
                  {contract.guarantorPhone ? (
                    <span className="block font-display text-[12px] text-muted" dir="ltr">
                      {contract.guarantorPhone}
                    </span>
                  ) : null}
                </Info>
              ) : null}
            </dl>
          </Panel>

          <Panel title="کالا">
            <p className="text-[13px] text-ink">{contract.itemDescription}</p>
            {contract.devices.length ? (
              <ul className="mt-2 grid gap-1 text-[12px]">
                {contract.devices.map((device) => (
                  <li key={device.imei} className="font-display text-muted" dir="ltr">
                    {device.imei}
                  </li>
                ))}
              </ul>
            ) : null}
            <dl className="mt-3 grid gap-1.5 border-t border-line pt-3 text-[12px]">
              {contract.orderId && contract.orderNumber ? (
                <Info label="سفارش">
                  <Link
                    href={`/admin/orders/${contract.orderId}`}
                    className="font-display text-ink hover:underline"
                  >
                    {contract.orderNumber}
                  </Link>
                </Info>
              ) : null}
              {contract.creditRequestNumber ? (
                <Info label="درخواست سایت">{formatNumberFa(contract.creditRequestNumber)}</Info>
              ) : null}
              {contract.monthlyFeePercent !== null ? (
                <Info label="کارمزد ماهانه">{formatPercentFa(contract.monthlyFeePercent)}٪</Info>
              ) : null}
              {contract.note ? <Info label="توضیحات">{contract.note}</Info> : null}
            </dl>
          </Panel>

          <Panel
            title="سفته‌ها"
            action={
              canWrite && contract.status !== 'CANCELLED' ? (
                <AddSafteDialog contractId={contract.id} suggested={contract.remaining} />
              ) : null
            }
          >
            {contract.saftes.length === 0 ? (
              <p className="text-[13px] text-muted">سفته‌ای ثبت نشده.</p>
            ) : (
              <ul className="grid gap-2">
                {contract.saftes.map((safte) => (
                  <li
                    key={safte.id}
                    className="grid gap-2 rounded-2xl border border-line px-4 py-3 text-[12px]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[13px] text-ink">
                        شمارهٔ <span className="font-display">{toPersianDigits(safte.serial)}</span> ·{' '}
                        {formatToman(safte.amount)}
                        {safte.electronic ? ' · الکترونیکی' : ''}
                      </p>
                      <Badge
                        tone={
                          safte.status === 'HELD'
                            ? 'neutral'
                            : safte.status === 'CLAIMED'
                              ? 'danger'
                              : 'outline'
                        }
                      >
                        {safte.statusLabel}
                      </Badge>
                    </div>
                    {safte.dueDate ? (
                      <p className="text-muted">سررسید {formatJalali(safte.dueDate)}</p>
                    ) : null}
                    {canWrite ? <SafteActions safte={safte} /> : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="text-end text-ink">{children}</dd>
    </div>
  );
}
