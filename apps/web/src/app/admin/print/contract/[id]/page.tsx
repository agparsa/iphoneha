import { notFound } from 'next/navigation';
import {
  CREDIT_METHOD_LABELS,
  formatJalali,
  formatNumberFa,
  formatPercentFa,
  formatToman,
  toPersianDigits,
} from '@iphoneha/shared';
import { getContract } from '@/lib/api/admin';
import { getStorefrontConfig } from '@/lib/api/endpoints';
import { BrandMark } from '@/components/brand/brand';
import { PrintBar } from '@/components/admin/backoffice/print-bar';

export const metadata = { title: 'قرارداد فروش اقساطی' };

const cell = 'border border-ink/25 px-2 py-1 align-top';

/** The contract the customer (and the guarantor) sign: parties, goods, money, schedule, securities, clauses. */
export default async function ContractPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [contract, config] = await Promise.all([getContract(id), getStorefrontConfig()]);
  if (!contract) notFound();
  const store = config.store;
  const clauses = contract.terms
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <>
      <style>{`@page { size: A4; margin: 12mm; }`}</style>
      <PrintBar
        title={`قرارداد شمارهٔ ${formatNumberFa(contract.number)}`}
        hint="دو نسخه چاپ کن: یکی برای مشتری، یکی برای پرونده."
      />
      <article className="mx-auto max-w-[210mm] bg-white p-[12mm] text-[12px] leading-6 text-ink shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b-2 border-ink pb-3">
          <div className="flex items-center gap-3">
            <BrandMark className="size-12" />
            <div>
              <p className="text-[16px] font-bold">{store.legalName || store.name}</p>
              <p className="text-[11px] text-muted">{store.address}</p>
            </div>
          </div>
          <div className="text-end">
            <h1 className="text-[17px] font-bold">قرارداد فروش اقساطی</h1>
            <p>شماره: {formatNumberFa(contract.number)}</p>
            <p>تاریخ: {formatJalali(contract.contractDate, 'long')}</p>
          </div>
        </header>

        <section className="mt-4 grid gap-1">
          <p>
            <strong>فروشنده:</strong> {store.legalName || store.name}، تلفن{' '}
            <span className="font-display" dir="ltr">
              {toPersianDigits(store.phone)}
            </span>
            {store.address ? `، نشانی: ${store.address}` : ''}
          </p>
          <p>
            <strong>خریدار:</strong> {contract.customerName}
            {contract.nationalId ? `، کد ملی ${toPersianDigits(contract.nationalId)}` : ''}، موبایل{' '}
            <span className="font-display" dir="ltr">
              {toPersianDigits(contract.customerPhone)}
            </span>
            {contract.customerAddress ? `، نشانی: ${contract.customerAddress}` : ''}
          </p>
          {contract.guarantorName ? (
            <p>
              <strong>ضامن:</strong> {contract.guarantorName}
              {contract.guarantorNationalId
                ? `، کد ملی ${toPersianDigits(contract.guarantorNationalId)}`
                : ''}
              {contract.guarantorPhone ? (
                <>
                  ، موبایل{' '}
                  <span className="font-display" dir="ltr">
                    {toPersianDigits(contract.guarantorPhone)}
                  </span>
                </>
              ) : null}
            </p>
          ) : null}
        </section>

        <section className="mt-3">
          <p>
            <strong>موضوع:</strong> {contract.itemDescription}
            {contract.orderNumber ? ` (سفارش ${contract.orderNumber})` : ''}
          </p>
          {contract.devices.length ? (
            <p className="font-display text-[11px]" dir="ltr">
              IMEI: {contract.devices.map((device) => device.imei).join(' · ')}
            </p>
          ) : null}
        </section>

        <section className="mt-3 grid grid-cols-3 gap-2 rounded-lg border border-ink/25 p-3">
          <Figure label="قیمت نقدی" value={formatToman(contract.cashPrice)} />
          <Figure label="پیش‌پرداخت" value={formatToman(contract.downPayment)} />
          <Figure label="مانده پس از پیش‌پرداخت" value={formatToman(contract.financed)} />
          <Figure
            label="کارمزد"
            value={`${formatToman(contract.markup)}${contract.monthlyFeePercent !== null ? ` (${formatPercentFa(contract.monthlyFeePercent)}٪ ماهانه)` : ''}`}
          />
          <Figure
            label="تعداد اقساط"
            value={`${formatNumberFa(contract.months)} قسط — ${CREDIT_METHOD_LABELS[contract.method]}`}
          />
          <Figure label="جمع کل پرداختی" value={formatToman(contract.totalPayable)} strong />
        </section>

        <h2 className="mt-4 font-semibold">جدول اقساط</h2>
        <table className="mt-1 w-full border-collapse text-start">
          <thead>
            <tr className="bg-ink/5">
              <th className={`${cell} w-10`}>قسط</th>
              <th className={cell}>سررسید</th>
              <th className={cell}>مبلغ (تومان)</th>
              <th className={cell}>چک</th>
            </tr>
          </thead>
          <tbody>
            {contract.installments.map((row) => (
              <tr key={row.id}>
                <td className={`${cell} text-center`}>{formatNumberFa(row.index)}</td>
                <td className={cell}>{formatJalali(row.dueDate, 'long')}</td>
                <td className={`${cell} tabular`}>{formatNumberFa(row.amount)}</td>
                <td className={`${cell} text-[11px]`}>
                  {row.cheque ? (
                    <>
                      {row.cheque.bankName} —{' '}
                      <span className="font-display" dir="ltr">
                        {row.cheque.sayadId}
                      </span>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {contract.cheques.some((cheque) => cheque.installmentIndex === null) || contract.saftes.length ? (
          <section className="mt-3 grid gap-1">
            <h2 className="font-semibold">تضمین‌ها</h2>
            {contract.cheques
              .filter((cheque) => cheque.installmentIndex === null)
              .map((cheque) => (
                <p key={cheque.id}>
                  چک ضمانت {cheque.bankName} به شناسهٔ صیادی{' '}
                  <span className="font-display" dir="ltr">
                    {cheque.sayadId}
                  </span>{' '}
                  به مبلغ {formatToman(cheque.amount)} به نام {cheque.drawerName}
                </p>
              ))}
            {contract.saftes.map((safte) => (
              <p key={safte.id}>
                سفته{safte.electronic ? 'ٔ الکترونیکی' : ''} شمارهٔ{' '}
                <span className="font-display">{toPersianDigits(safte.serial)}</span> به مبلغ{' '}
                {formatToman(safte.amount)}
              </p>
            ))}
          </section>
        ) : null}

        {clauses.length ? (
          <section className="mt-4">
            <h2 className="font-semibold">شرایط</h2>
            <ol className="mt-1 list-decimal ps-5">
              {clauses.map((clause, index) => (
                <li key={index}>{clause}</li>
              ))}
            </ol>
          </section>
        ) : null}
        {contract.note ? <p className="mt-3 text-[11px]">توضیحات: {contract.note}</p> : null}

        <footer
          className={`mt-10 grid gap-4 text-center ${contract.guarantorName ? 'grid-cols-3' : 'grid-cols-2'}`}
        >
          <div className="h-24 rounded-lg border border-dashed border-ink/30 p-2 text-muted">
            مهر و امضای فروشنده
          </div>
          <div className="h-24 rounded-lg border border-dashed border-ink/30 p-2 text-muted">
            امضا و اثر انگشت خریدار
          </div>
          {contract.guarantorName ? (
            <div className="h-24 rounded-lg border border-dashed border-ink/30 p-2 text-muted">
              امضا و اثر انگشت ضامن
            </div>
          ) : null}
        </footer>
      </article>
    </>
  );
}

function Figure({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-[11px] text-muted">{label}</p>
      <p className={strong ? 'text-[14px] font-bold tabular' : 'tabular'}>{value}</p>
    </div>
  );
}
