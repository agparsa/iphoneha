import Link from 'next/link';
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_INFO,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_LABELS,
  formatToman,
} from '@iphoneha/shared';
import { listAdminPayments } from '@/lib/api/admin';
import { formatDateTimeFa } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { EmptyRow, PageHeader, Table, TablePagination, Td, Th } from '@/components/admin/ui';
import { AdminSearch } from '@/components/admin/admin-search';
import { PaymentTransactions } from '@/components/admin/payment-transactions';

type SearchParams = Promise<{ q?: string; status?: string; method?: string; page?: string }>;

export default async function AdminPaymentsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const payments = await listAdminPayments({
    q: params.q,
    status: params.status,
    method: params.method,
    page: params.page ?? '1',
    pageSize: '20',
  });

  return (
    <div>
      <PageHeader title="پرداخت‌ها" description="تراکنش‌های درگاه‌های نقدی و اقساطی" />

      <div className="mb-4 grid gap-3">
        <AdminSearch placeholder="شماره سفارش، کد پیگیری یا موبایل…" />
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          <Chip label="همه وضعیت‌ها" href="/admin/payments" active={!params.status} />
          {PAYMENT_STATUSES.map((status) => (
            <Chip
              key={status}
              label={PAYMENT_STATUS_LABELS[status]}
              href={`/admin/payments?status=${status}`}
              active={params.status === status}
            />
          ))}
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          <Chip label="همه روش‌ها" href="/admin/payments" active={!params.method} />
          {PAYMENT_METHODS.map((method) => (
            <Chip
              key={method}
              label={PAYMENT_METHOD_INFO[method].name}
              href={`/admin/payments?method=${method}`}
              active={params.method === method}
            />
          ))}
        </div>
      </div>

      <Table>
        <thead>
          <tr>
            <Th>سفارش</Th>
            <Th>مشتری</Th>
            <Th>روش</Th>
            <Th>مبلغ</Th>
            <Th>وضعیت</Th>
            <Th>کد پیگیری</Th>
            <Th>تاریخ</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {payments.items.length === 0 ? (
            <EmptyRow colSpan={8} />
          ) : (
            payments.items.map((payment) => (
              <tr key={payment.id} className="transition-colors hover:bg-surface-2">
                <Td>
                  <Link
                    href={`/admin/orders/${payment.orderId}`}
                    className="font-display text-ink hover:underline"
                  >
                    {payment.orderNumber}
                  </Link>
                </Td>
                <Td className="whitespace-nowrap font-display text-[12px]">{payment.customerPhone}</Td>
                <Td className="text-[12px]">{payment.methodName}</Td>
                <Td className="tabular whitespace-nowrap">{formatToman(payment.amount)}</Td>
                <Td>
                  <Badge
                    tone={
                      payment.status === 'SUCCEEDED'
                        ? 'success'
                        : payment.status === 'FAILED' || payment.status === 'EXPIRED'
                          ? 'danger'
                          : payment.status === 'REFUNDED'
                            ? 'warning'
                            : 'neutral'
                    }
                  >
                    {payment.statusLabel}
                  </Badge>
                </Td>
                <Td className="font-display text-[11px]">{payment.trackingCode ?? '—'}</Td>
                <Td className="text-[12px]">{formatDateTimeFa(payment.createdAt)}</Td>
                <Td>
                  <PaymentTransactions
                    paymentId={payment.id}
                    orderNumber={payment.orderNumber}
                    method={payment.method}
                    amount={payment.amount}
                  />
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>

      <TablePagination
        page={payments.page}
        totalPages={payments.totalPages}
        total={payments.total}
        basePath="/admin/payments"
        params={params}
      />
    </div>
  );
}

function Chip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`shrink-0 rounded-pill border px-3 py-1.5 text-[12px] transition-colors ${
        active ? 'border-ink bg-ink text-white' : 'border-line text-ink-muted hover:bg-surface'
      }`}
    >
      {label}
    </Link>
  );
}
