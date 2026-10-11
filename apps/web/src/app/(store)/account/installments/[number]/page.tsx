import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Printer } from 'lucide-react';
import { formatJalali, formatNumberFa, formatToman } from '@iphoneha/shared';
import { getMyInstallment } from '@/lib/api/endpoints';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  BookletFigures,
  BookletProgress,
  BookletSchedule,
  NextDueCard,
  contractTone,
} from '@/components/store/installment-booklet';

export const metadata: Metadata = { title: 'دفترچهٔ اقساط', robots: { index: false, follow: false } };

export default async function MyInstallmentPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const contract = await getMyInstallment(number);
  if (!contract) notFound();

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="ghost">
          <Link href="/account/installments">
            <ArrowRight className="size-4" aria-hidden />
            همهٔ دفترچه‌ها
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="ms-auto">
          <Link href={`/print/installments/${contract.number}`} target="_blank">
            <Printer className="size-4" aria-hidden />
            چاپ دفترچه
          </Link>
        </Button>
      </div>

      <section className="rounded-panel border border-line p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[16px] font-semibold text-ink">
            دفترچهٔ اقساط — قرارداد {formatNumberFa(contract.number)}
          </h2>
          <Badge tone={contractTone(contract.status)}>{contract.statusLabel}</Badge>
        </div>
        <p className="mt-1 text-[13px] text-ink-muted">{contract.itemDescription}</p>
        <p className="mt-1 text-[11px] text-muted">
          {contract.methodLabel} · تاریخ قرارداد {formatJalali(contract.contractDate, 'long')}
          {contract.orderNumber ? ` · سفارش ${contract.orderNumber}` : ''}
        </p>
        <div className="mt-4">
          <BookletProgress contract={contract} />
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="grid content-start gap-3 rounded-panel border border-line p-5">
          <h3 className="text-[14px] font-semibold text-ink">قسط بعدی</h3>
          <NextDueCard contract={contract} />
          <dl className="grid grid-cols-2 gap-3 text-[12px]">
            <div>
              <dt className="text-muted">پرداخت‌شده تا امروز</dt>
              <dd className="mt-0.5 text-[14px] font-semibold text-success tabular">
                {formatToman(contract.paid)}
              </dd>
            </div>
            <div>
              <dt className="text-muted">باقی‌مانده</dt>
              <dd className="mt-0.5 text-[14px] font-semibold text-ink tabular">
                {formatToman(contract.remaining)}
              </dd>
            </div>
          </dl>
        </section>
        <section className="grid content-start gap-3 rounded-panel border border-line p-5">
          <h3 className="text-[14px] font-semibold text-ink">مبالغ قرارداد</h3>
          <BookletFigures contract={contract} />
        </section>
      </div>

      <section className="grid gap-3 rounded-panel border border-line p-5">
        <h3 className="text-[14px] font-semibold text-ink">
          جدول اقساط ({formatNumberFa(contract.installments.length)} قسط)
        </h3>
        <BookletSchedule contract={contract} />
        <p className="text-[11px] leading-5 text-muted">
          قسط را تا سررسید به فروشگاه بپرداز؛ پرداخت‌ها را کارشناس فروشگاه ثبت می‌کند و این دفترچه همان لحظه
          به‌روز می‌شود.
        </p>
      </section>

      {contract.payments.length > 0 ? (
        <section className="grid gap-3 rounded-panel border border-line p-5">
          <h3 className="text-[14px] font-semibold text-ink">پرداخت‌های ثبت‌شده</h3>
          <ul className="divide-y divide-line text-[12px]">
            {contract.payments.map((payment, index) => (
              <li
                key={`${payment.paidAt}-${index}`}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <span className="text-ink-muted">
                  {payment.note ??
                    (payment.installmentIndex
                      ? `قسط ${formatNumberFa(payment.installmentIndex)}`
                      : 'پرداخت')}{' '}
                  · {payment.channelLabel} · {formatJalali(payment.paidAt.slice(0, 10))}
                </span>
                <span className="font-medium text-ink tabular">{formatToman(payment.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
