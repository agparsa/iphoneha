'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  Boxes,
  ChartLine,
  CreditCard,
  FileClock,
  HandCoins,
  LayoutDashboard,
  LogOut,
  Menu,
  Newspaper,
  NotebookPen,
  Package,
  Palette,
  Percent,
  ScanBarcode,
  Settings,
  ShoppingCart,
  Tags,
  Truck,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { AdminMeDto, CreditRequestSummaryDto, Permission } from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { cn } from '@/lib/utils';
import { formatNumberFa } from '@iphoneha/shared';
import { BrandMark } from '@/components/brand/brand';
import { useCreditRequestWatch } from './credit-request-watch';

const NAV: { href: string; label: string; icon: typeof LayoutDashboard; permission: Permission }[] = [
  { href: '/admin', label: 'داشبورد', icon: LayoutDashboard, permission: 'dashboard.read' },
  { href: '/admin/orders', label: 'سفارش‌ها', icon: ShoppingCart, permission: 'orders.read' },
  { href: '/admin/installments', label: 'دفتر اقساط', icon: NotebookPen, permission: 'installments.read' },
  { href: '/admin/credit-requests', label: 'درخواست‌های اقساط', icon: HandCoins, permission: 'leads.read' },
  { href: '/admin/products', label: 'محصولات', icon: Package, permission: 'products.read' },
  { href: '/admin/pricing', label: 'قیمت‌ها', icon: Tags, permission: 'products.read' },
  { href: '/admin/options', label: 'رنگ و حافظه', icon: Palette, permission: 'products.read' },
  { href: '/admin/inventory', label: 'انبار', icon: Boxes, permission: 'inventory.read' },
  { href: '/admin/devices', label: 'گوشی‌ها (IMEI)', icon: ScanBarcode, permission: 'inventory.read' },
  { href: '/admin/payments', label: 'پرداخت‌ها', icon: CreditCard, permission: 'payments.read' },
  { href: '/admin/reports', label: 'گزارش فروش', icon: ChartLine, permission: 'reports.read' },
  { href: '/admin/discounts', label: 'تخفیف‌ها', icon: Percent, permission: 'discounts.read' },
  { href: '/admin/shipping', label: 'ارسال', icon: Truck, permission: 'shipping.read' },
  { href: '/admin/articles', label: 'مجله', icon: Newspaper, permission: 'content.read' },
  { href: '/admin/users', label: 'کاربران', icon: Users, permission: 'users.read' },
  { href: '/admin/audit-logs', label: 'گزارش فعالیت', icon: FileClock, permission: 'audit.read' },
  { href: '/admin/settings', label: 'تنظیمات', icon: Settings, permission: 'settings.read' },
];

export function AdminShell({
  admin,
  creditRequests = null,
  children,
}: {
  admin: AdminMeDto;
  /** requests waiting for a call (null: this admin cannot see them) */
  creditRequests?: CreditRequestSummaryDto | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const waitingRequests = useCreditRequestWatch(creditRequests);
  /** a count next to a menu entry, keyed by its href (0 hides it) */
  const badges: Record<string, number> = { '/admin/credit-requests': waitingRequests };

  const items = NAV.filter((item) => admin.permissions.includes(item.permission));

  async function logout() {
    try {
      await api.post('/admin/auth/logout');
      toast.success('از پنل خارج شدی');
      router.replace('/admin/login');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <div className="flex min-h-dvh bg-surface-2">
      <aside
        className={cn(
          'fixed inset-y-0 start-0 z-50 flex w-64 shrink-0 flex-col border-e border-line bg-canvas transition-transform lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0',
          open ? 'translate-x-0' : 'translate-x-full lg:translate-x-0',
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-5">
          <Link href="/admin" className="flex items-center gap-2.5">
            <BrandMark className="size-9" />
            <span className="text-[13px] font-semibold text-ink">پنل مدیریت</span>
          </Link>
          <button
            type="button"
            className="grid size-8 place-items-center rounded-full text-muted lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="بستن منو"
          >
            <X className="size-4" />
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto p-3" aria-label="منوی پنل">
          <ul className="grid gap-1">
            {items.map((item) => {
              const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      'flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-[13px] transition-colors',
                      active ? 'bg-ink text-white' : 'text-ink-muted hover:bg-surface',
                    )}
                  >
                    <item.icon className="size-4" aria-hidden />
                    {item.label}
                    {badges[item.href] ? (
                      <span
                        className={cn(
                          'ms-auto min-w-5 rounded-pill px-1.5 py-0.5 text-center text-[11px] font-semibold tabular',
                          active ? 'bg-white text-ink' : 'bg-brand-ink text-white',
                        )}
                      >
                        {formatNumberFa(badges[item.href] ?? 0)}
                        <span className="sr-only"> مورد جدید</span>
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="shrink-0 border-t border-line p-3">
          <div className="rounded-2xl bg-surface px-3.5 py-3">
            <p className="text-[13px] font-medium text-ink">{admin.name}</p>
            <p className="mt-0.5 text-[11px] text-muted">{admin.roleLabel}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="mt-2 flex w-full items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-[13px] text-danger transition-colors hover:bg-danger-soft"
          >
            <LogOut className="size-4" aria-hidden />
            خروج
          </button>
        </div>
      </aside>

      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-ink/20 lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="بستن منو"
        />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-canvas/90 px-4 backdrop-blur-xl lg:px-6">
          <button
            type="button"
            className="grid size-9 place-items-center rounded-full text-ink lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="باز کردن منو"
          >
            <Menu className="size-[18px]" />
          </button>
          <Link href="/" className="text-[12px] text-muted hover:text-ink">
            مشاهده فروشگاه
          </Link>
          <span className="ms-auto inline-flex items-center gap-1.5 text-[11px] text-muted">
            <BarChart3 className="size-3.5" aria-hidden />
            آیفونی‌ها
          </span>
        </header>

        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
