'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Heart, Menu, Phone, ShoppingBag, User } from 'lucide-react';
import { formatNumberFa } from '@iphoneha/shared';
import { useWishlist } from '@/hooks/use-wishlist';
import { useCart } from '@/providers/cart-provider';
import { useSession } from '@/providers/session-provider';
import { useStoreConfig } from '@/providers/store-config-provider';
import { cn, telHref } from '@/lib/utils';
import { Sheet, SheetClose, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { SearchTrigger } from './search-sheet';
import { BrandLogo, BrandMark } from '@/components/brand/brand';

const NAV = [
  { href: '/shop', label: 'فروشگاه' },
  { href: '/installments', label: 'خرید قسطی' },
  { href: '/shop?sort=discount_desc&discounted=true', label: 'تخفیف‌ها' },
  { href: '/guide', label: 'راهنمای خرید' },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { store, models } = useStoreConfig();
  const { itemsCount, openSheet } = useCart();
  const { isAuthenticated } = useSession();
  const { count: savedCount } = useWishlist();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/95">
      {store.announcement ? (
        <div className="hidden bg-brand-deep px-4 py-2 text-center text-[12px] text-white/90 md:block">
          {store.announcement}
          <span className="mx-3 text-white/25">|</span>
          <span className="text-white/70">{store.workingHours}</span>
          <span className="mx-3 text-white/25">|</span>
          <a href={telHref(store.phone)} className="text-white/90 hover:text-white">
            {store.phone}
          </a>
        </div>
      ) : null}

      <div className="container-page flex h-16 items-center gap-3">
        <MobileMenu models={models} />

        <Link href="/" className="flex shrink-0 items-center" aria-label={store.name}>
          {/* the full wordmark from 360px; only the narrowest phones get the monogram */}
          <BrandMark className="size-10 min-[360px]:hidden" />
          <BrandLogo className="hidden h-8 min-[360px]:block sm:h-10" />
        </Link>

        <nav className="ms-6 hidden items-center gap-1 lg:flex">
          {NAV.map((item) => {
            const active = pathname === item.href.split('?')[0];
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'rounded-pill px-3.5 py-2 text-[13px] font-medium transition-colors',
                  active ? 'bg-surface text-ink' : 'text-muted hover:bg-surface hover:text-ink',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ms-auto flex items-center gap-1.5">
          <SearchTrigger />

          <a
            href={telHref(store.phone)}
            className="hidden size-10 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink md:grid"
            aria-label="تماس با پشتیبانی"
          >
            <Phone className="size-[18px]" />
          </a>

          <Link
            href="/wishlist"
            className="relative hidden size-10 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink sm:grid"
            aria-label={`علاقه‌مندی‌ها${savedCount > 0 ? ` (${formatNumberFa(savedCount)} کالا)` : ''}`}
          >
            <Heart className="size-[18px]" />
            {savedCount > 0 ? (
              <span className="absolute -end-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white tabular">
                {formatNumberFa(savedCount)}
              </span>
            ) : null}
          </Link>

          <Link
            href={isAuthenticated ? '/account' : '/login'}
            className="hidden size-10 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink sm:grid"
            aria-label={isAuthenticated ? 'حساب کاربری' : 'ورود یا ثبت‌نام'}
          >
            <User className="size-[18px]" />
          </Link>

          <button
            type="button"
            onClick={openSheet}
            className="relative grid size-10 place-items-center rounded-full text-ink transition-colors hover:bg-surface"
            aria-label={`سبد خرید (${itemsCount} کالا)`}
          >
            <ShoppingBag className="size-[18px]" />
            {itemsCount > 0 ? (
              <span className="absolute -end-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-ink px-1 text-[10px] font-semibold text-white tabular">
                {formatNumberFa(itemsCount)}
              </span>
            ) : null}
          </button>
        </div>
      </div>
    </header>
  );
}

function MobileMenu({ models }: { models: { slug: string; name: string; series: string }[] }) {
  return (
    <Sheet>
      <SheetTrigger
        className="grid size-10 place-items-center rounded-full text-ink transition-colors hover:bg-surface lg:hidden"
        aria-label="منو"
      >
        <Menu className="size-[18px]" />
      </SheetTrigger>
      <SheetContent side="end" title="منو" className="lg:hidden">
        <div className="flex-1 overflow-y-auto p-5">
          <nav className="grid gap-1">
            {NAV.map((item) => (
              <SheetClose asChild key={item.href}>
                <Link
                  href={item.href}
                  className="rounded-2xl px-4 py-3 text-sm font-medium text-ink hover:bg-surface"
                >
                  {item.label}
                </Link>
              </SheetClose>
            ))}
            <SheetClose asChild>
              <Link
                href="/wishlist"
                className="flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium text-ink hover:bg-surface"
              >
                <Heart className="size-4 text-muted" aria-hidden />
                علاقه‌مندی‌ها
              </Link>
            </SheetClose>
          </nav>

          <p className="eyebrow mt-6 mb-2 px-4">Models</p>
          <nav className="grid gap-1">
            {models.map((model) => (
              <SheetClose asChild key={model.slug}>
                <Link
                  href={`/iphone/${model.slug}`}
                  className="flex items-center justify-between rounded-2xl px-4 py-3 text-sm text-ink-muted hover:bg-surface"
                >
                  {model.name}
                  <span className="text-[11px] text-muted-faint">{model.series}</span>
                </Link>
              </SheetClose>
            ))}
          </nav>
        </div>
      </SheetContent>
    </Sheet>
  );
}
