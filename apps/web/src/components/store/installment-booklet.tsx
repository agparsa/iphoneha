import Link from 'next/link';
import { AlertTriangle, CalendarClock, Check, ChevronLeft } from 'lucide-react';
import {
  formatJalali,
  formatNumberFa,
  formatPercentFa,
  formatToman,
  toPersianDigits,
  type MyContractDto,
  type MyInstallmentDto,
} from '@iphoneha/shared';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { CREDIT_COLORS } from '@/lib/credit';

/**
 * The customer's instalment booklet (دفترچهٔ اقساط): every figure is the one
 * written in the contract and its schedule — nothing is worked out again here.
 */

export function contractTone(status: MyContractDto['status']) {
  return status === 'COMPLETED' ? 'success' : status === 'DEFAULTED' ? 'danger' : 'info';
}

export function installmentTone(row: MyInstallmentDto) {
  if (row.status === 'PAID') return 'success' as const;
  if (row.status === 'WAIVED') return 'neutral' as const;
  if (row.overdue) return 'danger' as const;
  return row.paidAmount > 0 ? ('warning' as const) : ('outline' as const);
}

/** How much of the total has been paid, as a bar with the count of instalments. */
export function BookletProgress({ contract }: { contract: MyContractDto }) {
  const share = contract.totalPayable > 0 ? Math.min(1, contract.paid / contract.totalPayable) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-muted">
        <span>
          {formatNumberFa(contract.paidCount)} از {formatNumberFa(contract.installments.length)} قسط پرداخت
          شده
        </span>
        <span className="tabular">{formatNumberFa(Math.round(share * 100))}٪</span>
      </div>
      <div
        className="mt-1.5 h-2 overflow-hidden rounded-pill bg-surface-2"
        role="progressbar"
        aria-label="پیشرفت پرداخت"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(share * 100)}
      >
        <span
          className="block h-full rounded-pill transition-[width] duration-700"
          style={{ width: `${share * 100}%`, backgroundColor: CREDIT_COLORS[contract.method] }}
        />
      </div>
    </div>
  );
}

/** A booklet on the «دفترچهٔ اقساط» list. */
export function BookletCard({ contract }: { contract: MyContractDto }) {
  return (
    <Link
      href={`/account/installments/${contract.number}`}
      className="group block rounded-panel border border-line p-4 transition-colors hover:border-line-strong sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="rounded-pill px-2.5 py-1 text-[11px] font-medium text-white"
          style={{ backgroundColor: CREDIT_COLORS[contract.method] }}
        >
          {contract.methodLabel}
        </span>
        <span className="text-[13px] font-semibold text-ink">قرارداد {formatNumberFa(contract.number)}</span>
        <Badge tone={contractTone(contract.status)}>{contract.statusLabel}</Badge>
        <ChevronLeft
          className="ms-auto size-4 text-muted-faint transition-transform group-hover:-translate-x-0.5"
          aria-hidden
        />
      </div>
      <p className="mt-2 truncate text-[13px] text-ink-muted">{contract.itemDescription}</p>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-3">
        <div>
          <dt className="text-muted">پرداخت‌شده</dt>
          <dd className="mt-0.5 font-medium text-ink tabular">{formatToman(contract.paid)}</dd>
        </div>
        <div>
          <dt className="text-muted">باقی‌مانده</dt>
          <dd className="mt-0.5 font-medium text-ink tabular">{formatToman(contract.remaining)}</dd>
        </div>
        {contract.nextDue ? (
          <div className="col-span-2 sm:col-span-1">
            <dt className="text-muted">قسط بعدی</dt>
            <dd className="mt-0.5 font-medium text-ink tabular">
              {formatToman(contract.nextDue.amount)} · {formatJalali(contract.nextDue.dueDate)}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-4">
        <BookletProgress contract={contract} />
      </div>

      {contract.overdueCount > 0 ? (
        <p className="mt-3 flex items-center gap-2 rounded-2xl bg-danger-soft px-3 py-2 text-[12px] text-danger">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          {formatNumberFa(contract.overdueCount)} قسط معوق به مبلغ {formatToman(contract.overdueAmount)}
        </p>
      ) : null}
    </Link>
  );
}

/** The contract's money, as written: price, down payment, financed, fee, total. */
export function BookletFigures({ contract }: { contract: MyContractDto }) {
  const rows: [string, string][] = [
    ['قیمت نقدی کالا', formatToman(contract.cashPrice)],
    ['پیش‌پرداخت', contract.downPayment > 0 ? formatToman(contract.downPayment) : 'ندارد'],
    ['مبلغ اقساطی', formatToman(contract.financed)],
    [
      contract.monthlyFeePercent !== null
        ? `کارمزد (${formatPercentFa(contract.monthlyFeePercent)}٪ در ماه × ${formatNumberFa(contract.months)} ماه)`
        : 'کارمزد',
      formatToman(contract.markup),
    ],
    ['جمع کل قابل پرداخت', formatToman(contract.totalPayable)],
  ];
  return (
    <dl className="grid gap-2.5 text-[13px]">
      {rows.map(([label, value], index) => (
        <div
          key={label}
          className={cn(
            'flex items-center justify-between gap-3',
            index === rows.length - 1 && 'border-t border-line pt-2.5 font-semibold',
          )}
        >
          <dt className={index === rows.length - 1 ? 'text-ink' : 'text-muted'}>{label}</dt>
          <dd className="text-end text-ink tabular">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The next instalment, or the good news that there is none left. */
export function NextDueCard({ contract }: { contract: MyContractDto }) {
  if (!contract.nextDue) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-success-soft p-4 text-success">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-success text-white">
          <Check className="size-5" aria-hidden />
        </span>
        <p className="text-[13px] font-medium">
          {contract.status === 'COMPLETED'
            ? 'همهٔ اقساط این قرارداد پرداخت شده است.'
            : 'قسط بازی نمانده است.'}
        </p>
      </div>
    );
  }
  const row = contract.installments.find((item) => item.index === contract.nextDue!.index);
  const late = row?.overdue ?? false;
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl p-4',
        late ? 'bg-danger-soft text-danger' : 'bg-surface-2 text-ink',
      )}
    >
      <span
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-full text-white',
          late ? 'bg-danger' : 'bg-ink',
        )}
      >
        {late ? (
          <AlertTriangle className="size-5" aria-hidden />
        ) : (
          <CalendarClock className="size-5" aria-hidden />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] opacity-80">
          {late
            ? `قسط ${formatNumberFa(contract.nextDue.index)} — ${formatNumberFa(row!.daysLate)} روز گذشته از سررسید`
            : `قسط ${formatNumberFa(contract.nextDue.index)} — سررسید ${formatJalali(contract.nextDue.dueDate, 'long')}`}
        </p>
        <p className="mt-0.5 text-[17px] font-bold tabular">{formatToman(contract.nextDue.amount)}</p>
      </div>
    </div>
  );
}

/** Every instalment, in order: due date, amount, what was paid, status. */
export function BookletSchedule({ contract, print = false }: { contract: MyContractDto; print?: boolean }) {
  return (
    <div className={cn(!print && 'overflow-hidden rounded-2xl border border-line')}>
      <table className="w-full text-[12px]">
        <caption className="sr-only">جدول اقساط قرارداد {formatNumberFa(contract.number)}</caption>
        <thead className={cn('text-muted', print ? 'border-b-2 border-ink' : 'bg-surface-2')}>
          <tr>
            <th scope="col" className="px-2 py-2 text-start font-medium sm:px-3">
              قسط
            </th>
            <th scope="col" className="px-2 py-2 text-start font-medium sm:px-3">
              سررسید
            </th>
            <th scope="col" className="px-2 py-2 text-end font-medium sm:px-3">
              مبلغ (تومان)
            </th>
            <th
              scope="col"
              className={cn('px-2 py-2 text-end font-medium sm:px-3', !print && 'hidden sm:table-cell')}
            >
              پرداخت‌شده
            </th>
            <th scope="col" className="px-2 py-2 text-end font-medium sm:px-3">
              وضعیت
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {contract.installments.map((row) => (
            <tr key={row.index} className={cn(row.overdue && !print && 'bg-danger-soft/40')}>
              <td className="px-2 py-2.5 tabular sm:px-3">{formatNumberFa(row.index)}</td>
              <td className="px-2 py-2.5 sm:px-3">
                <span className="tabular">{formatJalali(row.dueDate)}</span>
                {row.cheque ? (
                  <span className="mt-0.5 block text-[10px] text-muted">
                    چک {row.cheque.bankName} ···{toPersianDigits(row.cheque.sayadTail)}
                  </span>
                ) : null}
              </td>
              <td className="px-2 py-2.5 text-end font-medium text-ink tabular sm:px-3">
                {formatNumberFa(row.amount)}
              </td>
              <td
                className={cn(
                  'px-2 py-2.5 text-end tabular text-ink-muted sm:px-3',
                  !print && 'hidden sm:table-cell',
                )}
              >
                {row.paidAmount > 0 ? formatNumberFa(row.paidAmount) : '—'}
              </td>
              <td className="px-2 py-2.5 text-end sm:px-3">
                {print ? (
                  <span>{row.statusLabel}</span>
                ) : (
                  <Badge tone={installmentTone(row)}>
                    {row.overdue ? `معوق ${formatNumberFa(row.daysLate)} روز` : row.statusLabel}
                  </Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot
          className={cn(
            'font-semibold text-ink',
            print ? 'border-t-2 border-ink' : 'border-t border-line bg-surface-2',
          )}
        >
          <tr>
            <td className="px-2 py-2.5 sm:px-3" colSpan={2}>
              جمع اقساط
            </td>
            <td className="px-2 py-2.5 text-end tabular sm:px-3">
              {formatNumberFa(contract.installments.reduce((sum, row) => sum + row.amount, 0))}
            </td>
            <td className={cn('px-2 py-2.5 text-end tabular sm:px-3', !print && 'hidden sm:table-cell')}>
              {formatNumberFa(contract.installments.reduce((sum, row) => sum + row.paidAmount, 0))}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
