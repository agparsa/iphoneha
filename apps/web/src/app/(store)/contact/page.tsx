import type { Metadata } from 'next';
import Link from 'next/link';
import { Camera, Clock, Mail, MapPin, PackageSearch, Phone, Send, Smartphone } from 'lucide-react';
import { getStorefrontConfig } from '@/lib/api/endpoints';
import { LegalPage } from '@/components/store/legal-page';
import { telHref } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'تماس با ما',
  description: 'راه‌های تماس با آیفونی‌ها: تلفن، ساعات کاری، آدرس و پیگیری سفارش.',
  alternates: { canonical: '/contact' },
};

export const revalidate = 300;

interface ContactItem {
  icon: typeof Phone;
  label: string;
  value: string;
  href?: string;
  ltr?: boolean;
}

/** Only channels the store has actually filled in are shown — nothing is made up. */
export default async function ContactPage() {
  const { store } = await getStorefrontConfig();

  const candidates: (ContactItem | null)[] = [
    { icon: Phone, label: 'تلفن', value: store.phone, href: telHref(store.phone) },
    store.supportMobile
      ? {
          icon: Smartphone,
          label: 'موبایل پشتیبانی',
          value: store.supportMobile,
          href: telHref(store.supportMobile),
        }
      : null,
    store.email
      ? { icon: Mail, label: 'ایمیل', value: store.email, href: `mailto:${store.email}`, ltr: true }
      : null,
    store.workingHours ? { icon: Clock, label: 'ساعات پاسخگویی', value: store.workingHours } : null,
    store.address ? { icon: MapPin, label: 'آدرس', value: store.address } : null,
    store.instagram
      ? {
          icon: Camera,
          label: 'اینستاگرام',
          value: `@${store.instagram.replace('@', '')}`,
          href: `https://instagram.com/${store.instagram.replace('@', '')}`,
          ltr: true,
        }
      : null,
    store.telegram
      ? {
          icon: Send,
          label: 'تلگرام',
          value: `@${store.telegram.replace('@', '')}`,
          href: `https://t.me/${store.telegram.replace('@', '')}`,
          ltr: true,
        }
      : null,
  ];
  const items = candidates.filter((item): item is ContactItem => item !== null);

  return (
    <LegalPage
      eyebrow="Contact"
      title="تماس با ما"
      path="/contact"
      intro={
        <p>
          برای مشاوره پیش از خرید، خرید اقساطی با چک و سفته، پیگیری سفارش یا بازگشت کالا با ما در تماس باشید.
        </p>
      }
    >
      <ul className="mt-10 grid max-w-4xl gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.label} className="flex items-start gap-3 rounded-panel border border-line p-5">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-ink">
              <item.icon className="size-[18px]" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[12px] text-muted">{item.label}</p>
              {item.href ? (
                <a
                  href={item.href}
                  dir={item.ltr ? 'ltr' : undefined}
                  className="mt-1 block break-words text-[15px] font-semibold text-ink hover:underline"
                  {...(item.href.startsWith('http') ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
                >
                  {item.value}
                </a>
              ) : (
                <p className="mt-1 text-[14px] leading-7 text-ink">{item.value}</p>
              )}
            </div>
          </li>
        ))}
        <li className="flex items-start gap-3 rounded-panel border border-line p-5">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-ink">
            <PackageSearch className="size-[18px]" aria-hidden />
          </span>
          <div>
            <p className="text-[12px] text-muted">پیگیری سفارش</p>
            <Link
              href="/account/orders"
              className="mt-1 block text-[15px] font-semibold text-ink hover:underline"
            >
              سفارش‌های من
            </Link>
          </div>
        </li>
      </ul>
    </LegalPage>
  );
}
