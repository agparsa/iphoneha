import Link from 'next/link';
import { Camera, Clock, Mail, MapPin, Phone, Send, ShieldCheck } from 'lucide-react';
import {
  PAYMENT_METHOD_INFO,
  formatNumberFa,
  type PaymentMethod,
  type StorefrontConfigDto,
} from '@iphoneha/shared';
import { PaymentLogo } from './payment-logo';
import { EnamadSeal } from './enamad-seal';
import { BrandLogo } from '@/components/brand/brand';
import { CREDIT_PAGES, offeredMethods } from '@/lib/credit';
import { telHref } from '@/lib/utils';

const LEGAL_LINKS = [
  { href: '/about', label: 'درباره ما' },
  { href: '/contact', label: 'تماس با ما' },
  { href: '/terms', label: 'قوانین و مقررات' },
  { href: '/privacy', label: 'حریم خصوصی' },
];

const solarYear = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric' });

const COLUMNS = [
  {
    title: 'فروشگاه',
    links: [
      { href: '/shop', label: 'همه محصولات' },
      { href: '/shop?discounted=true&sort=discount_desc', label: 'تخفیف‌دارها' },
      { href: '/shop?inStock=true', label: 'موجود در انبار' },
      { href: '/wishlist', label: 'علاقه‌مندی‌ها' },
    ],
  },
  {
    title: 'خدمات مشتریان',
    links: [
      { href: '/account/orders', label: 'پیگیری سفارش' },
      { href: '/guide', label: 'راهنمای خرید' },
      { href: '/guide#warranty', label: 'گارانتی و اصالت' },
      { href: '/guide#returns', label: 'بازگشت کالا' },
    ],
  },
];

export function SiteFooter({ config }: { config: StorefrontConfigDto }) {
  const { store, commerce } = config;
  // only methods a customer can actually use today — never an advertised-but-dead one
  const paymentMethods: PaymentMethod[] = [
    ...(config.disabledMethods.includes('ONLINE') ? [] : (['ONLINE'] as const)),
    ...config.installments.map((term) => term.method),
  ];
  const promises = [
    'فروش آیفون آکبند و اصل، با ضمانت اصالت کالا',
    store.warrantyMonths > 0 ? `گارانتی ${formatNumberFa(store.warrantyMonths)} ماهه` : null,
    config.installments.length > 0
      ? `امکان خرید قسطی از ${formatNumberFa(config.installments.length)} سرویس اعتباری معتبر`
      : 'امکان خرید اقساطی با چک و سفته',
  ].filter(Boolean);

  // every page links to every model on sale, so no product page is more than
  // one click from anywhere (and crawlers find a new model on the next visit)
  const columns = [
    ...(config.models.length > 0
      ? [
          {
            title: 'مدل‌های آیفون',
            links: config.models.map((model) => ({ href: `/iphone/${model.slug}`, label: model.name })),
          },
        ]
      : []),
    // the instalment pages and the magazine, linked from every page with the
    // words people search for them with
    {
      title: 'خرید قسطی',
      links: [
        { href: '/installments', label: 'آیفون قسطی' },
        ...offeredMethods(config).map((method) => ({
          href: CREDIT_PAGES[method].path,
          label: CREDIT_PAGES[method].title,
        })),
        { href: '/mag', label: 'مجلهٔ آیفونی‌ها' },
      ],
    },
    ...COLUMNS,
  ];

  return (
    <footer className="mt-16 border-t border-line bg-surface-2">
      <div className="container-page grid grid-cols-2 gap-x-6 gap-y-10 py-12 lg:grid-cols-6">
        <div className="col-span-2">
          <div>
            <BrandLogo className="h-11" />
            <p className="mt-2 text-[11px] text-muted">{store.tagline}</p>
          </div>
          <p className="mt-4 max-w-sm text-[13px] leading-7 text-muted">{promises.join('، ')}.</p>

          <ul className="mt-5 grid gap-2.5 text-[13px] text-muted">
            <li className="flex items-center gap-2">
              <Phone className="size-4 text-muted-faint" />
              <a href={telHref(store.phone)} className="hover:text-ink">
                {store.phone}
              </a>
            </li>
            {store.email ? (
              <li className="flex items-center gap-2">
                <Mail className="size-4 text-muted-faint" />
                <a href={`mailto:${store.email}`} className="hover:text-ink font-display">
                  {store.email}
                </a>
              </li>
            ) : null}
            {store.address ? (
              <li className="flex items-center gap-2">
                <MapPin className="size-4 text-muted-faint" />
                {store.address}
              </li>
            ) : null}
            {store.workingHours ? (
              <li className="flex items-center gap-2">
                <Clock className="size-4 text-muted-faint" />
                {store.workingHours}
              </li>
            ) : null}
          </ul>

          {store.instagram || store.telegram ? (
            <div className="mt-5 flex items-center gap-2">
              {store.instagram ? (
                <a
                  href={`https://instagram.com/${store.instagram.replace('@', '')}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label="اینستاگرام آیفونی‌ها"
                  className="grid size-9 place-items-center rounded-full border border-line text-muted transition-colors hover:border-ink hover:text-ink"
                >
                  <Camera className="size-4" aria-hidden />
                </a>
              ) : null}
              {store.telegram ? (
                <a
                  href={`https://t.me/${store.telegram.replace('@', '')}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label="تلگرام آیفونی‌ها"
                  className="grid size-9 place-items-center rounded-full border border-line text-muted transition-colors hover:border-ink hover:text-ink"
                >
                  <Send className="size-4" aria-hidden />
                </a>
              ) : null}
            </div>
          ) : null}
        </div>

        {columns.map((column) => (
          <div key={column.title}>
            <p className="mb-3 text-[13px] font-semibold text-ink">{column.title}</p>
            <ul className="grid gap-2.5">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-[13px] text-muted transition-colors hover:text-ink">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-line">
        <div className="container-page flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {paymentMethods.length > 0 ? (
              <>
                <p className="text-[12px] font-medium text-ink">
                  {config.installments.length > 0 ? 'روش‌های پرداخت و خرید اقساطی' : 'روش پرداخت'}
                </p>
                <ul className="mt-3 flex flex-wrap items-center gap-2">
                  {paymentMethods.map((method) => (
                    <li
                      key={method}
                      className="flex items-center gap-2 rounded-pill border border-line bg-canvas py-1 pe-3 ps-1"
                    >
                      <PaymentLogo method={method} size={24} rounded="full" />
                      <span className="text-[11px] text-ink-muted">{PAYMENT_METHOD_INFO[method].name}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <EnamadSeal id={store.enamadId} code={store.enamadCode} />
            <ul className="grid shrink-0 gap-2 text-[11px] text-muted">
              <li className="inline-flex items-center gap-1.5">
                <ShieldCheck className="size-3.5 text-success" aria-hidden />
                پرداخت امن روی بستر رمزنگاری‌شده
              </li>
              <li className="inline-flex items-center gap-1.5">
                <ShieldCheck className="size-3.5 text-success" aria-hidden />
                ورود فقط با کد یک‌بارمصرف، بدون رمز عبور
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-line">
        <div className="container-page flex flex-col items-center justify-between gap-3 py-5 text-[11px] text-muted sm:flex-row">
          <p>
            © {solarYear.format(new Date())} {store.name} — تمام حقوق محفوظ است.
          </p>
          <nav aria-label="قوانین و اطلاعات فروشگاه">
            <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
              {LEGAL_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="transition-colors hover:text-ink">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          {commerce.freeShippingThreshold ? (
            <p className="inline-flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-success" />
              ارسال رایگان سفارش‌های بالای {formatNumberFa(commerce.freeShippingThreshold / 1_000_000)} میلیون
              تومان
            </p>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
