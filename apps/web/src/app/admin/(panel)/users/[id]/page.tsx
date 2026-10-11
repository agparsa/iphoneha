import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Phone, Plus } from 'lucide-react';
import {
  formatJalali,
  formatNumberFa,
  formatToman,
  paymentMethodName,
  type Permission,
} from '@iphoneha/shared';
import { getAdminMe, getCustomer } from '@/lib/api/admin';
import { CONTRACT_TONE, orderTone } from '@/lib/backoffice';
import { formatDateFa, telHref } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { EmptyRow, PageHeader, Panel, StatCard, Table, Td, Th } from '@/components/admin/ui';
import { CustomerToggle } from '@/components/admin/customer-toggle';
import { CustomerNotes } from '@/components/admin/backoffice/customer-notes';

export const metadata = { title: 'پروندهٔ مشتری' };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await getAdminMe();
  if (!admin?.permissions.includes('users.read')) notFound();
  const customer = await getCustomer(id);
  if (!customer) notFound();
  const can = (permission: Permission) => admin.permissions.includes(permission);

  return (
    <div>
      <Link
        href="/admin/users"
        className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-ink"
      >
        <ArrowRight className="size-4" aria-hidden />
        بازگشت به کاربران
      </Link>
      <PageHeader
        title={customer.fullName ?? 'مشتری بدون نام'}
        description={`عضو از ${formatDateFa(customer.createdAt)}${customer.lastLoginAt ? ` · آخرین ورود ${formatDateFa(customer.lastLoginAt)}` : ''}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={telHref(customer.phone)}
              className="inline-flex h-9 items-center gap-2 rounded-pill border border-line-strong px-4 font-display text-[13px] text-ink hover:bg-surface"
              dir="ltr"
            >
              <Phone className="size-4" aria-hidden />
              {customer.phone}
            </a>
            <Badge tone={customer.isActive ? 'success' : 'danger'}>
              {customer.isActive ? 'فعال' : 'مسدود'}
            </Badge>
            {can('users.write') ? <CustomerToggle userId={customer.id} isActive={customer.isActive} /> : null}
            {can('orders.create') ? (
              <Link
                href="/admin/orders/new"
                className="inline-flex h-9 items-center gap-2 rounded-pill bg-brand-strong px-4 text-[13px] text-white hover:bg-brand-ink"
              >
                <Plus className="size-4" aria-hidden />
                سفارش تازه
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="خرید پرداخت‌شده"
          value={formatNumberFa(customer.stats.paidOrders)}
          hint={`از ${formatNumberFa(customer.stats.ordersCount)} سفارش`}
        />
        <StatCard
          label="جمع خرید"
          value={formatToman(customer.stats.totalSpent)}
          hint={customer.stats.lastOrderAt ? `آخرین: ${formatDateFa(customer.stats.lastOrderAt)}` : undefined}
        />
        {can('installments.read') ? (
          <>
            <StatCard
              label="ماندهٔ اقساط"
              value={formatToman(customer.stats.ledgerOutstanding)}
              hint={`${formatNumberFa(customer.contracts.length)} قرارداد`}
            />
            <StatCard
              label="معوق"
              value={formatToman(customer.stats.ledgerOverdue)}
              tone={customer.stats.ledgerOverdue ? 'danger' : 'neutral'}
            />
          </>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 content-start gap-4">
          <Panel title="سفارش‌ها">
            <Table className="border-0">
              <thead>
                <tr>
                  <Th>شماره</Th>
                  <Th>وضعیت</Th>
                  <Th>پرداخت</Th>
                  <Th>تاریخ</Th>
                  <Th>مبلغ</Th>
                </tr>
              </thead>
              <tbody>
                {customer.orders.length === 0 ? (
                  <EmptyRow colSpan={5} label="سفارشی ثبت نکرده" />
                ) : (
                  customer.orders.map((order) => (
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
                        <Badge tone={orderTone(order.status)}>{order.statusLabel}</Badge>
                      </Td>
                      <Td className="text-[12px]">{paymentMethodName(order.paymentMethod)}</Td>
                      <Td className="text-[12px]">{formatDateFa(order.createdAt)}</Td>
                      <Td className="whitespace-nowrap tabular">{formatToman(order.total)}</Td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </Panel>

          {can('installments.read') ? (
            <Panel title="قراردادهای اقساط">
              {customer.contracts.length === 0 ? (
                <p className="text-[13px] text-muted">قرارداد اقساطی ندارد.</p>
              ) : (
                <ul className="grid gap-2">
                  {customer.contracts.map((contract) => (
                    <li key={contract.id}>
                      <Link
                        href={`/admin/installments/${contract.id}`}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3 hover:bg-surface-2"
                      >
                        <span className="text-[13px] text-ink">
                          قرارداد {formatNumberFa(contract.number)} — {contract.itemDescription}
                          <span className="block text-[11px] text-muted">
                            مانده {formatToman(contract.remaining)}
                            {contract.nextDue ? ` · قسط بعدی ${formatJalali(contract.nextDue.dueDate)}` : ''}
                          </span>
                        </span>
                        <Badge tone={CONTRACT_TONE[contract.status]}>{contract.statusLabel}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : null}

          {customer.creditRequests.length ? (
            <Panel title="درخواست‌های اقساط از سایت">
              <ul className="grid gap-2 text-[13px]">
                {customer.creditRequests.map((request) => (
                  <li
                    key={request.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line px-4 py-2.5"
                  >
                    <span>
                      شمارهٔ {formatNumberFa(request.number)} — {request.productName ?? 'بدون مدل'}
                      <span className="block text-[11px] text-muted">{formatDateFa(request.createdAt)}</span>
                    </span>
                    <Badge tone="outline">{request.statusLabel}</Badge>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>

        <div className="grid min-w-0 content-start gap-4">
          <Panel title="یادداشت‌های داخلی">
            <CustomerNotes
              userId={customer.id}
              notes={customer.notes}
              canWrite={can('users.notes')}
              canDeleteAny={can('users.write')}
              adminName={admin.name}
            />
          </Panel>
          <Panel title="نشانی‌ها">
            {customer.addresses.length === 0 ? (
              <p className="text-[13px] text-muted">نشانی ذخیره نکرده.</p>
            ) : (
              <ul className="grid gap-2 text-[12px]">
                {customer.addresses.map((address) => (
                  <li key={address.id} className="rounded-2xl bg-surface-2 px-4 py-3">
                    <p className="text-[13px] text-ink">
                      {address.title ?? address.recipientName}
                      {address.isDefault ? (
                        <Badge tone="outline" className="ms-2">
                          پیش‌فرض
                        </Badge>
                      ) : null}
                    </p>
                    <p className="mt-1 leading-6 text-muted">
                      {address.province}، {address.city} — {address.addressLine}
                    </p>
                    <p className="font-display text-muted">{address.postalCode}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
