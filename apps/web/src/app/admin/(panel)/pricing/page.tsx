import { notFound } from 'next/navigation';
import { formatToman } from '@iphoneha/shared';
import { getAdminMe, getPriceHistory, getPricingTable } from '@/lib/api/admin';
import { formatDateTimeFa } from '@/lib/utils';
import { PageHeader, Panel } from '@/components/admin/ui';
import { PricingTable } from '@/components/admin/backoffice/pricing-table';

export const metadata = { title: 'قیمت‌ها' };

export default async function PricingPage() {
  const admin = await getAdminMe();
  if (!admin?.permissions.includes('products.read')) notFound();
  const [rows, history] = await Promise.all([getPricingTable({}), getPriceHistory()]);
  const canWrite = Boolean(admin?.permissions.includes('products.write'));

  return (
    <div>
      <PageHeader
        title="قیمت‌ها"
        description="همهٔ رنگ‌ها و حافظه‌ها در یک جدول: روی قیمت بزن تا ویرایش شود، یا چند ردیف را انتخاب کن و گروهی تغییر بده (اول پیش‌نمایش)"
      />
      <div className="grid gap-4">
        <PricingTable rows={rows} canWrite={canWrite} />
        <Panel title="تغییرهای اخیر قیمت">
          {history.length === 0 ? (
            <p className="text-[13px] text-muted">هنوز تغییری ثبت نشده.</p>
          ) : (
            <ul className="grid gap-1.5 text-[12px]">
              {history.slice(0, 30).map((change) => (
                <li
                  key={change.id}
                  className="flex flex-wrap justify-between gap-2 border-b border-line pb-1.5 last:border-0"
                >
                  <span className="text-ink">{change.title}</span>
                  <span className="tabular text-muted">
                    {formatToman(change.oldPrice)} ←{' '}
                    <span className="text-ink">{formatToman(change.newPrice)}</span> ·{' '}
                    {change.adminName ?? '—'} · {formatDateTimeFa(change.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
