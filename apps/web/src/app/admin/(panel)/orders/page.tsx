import Link from 'next/link';
import { Download, Plus } from 'lucide-react';
import {
  ORDER_PAYMENT_METHODS,
  ORDER_SOURCE_LABELS,
  ORDER_SOURCES,
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  paymentMethodName,
  type Permission,
} from '@iphoneha/shared';
import { getAdminMe, listAdminOrders } from '@/lib/api/admin';
import { exportHref } from '@/lib/backoffice';
import { FilterChips, PageHeader, TablePagination } from '@/components/admin/ui';
import { AdminSearch } from '@/components/admin/admin-search';
import { DateRangeFilter, OrdersTable, ParamSelect } from '@/components/admin/backoffice/list-tools';

type SearchParams = Promise<{
  q?: string;
  status?: string;
  source?: string;
  paymentMethod?: string;
  from?: string;
  to?: string;
  page?: string;
}>;

export default async function AdminOrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const [admin, orders] = await Promise.all([
    getAdminMe(),
    listAdminOrders({
      q: params.q,
      status: params.status,
      source: params.source,
      paymentMethod: params.paymentMethod,
      from: params.from,
      to: params.to,
      page: params.page ?? '1',
      pageSize: '20',
    }),
  ]);
  const can = (permission: Permission) => Boolean(admin?.permissions.includes(permission));

  return (
    <div>
      <PageHeader
        title="سفارش‌ها"
        description="جست‌وجو با شماره سفارش، نام، موبایل یا IMEI"
        action={
          <div className="flex flex-wrap gap-2">
            {can('reports.read') ? (
              <a
                href={exportHref('orders', { from: params.from, to: params.to, status: params.status })}
                className="inline-flex h-9 items-center gap-2 rounded-pill border border-line-strong px-4 text-[13px] text-ink hover:bg-surface"
              >
                <Download className="size-4" aria-hidden />
                خروجی اکسل
              </a>
            ) : null}
            {can('orders.create') ? (
              <Link
                href="/admin/orders/new"
                className="inline-flex h-9 items-center gap-2 rounded-pill bg-brand-strong px-4 text-[13px] font-medium text-white hover:bg-brand-ink"
              >
                <Plus className="size-4" aria-hidden />
                ثبت سفارش تلفنی یا حضوری
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="mb-4 grid gap-3">
        <AdminSearch placeholder="شماره سفارش، نام، موبایل یا IMEI…" />
        <FilterChips
          basePath="/admin/orders"
          params={params}
          name="status"
          label="وضعیت"
          options={ORDER_STATUSES.map((status) => ({ value: status, label: ORDER_STATUS_LABELS[status] }))}
        />
        <div className="flex flex-wrap items-center gap-3">
          <ParamSelect
            name="source"
            label="منبع"
            options={ORDER_SOURCES.map((source) => ({ value: source, label: ORDER_SOURCE_LABELS[source] }))}
          />
          <ParamSelect
            name="paymentMethod"
            label="روش پرداخت"
            options={ORDER_PAYMENT_METHODS.map((method) => ({
              value: method,
              label: paymentMethodName(method),
            }))}
          />
        </div>
        <DateRangeFilter />
      </div>

      <OrdersTable orders={orders.items} canBulk={can('orders.write')} />

      <TablePagination
        page={orders.page}
        totalPages={orders.totalPages}
        total={orders.total}
        basePath="/admin/orders"
        params={params}
      />
    </div>
  );
}
