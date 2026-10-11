import { notFound } from 'next/navigation';
import { Download } from 'lucide-react';
import {
  addDaysIso,
  daysBetweenIso,
  formatJalali,
  formatNumberFa,
  formatToman,
  isIsoDate,
  parseJalaliInput,
  tehranToday,
  type ReportRow,
} from '@iphoneha/shared';
import { getAdminMe, getSalesReport } from '@/lib/api/admin';
import { exportHref } from '@/lib/backoffice';
import { PageHeader, Panel, StatCard } from '@/components/admin/ui';
import { SalesChart } from '@/components/admin/sales-chart';
import { DateRangeFilter } from '@/components/admin/backoffice/list-tools';

export const metadata = { title: 'گزارش فروش' };

function day(value: string | undefined): string | null {
  if (!value) return null;
  return isIsoDate(value) ? value : parseJalaliInput(value);
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const today = tehranToday();
  let to = day(params.to) ?? today;
  let from = day(params.from) ?? addDaysIso(to, -29);
  if (daysBetweenIso(from, to) < 0) [from, to] = [to, from];
  if (daysBetweenIso(from, to) > 731) from = addDaysIso(to, -731);
  const admin = await getAdminMe();
  if (!admin?.permissions.includes('reports.read')) notFound();
  const report = await getSalesReport(from, to);
  const canLedger = Boolean(admin?.permissions.includes('installments.read'));
  const t = report.totals;
  const range = { from, to };

  return (
    <div>
      <PageHeader
        title="گزارش فروش"
        description={`${formatJalali(from, 'long')} تا ${formatJalali(to, 'long')} — سفارش‌های پرداخت‌شده بر اساس تاریخ ثبت`}
        action={
          <div className="flex flex-wrap gap-2">
            <ExportLink href={exportHref('sales', range)} label="اکسل گزارش" />
            <ExportLink href={exportHref('orders', range)} label="اکسل سفارش‌ها" />
            <ExportLink href={exportHref('customers')} label="اکسل مشتری‌ها" />
            <ExportLink href={exportHref('devices')} label="اکسل IMEIها" />
            {canLedger ? <ExportLink href={exportHref('installments')} label="اکسل اقساط" /> : null}
          </div>
        }
      />

      <div className="mb-4">
        <DateRangeFilter />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="فروش"
          value={formatToman(t.revenue)}
          hint={`${formatNumberFa(t.orders)} سفارش · ${formatNumberFa(t.units)} گوشی`}
          tone="success"
        />
        <StatCard
          label="میانگین سفارش"
          value={formatToman(t.averageOrderValue)}
          hint={`تخفیف‌ها ${formatToman(t.discount)}`}
        />
        <StatCard
          label="سود ناخالص"
          value={t.grossProfit !== null ? formatToman(t.grossProfit) : '—'}
          hint={
            t.costCoverage.units
              ? `قیمت خرید ${formatNumberFa(t.costCoverage.unitsWithCost)} از ${formatNumberFa(t.costCoverage.units)} گوشی ثبت شده`
              : 'قیمت خرید را هنگام ورود کالا با IMEI وارد کن'
          }
        />
        <StatCard
          label="لغو و بازپرداخت"
          value={formatToman(t.refundedAmount)}
          hint={`${formatNumberFa(t.cancelledOrders)} سفارش لغوشده`}
          tone={t.refundedAmount ? 'danger' : 'neutral'}
        />
      </div>

      <Panel title={report.days > 92 ? 'فروش ماه‌به‌ماه' : 'فروش روزانه'} className="mb-4">
        {report.days > 92 ? (
          <ul className="grid gap-2">
            {report.byMonth.map((month) => (
              <Bar
                key={month.key}
                label={month.label}
                value={month.revenue}
                max={Math.max(1, ...report.byMonth.map((m) => m.revenue))}
                note={`${formatNumberFa(month.orders)} سفارش`}
              />
            ))}
          </ul>
        ) : (
          <SalesChart data={report.byDay} label="نمودار فروش روزانه در بازهٔ انتخابی — هر ستون یک روز" />
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Breakdown title="مدل" rows={report.byModel} />
        <Breakdown title="حافظه" rows={report.byStorage} />
        <Breakdown title="رنگ" rows={report.byColor} />
        <Breakdown title="روش پرداخت" rows={report.byPaymentMethod} />
        <Breakdown title="منبع سفارش" rows={report.bySource} />
        <Breakdown title="استان" rows={report.byProvince} />
        <Breakdown title="پرفروش‌ترین‌ها" rows={report.topVariants} />
        {canLedger ? (
          <Panel title="اقساط فروشگاه">
            <dl className="grid gap-2 text-[13px]">
              <Line label="وصولی اقساط (با پیش‌پرداخت)" value={formatToman(report.ledger.collected)} />
              <Line label="قرارداد تازه" value={formatNumberFa(report.ledger.newContracts)} />
              <Line label="اصل اقساط تازه" value={formatToman(report.ledger.financed)} />
              <Line label="کارمزد اقساط تازه" value={formatToman(report.ledger.markup)} />
            </dl>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}

function ExportLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="inline-flex h-9 items-center gap-2 rounded-pill border border-line-strong px-4 text-[13px] text-ink hover:bg-surface"
    >
      <Download className="size-4" aria-hidden />
      {label}
    </a>
  );
}

function Bar({ label, value, max, note }: { label: string; value: number; max: number; note: string }) {
  return (
    <li className="grid gap-1 text-[12px]">
      <div className="flex justify-between gap-3">
        <span className="text-ink">{label}</span>
        <span className="tabular text-muted">
          {formatToman(value)} · {note}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-pill bg-surface" aria-hidden>
        <div
          className="h-full rounded-pill bg-brand-strong"
          style={{ width: `${Math.round((value / max) * 100)}%` }}
        />
      </div>
    </li>
  );
}

function Breakdown({ title, rows }: { title: string; rows: ReportRow[] }) {
  const max = Math.max(1, ...rows.map((row) => row.revenue));
  return (
    <Panel title={title}>
      {rows.length === 0 ? (
        <p className="text-[13px] text-muted">در این بازه فروشی نیست.</p>
      ) : (
        <ul className="grid gap-2.5">
          {rows.slice(0, 10).map((row) => (
            <Bar
              key={row.key}
              label={row.label}
              value={row.revenue}
              max={max}
              note={`${formatNumberFa(row.units)} عدد`}
            />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular text-ink">{value}</dd>
    </div>
  );
}
