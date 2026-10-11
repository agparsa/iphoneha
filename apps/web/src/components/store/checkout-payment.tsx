'use client';

import Link from 'next/link';
import { type CSSProperties, type ReactNode } from 'react';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import {
  ArrowLeft,
  CalendarClock,
  Check,
  Clock,
  CreditCard,
  FileText,
  Lock,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  formatNumberFa,
  formatToman,
  type CreditMethod,
  type InstallmentTerms,
  type PaymentMethod,
  type PaymentMethodOptionDto,
} from '@iphoneha/shared';
import { readableShade } from '@/lib/color';
import { CREDIT_COLORS, CREDIT_PAGES } from '@/lib/credit';
import { cn } from '@/lib/utils';
import { AnimatedNumber } from '@/components/motion/animated-number';
import { Button } from '@/components/ui/button';
import { PaymentLogo } from './payment-logo';

export type PaymentMode = 'cash' | 'credit';

/** --svc for accents, --svc-ink wherever the service's colour carries text. */
function serviceColors(color: string): CSSProperties {
  return { '--svc': color, '--svc-ink': readableShade(color) } as CSSProperties;
}

export function modeOf(option: Pick<PaymentMethodOptionDto, 'kind'>): PaymentMode {
  return option.kind === 'INSTALLMENT' ? 'credit' : 'cash';
}

/** The chosen service's plan for this order, as the API worked it out. */
export interface CreditBreakdown {
  downPayment: number;
  financed: number;
  months: number;
  monthly: number;
  /** null when the store has no terms on file for the service */
  feeFree: boolean | null;
}

export function creditBreakdown(
  option: PaymentMethodOptionDto,
  amount: number,
  terms: InstallmentTerms | undefined,
): CreditBreakdown | null {
  const estimate = option.estimate;
  if (!estimate) return null;
  return {
    downPayment: estimate.downPayment,
    financed: Math.max(0, amount - estimate.downPayment),
    months: estimate.months,
    monthly: estimate.monthly,
    feeFree: terms ? terms.annualFeeRate === 0 : null,
  };
}

/**
 * The checkout's payment step: first the way to pay — all at once through the
 * bank gateway, or in instalments through a credit service — then the gateway
 * itself. Every option comes from the API for this basket's amount; a service
 * the amount does not suit stays in view with the reason, and nothing that is
 * not connected is offered.
 */
export function CheckoutPayment({
  options,
  amount,
  terms,
  creditPlans,
  value,
  mode,
  onModeChange,
  onChange,
  onContinue,
}: {
  options: PaymentMethodOptionDto[];
  amount: number;
  terms: InstallmentTerms[];
  /** the store's own cheque and promissory-note plans that are offered (a request form, not a gateway) */
  creditPlans: CreditMethod[];
  value: PaymentMethod | null;
  mode: PaymentMode;
  onModeChange: (mode: PaymentMode) => void;
  onChange: (method: PaymentMethod) => void;
  onContinue: () => void;
}) {
  const cash = options.filter((option) => modeOf(option) === 'cash');
  const credit = options.filter((option) => modeOf(option) === 'credit');
  const hasCash = cash.length > 0;
  const hasCredit = credit.length > 0 || creditPlans.length > 0;

  const creditOffers = credit
    .filter((option) => option.eligible && option.estimate)
    .sort((a, b) => a.estimate!.monthly - b.estimate!.monthly);
  const lowestMonthly = creditOffers[0]?.estimate?.monthly ?? null;
  const lowestMethod = creditOffers[0]?.method ?? null;

  const shownMode: PaymentMode = !hasCredit ? 'cash' : !hasCash ? 'credit' : mode;
  const selected = options.find((option) => option.method === value) ?? null;
  const selectedTerms = selected ? terms.find((term) => term.method === selected.method) : undefined;
  const breakdown =
    selected && modeOf(selected) === 'credit' ? creditBreakdown(selected, amount, selectedTerms) : null;

  const choose = (next: PaymentMode) => {
    onModeChange(next);
    const pool = next === 'cash' ? cash : credit;
    const keep = pool.find((option) => option.method === value && option.eligible);
    const first = keep ?? pool.find((option) => option.eligible);
    if (first) onChange(first.method);
  };

  return (
    <div className="space-y-4">
      {hasCash && hasCredit ? (
        <div role="group" aria-label="نحوهٔ پرداخت" className="grid grid-cols-2 gap-2">
          <ModeCard
            active={shownMode === 'cash'}
            onClick={() => choose('cash')}
            icon={<CreditCard className="size-5" aria-hidden />}
            title="پرداخت نقدی"
            hint={
              <>
                یکجا <span className="tabular">{formatToman(amount)}</span>
              </>
            }
          />
          <ModeCard
            active={shownMode === 'credit'}
            onClick={() => choose('credit')}
            icon={<CalendarClock className="size-5" aria-hidden />}
            title="خرید قسطی"
            badge={creditOffers.length > 0 ? `${formatNumberFa(creditOffers.length)} سرویس` : null}
            hint={
              lowestMonthly !== null ? (
                <>
                  ماهانه از <span className="tabular">{formatToman(lowestMonthly)}</span>
                </>
              ) : (
                'با سرویس‌های اعتباری'
              )
            }
          />
        </div>
      ) : null}

      {shownMode === 'cash' ? (
        <div key="cash" className="animate-fade-up space-y-3">
          <RadioGroupPrimitive.Root
            aria-label="درگاه پرداخت نقدی"
            value={value ?? ''}
            onValueChange={(next) => onChange(next as PaymentMethod)}
            className="grid gap-2"
          >
            {cash.map((option) => (
              <GatewayCard key={option.method} option={option}>
                <div className="flex items-center gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-ink text-white">
                    <Lock className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-ink">{option.name}</p>
                    <p className="mt-0.5 text-[11px] text-muted">{option.tagline}</p>
                  </div>
                  <span className="shrink-0 text-end">
                    <span className="block text-[10px] text-muted">مبلغ</span>
                    <span className="block text-[14px] font-semibold text-ink tabular">
                      {formatToman(amount)}
                    </span>
                  </span>
                </div>
                {!option.eligible && option.reason ? (
                  <p className="mt-2 text-[11px] text-danger">{option.reason}</p>
                ) : null}
              </GatewayCard>
            ))}
          </RadioGroupPrimitive.Root>
          <p className="flex items-center gap-2 text-[11px] leading-5 text-muted">
            <ShieldCheck className="size-4 shrink-0 text-success" aria-hidden />
            پرداخت در درگاه امن شاپرک با همهٔ کارت‌های بانکی؛ اطلاعات کارت به فروشگاه نمی‌رسد.
          </p>
        </div>
      ) : (
        <div key="credit" className="animate-fade-up space-y-3">
          {credit.length > 0 ? (
            <RadioGroupPrimitive.Root
              aria-label="سرویس خرید قسطی"
              value={value ?? ''}
              onValueChange={(next) => onChange(next as PaymentMethod)}
              className="grid gap-2 sm:grid-cols-2"
            >
              {credit.map((option) => {
                const optionTerms = terms.find((term) => term.method === option.method);
                return (
                  <GatewayCard key={option.method} option={option} branded>
                    <div className="flex items-center gap-2.5">
                      <PaymentLogo method={option.method} size={40} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold text-ink">{option.name}</p>
                        <p className="truncate text-[11px] text-muted">{option.tagline}</p>
                      </div>
                    </div>
                    {option.eligible && option.estimate ? (
                      <>
                        <p className="mt-3 text-[11px] text-muted">قسط ماهانه</p>
                        <p className="text-[17px] font-bold text-[var(--svc-ink)] tabular">
                          {formatToman(option.estimate.monthly)}
                        </p>
                        <p className="mt-1 text-[11px] text-ink-muted">
                          {formatNumberFa(option.estimate.months)} قسط ·{' '}
                          {option.estimate.downPayment === 0
                            ? 'بدون پیش‌پرداخت'
                            : `پیش‌پرداخت ${formatToman(option.estimate.downPayment)}`}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {option.method === lowestMethod && creditOffers.length > 1 ? (
                            <Tag>
                              <Sparkles className="size-3" aria-hidden />
                              کمترین قسط
                            </Tag>
                          ) : null}
                          {optionTerms?.annualFeeRate === 0 ? <Tag>بدون کارمزد</Tag> : null}
                          {option.estimate.downPayment === 0 ? <Tag>بدون پیش‌پرداخت</Tag> : null}
                          {optionTerms ? <Tag muted>تأیید {optionTerms.approvalTime}</Tag> : null}
                        </div>
                      </>
                    ) : (
                      <p className="mt-3 text-[11px] leading-5 text-danger">
                        {option.reason ?? 'برای این سفارش در دسترس نیست'}
                      </p>
                    )}
                  </GatewayCard>
                );
              })}
            </RadioGroupPrimitive.Root>
          ) : null}

          {selected && breakdown ? (
            <CreditDetail option={selected} breakdown={breakdown} amount={amount} terms={selectedTerms} />
          ) : null}

          {creditPlans.length > 0 ? (
            <div className="rounded-2xl border border-dashed border-line-strong p-4">
              <p className="text-[13px] font-medium text-ink">
                {credit.length > 0 ? 'یا با چک و سفته، مستقیم از خود فروشگاه' : 'خرید قسطی از خود فروشگاه'}
              </p>
              <p className="mt-1 text-[11px] leading-5 text-muted">
                این روش درگاه آنلاین ندارد: درخواست را ثبت کن تا کارشناس فروشگاه تماس بگیرد و قرارداد را
                ببندد.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {creditPlans.map((plan) => (
                  <Link
                    key={plan}
                    href={`${CREDIT_PAGES[plan].path}#request`}
                    style={serviceColors(CREDIT_COLORS[plan])}
                    className="inline-flex items-center gap-1.5 rounded-pill border border-[color-mix(in_srgb,var(--svc)_40%,white)] px-3.5 py-1.5 text-[12px] font-medium text-[var(--svc-ink)] transition-colors hover:bg-[color-mix(in_srgb,var(--svc)_8%,white)]"
                  >
                    {CREDIT_PAGES[plan].title}
                    <ArrowLeft className="size-3.5" aria-hidden />
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {options.length > 0 ? (
        <Button size="lg" block className="shine" onClick={onContinue} disabled={!selected?.eligible}>
          {selected?.eligible ? `ادامه با ${selected.name}` : 'یک روش پرداخت انتخاب کن'}
          <ArrowLeft className="size-4" aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}

function ModeCard({
  active,
  onClick,
  icon,
  title,
  hint,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  hint: ReactNode;
  badge?: string | null;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'relative flex min-w-0 flex-col items-start gap-2 rounded-2xl border p-3.5 text-start transition-[background-color,border-color,box-shadow,color] duration-300 sm:p-4',
        active
          ? 'border-ink bg-ink text-white shadow-[0_14px_30px_-18px_rgba(8,9,10,0.7)]'
          : 'border-line bg-canvas text-ink hover:border-line-strong hover:bg-surface',
      )}
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span
          className={cn(
            'grid size-9 place-items-center rounded-xl',
            active ? 'bg-white/15' : 'bg-surface-2 text-ink',
          )}
        >
          {icon}
        </span>
        {active ? (
          <span className="grid size-5 place-items-center rounded-full bg-white text-ink">
            <Check className="size-3" aria-hidden />
          </span>
        ) : badge ? (
          <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-[10px] text-ink-muted">{badge}</span>
        ) : null}
      </span>
      <span className="text-[14px] font-semibold">{title}</span>
      <span className={cn('max-w-full truncate text-[11px]', active ? 'text-white/75' : 'text-muted')}>
        {hint}
      </span>
    </button>
  );
}

/** One gateway as a radio: the whole card is the control, the dot is only a cue. */
function GatewayCard({
  option,
  branded,
  children,
}: {
  option: PaymentMethodOptionDto;
  branded?: boolean;
  children: ReactNode;
}) {
  const id = `pay-${option.method.toLowerCase()}`;
  return (
    <label
      htmlFor={id}
      style={branded ? serviceColors(option.color) : undefined}
      className={cn(
        'group relative block cursor-pointer overflow-hidden rounded-2xl border border-line bg-canvas p-4 transition-[border-color,box-shadow,background-color] duration-300',
        branded
          ? 'has-[[data-state=checked]]:border-[var(--svc-ink)] has-[[data-state=checked]]:bg-[color-mix(in_srgb,var(--svc)_6%,white)] has-[[data-state=checked]]:shadow-[0_14px_30px_-20px_var(--svc)]'
          : 'has-[[data-state=checked]]:border-ink has-[[data-state=checked]]:bg-surface-2',
        option.eligible ? 'hover:border-line-strong' : 'cursor-not-allowed opacity-60',
      )}
    >
      <RadioGroupPrimitive.Item
        id={id}
        value={option.method}
        disabled={!option.eligible}
        aria-label={option.name}
        className={cn(
          'absolute top-3.5 left-3.5 grid size-5 place-items-center rounded-full border border-line-strong bg-canvas',
          branded ? 'data-[state=checked]:border-[var(--svc-ink)]' : 'data-[state=checked]:border-ink',
        )}
      >
        <RadioGroupPrimitive.Indicator
          className={cn('size-2.5 rounded-full', branded ? 'bg-[var(--svc-ink)]' : 'bg-ink')}
        />
      </RadioGroupPrimitive.Item>
      {/* room for the dot on the left (the page is right-to-left) */}
      <div className="pl-7">{children}</div>
    </label>
  );
}

function Tag({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[10px]',
        muted
          ? 'bg-surface-2 text-muted'
          : 'bg-[color-mix(in_srgb,var(--svc)_12%,white)] font-medium text-[var(--svc-ink)]',
      )}
    >
      {children}
    </span>
  );
}

/** The chosen service, worked out for this order, and what happens after «ادامه». */
function CreditDetail({
  option,
  breakdown,
  amount,
  terms,
}: {
  option: PaymentMethodOptionDto;
  breakdown: CreditBreakdown;
  amount: number;
  terms: InstallmentTerms | undefined;
}) {
  const steps = [
    'ثبت سفارش؛ کالا برایت رزرو می‌شود',
    `انتقال به ${option.name} و تأیید اعتبار${terms ? ` (${terms.approvalTime})` : ''}`,
    breakdown.downPayment > 0 ? 'پرداخت پیش‌پرداخت در همان درگاه' : 'تأیید نهایی خرید در همان درگاه',
    'آماده‌سازی و ارسال سفارش',
  ];
  return (
    <section
      key={option.method}
      aria-label={`جزئیات خرید با ${option.name}`}
      style={serviceColors(option.color)}
      className="animate-fade-up relative overflow-hidden rounded-2xl border border-line bg-surface-2 p-4 sm:p-5"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -top-20 -left-16 size-52 rounded-full bg-[color-mix(in_srgb,var(--svc)_20%,transparent)] blur-3xl"
      />
      <div className="relative grid gap-5 sm:grid-cols-2">
        <dl className="grid content-start gap-2.5 text-[13px]">
          <DetailRow label="مبلغ سفارش" value={formatToman(amount)} />
          <DetailRow
            label="پیش‌پرداخت"
            value={
              breakdown.downPayment === 0 ? (
                'ندارد'
              ) : (
                <AnimatedNumber value={breakdown.downPayment} format={formatToman} />
              )
            }
          />
          <DetailRow label="مبلغ اعتبار" value={formatToman(breakdown.financed)} />
          <DetailRow
            label={`${formatNumberFa(breakdown.months)} قسط ماهانه`}
            value={<AnimatedNumber value={breakdown.monthly} format={formatToman} />}
            emphasis
          />
          {breakdown.feeFree ? <DetailRow label="کارمزد" value="ندارد" /> : null}
        </dl>

        <div>
          <p className="text-[12px] font-medium text-ink">بعد از «ادامه» چه می‌شود؟</p>
          <ol className="mt-2.5 grid gap-2">
            {steps.map((step, index) => (
              <li key={step} className="flex items-start gap-2 text-[12px] leading-5 text-ink-muted">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[var(--svc-ink)] text-[10px] text-white tabular">
                  {formatNumberFa(index + 1)}
                </span>
                {step}
              </li>
            ))}
          </ol>
          {terms ? (
            <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-5 text-muted">
              <FileText className="mt-0.5 size-3.5 shrink-0 text-[var(--svc-ink)]" aria-hidden />
              مدارک: {terms.documents}
            </p>
          ) : null}
        </div>
      </div>
      <p className="relative mt-4 flex items-start gap-1.5 border-t border-line pt-3 text-[11px] leading-5 text-muted-faint">
        <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        ارقام برآوردی‌اند؛ تعداد اقساط و مبلغ نهایی را {option.name} پس از اعتبارسنجی اعلام می‌کند.
      </p>
    </section>
  );
}

function DetailRow({ label, value, emphasis }: { label: string; value: ReactNode; emphasis?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd
        className={cn(
          'text-end tabular',
          emphasis ? 'text-[15px] font-bold text-[var(--svc-ink)]' : 'text-ink',
        )}
      >
        {value}
      </dd>
    </div>
  );
}
