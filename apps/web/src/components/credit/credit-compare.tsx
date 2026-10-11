import {
  formatNumberFa,
  formatPercentFa,
  type CreditMethod,
  type StorefrontConfigDto,
} from '@iphoneha/shared';
import { CREDIT_PAGES, offeredMethods, planDocuments, planOf } from '@/lib/credit';

type Config = Pick<StorefrontConfigDto, 'credit' | 'installments'>;

interface Column {
  key: string;
  title: string;
  values: Record<string, string>;
}

function storeColumn(config: Config, method: CreditMethod): Column {
  const plan = planOf(config, method);
  const later = 'پس از بررسی اعلام می‌شود';
  return {
    key: method,
    title: CREDIT_PAGES[method].title,
    values: {
      down:
        plan.minDownPaymentPercent === null
          ? later
          : plan.minDownPaymentPercent === 0
            ? 'ندارد'
            : `از ${formatNumberFa(plan.minDownPaymentPercent)}٪ قیمت`,
      months: plan.maxMonths === null ? later : `تا ${formatNumberFa(plan.maxMonths)} ماه`,
      fee:
        plan.monthlyFeePercent === null
          ? 'پیش از قرارداد اعلام می‌شود'
          : plan.monthlyFeePercent === 0
            ? 'ندارد'
            : `${formatPercentFa(plan.monthlyFeePercent)}٪ در ماه روی مانده`,
      guarantee: method === 'CHEQUE' ? 'چک صیادی ثبت‌شده به نام فروشگاه' : 'سفتهٔ کاغذی یا الکترونیک',
      guarantor: plan.guarantor || 'بسته به مبلغ اقساط',
      documents: planDocuments(plan, method).join('، '),
      fit: method === 'CHEQUE' ? 'دارندگان دسته‌چک صیادی' : 'کسی که دسته‌چک ندارد',
    },
  };
}

function servicesColumn(config: Config): Column | null {
  const terms = config.installments;
  if (terms.length === 0) return null;
  const minDown = Math.min(...terms.map((term) => term.minDownPaymentPercent));
  const maxMonths = Math.max(...terms.map((term) => term.maxInstallments));
  return {
    key: 'services',
    title: 'سرویس‌های اعتباری',
    values: {
      down: minDown === 0 ? 'در بعضی سرویس‌ها بدون پیش‌پرداخت' : `از ${formatNumberFa(minDown)}٪ قیمت`,
      months: `تا ${formatNumberFa(maxMonths)} ماه`,
      fee: 'طبق تعرفهٔ هر سرویس',
      guarantee: 'اعتبار سرویس',
      guarantor: 'ندارد',
      documents: 'احراز هویت آنلاین در خود سرویس',
      fit: 'خرید آنلاین و سریع',
    },
  };
}

const ROWS: { key: string; label: string }[] = [
  { key: 'down', label: 'پیش‌پرداخت' },
  { key: 'months', label: 'تعداد اقساط' },
  { key: 'fee', label: 'کارمزد' },
  { key: 'guarantee', label: 'تضمین اقساط' },
  { key: 'guarantor', label: 'ضامن' },
  { key: 'documents', label: 'مدارک' },
  { key: 'fit', label: 'مناسب برای' },
];

/** Cheque vs promissory note (vs the online services, once live), from the owner's own figures. */
export function CreditCompare({ config }: { config: Config }) {
  const columns = [
    ...offeredMethods(config).map((method) => storeColumn(config, method)),
    servicesColumn(config),
  ].filter((column): column is Column => column !== null);
  if (columns.length < 2) return null;

  return (
    <div className="overflow-x-auto rounded-panel border border-line">
      <table className="w-full min-w-[34rem] border-collapse text-start text-[13px]">
        <caption className="sr-only">مقایسهٔ روش‌های خرید آیفون قسطی</caption>
        <thead className="bg-surface-2 text-[12px] text-muted">
          <tr>
            <th scope="col" className="w-28 px-4 py-3 text-start font-medium">
              <span className="sr-only">ویژگی</span>
            </th>
            {columns.map((column) => (
              <th key={column.key} scope="col" className="px-4 py-3 text-start font-semibold text-ink">
                {column.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.key} className="border-t border-line">
              <th scope="row" className="px-4 py-3 text-start text-[12px] font-medium text-muted">
                {row.label}
              </th>
              {columns.map((column) => (
                <td key={column.key} className="px-4 py-3 leading-6 text-ink-muted">
                  {column.values[row.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
