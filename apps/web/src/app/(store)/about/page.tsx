import type { Metadata } from 'next';
import Link from 'next/link';
import { BadgeCheck, CreditCard, RotateCcw, ShieldCheck, Truck } from 'lucide-react';
import { formatNumberFa } from '@iphoneha/shared';
import { getStorefrontConfig } from '@/lib/api/endpoints';
import { installmentServiceNames } from '@/lib/store-copy';
import { Button } from '@/components/ui/button';
import { LegalPage } from '@/components/store/legal-page';

export const metadata: Metadata = {
  title: 'درباره ما',
  description: 'آیفونی‌ها فروشگاه تخصصی آیفون آکبند و اصل است؛ با ضمانت اصالت، گارانتی و امکان خرید اقساطی.',
  alternates: { canonical: '/about' },
};

export const revalidate = 300;

export default async function AboutPage() {
  const config = await getStorefrontConfig();
  const { store } = config;

  const promises = [
    {
      icon: BadgeCheck,
      title: 'فقط آیفون آکبند و اصل',
      body: 'همهٔ دستگاه‌ها پلمپ و اصل‌اند و سریال هر کدام پیش از ارسال بررسی و در فاکتور ثبت می‌شود.',
    },
    store.warrantyMonths > 0
      ? {
          icon: ShieldCheck,
          title: `${formatNumberFa(store.warrantyMonths)} ماه گارانتی`,
          body: `هر دستگاه با گارانتی ${formatNumberFa(store.warrantyMonths)} ماهه ${store.name} عرضه می‌شود.`,
        }
      : null,
    {
      icon: CreditCard,
      title: 'پرداخت نقدی یا اقساطی',
      body:
        config.installments.length > 0
          ? `پرداخت آنلاین، خرید قسطی با ${installmentServiceNames(config)}، و خرید با چک صیادی یا سفته.`
          : 'پرداخت آنلاین، یا خرید اقساطی با چک صیادی و سفته با قرارداد رسمی.',
    },
    {
      icon: Truck,
      title: 'ارسال به سراسر ایران',
      body: 'روش، هزینه و زمان تقریبی ارسال پیش از پرداخت مشخص است و کد رهگیری در حساب شما ثبت می‌شود.',
    },
    store.returnDays > 0
      ? {
          icon: RotateCcw,
          title: `${formatNumberFa(store.returnDays)} روز مهلت بازگشت`,
          body: 'اگر پشیمان شدید، دستگاه پلمپ و سالم را در این مدت بازگردانید.',
        }
      : null,
  ].filter((item) => item !== null);

  return (
    <LegalPage
      eyebrow="About"
      title={`درباره ${store.name}`}
      path="/about"
      intro={
        <>
          <p>
            {store.name}
            {store.tagline ? ` — ${store.tagline} —` : ''} فروشگاهی تخصصی برای خرید آیفون است. تمرکز ما فقط
            روی آیفون است تا بتوانیم اصالت، قیمت شفاف و پشتیبانی واقعی را برای هر دستگاه تضمین کنیم.
          </p>
          <p className="mt-3">
            در {store.name} قیمت و موجودی هر ترکیب رنگ و حافظه همان لحظه نمایش داده می‌شود و ورود و خرید فقط
            با شمارهٔ موبایل و بدون رمز عبور انجام می‌شود.
          </p>
        </>
      }
    >
      <ul className="mt-10 grid max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {promises.map((item) => (
          <li key={item.title} className="rounded-panel border border-line p-5">
            <span className="grid size-9 place-items-center rounded-full bg-surface text-ink">
              <item.icon className="size-[18px]" aria-hidden />
            </span>
            <p className="mt-4 text-[14px] font-semibold text-ink">{item.title}</p>
            <p className="mt-1.5 text-[12px] leading-6 text-muted">{item.body}</p>
          </li>
        ))}
      </ul>

      <div className="mt-10 flex flex-wrap gap-3">
        <Button asChild size="md">
          <Link href="/shop">مشاهدهٔ محصولات</Link>
        </Button>
        <Button asChild size="md" variant="outline">
          <Link href="/contact">تماس با ما</Link>
        </Button>
      </div>
    </LegalPage>
  );
}
