import { formatDecimalFa, formatNumberFa } from '@iphoneha/shared';
import type { StoreSettings, StorefrontHomeDto } from '@iphoneha/shared';

interface Item {
  value: string;
  label: string;
}

/**
 * Four numbers that describe the store — each one straight from the catalogue
 * or from the store's own settings, so none of them can claim something the
 * store does not offer (no installment count without a live service, no
 * rating without real ratings).
 */
export function StatsBand({
  stats,
  store,
}: {
  stats: StorefrontHomeDto['stats'];
  store: Pick<StoreSettings, 'warrantyMonths' | 'returnDays'>;
}) {
  const candidates: (Item | null)[] = [
    { value: formatNumberFa(stats.products), label: 'مدل آیفون فعال' },
    { value: formatNumberFa(stats.variants), label: 'ترکیب رنگ و حافظه' },
    stats.installmentServices > 0
      ? { value: formatNumberFa(stats.installmentServices), label: 'سرویس خرید قسطی' }
      : null,
    stats.ratingAvg && stats.ratingCount > 0
      ? {
          value: `${formatDecimalFa(stats.ratingAvg)} از ۵`,
          label: `میانگین امتیاز ${formatNumberFa(stats.ratingCount)} خریدار`,
        }
      : null,
    store.warrantyMonths > 0
      ? { value: `${formatNumberFa(store.warrantyMonths)} ماه`, label: 'گارانتی فروشگاه' }
      : null,
    store.returnDays > 0
      ? { value: `${formatNumberFa(store.returnDays)} روز`, label: 'مهلت بازگشت کالا' }
      : null,
    { value: '۱۰۰٪', label: 'ضمانت اصالت کالا' },
  ];
  const items = candidates.filter((item): item is Item => item !== null).slice(0, 4);

  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line bg-line md:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="bg-canvas px-5 py-6 text-center">
          <dt className="sr-only">{item.label}</dt>
          <dd>
            <span className="block font-display text-2xl font-semibold text-ink tabular sm:text-[28px]">
              {item.value}
            </span>
            <span className="mt-1.5 block text-[12px] leading-5 text-muted">{item.label}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
