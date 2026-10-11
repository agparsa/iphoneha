'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CreditCard, Home, ShoppingBag, Store, User } from 'lucide-react';
import { formatNumberFa } from '@iphoneha/shared';
import { useCart } from '@/providers/cart-provider';
import { useSession } from '@/providers/session-provider';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/', label: 'خانه', icon: Home },
  { href: '/shop', label: 'فروشگاه', icon: Store },
  { href: '/installments', label: 'اقساط', icon: CreditCard },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const { itemsCount, openSheet } = useCart();
  const { isAuthenticated } = useSession();

  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas lg:hidden">
      <ul className="container-page grid grid-cols-5 items-center">
        {ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  'flex flex-col items-center gap-1 py-2.5 text-[10px] transition-colors',
                  active ? 'text-ink' : 'text-muted',
                )}
              >
                <item.icon className={cn('size-5', active && 'stroke-[2.2]')} aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={openSheet}
            className="relative flex w-full flex-col items-center gap-1 py-2.5 text-[10px] text-muted"
          >
            <span className="relative">
              <ShoppingBag className="size-5" aria-hidden />
              {itemsCount > 0 ? (
                <span className="absolute -end-2 -top-1.5 grid min-w-4 place-items-center rounded-full bg-ink px-1 text-[9px] font-semibold text-white tabular">
                  {formatNumberFa(itemsCount)}
                </span>
              ) : null}
            </span>
            سبد خرید
          </button>
        </li>
        <li>
          <Link
            href={isAuthenticated ? '/account' : '/login'}
            className={cn(
              'flex flex-col items-center gap-1 py-2.5 text-[10px] transition-colors',
              pathname.startsWith('/account') || pathname.startsWith('/login') ? 'text-ink' : 'text-muted',
            )}
          >
            <User className="size-5" aria-hidden />
            حساب
          </Link>
        </li>
      </ul>
    </nav>
  );
}
