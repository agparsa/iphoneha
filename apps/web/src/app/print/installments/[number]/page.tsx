import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { formatJalali, formatNumberFa, formatToman, toPersianDigits } from '@iphoneha/shared';
import { getMyInstallment, getStorefrontConfig } from '@/lib/api/endpoints';
import { BrandMark } from '@/components/brand/brand';
import { PrintBar } from '@/components/admin/backoffice/print-bar';
import { BookletFigures, BookletSchedule } from '@/components/store/installment-booklet';

export const metadata: Metadata = { title: 'دفترچهٔ اقساط', robots: { index: false, follow: false } };

/** The booklet on paper: the contract's figures and the whole schedule, with what is paid so far. */
export default async function BookletPrintPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const [contract, config] = await Promise.all([getMyInstallment(number), getStorefrontConfig()]);
  if (!contract) notFound();
  const store = config.store;

  return (
    <>
      <style>{`@page { size: A4; margin: 12mm; }`}</style>
      <PrintBar title={`دفترچهٔ اقساط قرارداد ${formatNumberFa(contract.number)}`} />
      <article className="mx-auto max-w-[210mm] bg-white p-[12mm] text-[12px] leading-6 text-ink shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b-2 border-ink pb-3">
          <div className="flex items-center gap-3">
            <BrandMark className="size-12" />
            <div>
              <p className="text-[16px] font-bold">{store.legalName || store.name}</p>
              <p className="text-[11px] text-muted">
                تلفن{' '}
                <span className="font-display" dir="ltr">
                  {toPersianDigits(store.phone)}
                </span>
              </p>
            </div>
          </div>
          <div className="text-end">
            <h1 className="text-[17px] font-bold">دفترچهٔ اقساط</h1>
            <p>
              قرارداد {formatNumberFa(contract.number)} · {contract.methodLabel}
            </p>
            <p>تاریخ قرارداد: {formatJalali(contract.contractDate, 'long')}</p>
          </div>
        </header>

        <section className="mt-4 grid gap-4 sm:grid-cols-2 print:grid-cols-2">
          <div>
            <p className="font-semibold">کالا</p>
            <p>{contract.itemDescription}</p>
            <p className="mt-2 text-muted">
              وضعیت: {contract.statusLabel} · پرداخت‌شده {formatToman(contract.paid)} · باقی‌مانده{' '}
              {formatToman(contract.remaining)}
            </p>
          </div>
          <BookletFigures contract={contract} />
        </section>

        <section className="mt-5">
          <BookletSchedule contract={contract} print />
        </section>

        <p className="mt-4 text-[11px] text-muted">
          چاپ‌شده در {formatJalali(new Date().toISOString().slice(0, 10), 'long')} از حساب کاربری در{' '}
          {store.name}. مبالغ به تومان است.
        </p>
      </article>
    </>
  );
}
