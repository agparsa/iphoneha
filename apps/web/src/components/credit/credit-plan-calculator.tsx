'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, Send } from 'lucide-react';
import {
  addJalaliMonths,
  creditMonthOptions,
  estimateCreditPlan,
  formatJalali,
  formatNumberFa,
  formatPercentFa,
  formatToman,
  tehranToday,
} from '@iphoneha/shared';
import { readyCreditPlan, type CalculatorPlan } from '@/lib/credit';
import { readableShade } from '@/lib/color';
import { cn } from '@/lib/utils';
import { AnimatedNumber } from '@/components/motion/animated-number';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreditSelection } from './credit-selection';
import { PlanIcon } from './plan-icon';

export interface CalculatorModel {
  slug: string;
  name: string;
  price: number;
}

/** --plan for accents, --plan-ink wherever the colour carries text (WCAG AA on white). */
function planColors(color: string): CSSProperties {
  return { '--plan': color, '--plan-ink': readableShade(color) } as CSSProperties;
}

/**
 * «محاسبه‌گر اقساط»: pick a plan (the store's cheque or promissory-note plan,
 * or a live credit service), a model, the down payment and the months, and see
 * the monthly instalment and everything paid in the end. On a page with the
 * request form, the store plans hand the choice over to the form.
 */
export function CreditPlanCalculator({
  plans,
  models,
  initialPlanId,
}: {
  plans: CalculatorPlan[];
  models: CalculatorModel[];
  initialPlanId?: string | null;
}) {
  const shared = useCreditSelection();
  const initial =
    plans.find((plan) => plan.id.toLowerCase() === (initialPlanId ?? '').toLowerCase()) ?? plans[0];
  const [localPlanId, setLocalPlanId] = useState(initial?.id ?? '');
  const [localSlug, setLocalSlug] = useState(models[0]?.slug ?? '');
  const [downPercent, setDownPercent] = useState<number | null>(null);
  const [localMonths, setLocalMonths] = useState<number | null>(null);

  // a service banner or a method card on the page can open a plan here
  const wantedPlan = shared?.selection.planId;
  const plan =
    (wantedPlan ? plans.find((item) => item.id === wantedPlan) : undefined) ??
    plans.find((item) => item.id === localPlanId) ??
    plans[0];
  // the model and months follow the request form's choice when there is one on the page
  const slug = shared?.selection.modelSlug ?? localSlug;
  const model = models.find((item) => item.slug === slug) ?? models[0];
  if (!plan || !model) return null;

  const monthOptions = creditMonthOptions(plan.maxMonths);
  const wantedMonths = shared?.selection.months ?? localMonths;
  const months = wantedMonths && monthOptions.includes(wantedMonths) ? wantedMonths : plan.maxMonths;
  const estimate = estimateCreditPlan(model.price, readyCreditPlan(plan), {
    downPaymentPercent: downPercent ?? plan.minDownPaymentPercent,
    months,
  });
  // the lowest down payment this model allows: the plan's minimum, or more when
  // the rest would pass the plan's ceiling — the slider starts there
  const minDown = Math.min(
    90,
    estimateCreditPlan(model.price, readyCreditPlan(plan), { downPaymentPercent: plan.minDownPaymentPercent })
      .downPaymentPercent,
  );
  const upfrontShare = estimate.totalCost > 0 ? (estimate.downPayment / estimate.totalCost) * 100 : 0;
  const withForm = plan.kind === 'store' && shared !== null;

  const pickModel = (value: string) => {
    // only a real model: an empty echo from the select must not clear the choice
    if (!models.some((item) => item.slug === value)) return;
    setLocalSlug(value);
    shared?.update({ modelSlug: value });
  };
  const pickMonths = (value: number) => {
    setLocalMonths(value);
    shared?.update({ months: value });
  };

  return (
    <div
      className="grid gap-6 rounded-panel border border-line p-5 md:grid-cols-2 md:p-6"
      style={planColors(plan.color)}
    >
      <div className="grid content-start gap-5">
        {plans.length > 1 ? (
          <div>
            <p className="mb-2 text-[13px] font-medium text-ink">روش خرید قسطی</p>
            <div className="flex flex-wrap gap-2">
              {plans.map((item) => {
                const selected = item.id === plan.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setLocalPlanId(item.id);
                      setDownPercent(null);
                      shared?.update({ planId: item.id, ...(item.method ? { method: item.method } : {}) });
                    }}
                    aria-pressed={selected}
                    style={planColors(item.color)}
                    className={cn(
                      'flex items-center gap-2 rounded-pill border py-1.5 ps-1.5 pe-3.5 text-[12px] transition-[background-color,border-color,color,transform,box-shadow] duration-300 hover:-translate-y-0.5',
                      selected
                        ? 'border-[var(--plan-ink)] bg-[var(--plan-ink)] text-white shadow-[0_10px_22px_-14px_var(--plan)]'
                        : 'border-line text-ink-muted hover:border-[color-mix(in_srgb,var(--plan)_45%,white)] hover:bg-surface',
                    )}
                  >
                    <PlanIcon
                      method={item.method ?? undefined}
                      service={item.service ?? undefined}
                      color={item.color}
                      size={24}
                      className={selected ? 'bg-white' : undefined}
                    />
                    {item.name}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div>
          <p id="calc-model-label" className="mb-2 text-[13px] font-medium text-ink">
            مدل آیفون
          </p>
          <Select value={model.slug} onValueChange={pickModel}>
            <SelectTrigger aria-labelledby="calc-model-label">
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
            <label htmlFor="calc-down" className="text-[13px] font-medium text-ink">
              پیش‌پرداخت
            </label>
            <span className="text-[12px] text-muted tabular">
              {formatNumberFa(estimate.downPaymentPercent)}٪ — {formatToman(estimate.downPayment)}
            </span>
          </div>
          <input
            id="calc-down"
            type="range"
            min={minDown}
            max={90}
            step={5}
            value={estimate.downPaymentPercent}
            onChange={(event) => setDownPercent(Number(event.target.value))}
            className="w-full accent-[var(--plan-ink)]"
          />
          <p className="mt-1 text-[11px] text-muted">
            {minDown > plan.minDownPaymentPercent
              ? `حداقل پیش‌پرداخت ${model.name} با ${plan.name}: ${formatNumberFa(minDown)}٪`
              : plan.minDownPaymentPercent > 0
                ? `حداقل پیش‌پرداخت ${plan.name}: ${formatNumberFa(plan.minDownPaymentPercent)}٪`
                : `${plan.name} بدون پیش‌پرداخت هم ممکن است`}
          </p>
        </div>

        <div>
          <p className="mb-2 text-[13px] font-medium text-ink">تعداد اقساط</p>
          <div className="flex flex-wrap gap-2">
            {monthOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => pickMonths(option)}
                aria-pressed={option === estimate.months}
                className={cn(
                  'rounded-pill border px-3 py-1.5 text-[12px] tabular transition-colors duration-200',
                  option === estimate.months
                    ? 'border-[var(--plan-ink)] bg-[var(--plan-ink)] text-white'
                    : 'border-line text-ink-muted hover:bg-surface',
                )}
              >
                {formatNumberFa(option)} ماه
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        className="relative overflow-hidden rounded-2xl border border-line bg-surface-2 p-5"
        aria-live="polite"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -top-20 -left-16 size-56 rounded-full bg-[color-mix(in_srgb,var(--plan)_16%,transparent)] blur-3xl transition-colors duration-700"
        />
        <div className="relative">
          <div className="flex items-center justify-between gap-3">
            <p className="eyebrow">نتیجهٔ محاسبه</p>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
              <PlanIcon
                method={plan.method ?? undefined}
                service={plan.service ?? undefined}
                color={plan.color}
                size={20}
              />
              {plan.name}
            </span>
          </div>
          <p className="mt-3 text-[13px] text-muted">قسط ماهانهٔ {model.name}</p>
          <p className="mt-1 text-3xl font-semibold text-[var(--plan-ink)] tabular">
            <AnimatedNumber value={estimate.monthly} format={formatToman} />
          </p>

          <div className="mt-4" aria-hidden>
            <div className="flex h-2 overflow-hidden rounded-pill bg-[color-mix(in_srgb,var(--plan)_14%,white)]">
              <span
                className="h-full rounded-pill bg-[var(--plan-ink)] transition-[width] duration-700 ease-out-quint"
                style={{ width: `${upfrontShare}%` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] text-muted">
              <span>پیش‌پرداخت</span>
              <span>{formatNumberFa(estimate.months)} قسط</span>
            </div>
          </div>

          <dl className="mt-5 grid gap-3 border-t border-line pt-5 text-[13px]">
            <Row label="قیمت نقد" value={formatToman(model.price)} />
            <Row
              label="پیش‌پرداخت"
              value={<AnimatedNumber value={estimate.downPayment} format={formatToman} />}
            />
            <Row
              label="مبلغ اقساط"
              value={<AnimatedNumber value={estimate.financed} format={formatToman} />}
            />
            <Row
              label={`کارمزد (${formatPercentFa(plan.monthlyFeePercent)}٪ در ماه × ${formatNumberFa(estimate.months)} ماه)`}
              value={<AnimatedNumber value={estimate.fee} format={formatToman} />}
            />
            <Row
              label="جمع اقساط با کارمزد"
              value={<AnimatedNumber value={estimate.totalRepayment} format={formatToman} />}
            />
            <Row
              label="جمع کل پرداختی"
              value={<AnimatedNumber value={estimate.totalCost} format={formatToman} />}
              emphasis
            />
          </dl>

          {estimate.months > 1 && estimate.lastInstallment !== estimate.monthly ? (
            <p className="mt-3 text-[11px] leading-5 text-muted">
              {formatNumberFa(estimate.months - 1)} قسط {formatToman(estimate.monthly)} و قسط آخر{' '}
              {formatToman(estimate.lastInstallment)} (گرد شدن مبلغ‌ها در قسط آخر جبران می‌شود).
            </p>
          ) : null}

          <InstallmentTable installments={estimate.installments} />

          {estimate.raisedForCeiling ? (
            <p className="mt-4 rounded-2xl bg-warning-soft px-3 py-2.5 text-[11px] leading-5 text-warning">
              سقف اقساط {plan.name} {formatToman(plan.maxFinanced ?? 0)} است؛ پیش‌پرداخت به همین اندازه بالا
              رفت.
            </p>
          ) : null}

          {withForm ? (
            <Button
              type="button"
              block
              size="lg"
              // long model names wrap instead of running out of the button on a phone
              className="shine relative mt-5 h-auto min-h-13 whitespace-normal py-3 text-center leading-6"
              onClick={() =>
                shared?.request({ method: plan.method, modelSlug: model.slug, months: estimate.months })
              }
            >
              <Send className="size-4" aria-hidden />
              درخواست خرید {model.name} با {plan.name}
            </Button>
          ) : (
            <Button asChild block size="lg" className="shine relative mt-5">
              <Link href={`/iphone/${model.slug}#installments`}>
                خرید {model.name}
                <ArrowLeft className="size-4" aria-hidden />
              </Link>
            </Button>
          )}
          <p className="mt-3 text-center text-[11px] leading-5 text-muted">
            {plan.kind === 'store'
              ? 'محاسبه تقریبی است؛ مبلغ دقیق هر قسط و جمع کل پیش از امضا در قرارداد نوشته می‌شود.'
              : `محاسبه تقریبی است؛ مبلغ نهایی را ${plan.name} پس از اعتبارسنجی اعلام می‌کند.`}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Every instalment with its due date, counting from next month — the same table the contract gets. */
function InstallmentTable({ installments }: { installments: number[] }) {
  const today = tehranToday();
  return (
    <details className="group mt-4 rounded-2xl border border-line bg-canvas/60">
      <summary className="cursor-pointer list-none px-4 py-2.5 text-[12px] font-medium text-ink [&::-webkit-details-marker]:hidden">
        جدول اقساط ({formatNumberFa(installments.length)} قسط)
        <span className="ms-1 text-muted group-open:hidden">— نمایش</span>
      </summary>
      <table className="w-full border-t border-line text-[12px]">
        <thead>
          <tr className="text-muted">
            <th scope="col" className="px-4 py-2 text-start font-normal">
              قسط
            </th>
            <th scope="col" className="px-4 py-2 text-start font-normal">
              سررسید تقریبی
            </th>
            <th scope="col" className="px-4 py-2 text-end font-normal">
              مبلغ
            </th>
          </tr>
        </thead>
        <tbody>
          {installments.map((amount, index) => (
            <tr key={index} className="border-t border-line/60">
              <td className="px-4 py-1.5 tabular">{formatNumberFa(index + 1)}</td>
              <td className="px-4 py-1.5 tabular text-ink-muted">
                {formatJalali(addJalaliMonths(today, index + 1), 'long')}
              </td>
              <td className="px-4 py-1.5 text-end tabular text-ink">{formatNumberFa(amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function Row({ label, value, emphasis }: { label: ReactNode; value: ReactNode; emphasis?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={cn('tabular', emphasis ? 'font-semibold text-ink' : 'text-ink-muted')}>{value}</dd>
    </div>
  );
}
