'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BadgeCheck, CreditCard, RotateCcw, ShieldCheck, Sparkles, Truck, Zap } from 'lucide-react';
import {
  formatNumberFa,
  formatToman,
  stockStatusOf,
  type ProductDetailDto,
  type VariantDto,
} from '@iphoneha/shared';
import { useCart } from '@/providers/cart-provider';
import { useStoreConfig } from '@/providers/store-config-provider';
import { useInstallmentEstimate } from '@/hooks/use-installment-estimate';
import { trackViewItem } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ColorSwatch } from './color-swatch';
import { DiscountBadge, Price } from './price';
import { ProductGallery } from './product-gallery';
import { useProductSelection } from './product-selection';
import { QuantityStepper } from './quantity-stepper';
import { RatingStars } from './rating-stars';
import { ShareButton } from './share-button';
import { StockPill } from './stock-pill';
import { WishlistButton } from './wishlist-button';

interface LiveUpdate {
  variantId: string;
  availableStock: number;
  price: number;
}

export function VariantPicker({ product }: { product: ProductDetailDto }) {
  const router = useRouter();
  const { addItem, isMutating } = useCart();
  const { commerce, store, installments } = useStoreConfig();
  const monthlyFor = useInstallmentEstimate();

  // The first render must match on the server and the client (hydration), so it
  // always starts from the product's default variant; a ?color/?storage in the
  // URL is applied right after mount.
  const initial = useMemo(
    () => product.variants.find((v) => v.id === product.defaultVariantId) ?? product.variants[0]!,
    [product],
  );

  const [colorId, setColorId] = useState(initial.colorId);
  const [storageId, setStorageId] = useState(initial.storageId);
  const [requestedQuantity, setQuantity] = useState(1);
  const [live, setLive] = useState<Record<string, LiveUpdate>>({});
  const [pending, setPending] = useState(false);

  // one «view_item» per product page (the ref also absorbs React's dev double-run)
  const viewed = useRef<string | null>(null);
  useEffect(() => {
    if (viewed.current === product.slug) return;
    viewed.current = product.slug;
    trackViewItem(product, initial);
  }, [product, initial]);

  // live stock/price: the API publishes inventory changes over SSE. The stream
  // opens once the page has settled (it is never needed for the first paint)
  // and is closed before the page goes away, so leaving never aborts it midway.
  useEffect(() => {
    let source: EventSource | null = null;
    const open = () => {
      source = new EventSource(`/api/products/${product.slug}/stream`);
      source.onmessage = (event) => {
        try {
          const update = JSON.parse(event.data) as LiveUpdate;
          setLive((state) => ({ ...state, [update.variantId]: update }));
        } catch {
          /* ignore malformed frames */
        }
      };
      source.onerror = () => source?.close();
    };
    const close = () => source?.close();
    const timer = window.setTimeout(open, 2500);
    window.addEventListener('pagehide', close);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pagehide', close);
      close();
    };
  }, [product.slug]);

  const withLive = (variant: VariantDto): VariantDto => {
    const update = live[variant.id];
    if (!update) return variant;
    return {
      ...variant,
      price: update.price,
      availableStock: update.availableStock,
      stockStatus: stockStatusOf(update.availableStock),
    };
  };

  const variantsForColor = product.variants.filter((v) => v.colorId === colorId && v.active).map(withLive);
  const selected =
    variantsForColor.find((v) => v.storageId === storageId) ??
    variantsForColor[0] ??
    withLive(product.variants[0]!);

  // keep the storage selection valid when the colour changes (adjusted during
  // render, which React prefers over an effect)
  if (variantsForColor.length > 0 && !variantsForColor.some((v) => v.storageId === storageId)) {
    setStorageId(variantsForColor[0]!.storageId);
  }

  // the query string as the page was opened: the effect below rewrites the URL
  // as soon as it runs, and a second pass (React's dev double-run) must still
  // see the link that was shared
  const openedWith = useRef(typeof window === 'undefined' ? '' : window.location.search);

  // apply ?color / ?storage from a shared link once the component is mounted.
  // Reading location during render would break hydration, so this one stays an
  // effect on purpose.
  useEffect(() => {
    const params = new URLSearchParams(openedWith.current);
    const requestedColor = params.get('color');
    const requestedStorage = params.get('storage');
    if (!requestedColor && !requestedStorage) return;

    const colorOf = (variant: VariantDto) => product.colors.find((c) => c.id === variant.colorId)?.code;
    const capacityOf = (variant: VariantDto) =>
      String(product.storages.find((s) => s.id === variant.storageId)?.capacityGb);
    const active = product.variants.filter((variant) => variant.active);
    const match =
      active.find(
        (variant) =>
          (!requestedColor || colorOf(variant) === requestedColor) &&
          (!requestedStorage || capacityOf(variant) === requestedStorage),
      ) ??
      // that exact pair is no longer on sale: keep the colour, failing that the capacity
      (requestedColor ? active.find((variant) => colorOf(variant) === requestedColor) : undefined) ??
      (requestedStorage ? active.find((variant) => capacityOf(variant) === requestedStorage) : undefined);
    if (match) {
      setColorId(match.colorId);
      setStorageId(match.storageId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep the URL in sync so the selection can be shared or bookmarked — without
  // a router navigation, which would re-fetch the server component on every tap
  useEffect(() => {
    const color = product.colors.find((c) => c.id === colorId);
    const storage = product.storages.find((s) => s.id === selected.storageId);
    if (!color || !storage) return;
    const params = new URLSearchParams(window.location.search);
    params.set('color', color.code);
    params.set('storage', String(storage.capacityGb));
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorId, selected.storageId]);

  const maxQuantity = Math.max(0, Math.min(selected.availableStock, commerce.maxQtyPerItem));
  const quantity = Math.min(Math.max(1, requestedQuantity), Math.max(1, maxQuantity));
  const soldOut = selected.availableStock <= 0;
  const activeColor = product.colors.find((c) => c.id === colorId) ?? product.colors[0]!;
  const saving =
    selected.compareAtPrice && selected.compareAtPrice > selected.price
      ? selected.compareAtPrice - selected.price
      : 0;
  const monthly = monthlyFor(selected.price);

  // the instalment section further down quotes and buys exactly this model
  const shareSelection = useProductSelection()?.setSelection;
  const storageLabel = product.storages.find((s) => s.id === selected.storageId)?.labelFa ?? '';
  useEffect(() => {
    shareSelection?.({
      variantId: selected.id,
      price: selected.price,
      label: `${activeColor.name} · ${storageLabel}`,
      available: selected.availableStock > 0,
    });
  }, [shareSelection, selected.id, selected.price, selected.availableStock, activeColor.name, storageLabel]);

  // the mobile buy bar only appears once the real buttons have scrolled away
  const ctaRef = useRef<HTMLDivElement>(null);
  const [ctaVisible, setCtaVisible] = useState(true);
  useEffect(() => {
    const node = ctaRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => setCtaVisible(entries[0]?.isIntersecting ?? true),
      {
        rootMargin: '-80px 0px -120px 0px',
      },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  async function add(goToCheckout = false) {
    setPending(true);
    try {
      await addItem({ variantId: selected.id, quantity, reveal: !goToCheckout });
      if (goToCheckout) router.push('/checkout');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
      <ProductGallery
        images={product.images}
        activeColorId={colorId}
        alt={product.name}
        accent={activeColor.hex}
      />

      <div className="stagger">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow">{product.nameEn}</p>
            <h1 className="mt-2 text-2xl font-semibold text-ink sm:text-3xl">{product.name}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-1">
            <ShareButton title={product.name} />
            <WishlistButton slug={product.slug} name={product.name} />
          </div>
        </div>
        {product.ratingAvg ? (
          <RatingStars value={product.ratingAvg} count={product.ratingCount} size="md" className="mt-3" />
        ) : null}
        {product.tagline ? <p className="mt-2 text-[13px] leading-7 text-muted">{product.tagline}</p> : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <StockPill status={selected.stockStatus} available={selected.availableStock} />
          <span className="text-muted-faint">·</span>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
            <ShieldCheck className="size-3.5 text-success" aria-hidden />
            {product.registryLabel}
          </span>
          <span className="text-muted-faint">·</span>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
            <Truck className="size-3.5 text-muted" aria-hidden />
            {selected.shippingTimeLabel}
          </span>
        </div>

        <div
          className="mt-6 flex flex-wrap items-end gap-3"
          data-testid="product-price"
          data-price={selected.price}
        >
          <Price value={selected.price} compareAt={selected.compareAtPrice} size="lg" animate />
          <DiscountBadge percent={selected.discountPercent} className="mb-1.5" />
          {saving > 0 ? (
            <span
              key={saving}
              className="animate-pop mb-1.5 rounded-pill bg-success-soft px-2.5 py-1 text-[11px] font-medium text-success tabular"
            >
              {formatNumberFa(saving)} تومان سود
            </span>
          ) : null}
        </div>
        <a
          href="#installments"
          onClick={(event) => {
            event.preventDefault();
            document.getElementById('installments')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          className="ring-gradient group mt-4 inline-flex items-center gap-2.5 rounded-pill py-2 ps-2 pe-4 text-[13px] transition-transform duration-300 hover:-translate-y-0.5"
          data-testid="installment-cta"
        >
          <span className="grid size-8 place-items-center rounded-full bg-brand text-white transition-transform duration-500 group-hover:rotate-12">
            <Sparkles className="size-4" aria-hidden />
          </span>
          {monthly ? (
            <span className="text-ink-muted">
              خرید قسطی از ماهانه{' '}
              <span className="font-semibold text-ink tabular">{formatToman(monthly)}</span>
              {installments.length > 1 ? (
                <span className="text-muted"> · {formatNumberFa(installments.length)} سرویس</span>
              ) : null}
            </span>
          ) : (
            <span className="font-medium text-ink">خرید قسطی با چک و سفته</span>
          )}
        </a>

        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[13px] font-medium text-ink">انتخاب رنگ</h2>
            <span className="text-[13px] text-muted">{activeColor.name}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {product.colors.map((color) => {
              const available = product.variants.some(
                (v) => v.colorId === color.id && v.active && withLive(v).availableStock > 0,
              );
              return (
                <ColorSwatch
                  key={color.id}
                  color={color}
                  selected={color.id === colorId}
                  onSelect={() => setColorId(color.id)}
                  title={available ? color.name : `${color.name} — ناموجود`}
                />
              );
            })}
          </div>
        </section>

        <section className="mt-7">
          <h2 className="mb-3 text-[13px] font-medium text-ink">انتخاب حافظه</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {product.storages.map((storage) => {
              const variant = variantsForColor.find((v) => v.storageId === storage.id);
              const disabled = !variant;
              const isSelected = variant?.id === selected.id;
              return (
                <button
                  key={storage.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setStorageId(storage.id)}
                  aria-pressed={isSelected}
                  className={cn(
                    'rounded-2xl border px-3 py-3 text-center transition-[border-color,background-color,box-shadow,transform] duration-300',
                    isSelected
                      ? 'border-brand bg-brand-soft shadow-[0_0_0_3px_rgb(14_138_92_/_0.12)]'
                      : 'border-line hover:-translate-y-0.5 hover:border-line-strong',
                    disabled && 'cursor-not-allowed border-dashed opacity-45',
                  )}
                >
                  <span className="block text-[13px] font-medium text-ink">{storage.labelFa}</span>
                  <span className="mt-1 block text-[11px] text-muted tabular">
                    {variant ? formatNumberFa(variant.price) : 'ناموجود'}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <div ref={ctaRef} className="mt-7 flex flex-wrap items-center gap-3">
          <QuantityStepper
            value={quantity}
            max={Math.max(1, maxQuantity)}
            disabled={soldOut || isMutating}
            onChange={setQuantity}
          />
          <Button
            size="lg"
            className="shine relative flex-1"
            data-testid="add-to-cart"
            disabled={soldOut}
            loading={pending}
            onClick={() => add(false)}
          >
            {soldOut ? 'ناموجود' : 'افزودن به سبد'}
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="flex-1 sm:flex-none"
            disabled={soldOut || pending}
            onClick={() => add(true)}
          >
            <Zap className="size-4" aria-hidden />
            خرید سریع
          </Button>
        </div>

        <p className="mt-3 text-[11px] text-muted-faint">
          کد کالا:{' '}
          <span className="font-display" data-testid="variant-sku">
            {selected.sku}
          </span>
          {maxQuantity > 0 ? ` · حداکثر ${formatNumberFa(maxQuantity)} عدد در هر سفارش` : ''}
        </p>

        <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-5">
          {[
            { icon: BadgeCheck, text: 'اصالت و آکبند بودن تضمین‌شده' },
            product.warranty ? { icon: ShieldCheck, text: product.warranty } : null,
            { icon: CreditCard, text: 'پرداخت نقدی یا اقساطی' },
            {
              icon: RotateCcw,
              text:
                store.returnDays > 0
                  ? `بازگشت کالا تا ${formatNumberFa(store.returnDays)} روز`
                  : 'بازگشت کالا طبق قوانین فروشگاه',
            },
          ]
            .filter((item) => item !== null)
            .map((item) => (
              <li key={item.text} className="flex items-start gap-2 text-[12px] leading-5 text-ink-muted">
                <item.icon className="mt-px size-4 shrink-0 text-muted" aria-hidden />
                {item.text}
              </li>
            ))}
        </ul>
      </div>

      {/* sticky buy bar — phones only, shown after the buttons scroll out of view */}
      <div
        className={cn(
          'layer-top safe-bottom fixed inset-x-0 bottom-[3.9rem] z-30 border-t border-line bg-canvas transition-[opacity,transform] duration-300 ease-out-quint lg:hidden',
          ctaVisible ? 'pointer-events-none translate-y-3 opacity-0' : 'translate-y-0 opacity-100',
        )}
        aria-hidden={ctaVisible}
      >
        <div className="container-page flex items-center gap-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-ink tabular">
              {formatToman(selected.price)}
            </p>
            <p className="truncate text-[11px] text-muted">
              {activeColor.name} · {product.storages.find((s) => s.id === selected.storageId)?.labelFa}
            </p>
          </div>
          <Button
            size="md"
            className="shrink-0"
            disabled={soldOut || pending || ctaVisible}
            loading={pending}
            tabIndex={ctaVisible ? -1 : undefined}
            onClick={() => add(false)}
          >
            {soldOut ? 'ناموجود' : 'افزودن به سبد'}
          </Button>
        </div>
      </div>
    </div>
  );
}
