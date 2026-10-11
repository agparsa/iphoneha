'use client';

import Link from 'next/link';
import { AlertTriangle, ShoppingBag, Trash2 } from 'lucide-react';
import { formatNumberFa, formatToman } from '@iphoneha/shared';
import { useCart } from '@/providers/cart-provider';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ProductImage } from './product-image';
import { QuantityStepper } from './quantity-stepper';

export function CartSheet() {
  const { cart, sheetOpen, closeSheet, isLoading, isMutating, updateItem, removeItem } = useCart();

  return (
    <Sheet open={sheetOpen} onOpenChange={(open) => (open ? null : closeSheet())}>
      <SheetContent
        side="end"
        title="سبد خرید"
        description={
          cart && cart.items.length > 0 ? `${formatNumberFa(cart.summary.itemsCount)} کالا` : undefined
        }
      >
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading && !cart ? (
            <div className="grid gap-3">
              <Skeleton className="h-24 rounded-2xl" />
              <Skeleton className="h-24 rounded-2xl" />
            </div>
          ) : !cart || cart.items.length === 0 ? (
            <EmptyState
              icon={ShoppingBag}
              title="سبد خرید خالی است"
              description="از میان آیفون‌های موجود، مدل مورد علاقه‌ات را انتخاب کن."
              action={
                <Button asChild size="sm" onClick={closeSheet}>
                  <Link href="/shop">مشاهده محصولات</Link>
                </Button>
              }
              className="border-dashed"
            />
          ) : (
            <ul className="grid gap-3">
              {cart.items.map((item) => (
                <li key={item.id} className="flex gap-3 rounded-2xl border border-line p-3">
                  <Link
                    href={`/iphone/${item.productSlug}`}
                    onClick={closeSheet}
                    className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-surface-2"
                  >
                    <ProductImage src={item.image} alt={item.productName} sizes="80px" className="p-1" />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{item.productName}</p>
                        <p className="mt-0.5 text-[11px] text-muted">
                          {item.storage.labelFa} · {item.color.name}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        disabled={isMutating}
                        className="grid size-8 shrink-0 place-items-center rounded-full text-muted-faint transition-colors hover:bg-danger-soft hover:text-danger"
                        aria-label="حذف از سبد"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>

                    {!item.isAvailable ? (
                      <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-danger">
                        <AlertTriangle className="size-3.5" />
                        موجودی کافی نیست
                      </p>
                    ) : null}
                    {item.priceChanged ? (
                      <p className="mt-1.5 text-[11px] text-warning">قیمت این کالا به‌روز شده است.</p>
                    ) : null}

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <QuantityStepper
                        size="sm"
                        value={item.quantity}
                        max={item.maxQuantity}
                        disabled={isMutating}
                        onChange={(next) => updateItem(item.id, next)}
                      />
                      <span className="text-[13px] font-semibold text-ink tabular">
                        {formatToman(item.lineTotal)}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {cart && cart.items.length > 0 ? (
          <div className="border-t border-line p-4">
            <dl className="grid gap-2 text-[13px]">
              <div className="flex items-center justify-between">
                <dt className="text-muted">جمع کالاها</dt>
                <dd className="text-ink tabular">{formatToman(cart.summary.subtotal)}</dd>
              </div>
              {cart.summary.discount > 0 ? (
                <div className="flex items-center justify-between">
                  <dt className="text-muted">تخفیف</dt>
                  <dd className="text-success tabular">−{formatToman(cart.summary.discount)}</dd>
                </div>
              ) : null}
              <div className="flex items-center justify-between border-t border-line pt-2">
                <dt className="font-medium text-ink">مبلغ قابل پرداخت</dt>
                <dd className="text-base font-semibold text-ink tabular">
                  {formatToman(cart.summary.total)}
                </dd>
              </div>
            </dl>
            <div className="mt-4 grid gap-2">
              <Button asChild size="lg" block onClick={closeSheet}>
                <Link href="/checkout">تکمیل خرید</Link>
              </Button>
              <Button asChild variant="ghost" size="sm" block onClick={closeSheet}>
                <Link href="/cart">مشاهده سبد خرید</Link>
              </Button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
