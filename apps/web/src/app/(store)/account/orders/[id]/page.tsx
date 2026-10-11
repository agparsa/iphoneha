import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Truck } from 'lucide-react';
import {
  ORDER_STATUS_LABELS,
  paymentMethodName,
  PICKUP_METHOD,
  PAYMENT_STATUS_LABELS,
  formatNumberFa,
  formatToman,
} from '@iphoneha/shared';
import { getOrder } from '@/lib/api/endpoints';
import { formatDateTimeFa } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ProductImage } from '@/components/store/product-image';
import { OrderActions } from '@/components/store/order-actions';

export const metadata: Metadata = { title: 'جزئیات سفارش', robots: { index: false, follow: false } };

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) notFound();

  return (
    <div className="grid gap-4">
      <Link
        href="/account/orders"
        className="inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-ink"
      >
        <ArrowRight className="size-4" aria-hidden />
        بازگشت به سفارش‌ها
      </Link>

      <section className="rounded-panel border border-line p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-ink font-display">{order.orderNumber}</h2>
            <p className="mt-1 text-[11px] text-muted">{formatDateTimeFa(order.createdAt)}</p>
          </div>
          <Badge
            tone={
              order.status === 'DELIVERED'
                ? 'success'
                : order.status === 'CANCELLED' || order.status === 'REFUNDED'
                  ? 'danger'
                  : 'neutral'
            }
          >
            {order.statusLabel}
          </Badge>
        </div>

        <OrderActions order={order} />
      </section>

      <section className="rounded-panel border border-line">
        <h3 className="border-b border-line px-5 py-4 text-[13px] font-semibold text-ink">کالاهای سفارش</h3>
        <ul className="divide-y divide-line">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-5 py-3.5">
              <span className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-surface-2">
                <ProductImage src={item.imageUrl} alt={item.productName} sizes="64px" className="p-1" />
              </span>
              <span className="min-w-0 flex-1">
                <Link
                  href={`/iphone/${item.productSlug}`}
                  className="block truncate text-[13px] font-medium text-ink"
                >
                  {item.productName}
                </Link>
                <span className="mt-0.5 block text-[11px] text-muted">
                  {item.variantTitle} · {formatNumberFa(item.quantity)} عدد
                </span>
                <span className="mt-0.5 block text-[11px] text-muted-faint">
                  <Truck className="me-1 inline size-3" aria-hidden />
                  {item.shippingTimeLabel}
                </span>
              </span>
              <span className="shrink-0 text-[13px] font-medium text-ink tabular">
                {formatToman(item.finalPrice)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-panel border border-line p-5">
          {order.shippingMethod.code === PICKUP_METHOD.code ? (
            <>
              <h3 className="mb-3 text-[13px] font-semibold text-ink">تحویل</h3>
              <p className="text-[13px] text-ink">{PICKUP_METHOD.name}</p>
            </>
          ) : (
            <>
              <h3 className="mb-3 text-[13px] font-semibold text-ink">آدرس تحویل</h3>
              <p className="text-[13px] text-ink">{order.shippingAddress.recipientName}</p>
              <p className="mt-1 text-[12px] leading-6 text-muted">
                {order.shippingAddress.province}، {order.shippingAddress.city} —{' '}
                {order.shippingAddress.addressLine}
              </p>
              <p className="mt-1 text-[11px] text-muted-faint font-display">{order.shippingAddress.mobile}</p>
              <p className="mt-3 border-t border-line pt-3 text-[12px] text-muted">
                {order.shippingMethod.name} — {order.shippingMethod.etaLabel}
              </p>
            </>
          )}
          {order.trackingCode ? (
            <p className="mt-1 text-[12px] text-ink">
              کد رهگیری: <span className="font-display">{order.trackingCode}</span>
            </p>
          ) : null}
        </section>

        <section className="rounded-panel border border-line p-5">
          <h3 className="mb-3 text-[13px] font-semibold text-ink">پرداخت</h3>
          <dl className="grid gap-2.5 text-[13px]">
            <Row label="جمع کالاها" value={formatToman(order.subtotal)} />
            {order.discountTotal > 0 ? (
              <Row label="تخفیف" value={`−${formatToman(order.discountTotal)}`} />
            ) : null}
            <Row
              label="هزینه ارسال"
              value={order.shippingCost === 0 ? 'رایگان' : formatToman(order.shippingCost)}
            />
            <div className="flex items-center justify-between border-t border-line pt-2.5">
              <dt className="font-medium text-ink">مبلغ کل</dt>
              <dd className="text-[15px] font-semibold text-ink tabular">{formatToman(order.total)}</dd>
            </div>
          </dl>

          <ul className="mt-4 grid gap-2 border-t border-line pt-4">
            {order.payments.map((payment) => (
              <li key={payment.id} className="flex items-center justify-between gap-2 text-[12px]">
                <span className="text-muted">{paymentMethodName(payment.method)}</span>
                <Badge
                  tone={
                    payment.status === 'SUCCEEDED'
                      ? 'success'
                      : payment.status === 'FAILED'
                        ? 'danger'
                        : 'neutral'
                  }
                >
                  {PAYMENT_STATUS_LABELS[payment.status]}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-panel border border-line p-5">
        <h3 className="mb-4 text-[13px] font-semibold text-ink">روند سفارش</h3>
        <ol className="relative grid gap-4 ps-5">
          <span className="absolute inset-y-1 start-1.5 w-px bg-line" aria-hidden />
          {order.history.map((entry) => (
            <li key={entry.id} className="relative">
              <span className="absolute -start-[1.05rem] top-1.5 size-2 rounded-full bg-ink" aria-hidden />
              <p className="text-[13px] text-ink">{ORDER_STATUS_LABELS[entry.toStatus]}</p>
              <p className="mt-0.5 text-[11px] text-muted">{formatDateTimeFa(entry.createdAt)}</p>
              {entry.note ? <p className="mt-1 text-[11px] text-muted-faint">{entry.note}</p> : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-ink tabular">{value}</dd>
    </div>
  );
}
