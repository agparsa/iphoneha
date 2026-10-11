import type { Metadata } from 'next';
import Link from 'next/link';
import { CREDIT_PAGES, offeredMethods } from '@/lib/credit';
import { formatNumberFa } from '@iphoneha/shared';
import {
  BadgeCheck,
  CreditCard,
  FileSignature,
  PackageCheck,
  RotateCcw,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import type { StorefrontConfigDto } from '@iphoneha/shared';
import { getStorefrontConfig } from '@/lib/api/endpoints';
import { breadcrumbLd, faqLd, jsonLdScript } from '@/lib/seo';
import {
  chequeSentence,
  installmentServiceNames,
  purchaseFaq,
  returnsSentence,
  warrantySentence,
} from '@/lib/store-copy';
import { FaqSection } from '@/components/store/faq-section';
import { SectionHeader } from '@/components/store/section-header';
import { telHref } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'راهنمای خرید آیفون',
  description:
    'همه چیز درباره خرید آیفون از آیفونی‌ها: اصالت کالا، گارانتی، ارسال، بازگشت کالا و خرید اقساطی.',
  alternates: { canonical: '/guide' },
};

export const revalidate = 3600;

/** Built from the live settings, so every promise here is one the store actually makes. */
function sections(config: StorefrontConfigDto) {
  const warranty = warrantySentence(config);
  return [
    {
      id: 'authenticity',
      icon: BadgeCheck,
      title: 'اصالت و آکبند بودن',
      body: 'همه دستگاه‌ها آکبند، پلمپ و اصل‌اند. پیش از ارسال، سریال دستگاه بررسی و در فاکتور ثبت می‌شود تا اصالت کالا برای تو قابل پیگیری باشد.',
    },
    {
      id: 'warranty',
      icon: ShieldCheck,
      title:
        config.store.warrantyMonths > 0
          ? `گارانتی ${formatNumberFa(config.store.warrantyMonths)} ماهه`
          : 'گارانتی',
      body: warranty ?? 'شرایط گارانتی هر مدل در صفحهٔ همان محصول آمده است.',
    },
    {
      id: 'shipping',
      icon: Truck,
      title: 'ارسال و تحویل',
      body: 'روش‌های ارسال، هزینه و زمان تقریبی تحویل هر کدام پیش از پرداخت در مرحلهٔ تسویه نمایش داده می‌شود. زمان آماده‌سازی هر کالا روی همان کالا نوشته شده و در فاکتور ثبت می‌شود.',
    },
    { id: 'returns', icon: RotateCcw, title: 'بازگشت کالا', body: returnsSentence(config) },
    config.installments.length > 0
      ? {
          id: 'installments',
          icon: CreditCard,
          title: 'خرید قسطی',
          body: `در مرحله پرداخت می‌توانی یکی از سرویس‌های اعتباری (${installmentServiceNames(config)}) را انتخاب کنی. پس از اعتبارسنجی در درگاه همان سرویس، سفارش نهایی می‌شود و اقساط طبق قرارداد همان سرویس پرداخت می‌گردد.`,
        }
      : null,
    {
      id: 'cheque',
      icon: FileSignature,
      title: 'خرید با چک و سفته',
      body: chequeSentence(),
      links: [
        { href: '/installments', label: 'آیفون قسطی' },
        ...offeredMethods(config).map((method) => ({
          href: CREDIT_PAGES[method].path,
          label: CREDIT_PAGES[method].title,
        })),
      ],
    },
    {
      id: 'terms',
      icon: PackageCheck,
      title: 'قوانین و حریم خصوصی',
      body: 'اطلاعات حساب و سفارش‌ها فقط برای پردازش سفارش، ارسال و پشتیبانی استفاده می‌شود. ورود به حساب تنها با شماره موبایل و کد یک‌بارمصرف انجام می‌شود و رمز عبوری ذخیره نمی‌کنیم. متن کامل در صفحه‌های قوانین و مقررات و حریم خصوصی آمده است.',
    },
  ].filter((section) => section !== null);
}

export default async function GuidePage() {
  const config = await getStorefrontConfig();
  const faq = purchaseFaq(config);

  return (
    <div className="container-page space-y-12 py-5 md:py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          faqLd(faq),
          breadcrumbLd([
            { name: 'خانه', href: '/' },
            { name: 'راهنمای خرید', href: '/guide' },
          ]),
        ])}
      />

      <header>
        <p className="eyebrow">Guide</p>
        <h1 className="mt-3 text-3xl font-semibold text-ink">راهنمای خرید آیفون</h1>
        <p className="mt-3 max-w-2xl text-[13px] leading-7 text-muted">
          پیش از خرید، این نکته‌ها را بخوان تا بدانی دستگاه با چه شرایطی به دستت می‌رسد. اگر سؤالی ماند، با{' '}
          <a href={telHref(config.store.phone)} className="text-ink underline underline-offset-4">
            {config.store.phone}
          </a>{' '}
          تماس بگیر.
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        {sections(config).map((section) => (
          <section
            key={section.id}
            id={section.id}
            className="scroll-mt-24 rounded-panel border border-line p-5"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-full bg-surface text-ink">
                <section.icon className="size-[18px]" aria-hidden />
              </span>
              <h2 className="text-[15px] font-semibold text-ink">{section.title}</h2>
            </div>
            <p className="mt-3 text-[13px] leading-7 text-muted">{section.body}</p>
            {'links' in section && section.links ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="inline-flex items-center rounded-pill border border-line px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-surface"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>

      <section>
        <SectionHeader eyebrow="FAQ" title="سؤال‌های پرتکرار" />
        <FaqSection items={faq} />
      </section>
    </div>
  );
}
