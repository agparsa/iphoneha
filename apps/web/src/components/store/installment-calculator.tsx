'use client';

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import {
  INSTALLMENT_MONTH_OPTIONS,
  PAYMENT_METHOD_INFO,
  estimateInstallment,
  formatNumberFa,
  formatToman,
  type InstallmentTerms,
} from '@iphoneha/shared';
import { readableShade } from '@/lib/color';
import { cn } from '@/lib/utils';
import { AnimatedNumber } from '@/components/motion/animated-number';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PaymentLogo } from './payment-logo';

export interface CalculatorModel {
  slug: string;
  name: string;
  price: number;
}

/** Colour variables for one service: --svc for accents, --svc-ink wherever it carries text. */
function serviceColors(color: string): CSSProperties {
  return { '--svc': color, '--svc-ink': readableShade(color) } as CSSProperties;
}

export function InstallmentCalculator({
  terms,
  models,
  initialMethod,
}: {
  terms: InstallmentTerms[];
  models: CalculatorModel[];
  initialMethod?: string;
}) {
  const initialTerm =
    terms.find((term) => term.method.toLowerCase() === (initialMethod ?? '').toLowerCase()) ?? terms[0];
  const [method, setMethod] = useState(initialTerm?.method ?? terms[0]?.method);
  const [slug, setSlug] = useState(models[0]?.slug ?? '');
  const [downPercent, setDownPercent] = useState<number | null>(null);
  const [months, setMonths] = useState<number | null>(null);

  const term = terms.find((item) => item.method === method) ?? terms[0];
  const model = models.find((item) => item.slug === slug) ?? models[0];

  const monthOptions = useMemo(
    () => INSTALLMENT_MONTH_OPTIONS.filter((option) => term && option <= term.maxInstallments),
    [term],
  );

  if (!term || !model) return null;

  const info = PAYMENT_METHOD_INFO[term.method];
  const effectiveDown = Math.max(term.minDownPaymentPercent, downPercent ?? term.minDownPaymentPercent);
  const effectiveMonths = months && monthOptions.includes(months as never) ? months : term.maxInstallments;
  const estimate = estimateInstallment(model.price, term, {
    downPaymentPercent: effectiveDown,
    months: effectiveMonths,
  });
  const overCredit = model.price > term.maxCredit;
  // share of everything paid that is paid up front — drawn as a bar under the result
  const upfrontShare = estimate.totalCost > 0 ? (estimate.downPayment / estimate.totalCost) * 100 : 0;

  return (
    <div
      className="grid gap-6 rounded-panel border border-line p-5 md:grid-cols-2 md:p-6"
      style={serviceColors(info.color)}
    >
      <div className="grid gap-5">
        <div>
          <p className="mb-2 text-[13px] font-medium text-ink">سرویس اعتباری</p>
          <div className="flex flex-wrap gap-2">
            {terms.map((item) => {
              const itemInfo = PAYMENT_METHOD_INFO[item.method];
              const selected = item.method === method;
              return (
                <button
                  key={item.method}
                  type="button"
                  onClick={() => {
                    setMethod(item.method);
                    setDownPercent(null);
                    setMonths(null);
                  }}
                  aria-pressed={selected}
                  style={serviceColors(itemInfo.color)}
                  className={cn(
                    'flex items-center gap-2 rounded-pill border py-1.5 ps-1.5 pe-3.5 text-[12px] transition-[background-color,border-color,color,transform,box-shadow] duration-300 hover:-translate-y-0.5',
                    selected
                      ? 'border-[var(--svc-ink)] bg-[var(--svc-ink)] text-white shadow-[0_10px_22px_-14px_var(--svc)]'
                      : 'border-line text-ink-muted hover:border-[color-mix(in_srgb,var(--svc)_45%,white)] hover:bg-surface',
                  )}
                >
                  <PaymentLogo method={item.method} size={24} rounded="full" />
                  {itemInfo.name}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-2 text-[13px] font-medium text-ink">مدل آیفون</p>
          <Select value={slug} onValueChange={setSlug}>
            <SelectTrigger aria-label="مدل آیفون">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {models.map((item) => (
                <SelectItem key={item.slug} value={item.slug}>
                  {item.name} — از {formatToman(item.price)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[13px] font-medium text-ink">پیش‌پرداخت</p>
            <span className="text-[12px] text-muted tabular">
              {formatNumberFa(effectiveDown)}٪ — {formatToman(estimate.downPayment)}
            </span>
          </div>
          <input
            type="range"
            min={term.minDownPaymentPercent}
            max={80}
            step={5}
            value={effectiveDown}
            onChange={(event) => setDownPercent(Number(event.target.value))}
            className="w-full accent-[var(--svc-ink)]"
            aria-label="درصد پیش‌پرداخت"
          />
          <p className="mt-1 text-[11px] text-muted-faint">
            حداقل پیش‌پرداخت این سرویس {formatNumberFa(term.minDownPaymentPercent)}٪ است.
          </p>
        </div>

        <div>
          <p className="mb-2 text-[13px] font-medium text-ink">تعداد اقساط</p>
          <div className="flex flex-wrap gap-2">
            {monthOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMonths(option)}
                aria-pressed={option === effectiveMonths}
                className={cn(
                  'rounded-pill border px-3 py-1.5 text-[12px] tabular transition-colors duration-200',
                  option === effectiveMonths
                    ? 'border-[var(--svc-ink)] bg-[var(--svc-ink)] text-white'
                    : 'border-line text-ink-muted hover:bg-surface',
                )}
              >
                {formatNumberFa(option)} ماه
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-line bg-surface-2 p-5">
        <span
          aria-hidden
          className="pointer-events-none absolute -top-20 -left-16 size-56 rounded-full bg-[color-mix(in_srgb,var(--svc)_16%,transparent)] blur-3xl transition-colors duration-700"
        />
        <div className="relative">
          <div className="flex items-center justify-between gap-3">
            <p className="eyebrow">نتیجه محاسبه</p>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
              <PaymentLogo method={term.method} size={20} rounded="full" />
              {info.name}
            </span>
          </div>
          <p className="mt-3 text-[13px] text-muted">قسط ماهانه</p>
          <p className="mt-1 text-3xl font-semibold text-[var(--svc-ink)] tabular">
            <AnimatedNumber value={estimate.monthly} format={formatToman} />
          </p>

          <div className="mt-4" aria-hidden>
            <div className="flex h-2 overflow-hidden rounded-pill bg-[color-mix(in_srgb,var(--svc)_14%,white)]">
              <span
                className="h-full rounded-pill bg-[var(--svc-ink)] transition-[width] duration-700 ease-out-quint"
                style={{ width: `${upfrontShare}%` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] text-muted">
              <span>پیش‌پرداخت</span>
              <span>{formatNumberFa(estimate.months)} قسط</span>
            </div>
          </div>

          <dl className="mt-5 grid gap-3 border-t border-line pt-5 text-[13px]">
            <Row label="قیمت دستگاه" value={formatToman(model.price)} />
            <Row
              label="پیش‌پرداخت"
              value={<AnimatedNumber value={estimate.downPayment} format={formatToman} />}
            />
            <Row
              label="مبلغ تسهیلات"
              value={<AnimatedNumber value={estimate.financed} format={formatToman} />}
            />
            <Row
              label="جمع بازپرداخت"
              value={<AnimatedNumber value={estimate.totalRepayment} format={formatToman} />}
            />
            <Row
              label="جمع کل پرداختی"
              value={<AnimatedNumber value={estimate.totalCost} format={formatToman} />}
              emphasis
            />
          </dl>

          {overCredit ? (
            <p className="mt-4 rounded-2xl bg-warning-soft px-3 py-2.5 text-[11px] leading-5 text-warning">
              قیمت این مدل از سقف اعتبار {info.name} ({formatToman(term.maxCredit)}) بیشتر است؛ مابه‌التفاوت
              باید نقدی پرداخت شود.
            </p>
          ) : null}

          <Button asChild block size="lg" className="shine relative mt-5">
            <Link href={`/iphone/${model.slug}#installments`}>
              انتخاب و خرید {model.name}
              <ArrowLeft className="size-4" aria-hidden />
            </Link>
          </Button>
          <p className="mt-3 text-center text-[11px] leading-5 text-muted-faint">
            محاسبه تقریبی است؛ مبلغ نهایی اقساط را سرویس اعتباری پس از اعتبارسنجی اعلام می‌کند.
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, emphasis }: { label: string; value: ReactNode; emphasis?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={cn('tabular', emphasis ? 'font-semibold text-ink' : 'text-ink-muted')}>{value}</dd>
    </div>
  );
}
