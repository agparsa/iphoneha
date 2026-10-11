'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Heart, Loader2 } from 'lucide-react';
import type { ProductCardDto, ProductListResponse } from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { useWishlist } from '@/hooks/use-wishlist';
import { useInstallmentEstimate } from '@/hooks/use-installment-estimate';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ProductCard } from './product-card';
import { ProductCardSkeleton } from './product-card-skeleton';

/**
 * Favourites live in this browser (see use-wishlist), so the list is resolved
 * client-side: the saved slugs are fetched from the catalog in one request.
 */
export function WishlistView() {
  const { slugs } = useWishlist();
  const monthlyFor = useInstallmentEstimate();
  const key = [...slugs].sort().join(',');

  const { data, isLoading } = useQuery({
    queryKey: ['wishlist', key],
    enabled: slugs.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const search = new URLSearchParams();
      for (const slug of slugs) search.append('model', slug);
      search.set('pageSize', '48');
      const response = await api.get<ProductListResponse>(`/products?${search.toString()}`);
      // keep the order the visitor saved them in
      const bySlug = new Map(response.items.map((item) => [item.slug, item]));
      return slugs
        .map((slug) => bySlug.get(slug))
        .filter((item): item is ProductCardDto => item !== undefined);
    },
  });

  if (slugs.length === 0) {
    return (
      <EmptyState
        icon={Heart}
        title="هنوز چیزی ذخیره نکرده‌ای"
        description="روی آیکن قلب هر محصول بزن تا اینجا ذخیره شود و بعداً راحت پیدایش کنی."
        className="border-dashed"
        action={
          <Button asChild size="md">
            <Link href="/shop">مشاهده آیفون‌ها</Link>
          </Button>
        }
      />
    );
  }

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
        {slugs.slice(0, 8).map((slug) => (
          <ProductCardSkeleton key={slug} />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <EmptyState
        icon={Loader2}
        title="محصولات ذخیره‌شده دیگر در دسترس نیستند"
        description="ممکن است از فروشگاه حذف شده باشند. فهرست کامل محصولات را ببین."
        className="border-dashed"
        action={
          <Button asChild size="md">
            <Link href="/shop">مشاهده آیفون‌ها</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
      {data.map((product) => (
        <ProductCard key={product.id} product={product} monthly={monthlyFor(product.minPrice)} />
      ))}
    </div>
  );
}
