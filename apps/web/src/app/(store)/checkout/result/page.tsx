import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import type { PaymentResultDto } from '@iphoneha/shared';
import { getOrder, getStorefrontConfig } from '@/lib/api/endpoints';
import { apiGetOptional } from '@/lib/api/server';
import { Button } from '@/components/ui/button';
import { PurchaseTracker } from '@/components/analytics/purchase-tracker';
import { ResultRefresher } from '@/components/store/result-refresher';

export const metadata: Metadata = {
  title: 'نتیجه پرداخت',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ order?: string; status?: string }>;

export default async function CheckoutResultPage({ searchParams }: { searchParams: SearchParams }) {
  const { order: orderNumber, status } = await searchParams;

  const result = orderNumber
    ? await apiGetOptional<PaymentResultDto>(`/payments/result/${orderNumber}`)
    : null;

  const success = result ? result.success : status === 'success';
  // a payment the gateway has not settled yet is «pending», never «failed»:
  // the customer may well have paid and the store is still confirming it
  const pending =
    !success &&
    (result
      ? result.paymentStatus === 'PENDING' || result.paymentStatus === 'INITIATED'
      : status !== 'failed' && status !== 'cancelled');

  // a confirmed sale is reported to analytics (only when the owner turned it on)
  const { seo } = await getStorefrontConfig();
  const paidOrder =
    result?.success && seo?.ga4MeasurementId
      ? // analytics never takes the result page down
        await getOrder(encodeURIComponent(result.orderNumber)).catch(() => null)
      : null;

  const Icon = success ? CheckCircle2 : pending ? Clock : XCircle;
  const tone = success ? 'text-success' : pending ? 'text-warning' : 'text-danger';

  return (
    <div className="container-page flex justify-center py-10 md:py-16">
      <div className="w-full max-w-md rounded-panel border border-line p-6 text-center">
        <span className={`mx-auto grid size-14 place-items-center rounded-full bg-surface ${tone}`}>
          <Icon className="size-7" aria-hidden />
        </span>

        <h1 className="mt-5 text-xl font-semibold text-ink">
          {success ? 'پرداخت با موفقیت انجام شد' : pending ? 'در انتظار تأیید پرداخت' : 'پرداخت ناموفق بود'}
        </h1>
        <p className="mt-3 text-[13px] leading-7 text-muted">
          {pending
            ? 'نتیجه پرداخت هنوز قطعی نشده است. اگر مبلغی از حساب شما کسر شده، پس از تأیید درگاه سفارش ثبت می‌شود و در غیر این صورت مبلغ خودکار به حسابتان برمی‌گردد.'
            : (result?.message ??
              (success
                ? 'سفارش شما ثبت شد و به‌زودی برای ارسال آماده می‌شود.'
                : 'اگر مبلغی از حساب شما کسر شده باشد، خودکار به حسابتان برمی‌گردد. می‌توانی دوباره تلاش کنی.'))}
        </p>

        {result ? (
          <dl className="mt-6 grid gap-2.5 rounded-2xl bg-surface-2 p-4 text-[13px]">
            <div className="flex items-center justify-between">
              <dt className="text-muted">شماره سفارش</dt>
              <dd className="font-medium text-ink font-display">{result.orderNumber}</dd>
            </div>
            {result.trackingCode ? (
              <div className="flex items-center justify-between">
                <dt className="text-muted">کد پیگیری</dt>
                <dd className="font-medium text-ink font-display">{result.trackingCode}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        <div className="mt-6 grid gap-2">
          <Button asChild block size="lg">
            <Link href="/account/orders">پیگیری سفارش‌ها</Link>
          </Button>
          <Button asChild block size="md" variant="ghost">
            <Link href="/shop">ادامه خرید</Link>
          </Button>
        </div>

        {pending && orderNumber ? <ResultRefresher /> : null}
        {paidOrder ? <PurchaseTracker order={paidOrder} /> : null}
      </div>
    </div>
  );
}
