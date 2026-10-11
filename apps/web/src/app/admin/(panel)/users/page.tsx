import Link from 'next/link';
import { ADMIN_ROLE_LABELS, formatNumberFa, formatToman } from '@iphoneha/shared';
import { getAdminMe, listAdminUsers, listCustomers } from '@/lib/api/admin';
import { formatDateFa } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { EmptyRow, PageHeader, Table, TablePagination, Td, Th } from '@/components/admin/ui';
import { AdminSearch } from '@/components/admin/admin-search';
import { AdminUserDialog } from '@/components/admin/admin-user-dialog';
import { CustomerToggle } from '@/components/admin/customer-toggle';

type SearchParams = Promise<{ q?: string; page?: string }>;

export default async function AdminUsersPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const [customers, admin] = await Promise.all([
    listCustomers({ q: params.q, page: params.page ?? '1', pageSize: '20' }),
    getAdminMe(),
  ]);
  const canWriteUsers = admin?.permissions.includes('users.write') ?? false;
  const canSeeAdmins = admin?.permissions.includes('admins.manage') ?? false;
  const admins = canSeeAdmins ? await listAdminUsers() : [];

  return (
    <div>
      <PageHeader title="کاربران" description="مشتری‌ها و مدیران فروشگاه" />

      <div className="mb-4">
        <AdminSearch placeholder="نام یا شماره موبایل…" />
      </div>

      <Table>
        <thead>
          <tr>
            <Th>مشتری</Th>
            <Th>موبایل</Th>
            <Th>سفارش‌ها</Th>
            <Th>مجموع خرید</Th>
            <Th>عضویت</Th>
            <Th>وضعیت</Th>
            {canWriteUsers ? <Th /> : null}
          </tr>
        </thead>
        <tbody>
          {customers.items.length === 0 ? (
            <EmptyRow colSpan={canWriteUsers ? 7 : 6} />
          ) : (
            customers.items.map((customer) => (
              <tr key={customer.id} className="transition-colors hover:bg-surface-2">
                <Td>
                  <Link href={`/admin/users/${customer.id}`} className="text-ink hover:underline">
                    {customer.fullName ?? 'بدون نام'}
                  </Link>
                </Td>
                <Td className="whitespace-nowrap font-display text-[12px]">{customer.phone}</Td>
                <Td className="tabular whitespace-nowrap">{formatNumberFa(customer.ordersCount)}</Td>
                <Td className="tabular whitespace-nowrap">{formatToman(customer.totalSpent)}</Td>
                <Td className="text-[12px]">{formatDateFa(customer.createdAt)}</Td>
                <Td>
                  <Badge tone={customer.isActive ? 'success' : 'danger'}>
                    {customer.isActive ? 'فعال' : 'مسدود'}
                  </Badge>
                </Td>
                {canWriteUsers ? (
                  <Td>
                    <CustomerToggle userId={customer.id} isActive={customer.isActive} />
                  </Td>
                ) : null}
              </tr>
            ))
          )}
        </tbody>
      </Table>

      <TablePagination
        page={customers.page}
        totalPages={customers.totalPages}
        total={customers.total}
        basePath="/admin/users"
        params={params}
      />

      {canSeeAdmins ? (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-semibold text-ink">مدیران</h2>
            <AdminUserDialog />
          </div>
          <Table>
            <thead>
              <tr>
                <Th>نام</Th>
                <Th>موبایل</Th>
                <Th>نقش</Th>
                <Th>آخرین ورود</Th>
                <Th>وضعیت</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {admins.map((row) => (
                <tr key={row.id}>
                  <Td className="text-ink">{row.name}</Td>
                  <Td className="whitespace-nowrap font-display text-[12px]">{row.phone}</Td>
                  <Td className="text-[12px]">{ADMIN_ROLE_LABELS[row.role]}</Td>
                  <Td className="text-[12px]">{row.lastLoginAt ? formatDateFa(row.lastLoginAt) : '—'}</Td>
                  <Td>
                    <Badge tone={row.isActive ? 'success' : 'neutral'}>
                      {row.isActive ? 'فعال' : 'غیرفعال'}
                    </Badge>
                  </Td>
                  <Td>
                    <AdminUserDialog admin={row} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
      ) : null}
    </div>
  );
}
