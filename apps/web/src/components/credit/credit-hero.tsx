import type { CSSProperties, ReactNode } from 'react';
import { Calculator, MapPin, PackageCheck, Phone, Send, ShieldCheck } from 'lucide-react';
import type { CreditMethod, InstallmentMethod } from '@iphoneha/shared';
import { telHref } from '@/lib/utils';
import { PulseRing } from '@/components/motion/pulse-ring';
import { ProductImage } from '@/components/store/product-image';
import { PlanIcon } from './plan-icon';

export interface HeroPill {
  label: string;
  color: string;
  method?: CreditMethod;
  service?: InstallmentMethod;
}

const PROMISES = [
  { icon: MapPin, text: 'قرارداد غیرحضوری، سراسر ایران' },
  { icon: PackageCheck, text: 'آکبند و اصل' },
  { icon: ShieldCheck, text: 'همهٔ مبالغ پیش از امضا مکتوب' },
];

/** The dark-green header of the instalment pages: the page's one H1, the plans and the three ways to start. */
export function CreditHero({
  eyebrow,
  title,
  lead,
  pills,
  phone,
  requestLabel,
  calculator,
  image,
}: {
  eyebrow: string;
  title: string;
  lead: ReactNode;
  pills: HeroPill[];
  phone: string;
  requestLabel: string;
  /** there is a calculator on the page to jump to */
  calculator: boolean;
  image: { src: string; alt: string } | null;
}) {
  return (
    <header className="relative isolate overflow-hidden rounded-panel bg-brand-deep text-white">
      <span aria-hidden className="panel-grid absolute inset-0 -z-10" />
      <span
        aria-hidden
        className="animate-drift absolute -top-32 -right-24 -z-10 size-96 rounded-full bg-brand/40 blur-3xl"
      />
      <span
        aria-hidden
        className="animate-drift-slow absolute -bottom-40 left-10 -z-10 size-96 rounded-full bg-brand-mint/10 blur-3xl"
      />

      <div className="grid items-center gap-6 px-6 py-10 md:grid-cols-[1.3fr_1fr] md:px-10 md:py-12">
        <div className="animate-fade-up">
          <p className="inline-flex items-center gap-2 rounded-pill bg-white/10 px-3 py-1 text-[11px] font-medium text-brand-mint">
            <span className="relative flex size-2" aria-hidden>
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-mint opacity-70" />
              <span className="relative inline-flex size-2 rounded-full bg-brand-mint" />
            </span>
            {eyebrow}
          </p>
          <h1 className="mt-4 max-w-xl text-3xl font-semibold leading-[1.3] text-balance sm:text-4xl">
            {title}
          </h1>
          <div className="mt-4 max-w-2xl text-[13px] leading-7 text-white/80">{lead}</div>

          {pills.length > 0 ? (
            <ul className="mt-5 flex flex-wrap gap-2" aria-label="روش‌های پرداخت اقساطی">
              {pills.map((pill, i) => (
                <li
                  key={pill.label}
                  className="animate-pop inline-flex items-center gap-2 rounded-pill border border-white/15 bg-white/5 py-1 ps-1 pe-3 text-[12px] text-white/90"
                  style={{ animationDelay: `${200 + i * 70}ms` }}
                >
                  <PlanIcon
                    method={pill.method}
                    service={pill.service}
                    color={pill.color}
                    size={22}
                    className="bg-white"
                  />
                  {pill.label}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <PulseRing color="#bfe3d2">
              <a
                href="#request"
                style={{ '--shine': 'rgb(255 255 255 / 0.7)' } as CSSProperties}
                className="shine relative inline-flex h-13 items-center gap-2 rounded-pill bg-brand-mint px-7 text-[15px] font-semibold text-brand-deep transition-[transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-white active:scale-[0.98]"
              >
                <Send className="size-5" aria-hidden />
                {requestLabel}
              </a>
            </PulseRing>
            {calculator ? (
              <a
                href="#calculator"
                className="inline-flex h-13 items-center gap-2 rounded-pill border border-white/20 px-6 text-[14px] font-medium text-white transition-colors hover:bg-white/10"
              >
                <Calculator className="size-4" aria-hidden />
                محاسبهٔ قسط
              </a>
            ) : null}
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

          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-white/70">
            {PROMISES.map((item) => (
              <li key={item.text} className="inline-flex items-center gap-1.5">
                <item.icon className="size-3.5 text-brand-mint" aria-hidden />
                {item.text}
              </li>
            ))}
          </ul>
        </div>

        {image ? (
          <div className="relative mx-auto hidden aspect-square w-full max-w-[20rem] md:block">
            <span aria-hidden className="absolute inset-[14%] rounded-full bg-brand-mint/20 blur-3xl" />
            <span
              aria-hidden
              className="animate-float-shadow absolute bottom-[4%] left-1/2 h-5 w-1/2 -translate-x-1/2 rounded-[50%] bg-black/40 blur-xl"
            />
            <div className="animate-float absolute inset-0">
              <ProductImage
                src={image.src}
                alt={image.alt}
                sizes="320px"
                priority
                className="p-4 drop-shadow-[0_30px_40px_rgb(0_0_0_/_0.35)]"
              />
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}
