import Link from 'next/link';
import { ArrowLeft, BadgeCheck, CreditCard, FileSignature, RotateCcw, ShieldCheck } from 'lucide-react';
import { formatNumberFa, type StorefrontConfigDto } from '@iphoneha/shared';

/** Deep links into the buying guide — the sections and their ids are real. */
const cards = (config: Pick<StorefrontConfigDto, 'store' | 'installments'>) => [
  {
    href: '/guide#authenticity',
    icon: BadgeCheck,
    eyebrow: 'اصالت',
    title: 'از کجا بفهمم آیفون اصل است؟',
    body: 'سریال دستگاه پیش از ارسال بررسی و در فاکتور ثبت می‌شود؛ روش استعلام را قدم‌به‌قدم توضیح داده‌ایم.',
  },
  // only when a credit service is actually live; otherwise the warranty takes the slot
  config.installments.length > 0
    ? {
        href: '/guide#installments',
        icon: CreditCard,
        eyebrow: 'اقساط',
        title: 'خرید قسطی چطور انجام می‌شود؟',
        body: 'اعتبارسنجی در درگاه سرویس اعتباری انجام می‌شود و سفارش پس از تأیید نهایی می‌گردد.',
      }
    : {
        href: '/guide#warranty',
        icon: ShieldCheck,
        eyebrow: 'گارانتی',
        title: 'گارانتی دستگاه چطور است؟',
        body:
          config.store.warrantyMonths > 0
            ? `هر دستگاه ${formatNumberFa(config.store.warrantyMonths)} ماه گارانتی ${config.store.name} دارد؛ شرایط پوشش در راهنمای خرید آمده است.`
            : 'شرایط گارانتی هر مدل در صفحهٔ همان محصول آمده است.',
      },
  {
    href: '/guide#cheque',
    icon: FileSignature,
    eyebrow: 'چک و سفته',
    title: 'شرایط خرید با چک صیادی',
    body: 'استعلام سریع چک و تنظیم قرارداد رسمی با جزئیات اقساط، بدون رفت‌وآمد اضافه.',
  },
  {
    href: '/guide#returns',
    icon: RotateCcw,
    eyebrow: 'بازگشت کالا',
    title: 'تا چند روز می‌توانم مرجوع کنم؟',
    body:
      config.store.returnDays > 0
        ? `تا ${formatNumberFa(config.store.returnDays)} روز پس از تحویل، در صورت پلمپ و سالم بودن دستگاه، بازگشت کالا ممکن است.`
        : 'شرایط بازگشت کالا در راهنمای خرید و قوانین فروشگاه آمده است.',
  },
];

export function GuideCards({ config }: { config: Pick<StorefrontConfigDto, 'store' | 'installments'> }) {
  return (
    <ul className="rail sm:grid sm:grid-cols-2 sm:gap-3 sm:overflow-visible lg:grid-cols-4">
      {cards(config).map((card) => (
        <li key={card.href} className="w-[15.5rem] sm:w-auto">
          <Link
            href={card.href}
            className="card-interactive group flex h-full flex-col rounded-panel border border-line bg-canvas p-5"
          >
            <span className="grid size-9 place-items-center rounded-full bg-surface text-ink">
              <card.icon className="size-[18px]" aria-hidden />
            </span>
            <span className="eyebrow mt-4">{card.eyebrow}</span>
            <span className="mt-1.5 block text-[14px] leading-6 font-semibold text-ink">{card.title}</span>
            <span className="mt-2 block text-[12px] leading-6 text-muted">{card.body}</span>
            <span className="mt-4 inline-flex items-center gap-1 text-[12px] font-medium text-ink-muted">
              بیشتر بخوان
              <ArrowLeft
                className="size-3.5 transition-transform duration-300 group-hover:-translate-x-0.5"
                aria-hidden
              />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
