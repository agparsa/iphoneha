import { redirect } from 'next/navigation';
import Link from 'next/link';
import { BookOpenCheck, LogOut, MapPin, Package, Smartphone, UserRound } from 'lucide-react';
import { getMe } from '@/lib/api/endpoints';
import { LogoutButton } from '@/components/store/logout-button';

const LINKS = [
  { href: '/account', label: 'حساب من', icon: UserRound },
  { href: '/account/orders', label: 'سفارش‌ها', icon: Package },
  { href: '/account/installments', label: 'دفترچهٔ اقساط', icon: BookOpenCheck },
  { href: '/account/addresses', label: 'آدرس‌ها', icon: MapPin },
  { href: '/account/sessions', label: 'دستگاه‌های فعال', icon: Smartphone },
];

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await getMe();
  if (!user) redirect('/login?next=/account');

  return (
    <div className="container-page py-5 md:py-8">
      <header className="mb-6">
        <p className="eyebrow">حساب کاربری</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">{user.fullName ?? 'کاربر آیفونی‌ها'}</h1>
        <p className="mt-1 text-[13px] text-muted font-display">{user.phone}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
        <nav className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <ul className="no-scrollbar flex gap-2 overflow-x-auto lg:grid lg:gap-1">
            {LINKS.map((link) => (
              <li key={link.href} className="shrink-0">
                <Link
                  href={link.href}
                  className="flex items-center gap-2.5 rounded-2xl border border-line px-4 py-2.5 text-[13px] text-ink-muted transition-colors hover:bg-surface lg:border-0"
                >
                  <link.icon className="size-4 text-muted" aria-hidden />
                  {link.label}
                </Link>
              </li>
            ))}
            <li className="shrink-0">
              <LogoutButton className="flex items-center gap-2.5 rounded-2xl border border-line px-4 py-2.5 text-[13px] text-danger transition-colors hover:bg-danger-soft lg:border-0">
                <LogOut className="size-4" aria-hidden />
                خروج از حساب
              </LogoutButton>
            </li>
          </ul>
        </nav>

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
