import type { CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarCheck2, FileSignature, Headphones, Phone, ShieldCheck } from 'lucide-react';
import { PulseRing } from '@/components/motion/pulse-ring';
import { Reveal } from '@/components/motion/reveal';
import { telHref } from '@/lib/utils';

const PROMISES = [
  { icon: FileSignature, title: 'قرارداد رسمی', text: 'ثبت مکتوب مبلغ، اقساط و تاریخ‌ها' },
  { icon: ShieldCheck, title: 'بدون بهره پنهان', text: 'همه هزینه‌ها پیش از امضا اعلام می‌شود' },
  { icon: Headphones, title: 'پشتیبانی اختصاصی', text: 'کارشناس تا تحویل دستگاه همراه توست' },
];

/** «روش ویژه آیفونی‌ها» — buying with a cheque or promissory note, on a dark-green panel. */
export function CheckPurchase({ phone }: { phone: string }) {
  return (
    <section className="relative isolate overflow-hidden rounded-panel bg-brand-deep text-white">
      <span aria-hidden className="panel-grid absolute inset-0 -z-10" />
      <span
        aria-hidden
        className="animate-drift absolute -top-28 -left-24 -z-10 size-80 rounded-full bg-brand/45 blur-3xl"
      />
      <span
        aria-hidden
        className="animate-drift-slow absolute -right-16 -bottom-32 -z-10 size-80 rounded-full bg-brand-mint/15 blur-3xl"
      />

      <div className="grid gap-8 p-6 md:grid-cols-[1.2fr_1fr] md:items-center md:p-10">
        <div>
          <p className="inline-flex items-center gap-2 rounded-pill bg-white/10 px-3 py-1 text-[11px] font-medium text-brand-mint">
            <span className="relative flex size-2" aria-hidden>
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-mint opacity-70" />
              <span className="relative inline-flex size-2 rounded-full bg-brand-mint" />
            </span>
            روش ویژه آیفونی‌ها
          </p>
          <h2 className="mt-4 text-2xl font-semibold leading-[1.35] text-balance sm:text-3xl">
            خرید آیفون با چک و سفته
          </h2>
          <p className="mt-4 max-w-lg text-[13px] leading-7 text-white/75">
            اگر ترجیح می‌دهی بدون سرویس‌های اعتباری خرید کنی، آیفون خود را با چک صیادی یا سفته تهیه کن؛
            استعلام سریع، بدون بهره پنهان و با قرارداد رسمی.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            {['چک صیادی', 'سفته'].map((label) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 rounded-pill border border-white/15 bg-white/5 px-3 py-1 text-[12px] text-white/90"
              >
                <CalendarCheck2 className="size-3.5 text-brand-mint" aria-hidden />
                {label}
              </span>
            ))}
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <PulseRing color="#bfe3d2">
              <Link
                href="/installments/cheque"
                style={{ '--shine': 'rgb(255 255 255 / 0.7)' } as CSSProperties}
                className="shine relative inline-flex h-13 items-center gap-2 rounded-pill bg-brand-mint px-7 text-[15px] font-semibold text-brand-deep transition-[transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-white active:scale-[0.98]"
              >
                <FileSignature className="size-5" aria-hidden />
                خرید گوشی با چک
              </Link>
            </PulseRing>
            <Link
              href="/installments/safte"
              className="group inline-flex h-13 items-center gap-2 rounded-pill border border-white/20 px-6 text-[14px] font-medium text-white transition-colors hover:bg-white/10"
            >
              خرید آیفون با سفته
              <ArrowLeft
                className="size-4 transition-transform duration-300 group-hover:-translate-x-1"
                aria-hidden
              />
            </Link>
            <a
              href={telHref(phone)}
              className="inline-flex h-13 items-center gap-2 rounded-pill px-3 text-[14px] font-medium text-white/85 transition-colors hover:text-white"
            >
              <Phone className="size-4" aria-hidden />
              <span dir="ltr" className="font-display">
                {phone}
              </span>
            </a>
          </div>
        </div>

        <ul className="grid gap-3">
          {PROMISES.map((item, i) => (
            <Reveal
              key={item.title}
              as="li"
              delay={i * 110}
              className="group flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm transition-[background-color,border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/10"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-mint/15 text-brand-mint transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
                <item.icon className="size-5" aria-hidden />
              </span>
              <span>
                <span className="block text-[13px] font-semibold text-white">{item.title}</span>
                <span className="mt-0.5 block text-[12px] leading-5 text-white/70">{item.text}</span>
              </span>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
