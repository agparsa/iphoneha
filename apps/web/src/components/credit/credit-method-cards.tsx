import type { CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { CREDIT_METHOD_LABELS, PAYMENT_METHOD_INFO, type StorefrontConfigDto } from '@iphoneha/shared';
import { CREDIT_COLORS, CREDIT_PAGES, offeredMethods, planOf, planSummary } from '@/lib/credit';
import { readableShade } from '@/lib/color';
import { Reveal } from '@/components/motion/reveal';
import { PlanIcon } from './plan-icon';
import { SelectionLink } from './selection-link';

const FIT: Record<'CHEQUE' | 'SAFTE', string[]> = {
  CHEQUE: ['برای کسی که دسته‌چک صیادی به نام خودش دارد', 'استعلام و ثبت چک، غیرحضوری'],
  SAFTE: ['برای کسی که دسته‌چک ندارد', 'سفتهٔ کاغذی یا الکترونیک، طبق قرارداد'],
};

const card =
  'group relative flex h-full flex-col overflow-hidden rounded-panel border border-line bg-canvas p-5 transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:border-[color-mix(in_srgb,var(--plan)_40%,white)] hover:shadow-[0_22px_40px_-26px_var(--plan)]';
const cta =
  'mt-5 inline-flex items-center gap-1.5 self-start rounded-pill bg-[color-mix(in_srgb,var(--plan)_9%,white)] px-4 py-2 text-[12px] font-semibold text-[var(--plan-ink)] transition-[background-color,gap] duration-300 hover:gap-2.5 hover:bg-[color-mix(in_srgb,var(--plan)_16%,white)]';

function colors(color: string): CSSProperties {
  return { '--plan': color, '--plan-ink': readableShade(color) } as CSSProperties;
}

/** «روش‌های خرید گوشی قسطی»: one card per way to pay, each leading to its own page or the calculator. */
export function CreditMethodCards({
  config,
}: {
  config: Pick<StorefrontConfigDto, 'credit' | 'installments'>;
}) {
  const methods = offeredMethods(config);
  const services = config.installments;

  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {methods.map((method, i) => {
        const page = CREDIT_PAGES[method];
        return (
          <Reveal key={method} delay={i * 80} className="h-full">
            <article style={colors(CREDIT_COLORS[method])} className={card}>
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-1 origin-right scale-x-0 bg-[var(--plan)] transition-transform duration-500 group-hover:scale-x-100"
              />
              <div className="flex items-center gap-3">
                <PlanIcon method={method} color={CREDIT_COLORS[method]} size={44} />
                <div>
                  <h3 className="text-[15px] font-semibold text-ink">{page.title}</h3>
                  <p className="text-[11px] text-muted">اقساط با {CREDIT_METHOD_LABELS[method]}</p>
                </div>
              </div>
              <p className="mt-4 text-[13px] leading-7 text-ink-muted">
                {planSummary(planOf(config, method))}.
              </p>
              <ul className="mt-3 grid flex-1 content-start gap-2 text-[12px] text-muted">
                {FIT[method].map((line) => (
                  <li key={line} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[var(--plan-ink)]" aria-hidden />
                    {line}
                  </li>
                ))}
              </ul>
              <Link href={page.path} className={cta}>
                شرایط {page.title}
                <ArrowLeft className="size-3.5" aria-hidden />
              </Link>
            </article>
          </Reveal>
        );
      })}

      {services.length > 0 ? (
        <Reveal delay={methods.length * 80} className="h-full">
          <article style={colors(PAYMENT_METHOD_INFO[services[0]!.method].color)} className={card}>
            <div className="flex items-center gap-1.5">
              {services.map((term) => (
                <PlanIcon
                  key={term.method}
                  service={term.method}
                  color={PAYMENT_METHOD_INFO[term.method].color}
                  size={36}
                />
              ))}
            </div>
            <h3 className="mt-3 text-[15px] font-semibold text-ink">اقساط آنلاین با سرویس‌های اعتباری</h3>
            <p className="mt-2 flex-1 text-[13px] leading-7 text-ink-muted">
              با {services.map((term) => PAYMENT_METHOD_INFO[term.method].name).join('، ')}: اعتبارسنجی آنلاین
              و پرداخت اقساط در مرحلهٔ پرداخت سفارش، بدون چک و سفته.
            </p>
            <SelectionLink target="calculator" patch={{ planId: services[0]!.method }} className={cta}>
              محاسبهٔ قسط سرویس‌ها
              <ArrowLeft className="size-3.5" aria-hidden />
            </SelectionLink>
          </article>
        </Reveal>
      ) : null}
    </div>
  );
}
