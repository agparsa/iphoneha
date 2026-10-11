import { notFound } from 'next/navigation';
import { formatNumberFa, toPersianDigits } from '@iphoneha/shared';
import { getAdminOrder } from '@/lib/api/admin';
import { getStorefrontConfig } from '@/lib/api/endpoints';
import { BrandMark } from '@/components/brand/brand';
import { PrintBar } from '@/components/admin/backoffice/print-bar';

export const metadata = { title: 'برچسب ارسال' };

/** A 10 × 15 cm label for the parcel: who it is from, who it goes to, and the order it belongs to. */
export default async function ShippingLabelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [order, config] = await Promise.all([getAdminOrder(id), getStorefrontConfig()]);
  if (!order) notFound();
  const to = order.shippingAddress;
  const units = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <>
      <style>{`@page { size: 100mm 150mm; margin: 0; }`}</style>
      <PrintBar
        title={`برچسب ارسال ${order.orderNumber}`}
        hint="برای چاپگر برچسب ۱۰×۱۵ سانتی‌متر؛ روی A4 هم بالای صفحه چاپ می‌شود."
      />
      <article className="mx-auto flex h-[150mm] w-[100mm] flex-col gap-3 overflow-hidden bg-white p-[6mm] text-[12px] leading-6 text-ink shadow-sm print:shadow-none">
        <header className="flex items-center justify-between border-b-2 border-ink pb-2">
          <div className="flex items-center gap-2">
            <BrandMark className="size-9" />
            <div>
              <p className="text-[13px] font-bold">{config.store.name}</p>
              <p className="font-display text-[11px]" dir="ltr">
                {toPersianDigits(config.store.phone)}
              </p>
            </div>
          </div>
          <p className="font-display text-[20px] font-bold tracking-wide">{order.orderNumber}</p>
        </header>

        <section className="grid gap-0.5">
          <p className="text-[11px] text-muted">فرستنده</p>
          <p className="text-[11px]">{config.store.address || config.store.name}</p>
        </section>

        <section className="grid flex-1 content-start gap-1 rounded-lg border-2 border-ink p-3">
          <p className="text-[11px] text-muted">گیرنده</p>
          <p className="text-[18px] font-bold leading-7">{to.recipientName}</p>
          <p className="font-display text-[16px] font-semibold" dir="ltr">
            {toPersianDigits(to.mobile)}
          </p>
          <p className="text-[14px] font-semibold">
            {to.province}، {to.city}
          </p>
          <p className="text-[13px] leading-6">
            {to.addressLine}
            {to.plaque ? `، پلاک ${to.plaque}` : ''}
            {to.unit ? `، واحد ${to.unit}` : ''}
          </p>
          <p className="mt-1 text-[13px]">
            کد پستی:{' '}
            <span className="font-display text-[15px] font-bold tracking-wider">
              {toPersianDigits(to.postalCode)}
            </span>
          </p>
        </section>

        <footer className="flex items-center justify-between border-t border-ink/30 pt-2 text-[11px]">
          <span>{order.shippingMethod.name}</span>
          <span>{formatNumberFa(units)} قلم</span>
          {order.trackingCode ? <span className="font-display">{order.trackingCode}</span> : null}
        </footer>
      </article>
    </>
  );
}
