import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, NotebookPen, Printer, Tag } from 'lucide-react';
import {
  ORDER_SOURCE_LABELS,
  ORDER_STATUS_LABELS,
  PAID_ORDER_STATUSES,
  PICKUP_METHOD,
  paymentMethodName,
  PAYMENT_STATUS_LABELS,
  formatNumberFa,
  formatToman,
} from '@iphoneha/shared';
import { getAdminMe, getAdminOrder } from '@/lib/api/admin';
import { formatDateTimeFa } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { PageHeader, Table, Td, Th } from '@/components/admin/ui';
import { OrderStatusForm } from '@/components/admin/order-status-form';
import { RefundButton } from '@/components/admin/refund-button';
import { OrderDevicesDialog, OrderNoteForm } from '@/components/admin/backoffice/order-extras';
import { orderTone } from '@/lib/backoffice';

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [order, admin] = await Promise.all([getAdminOrder(id), getAdminMe()]);
  if (!order) notFound();

  const canWriteOrders = admin?.permissions.includes('orders.write') ?? false;
  const canRefund = admin?.permissions.includes('payments.refund') ?? false;
  const canAssignDevices =
    canWriteOrders &&
    Boolean(admin?.permissions.includes('inventory.write')) &&
    PAID_ORDER_STATUSES.includes(order.status);
  const canSeeLedger = admin?.permissions.includes('installments.read') ?? false;
  const pickup = order.shippingMethod.code === PICKUP_METHOD.code;
  const recordedBy =
    order.source !== 'WEBSITE'
      ? `ثبت ${ORDER_SOURCE_LABELS[order.source]}${order.createdByName ? ` توسط ${order.createdByName}` : ''}`
      : null;

  return (
    <div>
      <Link
        href="/admin/orders"
        className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-ink"
      >
        <ArrowRight className="size-4" aria-hidden />
        بازگشت به سفارش‌ها
      </Link>

      <PageHeader
        title={`سفارش ${order.orderNumber}`}
        description={[
          `${order.customerName} — ${order.customerPhone}`,
          formatDateTimeFa(order.createdAt),
          recordedBy,
        ]
          .filter(Boolean)
          .join(' · ')}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={orderTone(order.status)}>{order.statusLabel}</Badge>
            {order.source !== 'WEBSITE' ? (
              <Badge tone="info">{ORDER_SOURCE_LABELS[order.source]}</Badge>
            ) : null}
            <Link
              href={`/admin/print/invoice/${order.id}`}
              target="_blank"
              className="inline-flex h-9 items-center gap-2 rounded-pill border border-line-strong px-4 text-[13px] text-ink hover:bg-surface"
            >
              <Printer className="size-4" aria-hidden />
              فاکتور
            </Link>
            {!pickup ? (
              <Link
                href={`/admin/print/label/${order.id}`}
                target="_blank"
                className="inline-flex h-9 items-center gap-2 rounded-pill border border-line-strong px-4 text-[13px] text-ink hover:bg-surface"
              >
                <Tag className="size-4" aria-hidden />
                برچسب ارسال
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 content-start gap-4">
          <Table>
            <thead>
              <tr>
                <Th>کالا</Th>
                <Th>IMEI</Th>
                <Th>تعداد</Th>
                <Th>قیمت واحد</Th>
                <Th>جمع</Th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id}>
                  <Td>
                    <span className="block text-ink">{item.productName}</span>
                    <span className="block text-[11px] text-muted">{item.variantTitle}</span>
                    <span className="block font-display text-[11px] text-muted-faint">{item.sku}</span>
                  </Td>
                  <Td className="whitespace-nowrap font-display text-[12px]">
                    {order.devices.filter((device) => device.orderItemId === item.id).length ? (
                      order.devices
                        .filter((device) => device.orderItemId === item.id)
                        .map((device) => (
                          <Link
                            key={device.id}
                            href={`/admin/devices?q=${device.imei}`}
                            className="block text-ink hover:underline"
                            dir="ltr"
                          >
                            {device.imei}
                          </Link>
                        ))
                    ) : (
                      <span className="text-muted-faint">—</span>
                    )}
                  </Td>
                  <Td className="tabular whitespace-nowrap">{formatNumberFa(item.quantity)}</Td>
                  <Td className="tabular whitespace-nowrap">{formatToman(item.unitPrice)}</Td>
                  <Td className="tabular whitespace-nowrap">{formatToman(item.finalPrice)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {canAssignDevices ? (
            <div className="-mt-2 flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
              <span>
                {order.devices.length
                  ? `${formatNumberFa(order.devices.length)} گوشی با IMEI روی این سفارش`
                  : 'IMEI گوشی‌هایی که تحویل می‌شوند را ثبت کن تا روی فاکتور بیاید.'}
              </span>
              <OrderDevicesDialog order={order} />
            </div>
          ) : null}

          {order.contract ? (
            <section className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-info-soft/40 p-5">
              <div>
                <h2 className="text-[15px] font-semibold text-ink">
                  قرارداد اقساط شمارهٔ {formatNumberFa(order.contract.number)}
                </h2>
                <p className="mt-1 text-[12px] text-muted">وضعیت: {order.contract.statusLabel}</p>
              </div>
              {canSeeLedger ? (
                <Link
                  href={`/admin/installments/${order.contract.id}`}
                  className="inline-flex h-9 items-center gap-2 rounded-pill bg-ink px-4 text-[13px] text-white hover:bg-ink-soft"
                >
                  <NotebookPen className="size-4" aria-hidden />
                  دفتر اقساط این قرارداد
                </Link>
              ) : null}
            </section>
          ) : null}

          <section className="rounded-panel border border-line p-5">
            <h2 className="mb-4 text-[15px] font-semibold text-ink">تاریخچه وضعیت</h2>
            <ol className="relative grid gap-4 ps-5">
              <span className="absolute inset-y-1 start-1.5 w-px bg-line" aria-hidden />
              {order.history.map((entry) => (
                <li key={entry.id} className="relative">
                  <span
                    className="absolute -start-[1.05rem] top-1.5 size-2 rounded-full bg-ink"
                    aria-hidden
                  />
                  <p className="text-[13px] text-ink">
                    {ORDER_STATUS_LABELS[entry.toStatus]}
                    <span className="ms-2 text-[11px] text-muted">
                      {entry.adminName
                        ? `توسط ${entry.adminName}`
                        : entry.actor === 'SYSTEM'
                          ? 'سیستم'
                          : 'مشتری'}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">{formatDateTimeFa(entry.createdAt)}</p>
                  {entry.note ? <p className="mt-1 text-[11px] text-muted-faint">{entry.note}</p> : null}
                </li>
              ))}
            </ol>
          </section>

          {order.reservations.length > 0 ? (
            <section className="rounded-panel border border-line p-5">
              <h2 className="mb-3 text-[15px] font-semibold text-ink">رزروهای موجودی</h2>
              <ul className="grid gap-2 text-[12px]">
                {order.reservations.map((reservation) => (
                  <li
                    key={`${reservation.variantId}-${reservation.expiresAt}`}
                    className="flex justify-between gap-3"
                  >
                    <span className="font-display text-muted">{reservation.sku}</span>
                    <span className="text-ink">
                      {formatNumberFa(reservation.quantity)} عدد — {reservation.status} تا{' '}
                      {formatDateTimeFa(reservation.expiresAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <div className="grid min-w-0 content-start gap-4">
          {canWriteOrders ? (
            <section className="rounded-panel border border-line p-5">
              <h2 className="mb-4 text-[15px] font-semibold text-ink">تغییر وضعیت</h2>
              <OrderStatusForm
                orderId={order.id}
                current={order.status}
                allowed={order.allowedTransitions}
                trackingCode={order.trackingCode}
              />
            </section>
          ) : null}

          <section className="rounded-panel border border-line p-5">
            <h2 className="mb-3 text-[15px] font-semibold text-ink">خلاصه مالی</h2>
            <dl className="grid gap-2.5 text-[13px]">
              <Row label="جمع کالاها" value={formatToman(order.subtotal)} />
              {order.discountTotal > 0 ? (
                <Row label="تخفیف" value={`−${formatToman(order.discountTotal)}`} />
              ) : null}
              <Row
                label="ارسال"
                value={order.shippingCost === 0 ? 'رایگان' : formatToman(order.shippingCost)}
              />
              <div className="flex items-center justify-between border-t border-line pt-2.5">
                <dt className="font-medium text-ink">مبلغ کل</dt>
                <dd className="text-[15px] font-semibold text-ink tabular">{formatToman(order.total)}</dd>
              </div>
            </dl>

            <ul className="mt-4 grid gap-3 border-t border-line pt-4">
              {order.payments.map((payment) => (
                <li key={payment.id} className="text-[12px]">
                  <div className="flex items-center justify-between gap-2">
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
                  </div>
                  {payment.trackingCode ? (
                    <p className="mt-1 text-[11px] text-muted-faint font-display">{payment.trackingCode}</p>
                  ) : null}
                  {canRefund && payment.status === 'SUCCEEDED' ? (
                    <RefundButton paymentId={payment.id} amount={payment.amount} />
                  ) : null}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-panel border border-line p-5">
            <h2 className="mb-3 text-[15px] font-semibold text-ink">{pickup ? 'تحویل' : 'آدرس تحویل'}</h2>
            {pickup ? (
              <p className="text-[13px] text-ink">{PICKUP_METHOD.name}</p>
            ) : (
              <>
                <p className="text-[13px] text-ink">{order.shippingAddress.recipientName}</p>
                <p className="mt-1 text-[12px] leading-6 text-muted">
                  {order.shippingAddress.province}، {order.shippingAddress.city} —{' '}
                  {order.shippingAddress.addressLine}
                </p>
                <p className="mt-1 text-[11px] text-muted-faint font-display">
                  {order.shippingAddress.mobile} · {order.shippingAddress.postalCode}
                </p>
                <p className="mt-3 border-t border-line pt-3 text-[12px] text-muted">
                  {order.shippingMethod.name} — {order.shippingMethod.etaLabel}
                </p>
              </>
            )}
            {order.notes ? <p className="mt-2 text-[12px] text-muted">یادداشت مشتری: {order.notes}</p> : null}
            <p className="mt-3 border-t border-line pt-3 text-[12px]">
              <Link href={`/admin/users/${order.user.id}`} className="text-ink hover:underline">
                پروندهٔ مشتری
              </Link>
            </p>
          </section>

          {canWriteOrders ? (
            <section className="rounded-panel border border-line p-5">
              <OrderNoteForm orderId={order.id} note={order.adminNote} />
            </section>
          ) : order.adminNote ? (
            <section className="rounded-panel border border-line p-5 text-[12px] text-muted">
              یادداشت داخلی: {order.adminNote}
            </section>
          ) : null}
        </div>
      </div>
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
