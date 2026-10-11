import type { CSSProperties } from 'react';
import { ArrowLeft, CheckCircle2, Clock, FileText, Wallet } from 'lucide-react';
import { PAYMENT_METHOD_INFO, formatNumberFa, formatToman, type InstallmentTerms } from '@iphoneha/shared';
import { readableShade } from '@/lib/color';
import { Reveal } from '@/components/motion/reveal';
import { PaymentLogo } from '@/components/store/payment-logo';
import { SelectionLink } from './selection-link';

/** The live online credit services, each opening itself in the calculator. */
export function ServiceCards({ services }: { services: InstallmentTerms[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {services.map((term, i) => {
        const info = PAYMENT_METHOD_INFO[term.method];
        return (
          <Reveal key={term.method} delay={i * 80} className="h-full">
            <article
              style={{ '--svc': info.color, '--svc-ink': readableShade(info.color) } as CSSProperties}
              className="group relative flex h-full flex-col overflow-hidden rounded-panel border border-line bg-canvas p-5 transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:border-[color-mix(in_srgb,var(--svc)_40%,white)] hover:shadow-[0_22px_40px_-26px_var(--svc)]"
            >
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-1 origin-right scale-x-0 bg-[var(--svc)] transition-transform duration-500 group-hover:scale-x-100"
              />
              <div className="flex items-center gap-3">
                <PaymentLogo
                  method={term.method}
                  size={44}
                  className="transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3"
                />
                <div>
                  <h3 className="text-[15px] font-semibold text-ink">خرید قسطی با {info.name}</h3>
                  <p className="text-[11px] text-muted font-display">{info.nameEn}</p>
                </div>
              </div>
              <p className="mt-4 flex-1 text-[13px] leading-7 text-muted">{term.description}</p>
              <ul className="mt-4 grid gap-2.5 border-t border-line pt-4 text-[12px] text-ink-muted">
                <li className="flex items-center gap-2">
                  <Wallet className="size-3.5 text-[var(--svc-ink)]" aria-hidden />
                  پیش‌پرداخت از {formatNumberFa(term.minDownPaymentPercent)}٪
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="size-3.5 text-[var(--svc-ink)]" aria-hidden />
                  تا {formatNumberFa(term.maxInstallments)} قسط — سقف {formatToman(term.maxCredit)}
                </li>
                <li className="flex items-center gap-2">
                  <Clock className="size-3.5 text-[var(--svc-ink)]" aria-hidden />
                  {term.approvalTime}
                </li>
                <li className="flex items-center gap-2">
                  <FileText className="size-3.5 text-[var(--svc-ink)]" aria-hidden />
                  {term.documents}
                </li>
              </ul>
              <SelectionLink
                target="calculator"
                patch={{ planId: term.method }}
                className="mt-4 inline-flex items-center gap-1.5 self-start rounded-pill bg-[color-mix(in_srgb,var(--svc)_9%,white)] px-4 py-2 text-[12px] font-semibold text-[var(--svc-ink)] transition-[background-color,gap] duration-300 hover:gap-2.5 hover:bg-[color-mix(in_srgb,var(--svc)_16%,white)]"
              >
                محاسبهٔ قسط با {info.name}
                <ArrowLeft className="size-3.5" aria-hidden />
              </SelectionLink>
            </article>
          </Reveal>
        );
      })}
    </div>
  );
}
