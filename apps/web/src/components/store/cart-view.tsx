'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, ShoppingBag, Tag, Trash2, X } from 'lucide-react';
import { formatNumberFa, formatToman, type ProductCardDto } from '@iphoneha/shared';
import { useCart } from '@/providers/cart-provider';
import { useStoreConfig } from '@/providers/store-config-provider';
import { useInstallmentEstimate } from '@/hooks/use-installment-estimate';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ProductImage } from './product-image';
import { ProductRail } from './product-rail';
import { QuantityStepper } from './quantity-stepper';
import { SectionHeader } from './section-header';

export function CartView({ suggestions = [] }: { suggestions?: ProductCardDto[] }) {
  const { cart, isLoading, isMutating, updateItem, removeItem, applyCoupon, removeCoupon } = useCart();
  const { commerce } = useStoreConfig();
  const monthlyFor = useInstallmentEstimate();
  const [code, setCode] = useState('');

  if (isLoading && !cart) {
    return (
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Skeleton className="h-64 rounded-panel" />
        <Skeleton className="h-48 rounded-panel" />
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="space-y-12">
        <EmptyState
          icon={ShoppingBag}
          title="سبد خرید خالی است"
          description="هنوز محصولی اضافه نکرده‌ای. از فروشگاه شروع کن."
          action={
            <Button asChild>
              <Link href="/shop">مشاهده محصولات</Link>
            </Button>
          }
          className="border-dashed"
        />

        {suggestions.length > 0 ? (
          <section>
            <SectionHeader
              eyebrow="Best Sellers"
              title="شاید این‌ها را بخواهی"
              description="محبوب‌ترین آیفون‌های این هفته، همه با ضمانت اصالت."
              href="/shop"
            />
            <ProductRail products={suggestions} />
          </section>
        ) : null}
      </div>
    );
  }

  const remainingForFreeShipping = commerce.freeShippingThreshold
    ? Math.max(0, commerce.freeShippingThreshold - cart.summary.total)
    : 0;
  const monthly = monthlyFor(cart.summary.total);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1.6fr_1fr]">
      <div className="space-y-4">
        {cart.issues.length > 0 ? (
          <div className="rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3">
            <p className="flex items-center gap-2 text-[13px] font-medium text-danger">
              <AlertTriangle className="size-4" aria-hidden />
              چند مورد نیاز به بررسی دارد
            </p>
            <ul className="mt-2 grid gap-1 ps-6 text-[12px] text-danger/90">
              {cart.issues.map((issue) => (
                <li key={`${issue.itemId}-${issue.code}`} className="list-disc">
                  {issue.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <ul className="divide-y divide-line overflow-hidden rounded-panel border border-line">
          {cart.items.map((item) => (
            <li key={item.id} className="flex gap-4 p-4">
              <Link
                href={`/iphone/${item.productSlug}`}
                className="relative size-24 shrink-0 overflow-hidden rounded-2xl bg-surface-2 sm:size-28"
              >
                <ProductImage src={item.image} alt={item.productName} sizes="112px" className="p-2" />
              </Link>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/iphone/${item.productSlug}`} className="text-[15px] font-medium text-ink">
                      {item.productName}
                    </Link>
                    <p className="mt-1 text-[12px] text-muted">
                      {item.storage.labelFa} · {item.color.name}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-faint">{item.shippingTimeLabel}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    disabled={isMutating}
                    className="grid size-9 shrink-0 place-items-center rounded-full text-muted-faint transition-colors hover:bg-danger-soft hover:text-danger"
                    aria-label={`حذف ${item.productName}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <QuantityStepper
                    value={item.quantity}
                    max={item.maxQuantity}
                    disabled={isMutating || !item.isAvailable}
                    onChange={(next) => updateItem(item.id, next)}
                  />
                  <div className="text-end">
                    {item.compareAtPrice && item.compareAtPrice > item.unitPrice ? (
                      <p className="text-[11px] text-muted-faint line-through tabular">
                        {formatNumberFa(item.compareAtPrice * item.quantity)}
                      </p>
                    ) : null}
                    <p className="text-[15px] font-semibold text-ink tabular">
                      {formatToman(item.lineTotal)}
                    </p>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <Button asChild variant="ghost" size="sm">
          <Link href="/shop">
            <ArrowLeft className="size-4 rotate-180" aria-hidden />
            ادامه خرید
          </Link>
        </Button>
      </div>

      <aside className="sticky top-24 space-y-4 rounded-panel border border-line p-5">
        <h2 className="text-[15px] font-semibold text-ink">خلاصه سفارش</h2>

        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (code.trim()) void applyCoupon(code.trim());
          }}
        >
          <div className="relative flex-1">
            <Tag className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-faint" />
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="کد تخفیف"
              className="h-11 ps-10 font-display"
              aria-label="کد تخفیف"
            />
          </div>
          <Button type="submit" variant="outline" size="md" disabled={isMutating || !code.trim()}>
            اعمال
          </Button>
        </form>

        {cart.couponCode ? (
          <p className="flex items-center justify-between rounded-2xl bg-success-soft px-3 py-2 text-[12px] text-success">
            <span className="font-display">{cart.couponCode}</span>
            <button type="button" onClick={() => removeCoupon()} aria-label="حذف کد تخفیف">
              <X className="size-3.5" />
            </button>
          </p>
        ) : null}

        <dl className="grid gap-2.5 border-t border-line pt-4 text-[13px]">
          <Row
            label={`جمع کالاها (${formatNumberFa(cart.summary.itemsCount)})`}
            value={formatToman(cart.summary.subtotal)}
          />
          {cart.summary.itemsDiscount > 0 ? (
            <Row label="تخفیف محصولات" value={`−${formatToman(cart.summary.itemsDiscount)}`} tone="success" />
          ) : null}
          {cart.summary.couponDiscount > 0 ? (
            <Row label="کد تخفیف" value={`−${formatToman(cart.summary.couponDiscount)}`} tone="success" />
          ) : null}
          <Row
            label="هزینه ارسال"
            value={cart.summary.shipping === null ? 'در مرحله بعد' : formatToman(cart.summary.shipping)}
          />
        </dl>

        <div className="flex items-center justify-between border-t border-line pt-4">
          <span className="text-[13px] font-medium text-ink">مبلغ قابل پرداخت</span>
          <span className="text-lg font-semibold text-ink tabular">{formatToman(cart.summary.total)}</span>
        </div>

        {monthly ? <p className="text-[11px] text-muted">یا قسطی از ماهانه {formatToman(monthly)}</p> : null}

        {remainingForFreeShipping > 0 ? (
          <p className="rounded-2xl bg-surface px-3 py-2.5 text-[11px] leading-5 text-muted">
            با {formatToman(remainingForFreeShipping)} خرید بیشتر، ارسال رایگان می‌شود.
          </p>
        ) : null}

        <Button asChild block size="lg" disabled={cart.issues.length > 0}>
          <Link href="/checkout">ادامه و تکمیل خرید</Link>
        </Button>
      </aside>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'success' }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={tone === 'success' ? 'text-success tabular' : 'text-ink tabular'}>{value}</dd>
    </div>
  );
}
