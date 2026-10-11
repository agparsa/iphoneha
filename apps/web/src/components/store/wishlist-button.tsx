'use client';

import { Heart } from 'lucide-react';
import { toast } from 'sonner';
import { useWishlist } from '@/hooks/use-wishlist';
import { cn } from '@/lib/utils';

/**
 * Favourites are local to the browser, so the heart never blocks on a request
 * and works for signed-out visitors too.
 */
export function WishlistButton({
  slug,
  name,
  size = 'md',
  className,
}: {
  slug: string;
  name: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const { has, toggle } = useWishlist();
  const saved = has(slug);

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? `حذف ${name} از علاقه‌مندی‌ها` : `افزودن ${name} به علاقه‌مندی‌ها`}
      title={saved ? 'حذف از علاقه‌مندی‌ها' : 'افزودن به علاقه‌مندی‌ها'}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const added = toggle(slug);
        toast.success(added ? 'به علاقه‌مندی‌ها اضافه شد' : 'از علاقه‌مندی‌ها حذف شد');
      }}
      className={cn(
        'grid place-items-center rounded-full border border-line bg-canvas/95 text-muted transition-[color,border-color,transform] duration-200 hover:text-ink active:scale-90',
        size === 'md' ? 'size-9' : 'size-8',
        saved && 'border-danger/30 text-danger hover:text-danger',
        className,
      )}
    >
      <Heart
        className={cn(size === 'md' ? 'size-[17px]' : 'size-[15px]')}
        fill={saved ? 'currentColor' : 'none'}
        strokeWidth={1.8}
        aria-hidden
      />
    </button>
  );
}
