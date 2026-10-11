import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft, Package } from 'lucide-react';
import { ORDER_STATUS_LABELS, formatNumberFa, formatToman } from '@iphoneha/shared';
import { listOrders } from '@/lib/api/endpoints';
import { formatDateFa } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ProductImage } from '@/components/store/product-image';

export const metadata: Metadata = { title: 'سفارش‌های من', robots: { index: false, follow: false } };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page } = await searchParams;
  const orders = await listOrders(Number(page ?? 1));

  if (orders.items.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="هنوز سفارشی ثبت نکرده‌ای"
        description="سفارش‌های ثبت‌شده و وضعیت ارسالشان اینجا نمایش داده می‌شود."
        action={
          <Button asChild size="sm">
            <Link href="/shop">شروع خرید</Link>
          </Button>
        }
        className="border-dashed"
      />
    );
  }

  return (
    <div className="grid gap-3">
      {orders.items.map((order) => (
        <Link
          key={order.id}
          href={`/account/orders/${order.id}`}
          className="flex items-center gap-4 rounded-panel border border-line p-4 transition-colors hover:border-line-strong"
        >
          {order.firstItem ? (
            <span className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-surface-2">
              <ProductImage
                src={order.firstItem.imageUrl}
                alt={order.firstItem.productName}
                sizes="64px"
                className="p-1"
              />
            </span>
          ) : null}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-medium text-ink font-display">{order.orderNumber}</span>
              <Badge
                tone={
                  order.status === 'DELIVERED'
                    ? 'success'
                    : order.status === 'CANCELLED' || order.status === 'REFUNDED'
                      ? 'danger'
                      : 'neutral'
                }
              >
                {ORDER_STATUS_LABELS[order.status]}
              </Badge>
            </div>
            <p className="mt-1 truncate text-[12px] text-muted">
              {order.firstItem?.productName}
              {order.itemsCount > 1 ? ` و ${formatNumberFa(order.itemsCount - 1)} کالای دیگر` : ''}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-faint">{formatDateFa(order.createdAt)}</p>
          </div>

          <div className="shrink-0 text-end">
            <p className="text-[13px] font-semibold text-ink tabular">{formatToman(order.total)}</p>
            <ChevronLeft className="ms-auto mt-1 size-4 text-muted-faint" aria-hidden />
          </div>
        </Link>
      ))}

      {orders.totalPages > 1 ? (
        <div className="mt-2 flex justify-center gap-2">
          {Array.from({ length: orders.totalPages }, (_, i) => i + 1).map((item) => (
            <Link
              key={item}
              href={`/account/orders?page=${item}`}
              className={`grid size-9 place-items-center rounded-full border text-[13px] tabular ${
                item === orders.page ? 'border-ink bg-ink text-white' : 'border-line text-ink-muted'
              }`}
            >
              {formatNumberFa(item)}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
