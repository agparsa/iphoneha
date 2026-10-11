'use client';

import { useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Phone, Send, Sparkles } from 'lucide-react';
import {
  CREDIT_METHOD_LABELS,
  creditMonthOptions,
  creditPlanReady,
  estimateCreditPlan,
  estimateInstallment,
  formatNumberFa,
  formatPercentFa,
  formatToman,
  INSTALLMENT_MONTH_OPTIONS,
  PAYMENT_METHOD_INFO,
  type CreditMethod,
  type InstallmentTerms,
  type PaymentMethod,
} from '@iphoneha/shared';
import { useCart } from '@/providers/cart-provider';
import { useStoreConfig } from '@/providers/store-config-provider';
import { readableShade } from '@/lib/color';
import { CREDIT_COLORS, CREDIT_PAGES, offeredMethods, planOf } from '@/lib/credit';
import { cn, telHref } from '@/lib/utils';
import { AnimatedNumber } from '@/components/motion/animated-number';
import { PulseRing } from '@/components/motion/pulse-ring';
import { Reveal } from '@/components/motion/reveal';
import { PlanIcon } from '@/components/credit/plan-icon';
import { ChequeSteps } from './cheque-steps';
import { PaymentLogo } from './payment-logo';
import { useProductSelection } from './product-selection';

/**
 * «خرید قسطی» on the product page (#installments).
 *
 * With live credit services: a card per service quoting the colour/capacity
 * picked in the buy box, a plan you can tune, and a button that puts that
 * model in the cart and opens checkout with the service already chosen.
 * Always: the store's own cheque and promissory-note plans for this model,
 * each leading to its page with the model already picked in the request form.
 */
export function ProductInstallments({
  price,
  productName,
  productSlug,
}: {
  price: number;
  productName: string;
  productSlug: string;
}) {
  const { installments } = useStoreConfig();
  const selection = useProductSelection()?.selection ?? null;
  const amount = selection?.price ?? price;

  return (
    <section id="installments" className="scroll-mt-24 overflow-hidden rounded-panel border border-line">
      <header className="relative overflow-hidden bg-brand-deep px-5 py-5 text-white sm:px-6">
        <span aria-hidden className="absolute -top-16 -left-10 size-48 rounded-full bg-brand/40 blur-3xl" />
        <p className="relative inline-flex items-center gap-2 rounded-pill bg-white/10 px-3 py-1 text-[11px] font-medium text-brand-mint">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-mint opacity-70" />
            <span className="relative inline-flex size-2 rounded-full bg-brand-mint" />
          </span>
          خرید قسطی
        </p>
        <h2 className="relative mt-3 text-[18px] font-semibold leading-8">خرید قسطی {productName}</h2>
        <p className="relative mt-1 text-[12px] text-white/70">
          {selection ? `برای ${selection.label} — ` : ''}
          قیمت نقد <span className="font-semibold text-white tabular">{formatNumberFa(amount)}</span> تومان
        </p>
      </header>

      {installments.length > 0 ? (
        <CreditServices
          terms={installments}
          amount={amount}
          productSlug={productSlug}
          productName={productName}
        />
      ) : (
        <ChequePath amount={amount} productName={productName} productSlug={productSlug} />
      )}
    </section>
  );
}

// ─── live credit services ────────────────────────────────────────────────────

function CreditServices({
  terms,
  amount,
  productSlug,
  productName,
}: {
  terms: InstallmentTerms[];
  amount: number;
  productSlug: string;
  productName: string;
}) {
  const router = useRouter();
  const { addItem } = useCart();
  const selection = useProductSelection()?.selection ?? null;
  const [method, setMethod] = useState<PaymentMethod>(terms[0]!.method);
  const [months, setMonths] = useState<number | null>(null);
  const [pending, setPending] = useState(false);

  const term = terms.find((t) => t.method === method) ?? terms[0]!;
  const info = PAYMENT_METHOD_INFO[term.method];
  const monthOptions = INSTALLMENT_MONTH_OPTIONS.filter((option) => option <= term.maxInstallments);
  const chosenMonths = months && monthOptions.includes(months as never) ? months : term.maxInstallments;
  const plan = estimateInstallment(amount, term, { months: chosenMonths });
  const overCredit = amount > term.maxCredit;
  const canBuy = Boolean(selection?.available) && !overCredit;

  async function buy() {
    if (!selection) return;
    setPending(true);
    try {
      await addItem({ variantId: selection.variantId, quantity: 1, reveal: false });
      router.push(`/checkout?method=${term.method}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="p-5 sm:p-6">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {terms.map((item, i) => {
          const itemInfo = PAYMENT_METHOD_INFO[item.method];
          const selected = item.method === term.method;
          const cheapest = estimateInstallment(amount, item, { months: item.maxInstallments });
          return (
            <Reveal key={item.method} delay={i * 60}>
              <button
                type="button"
                onClick={() => {
                  setMethod(item.method);
                  setMonths(null);
                }}
                aria-pressed={selected}
                style={{ '--svc': itemInfo.color } as CSSProperties}
                className={cn(
                  'group relative flex w-full flex-col items-start gap-2 overflow-hidden rounded-2xl border p-3 text-start transition-[border-color,transform,box-shadow,background-color] duration-300 hover:-translate-y-1 hover:shadow-[0_14px_30px_-18px_var(--svc)]',
                  selected
                    ? 'border-[var(--svc)] bg-[color-mix(in_srgb,var(--svc)_7%,white)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--svc)_18%,transparent)]'
                    : 'border-line bg-canvas hover:border-[color-mix(in_srgb,var(--svc)_45%,white)]',
                )}
              >
                {selected ? <span aria-hidden className="shine absolute inset-0" /> : null}
                <span className="flex items-center gap-2">
                  <PaymentLogo
                    method={item.method}
                    size={30}
                    className="transition-transform duration-300 group-hover:scale-110"
                  />
                  <span className="text-[13px] font-semibold text-ink">{itemInfo.name}</span>
                </span>
                <span className="text-[11px] text-muted">
                  ماهانه از{' '}
                  <span className="font-semibold text-ink tabular">
                    <AnimatedNumber value={cheapest.monthly} />
                  </span>
                </span>
              </button>
            </Reveal>
          );
        })}
      </div>

      <div
        className="mt-5 rounded-2xl bg-surface p-4"
        // --svc-ink: the service's colour dark enough to carry text (WCAG AA)
        style={{ '--svc': info.color, '--svc-ink': readableShade(info.color) } as CSSProperties}
      >
        <p className="text-[12px] font-medium text-ink">تعداد اقساط</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {monthOptions.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMonths(option)}
              aria-pressed={option === chosenMonths}
              className={cn(
                'rounded-pill border px-3 py-1.5 text-[12px] tabular transition-colors duration-200',
                option === chosenMonths
                  ? 'border-[var(--svc-ink)] bg-[var(--svc-ink)] text-white'
                  : 'border-line bg-canvas text-ink-muted hover:border-line-strong',
              )}
            >
              {formatNumberFa(option)} ماه
            </button>
          ))}
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-4">
          <div>
            <dt className="text-muted">پیش‌پرداخت</dt>
            <dd className="mt-1 font-semibold text-ink tabular">
              <AnimatedNumber value={plan.downPayment} />
            </dd>
          </div>
          <div>
            <dt className="text-muted">هر قسط</dt>
            <dd className="mt-1 text-[15px] font-bold text-[var(--svc-ink)] tabular">
              <AnimatedNumber value={plan.monthly} />
            </dd>
          </div>
          <div>
            <dt className="text-muted">تعداد اقساط</dt>
            <dd className="mt-1 font-semibold text-ink tabular">{formatNumberFa(plan.months)}</dd>
          </div>
          <div>
            <dt className="text-muted">مجموع پرداخت</dt>
            <dd className="mt-1 font-semibold text-ink tabular">
              <AnimatedNumber value={plan.totalCost} />
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-[10px] text-muted-faint">
          مبالغ به تومان و تقریبی است؛ رقم نهایی را {info.name} اعلام می‌کند.
        </p>
      </div>

      {overCredit ? (
        <p className="mt-3 text-[12px] text-danger">
          این مبلغ از سقف اعتبار {info.name} ({formatToman(term.maxCredit)}) بیشتر است؛ سرویس دیگری را انتخاب
          کن.
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <PulseRing color={info.color} active={canBuy && !pending}>
          <button
            type="button"
            onClick={buy}
            disabled={!canBuy || pending}
            style={{ '--svc-ink': readableShade(info.color) } as CSSProperties}
            className="shine relative inline-flex h-13 items-center gap-2 rounded-pill bg-[var(--svc-ink)] px-7 text-[15px] font-semibold text-white transition-[transform,opacity] duration-200 hover:-translate-y-0.5 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45"
          >
            <Sparkles className="size-5" aria-hidden />
            {selection && !selection.available ? 'این مدل ناموجود است' : `خرید قسطی با ${info.name}`}
          </button>
        </PulseRing>
        <Link
          href="/installments"
          className="inline-flex items-center gap-1 text-[12px] font-medium text-muted hover:text-ink"
        >
          مقایسهٔ شرایط همهٔ سرویس‌ها
          <ArrowLeft className="size-3.5" aria-hidden />
        </Link>
      </div>
      <div className="mt-5 border-t border-line pt-4">
        <p className="text-[12px] font-medium text-ink">یا اقساط مستقیم فروشگاه:</p>
        <CreditPlans amount={amount} productSlug={productSlug} className="mt-3" />
        <PlanMonthsTable amount={amount} productName={productName} className="mt-3" />
      </div>
    </div>
  );
}

// ─── the store's own plans: cheque and promissory note ──────────────────────

/** A card per store plan: this model's estimate when the plan has figures, and a link to its page. */
function CreditPlans({
  amount,
  productSlug,
  className,
}: {
  amount: number;
  productSlug: string;
  className?: string;
}) {
  const config = useStoreConfig();
  const methods = offeredMethods(config);
  if (methods.length === 0) return null;

  return (
    <ul className={cn('grid gap-2.5 sm:grid-cols-2', className)}>
      {methods.map((method) => (
        <li key={method}>
          <PlanCard method={method} amount={amount} productSlug={productSlug} />
        </li>
      ))}
    </ul>
  );
}

function PlanCard({
  method,
  amount,
  productSlug,
}: {
  method: CreditMethod;
  amount: number;
  productSlug: string;
}) {
  const config = useStoreConfig();
  const plan = planOf(config, method);
  const color = CREDIT_COLORS[method];
  const estimate = creditPlanReady(plan) && amount > 0 ? estimateCreditPlan(amount, plan) : null;

  return (
    <Link
      href={`${CREDIT_PAGES[method].path}?model=${productSlug}#request`}
      style={{ '--plan': color, '--plan-ink': readableShade(color) } as CSSProperties}
      className="group flex h-full items-center gap-3 rounded-2xl border border-line bg-canvas p-3.5 transition-[border-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--plan)_45%,white)] hover:shadow-[0_14px_30px_-20px_var(--plan)]"
    >
      <PlanIcon method={method} color={color} size={40} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-ink">{CREDIT_PAGES[method].title}</span>
        <span className="mt-0.5 block text-[11px] leading-5 text-muted">
          {estimate ? (
            <>
              پیش‌پرداخت {formatToman(estimate.downPayment)}، ماهانه{' '}
              <span className="font-semibold text-[var(--plan-ink)] tabular">
                {formatToman(estimate.monthly)}
              </span>{' '}
              × {formatNumberFa(estimate.months)}
            </>
          ) : (
            `اقساط با ${CREDIT_METHOD_LABELS[method]}؛ شرایط را کارشناس ما اعلام می‌کند`
          )}
        </span>
      </span>
      <ArrowLeft
        className="size-4 shrink-0 text-[var(--plan-ink)] transition-transform duration-300 group-hover:-translate-x-1"
        aria-hidden
      />
    </Link>
  );
}

/**
 * This model's price with each store plan, for every month choice: the down
 * payment, the monthly instalment and everything paid in the end — the same
 * figures the contract is written with.
 */
function PlanMonthsTable({
  amount,
  productName,
  className,
}: {
  amount: number;
  productName: string;
  className?: string;
}) {
  const config = useStoreConfig();
  const ready = offeredMethods(config).flatMap((method) => {
    const plan = planOf(config, method);
    return creditPlanReady(plan) ? [{ method, plan }] : [];
  });
  const [chosen, setChosen] = useState<CreditMethod | null>(null);
  if (ready.length === 0 || amount <= 0) return null;
  const current = ready.find((item) => item.method === chosen) ?? ready[0]!;

  return (
    <div className={cn('min-w-0 max-w-full overflow-hidden rounded-2xl border border-line', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <p className="text-[13px] font-semibold text-ink">جدول اقساط {productName}</p>
        {ready.length > 1 ? (
          <div className="flex gap-1.5" role="group" aria-label="روش خرید قسطی">
            {ready.map((item) => (
              <button
                key={item.method}
                type="button"
                onClick={() => setChosen(item.method)}
                aria-pressed={item.method === current.method}
                className={cn(
                  'rounded-pill border px-3 py-1 text-[12px] transition-colors',
                  item.method === current.method
                    ? 'border-brand-strong bg-brand-strong text-white'
                    : 'border-line text-ink-muted hover:bg-surface',
                )}
              >
                {CREDIT_METHOD_LABELS[item.method]}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div>
        <table className="w-full text-[11px] sm:text-[12px]">
          <caption className="sr-only">
            قسط ماهانهٔ {productName} با {CREDIT_METHOD_LABELS[current.method]} برای هر تعداد قسط
          </caption>
          <thead>
            <tr className="text-muted">
              <th scope="col" className="px-2.5 py-2 sm:px-4 text-start font-normal">
                تعداد قسط
              </th>
              <th scope="col" className="px-2.5 py-2 sm:px-4 text-start font-normal">
                پیش‌پرداخت
              </th>
              <th scope="col" className="px-2.5 py-2 sm:px-4 text-start font-normal">
                قسط ماهانه
              </th>
              <th scope="col" className="px-2.5 py-2 sm:px-4 text-end font-normal">
                جمع کل
              </th>
            </tr>
          </thead>
          <tbody>
            {creditMonthOptions(current.plan.maxMonths).map((months) => {
              const e = estimateCreditPlan(amount, current.plan, { months });
              return (
                <tr key={months} className="border-t border-line/60">
                  <td className="px-2.5 py-2 sm:px-4 tabular text-ink">{formatNumberFa(months)} ماه</td>
                  <td className="px-2.5 py-2 sm:px-4 tabular text-ink-muted">
                    {formatNumberFa(e.downPayment)}
                  </td>
                  <td className="px-2.5 py-2 sm:px-4 tabular font-semibold text-ink">
                    {formatNumberFa(e.monthly)}
                    {e.lastInstallment !== e.monthly && months > 1 ? (
                      <span className="block text-[10px] font-normal text-muted">
                        قسط آخر {formatNumberFa(e.lastInstallment)}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2.5 py-2 sm:px-4 text-end tabular text-ink-muted">
                    {formatNumberFa(e.totalCost)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-2.5 py-2 sm:px-4.5 text-[11px] leading-5 text-muted">
        کارمزد {formatPercentFa(current.plan.monthlyFeePercent)}٪ در ماه روی مانده پس از پیش‌پرداخت؛ مبلغ دقیق
        در قرارداد نوشته می‌شود.
      </p>
    </div>
  );
}

// ─── cheque and promissory note ──────────────────────────────────────────────

function ChequePath({
  amount,
  productName,
  productSlug,
}: {
  amount: number;
  productName: string;
  productSlug: string;
}) {
  const config = useStoreConfig();
  const { store } = config;
  const telegram = store.telegram?.replace('@', '');
  const first = offeredMethods(config)[0];

  return (
    <div className="p-5 sm:p-6">
      <CreditPlans amount={amount} productSlug={productSlug} />

      <PlanMonthsTable amount={amount} productName={productName} className="mt-4" />

      <ChequeSteps className="mt-5" onProductPage />

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <PulseRing>
          {first ? (
            <Link
              href={`${CREDIT_PAGES[first].path}?model=${productSlug}#request`}
              className="shine relative inline-flex h-13 items-center gap-2 rounded-pill bg-brand-strong px-7 text-[15px] font-semibold text-white transition-[transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-brand-ink active:scale-[0.98]"
            >
              <Send className="size-5" aria-hidden />
              درخواست خرید قسطی {productName}
            </Link>
          ) : (
            <a
              href={telHref(store.phone)}
              className="shine relative inline-flex h-13 items-center gap-2 rounded-pill bg-brand-strong px-7 text-[15px] font-semibold text-white transition-[transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-brand-ink active:scale-[0.98]"
            >
              <Phone className="size-5" aria-hidden />
              درخواست خرید قسطی
            </a>
          )}
        </PulseRing>
        <a
          href={telHref(store.phone)}
          className="inline-flex h-13 items-center gap-2 rounded-pill border border-line px-5 text-[14px] font-medium text-ink transition-colors hover:bg-surface"
        >
          <Phone className="size-4 text-brand" aria-hidden />
          <span dir="ltr" className="font-display">
            {store.phone}
          </span>
        </a>
        {telegram ? (
          <a
            href={`https://t.me/${telegram}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ring-gradient inline-flex h-13 items-center gap-2 rounded-pill px-6 text-[14px] font-medium text-ink transition-transform duration-200 hover:-translate-y-0.5"
          >
            <Send className="size-4 text-brand" aria-hidden />
            پیام در تلگرام
          </a>
        ) : null}
      </div>
      <Link
        href="/installments"
        className="mt-4 inline-flex items-center gap-1 text-[12px] font-medium text-muted hover:text-ink"
      >
        قیمت اقساطی همهٔ مدل‌ها و شرایط آیفون قسطی
        <ArrowLeft className="size-3.5" aria-hidden />
      </Link>
    </div>
  );
}
