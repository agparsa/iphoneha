'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Check, Loader2, ShoppingBag, Truck } from 'lucide-react';
import { formatNumberFa } from '@iphoneha/shared';
import type { ProductCardDto, ProductCardVariant, ProductDetailDto } from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/keys';
import { useCart } from '@/providers/cart-provider';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ColorSwatch } from './color-swatch';
import { Price } from './price';
import { ProductImage } from './product-image';
import { RatingStars } from './rating-stars';
import { StockPill } from './stock-pill';
import { WishlistButton } from './wishlist-button';

interface ProductCardProps {
  product: ProductCardDto;
  monthly?: number | null;
  className?: string;
  /** compact cards are used inside horizontal rails */
  compact?: boolean;
  /** the first row of a listing: its photo is the page's largest paint, so load it right away */
  priority?: boolean;
}

export function ProductCard({ product, monthly, className, compact, priority }: ProductCardProps) {
  const { addItem, isMutating } = useCart();
  const [colorId, setColorId] = useState(product.variant.color.id);
  const [pending, setPending] = useState(false);
  const [added, setAdded] = useState(false);

  // the full product (variants + per-colour photos) is only fetched once the
  // visitor actually switches colour on the card
  const { data: detail, isFetching } = useQuery({
    queryKey: queryKeys.variants(product.slug),
    queryFn: () => api.get<ProductDetailDto>(`/products/${product.slug}`),
    enabled: colorId !== product.variant.color.id,
    staleTime: 30_000,
  });

  const shown: ProductCardVariant = useMemo(() => {
    if (colorId === product.variant.color.id || !detail) return product.variant;
    const storageId = product.variant.storage.id;
    const forColor = detail.variants.filter((v) => v.colorId === colorId && v.active);
    if (forColor.length === 0) return product.variant;
    const match = forColor.find((v) => v.storageId === storageId) ?? forColor[0]!;
    const color = product.colors.find((c) => c.id === colorId) ?? product.variant.color;
    const storage = product.storages.find((s) => s.id === match.storageId) ?? product.variant.storage;
    return {
      id: match.id,
      sku: match.sku,
      color,
      storage,
      price: match.price,
      compareAtPrice: match.compareAtPrice,
      discountPercent: match.discountPercent,
      availableStock: match.availableStock,
      stockStatus: match.stockStatus,
      shippingTime: match.shippingTime,
      shippingTimeLabel: match.shippingTimeLabel,
      image: detail.images.find((image) => image.colorId === colorId) ?? product.variant.image,
    };
  }, [colorId, detail, product]);

  const href = `/iphone/${product.slug}${colorId !== product.variant.color.id ? `?color=${shown.color.code}` : ''}`;
  const soldOut = shown.availableStock <= 0;
  const saving =
    shown.compareAtPrice && shown.compareAtPrice > shown.price ? shown.compareAtPrice - shown.price : 0;

  async function onAdd() {
    setPending(true);
    try {
      await addItem({ variantId: shown.id });
      setAdded(true);
      window.setTimeout(() => setAdded(false), 1600);
    } finally {
      setPending(false);
    }
  }

  return (
    <article
      className={cn(
        'card-interactive group relative flex flex-col overflow-hidden rounded-panel border border-line bg-canvas',
        compact ? 'w-[15.5rem]' : 'w-full',
        className,
      )}
    >
      <div className="relative">
        <Link href={href} className="relative block aspect-4/5 overflow-hidden bg-surface-2" prefetch={false}>
          <ProductImage
            src={shown.image?.url}
            alt={`${product.name} ${shown.color.name}`}
            sizes="(min-width: 1024px) 280px, (min-width: 640px) 33vw, 45vw"
            priority={priority}
            className="p-3 transition-transform duration-[600ms] ease-out-quint group-hover:scale-[1.06]"
          />
          {soldOut ? (
            <span className="absolute inset-x-0 bottom-0 bg-canvas/90 py-1.5 text-center text-[11px] font-medium text-muted-soft">
              فعلاً ناموجود
            </span>
          ) : null}
        </Link>

        {shown.discountPercent > 0 && !soldOut ? (
          <span className="pointer-events-none absolute start-3 top-3 inline-flex items-center gap-1 rounded-pill bg-danger px-2 py-1 text-[11px] font-semibold text-white shadow-sm">
            <span className="tabular">{formatNumberFa(shown.discountPercent)}٪</span>
            <span className="font-normal">تخفیف</span>
          </span>
        ) : null}

        <WishlistButton
          slug={product.slug}
          name={product.name}
          size={compact ? 'sm' : 'md'}
          className="absolute end-3 top-3"
        />

        {isFetching ? (
          <span className="absolute end-3 bottom-3 grid size-6 place-items-center rounded-full bg-canvas/85">
            <Loader2 className="size-3.5 animate-spin text-muted" />
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link href={href} prefetch={false} className="block">
              <h3 className="truncate text-[15px] font-semibold text-ink">{product.name}</h3>
            </Link>
            <p className="mt-1 truncate text-xs text-muted">
              {shown.storage.labelFa} · {shown.color.name}
            </p>
          </div>
          {product.ratingAvg ? (
            <RatingStars
              value={product.ratingAvg}
              count={product.ratingCount}
              showCount={false}
              className="mt-0.5 shrink-0"
            />
          ) : null}
        </div>

        {product.colors.length > 1 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {product.colors.slice(0, 5).map((color) => (
              <ColorSwatch
                key={color.id}
                color={color}
                size="sm"
                selected={color.id === colorId}
                onSelect={() => setColorId(color.id)}
              />
            ))}
            {product.colors.length > 5 ? (
              <span className="text-[11px] text-muted-faint tabular">+{product.colors.length - 5}</span>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <StockPill status={shown.stockStatus} available={shown.availableStock} />
          {!soldOut ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted">
              <Truck className="size-3.5" aria-hidden />
              {shown.shippingTimeLabel}
            </span>
          ) : null}
        </div>

        <div className="mt-auto space-y-2.5 pt-1">
          <div className="flex items-end justify-between gap-2">
            <Price value={shown.price} compareAt={shown.compareAtPrice} size="sm" />
            {saving > 0 ? (
              <span className="shrink-0 rounded-pill bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success tabular">
                {formatNumberFa(saving)} سود
              </span>
            ) : null}
          </div>

          {monthly ? (
            <p className="truncate rounded-xl bg-surface px-2.5 py-1.5 text-[11px] text-muted">
              قسطی از ماهانه <span className="font-semibold text-ink tabular">{formatNumberFa(monthly)}</span>{' '}
              تومان
            </p>
          ) : null}

          <Button
            size="md"
            className="w-full"
            variant={soldOut ? 'soft' : added ? 'soft' : 'primary'}
            disabled={soldOut || pending || isMutating}
            loading={pending}
            onClick={onAdd}
          >
            {soldOut ? (
              'ناموجود'
            ) : added ? (
              <>
                <Check className="size-4" aria-hidden />
                در سبد
              </>
            ) : (
              <>
                <ShoppingBag className="size-4" aria-hidden />
                افزودن به سبد
              </>
            )}
          </Button>
        </div>
      </div>
    </article>
  );
}
