import Link from 'next/link';
import { AlertTriangle, ArrowLeft, NotebookPen, Plus, ScanBarcode } from 'lucide-react';
import { ORDER_STATUS_LABELS, formatNumberFa, formatToman } from '@iphoneha/shared';
import { getAdminMe, getDashboard } from '@/lib/api/admin';
import { formatDateFa } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { EmptyRow, PageHeader, StatCard, Table, Td, Th } from '@/components/admin/ui';
import { SalesChart } from '@/components/admin/sales-chart';

export default async function AdminDashboardPage() {
  const [data, admin] = await Promise.all([getDashboard(), getAdminMe()]);
  const canCreate = Boolean(admin?.permissions.includes('orders.create'));
  const canReceive = Boolean(admin?.permissions.includes('inventory.write'));

  return (
    <div>
      <PageHeader
        title="داشبورد"
        description="نمای کلی فروش، سفارش‌ها و موجودی"
        action={
          <div className="flex flex-wrap gap-2">
            {canReceive ? (
              <Link
                href="/admin/devices"
                className="inline-flex h-9 items-center gap-2 rounded-pill border border-line-strong px-4 text-[13px] text-ink hover:bg-surface"
              >
                <ScanBarcode className="size-4" aria-hidden />
                ورود کالا با IMEI
              </Link>
            ) : null}
            {canCreate ? (
              <Link
                href="/admin/orders/new"
                className="inline-flex h-9 items-center gap-2 rounded-pill bg-brand-strong px-4 text-[13px] font-medium text-white hover:bg-brand-ink"
              >
                <Plus className="size-4" aria-hidden />
                فروش حضوری یا تلفنی
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="فروش امروز"
          value={formatToman(data.today.revenue)}
          hint={`${formatNumberFa(data.today.paidOrders)} سفارش پرداخت‌شده از ${formatNumberFa(data.today.orders)}`}
        />
        <StatCard
          label="فروش ۳۰ روز اخیر"
          value={formatToman(data.last30Days.revenue)}
          hint={`میانگین سبد ${formatToman(data.last30Days.averageOrderValue)}`}
        />
        <StatCard
          label="سفارش‌های ۳۰ روز"
          value={formatNumberFa(data.last30Days.orders)}
          hint={`${formatNumberFa(data.last30Days.paidOrders)} پرداخت‌شده`}
        />
        <StatCard
          label="رزروهای فعال"
          value={formatNumberFa(data.activeReservations)}
          hint={`${formatNumberFa(data.usersCount)} کاربر ثبت‌نام‌شده`}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <section className="rounded-panel border border-line p-5">
          <h2 className="mb-4 text-[15px] font-semibold text-ink">فروش ۳۰ روز اخیر</h2>
          <SalesChart data={data.salesByDay} />
        </section>

        <section className="rounded-panel border border-line p-5">
          <h2 className="mb-4 text-[15px] font-semibold text-ink">سفارش‌ها بر اساس وضعیت</h2>
          <ul className="grid gap-2.5">
            {data.ordersByStatus.map((row) => (
              <li key={row.status} className="flex items-center justify-between gap-3 text-[13px]">
                <span className="text-muted">{row.label}</span>
                <span className="font-medium text-ink tabular">{formatNumberFa(row.count)}</span>
              </li>
            ))}
          </ul>

          <h2 className="mb-3 mt-6 text-[15px] font-semibold text-ink">پرداخت‌ها بر اساس روش</h2>
          <ul className="grid gap-2.5">
            {data.paymentsByMethod.map((row) => (
              <li key={row.method} className="flex items-center justify-between gap-3 text-[13px]">
                <span className="text-muted">{row.name}</span>
                <span className="text-ink tabular">
                  {formatNumberFa(row.count)} — {formatToman(row.amount)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {data.ledger ? (
        <section className="mt-4 rounded-panel border border-line p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="inline-flex items-center gap-2 text-[15px] font-semibold text-ink">
              <NotebookPen className="size-4" aria-hidden />
              دفتر اقساط
            </h2>
            <Link
              href="/admin/installments"
              className="inline-flex items-center gap-0.5 text-[12px] text-muted hover:text-ink"
            >
              سررسیدها و چک‌ها
              <ArrowLeft className="size-3.5" aria-hidden />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="معوق"
              value={formatToman(data.ledger.overdue.amount)}
              hint={`${formatNumberFa(data.ledger.overdue.count)} قسط`}
              tone={data.ledger.overdue.count ? 'danger' : 'neutral'}
            />
            <StatCard
              label="سررسید این هفته"
              value={formatToman(data.ledger.dueNext7Days.amount)}
              hint={`${formatNumberFa(data.ledger.dueNext7Days.count)} قسط`}
            />
            <StatCard
              label="چک برای خواباندن"
              value={formatNumberFa(data.ledger.chequesToDeposit.count)}
              hint={formatToman(data.ledger.chequesToDeposit.amount)}
            />
            <StatCard
              label="مانده کل"
              value={formatToman(data.ledger.outstanding)}
              hint={`${formatNumberFa(data.ledger.activeContracts)} قرارداد فعال`}
            />
          </div>
          {data.ledger.bouncedCheques.count ? (
            <p className="mt-3 text-[12px] text-danger">
              {formatNumberFa(data.ledger.bouncedCheques.count)} چک برگشتی به مبلغ{' '}
              {formatToman(data.ledger.bouncedCheques.amount)} پیگیری می‌خواهد.
            </p>
          ) : null}
        </section>
      ) : null}

      {data.lowStock.length > 0 ? (
        <section className="mt-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="inline-flex items-center gap-2 text-[15px] font-semibold text-ink">
              <AlertTriangle className="size-4 text-warning" aria-hidden />
              موجودی رو به اتمام
            </h2>
            <Link
              href="/admin/inventory?stock=low"
              className="inline-flex items-center gap-0.5 text-[12px] text-muted hover:text-ink"
            >
              مدیریت انبار
              <ArrowLeft className="size-3.5" aria-hidden />
            </Link>
          </div>
          <Table>
            <thead>
              <tr>
                <Th>محصول</Th>
                <Th>ترکیب</Th>
                <Th>SKU</Th>
                <Th>موجودی قابل فروش</Th>
              </tr>
            </thead>
            <tbody>
              {data.lowStock.map((row) => (
                <tr key={row.variantId}>
                  <Td className="text-ink">{row.productName}</Td>
                  <Td>{row.title}</Td>
                  <Td className="whitespace-nowrap font-display text-[12px]">{row.sku}</Td>
                  <Td>
                    <Badge tone={row.available === 0 ? 'danger' : 'warning'}>
                      {formatNumberFa(row.available)} عدد
                    </Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
      ) : null}

      <section className="mt-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-ink">آخرین سفارش‌ها</h2>
          <Link
            href="/admin/orders"
            className="inline-flex items-center gap-0.5 text-[12px] text-muted hover:text-ink"
          >
            همه سفارش‌ها
            <ArrowLeft className="size-3.5" aria-hidden />
          </Link>
        </div>
        <Table>
          <thead>
            <tr>
              <Th>شماره</Th>
              <Th>وضعیت</Th>
              <Th>تاریخ</Th>
              <Th>مبلغ</Th>
            </tr>
          </thead>
          <tbody>
            {data.recentOrders.length === 0 ? (
              <EmptyRow colSpan={4} label="هنوز سفارشی ثبت نشده است" />
            ) : (
              data.recentOrders.map((order) => (
                <tr key={order.id}>
                  <Td>
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="font-display text-ink hover:underline"
                    >
                      {order.orderNumber}
                    </Link>
                  </Td>
                  <Td>
                    <Badge
                      tone={
                        order.status === 'DELIVERED'
                          ? 'success'
                          : order.status === 'CANCELLED'
                            ? 'danger'
                            : 'neutral'
                      }
                    >
                      {ORDER_STATUS_LABELS[order.status]}
                    </Badge>
                  </Td>
                  <Td className="text-[12px]">{formatDateFa(order.createdAt)}</Td>
                  <Td className="tabular whitespace-nowrap">{formatToman(order.total)}</Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </section>
    </div>
  );
}
