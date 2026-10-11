import { notFound } from 'next/navigation';
import {
  PICKUP_METHOD,
  formatNumberFa,
  formatToman,
  paymentMethodName,
  toPersianDigits,
} from '@iphoneha/shared';
import { getAdminOrder } from '@/lib/api/admin';
import { getStorefrontConfig } from '@/lib/api/endpoints';
import { formatDateFa } from '@/lib/utils';
import { BrandMark } from '@/components/brand/brand';
import { PrintBar } from '@/components/admin/backoffice/print-bar';

export const metadata = { title: 'فاکتور فروش' };

const cell = 'border border-ink/25 px-2 py-1.5 align-top';

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [order, config] = await Promise.all([getAdminOrder(id), getStorefrontConfig()]);
  if (!order) notFound();
  const store = config.store;
  const pickup = order.shippingMethod.code === PICKUP_METHOD.code;
  const address = order.shippingAddress;
  const paid = order.payments.filter(
    (payment) => payment.status === 'SUCCEEDED' || payment.status === 'REFUNDED',
  );

  return (
    <>
      <style>{`@page { size: A4; margin: 12mm; }`}</style>
      <PrintBar
        title={`فاکتور ${order.orderNumber}`}
        hint="کاغذ A4 — در پنجرهٔ چاپ «Headers and footers» را خاموش کن."
      />
      <article className="mx-auto max-w-[210mm] bg-white p-[12mm] text-[12px] leading-6 text-ink shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b-2 border-ink pb-4">
          <div className="flex items-center gap-3">
            <BrandMark className="size-12" />
            <div>
              <p className="text-[16px] font-bold">{store.legalName || store.name}</p>
              {store.legalName && store.legalName !== store.name ? (
                <p className="text-muted">{store.name}</p>
              ) : null}
              {store.address ? <p className="max-w-[90mm] text-[11px] text-muted">{store.address}</p> : null}
              <p className="text-[11px] text-muted">
                تلفن:{' '}
                <span className="font-display" dir="ltr">
                  {toPersianDigits(store.phone)}
                </span>
              </p>
            </div>
          </div>
          <div className="text-end">
            <h1 className="text-[18px] font-bold">فاکتور فروش</h1>
            <p>
              شماره: <span className="font-display font-semibold">{order.orderNumber}</span>
            </p>
            <p>تاریخ: {formatDateFa(order.createdAt)}</p>
          </div>
        </header>

        <section className="mt-4 grid grid-cols-2 gap-4 rounded-lg border border-ink/25 p-3">
          <div>
            <p className="font-semibold">خریدار</p>
            <p>{order.customerName}</p>
            <p>
              موبایل:{' '}
              <span className="font-display" dir="ltr">
                {toPersianDigits(order.customerPhone)}
              </span>
            </p>
          </div>
          <div>
            <p className="font-semibold">{pickup ? 'تحویل' : 'نشانی تحویل'}</p>
            {pickup ? (
              <p>{PICKUP_METHOD.name}</p>
            ) : (
              <>
                <p>
                  {address.province}، {address.city} — {address.addressLine}
                  {address.plaque ? `، پلاک ${address.plaque}` : ''}
                  {address.unit ? `، واحد ${address.unit}` : ''}
                </p>
                <p>
                  گیرنده: {address.recipientName} · کد پستی:{' '}
                  <span className="font-display">{toPersianDigits(address.postalCode)}</span>
                </p>
              </>
            )}
          </div>
        </section>

        <table className="mt-4 w-full border-collapse text-start">
          <thead>
            <tr className="bg-ink/5">
              <th className={`${cell} w-8`}>ردیف</th>
              <th className={cell}>شرح کالا</th>
              <th className={cell}>IMEI / سریال</th>
              <th className={`${cell} w-12`}>تعداد</th>
              <th className={cell}>قیمت واحد (تومان)</th>
              <th className={cell}>تخفیف (تومان)</th>
              <th className={cell}>مبلغ (تومان)</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item, index) => {
              const devices = order.devices.filter((device) => device.orderItemId === item.id);
              const listPrice =
                item.compareAtPrice && item.compareAtPrice > item.unitPrice
                  ? item.compareAtPrice
                  : item.unitPrice;
              return (
                <tr key={item.id}>
                  <td className={`${cell} text-center`}>{formatNumberFa(index + 1)}</td>
                  <td className={cell}>
                    <p className="font-medium">{item.productName}</p>
                    <p className="text-[11px] text-muted">{item.variantTitle}</p>
                  </td>
                  <td className={`${cell} font-display text-[11px]`} dir="ltr">
                    {devices.length
                      ? devices.map((device) => (
                          <span key={device.id} className="block">
                            {device.imei}
                            {device.serialNumber ? ` · ${device.serialNumber}` : ''}
                          </span>
                        ))
                      : '—'}
                  </td>
                  <td className={`${cell} text-center tabular`}>{formatNumberFa(item.quantity)}</td>
                  <td className={`${cell} tabular`}>{formatNumberFa(listPrice)}</td>
                  <td className={`${cell} tabular`}>{item.discount ? formatNumberFa(item.discount) : '—'}</td>
                  <td className={`${cell} tabular`}>{formatNumberFa(item.finalPrice)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="mt-4 grid grid-cols-[1fr_auto] gap-6">
          <div className="grid content-start gap-1">
            <p className="font-semibold">پرداخت</p>
            {order.contract ? (
              <p>
                فروش اقساطی ({paymentMethodName(order.paymentMethod)}) — قرارداد شمارهٔ{' '}
                {formatNumberFa(order.contract.number)}؛ پیش‌پرداخت، سررسیدها و چک‌ها در متن قرارداد آمده است.
              </p>
            ) : (
              paid.map((payment) => (
                <p key={payment.id}>
                  {paymentMethodName(payment.method)}
                  {payment.trackingCode ? (
                    <>
                      {' '}
                      — پیگیری: <span className="font-display">{payment.trackingCode}</span>
                    </>
                  ) : null}
                  {payment.status === 'REFUNDED' ? ' (بازپرداخت شد)' : ''}
                </p>
              ))
            )}
            {store.warrantyMonths > 0 ? (
              <p className="mt-2 text-[11px] text-muted">
                گارانتی {formatNumberFa(store.warrantyMonths)} ماههٔ {store.name} با همین فاکتور و IMEI بالا
                اعتبار دارد.
                {store.returnDays > 0
                  ? ` کالای پلمب تا ${formatNumberFa(store.returnDays)} روز پس از تحویل مرجوع می‌شود.`
                  : ''}
              </p>
            ) : null}
          </div>
          <dl className="grid min-w-[70mm] gap-1 rounded-lg border border-ink/25 p-3">
            <Row label="جمع کالاها" value={formatToman(order.subtotal)} />
            {order.itemsDiscount > 0 ? (
              <Row label="تخفیف کالاها" value={`− ${formatToman(order.itemsDiscount)}`} />
            ) : null}
            {order.couponDiscount > 0 ? (
              <Row label="تخفیف فاکتور" value={`− ${formatToman(order.couponDiscount)}`} />
            ) : null}
            <Row
              label="هزینهٔ ارسال"
              value={order.shippingCost ? formatToman(order.shippingCost) : pickup ? '—' : 'رایگان'}
            />
            <div className="mt-1 flex justify-between gap-4 border-t border-ink/25 pt-2 text-[14px] font-bold">
              <dt>مبلغ کل</dt>
              <dd className="tabular">{formatToman(order.total)}</dd>
            </div>
          </dl>
        </div>

        <footer className="mt-10 grid grid-cols-2 gap-6 text-center">
          <div className="h-24 rounded-lg border border-dashed border-ink/30 p-2 text-muted">
            مهر و امضای فروشنده
          </div>
          <div className="h-24 rounded-lg border border-dashed border-ink/30 p-2 text-muted">
            امضای خریدار
          </div>
        </footer>
      </article>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}
