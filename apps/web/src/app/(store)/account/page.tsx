import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft, Package } from 'lucide-react';
import { ORDER_STATUS_LABELS, formatNumberFa, formatToman } from '@iphoneha/shared';
import { getMe, listOrders } from '@/lib/api/endpoints';
import { formatDateFa } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ProfileForm } from '@/components/store/profile-form';

export const metadata: Metadata = { title: 'حساب کاربری', robots: { index: false, follow: false } };

export default async function AccountPage() {
  const [user, orders] = await Promise.all([getMe(), listOrders(1)]);
  const recent = orders.items.slice(0, 3);

  return (
    <div className="grid gap-6">
      <section className="rounded-panel border border-line p-5">
        <h2 className="mb-4 text-[15px] font-semibold text-ink">اطلاعات حساب</h2>
        {user ? <ProfileForm user={user} /> : null}
      </section>

      <section className="rounded-panel border border-line p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-ink">آخرین سفارش‌ها</h2>
          <Link
            href="/account/orders"
            className="inline-flex items-center gap-0.5 text-[12px] text-muted hover:text-ink"
          >
            همه سفارش‌ها
            <ChevronLeft className="size-3.5" aria-hidden />
          </Link>
        </div>

        {recent.length === 0 ? (
          <EmptyState
            icon={Package}
            title="هنوز سفارشی ثبت نکرده‌ای"
            action={
              <Button asChild size="sm">
                <Link href="/shop">شروع خرید</Link>
              </Button>
            }
            className="border-dashed"
          />
        ) : (
          <ul className="divide-y divide-line">
            {recent.map((order) => (
              <li key={order.id}>
                <Link href={`/account/orders/${order.id}`} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-ink font-display">{order.orderNumber}</p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {formatDateFa(order.createdAt)} · {formatNumberFa(order.itemsCount)} کالا
                    </p>
                  </div>
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
                  <span className="shrink-0 text-[13px] font-medium text-ink tabular">
                    {formatToman(order.total)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
