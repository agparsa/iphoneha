'use client';

import Link from 'next/link';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowLeft, Clock, FileText, Wallet } from 'lucide-react';
import {
  estimateInstallment,
  formatNumberFa,
  formatPercentFa,
  formatToman,
  PAYMENT_METHOD_INFO,
  type InstallmentTerms,
} from '@iphoneha/shared';
import { readableShade } from '@/lib/color';
import { cn } from '@/lib/utils';
import { AnimatedNumber } from '@/components/motion/animated-number';
import { Button } from '@/components/ui/button';
import { PaymentLogo } from './payment-logo';

/** --svc for accents, --svc-ink wherever the service's colour carries text. */
function serviceColors(color: string): CSSProperties {
  return { '--svc': color, '--svc-ink': readableShade(color) } as CSSProperties;
}

/** Home-page instalment section: pick a service, see its terms for a sample price. */
export function InstallmentStrip({ terms, samplePrice }: { terms: InstallmentTerms[]; samplePrice: number }) {
  const [active, setActive] = useState(terms[0]?.method ?? null);
  const current = terms.find((term) => term.method === active) ?? terms[0];
  if (!current) return null;

  const info = PAYMENT_METHOD_INFO[current.method];
  const estimate = estimateInstallment(samplePrice, current, { months: current.maxInstallments });

  return (
    <div className="overflow-hidden rounded-panel border border-line" style={serviceColors(info.color)}>
      <div className="no-scrollbar flex gap-2 overflow-x-auto border-b border-line p-3">
        {terms.map((term) => {
          const item = PAYMENT_METHOD_INFO[term.method];
          const selected = term.method === current.method;
          return (
            <button
              key={term.method}
              type="button"
              onClick={() => setActive(term.method)}
              aria-pressed={selected}
              style={serviceColors(item.color)}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-pill border py-1.5 ps-1.5 pe-3.5 text-[13px] transition-[background-color,border-color,color,box-shadow] duration-300',
                selected
                  ? 'border-[var(--svc-ink)] bg-[var(--svc-ink)] text-white shadow-[0_10px_22px_-14px_var(--svc)]'
                  : 'border-line text-ink-muted hover:border-[color-mix(in_srgb,var(--svc)_45%,white)] hover:bg-surface',
              )}
            >
              <PaymentLogo
                method={term.method}
                size={26}
                rounded="full"
                className={selected ? 'border-white/20' : ''}
              />
              {item.name}
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 p-5 md:grid-cols-[1.1fr_1fr] md:p-6">
        <div key={current.method} className="animate-fade-up">
          <div className="flex items-center gap-3">
            <PaymentLogo method={current.method} size={48} />
            <div>
              <p className="text-[15px] font-semibold text-ink">{info.name}</p>
              <p className="text-[11px] text-muted">{info.tagline}</p>
            </div>
          </div>
          <p className="mt-4 text-[13px] leading-7 text-muted">{current.description}</p>

          <ul className="mt-5 grid gap-3">
            <li className="flex items-center gap-2 text-[13px] text-ink-muted">
              <Clock className="size-4 text-[var(--svc)]" aria-hidden />
              زمان تأیید: {current.approvalTime}
            </li>
            <li className="flex items-center gap-2 text-[13px] text-ink-muted">
              <FileText className="size-4 text-[var(--svc)]" aria-hidden />
              مدارک: {current.documents}
            </li>
            <li className="flex items-center gap-2 text-[13px] text-ink-muted">
              <Wallet className="size-4 text-[var(--svc)]" aria-hidden />
              سقف اعتبار: {formatToman(current.maxCredit)}
            </li>
          </ul>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-line bg-surface-2 p-5">
          <span
            aria-hidden
            className="pointer-events-none absolute -top-16 -left-14 size-44 rounded-full bg-[color-mix(in_srgb,var(--svc)_18%,transparent)] blur-3xl transition-colors duration-700"
          />
          <div className="relative">
            <p className="text-[11px] text-muted">
              برای خرید نمونه به مبلغ{' '}
              <span className="font-medium text-ink tabular">{formatToman(samplePrice)}</span>
            </p>
            <dl className="mt-4 grid gap-3 text-[13px]">
              <Row
                label="پیش‌پرداخت"
                value={<AnimatedNumber value={estimate.downPayment} format={formatToman} />}
              />
              <Row label="تعداد اقساط" value={`${formatNumberFa(estimate.months)} ماه`} />
              <Row
                label="قسط ماهانه"
                value={<AnimatedNumber value={estimate.monthly} format={formatToman} />}
                emphasis
              />
              <Row
                label="کارمزد سالانه"
                value={
                  current.annualFeeRate === 0
                    ? 'بدون کارمزد'
                    : `${formatPercentFa(current.annualFeeRate * 100)}٪`
                }
              />
            </dl>
            <Button asChild block size="md" className="shine relative mt-5">
              <Link href={`/installments?service=${current.method.toLowerCase()}#calculator`}>
                بررسی شرایط {info.name}
                <ArrowLeft className="size-4" aria-hidden />
              </Link>
            </Button>
            <p className="mt-3 text-center text-[11px] leading-5 text-muted-faint">
              ارقام تخمینی‌اند و مبلغ نهایی را سرویس اعتباری پس از اعتبارسنجی اعلام می‌کند.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, emphasis }: { label: string; value: ReactNode; emphasis?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd
        className={cn(
          'tabular',
          emphasis ? 'text-[15px] font-semibold text-[var(--svc-ink)]' : 'text-ink-muted',
        )}
      >
        {value}
      </dd>
    </div>
  );
}
