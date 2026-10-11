'use client';

import { useId } from 'react';
import { CalendarRange, Plus, Trash2 } from 'lucide-react';
import {
  addJalaliMonths,
  buildInstallmentSchedule,
  CREDIT_METHOD_LABELS,
  creditDownPayment,
  digitsOnly,
  formatNumberFa,
  formatPercentFa,
  formatToman,
  isValidSayadId,
  MANUAL_PAYMENT_CHANNEL_LABELS,
  tehranToday,
  type CreditMethod,
  type CreditPlan,
} from '@iphoneha/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { JalaliDateInput, MoneyInput } from './inputs';

export const IRANIAN_BANKS = [
  'ملت',
  'ملی',
  'صادرات',
  'تجارت',
  'سپه',
  'رفاه کارگران',
  'مسکن',
  'کشاورزی',
  'پاسارگاد',
  'سامان',
  'پارسیان',
  'اقتصاد نوین',
  'سینا',
  'شهر',
  'دی',
  'آینده',
  'کارآفرین',
  'خاورمیانه',
  'گردشگری',
  'ایران زمین',
  'سرمایه',
  'توسعه تعاون',
  'توسعه صادرات',
  'صنعت و معدن',
  'پست بانک',
  'رسالت',
  'قرض‌الحسنه مهر ایران',
  'ملل',
];

type CounterChannel = 'CASH' | 'POS' | 'TRANSFER';

export interface ChequeDraft {
  key: string;
  /** 1…n, or null for a guarantee cheque on the whole contract */
  installmentIndex: number | null;
  sayadId: string;
  serial: string;
  bankName: string;
  branch: string;
  drawerName: string;
  amount: number | null;
  dueDate: string | null;
  sayadConfirmed: boolean;
}

export interface SafteDraft {
  key: string;
  serial: string;
  amount: number | null;
  electronic: boolean;
  dueDate: string | null;
}

export interface ContractDraft {
  contractDate: string | null;
  downPayment: number | null;
  downPaymentChannel: CounterChannel;
  downPaymentReference: string;
  months: number;
  monthlyFeePercent: number | null;
  firstDueDate: string | null;
  installments: { key: string; dueDate: string | null; amount: number | null }[];
  cheques: ChequeDraft[];
  saftes: SafteDraft[];
  nationalId: string;
  customerAddress: string;
  withGuarantor: boolean;
  guarantor: { name: string; phone: string; nationalId: string };
  note: string;
}

let counter = 0;
const key = () => `k${++counter}`;

/** A fresh contract with the plan's figures as the starting point. */
export function emptyContract(plan: CreditPlan | null | undefined, price: number): ContractDraft {
  const today = tehranToday();
  const months = Math.min(plan?.maxMonths ?? 6, 6) || 6;
  const downPercent = plan?.minDownPaymentPercent ?? 30;
  return {
    contractDate: today,
    downPayment: price > 0 ? creditDownPayment(price, downPercent) : null,
    downPaymentChannel: 'POS',
    downPaymentReference: '',
    months,
    monthlyFeePercent: plan?.monthlyFeePercent ?? null,
    firstDueDate: addJalaliMonths(today, 1),
    installments: [],
    cheques: [],
    saftes: [],
    nationalId: '',
    customerAddress: '',
    withGuarantor: false,
    guarantor: { name: '', phone: '', nationalId: '' },
    note: '',
  };
}

export function draftTotals(draft: ContractDraft, price: number) {
  const downPayment = draft.downPayment ?? 0;
  const financed = Math.max(0, price - downPayment);
  const scheduled = draft.installments.reduce((sum, row) => sum + (row.amount ?? 0), 0);
  return { downPayment, financed, scheduled, markup: scheduled - financed, total: downPayment + scheduled };
}

/** What the API takes for the contract part of an order (or a contract on its own). */
export function contractPayload(draft: ContractDraft, customerName: string) {
  return {
    nationalId: draft.nationalId.trim() || null,
    customerAddress: draft.customerAddress.trim() || null,
    guarantor: draft.withGuarantor
      ? {
          name: draft.guarantor.name.trim(),
          phone: digitsOnly(draft.guarantor.phone),
          nationalId: draft.guarantor.nationalId.trim() || null,
        }
      : null,
    downPayment: draft.downPayment ?? 0,
    downPaymentChannel: draft.downPaymentChannel,
    downPaymentReference: draft.downPaymentReference.trim() || null,
    monthlyFeePercent: draft.monthlyFeePercent,
    contractDate: draft.contractDate,
    installments: draft.installments.map((row) => ({ dueDate: row.dueDate, amount: row.amount })),
    cheques: draft.cheques.map((cheque) => ({
      installmentIndex: cheque.installmentIndex,
      sayadId: digitsOnly(cheque.sayadId),
      serial: cheque.serial.trim() || null,
      bankName: cheque.bankName.trim(),
      branch: cheque.branch.trim() || null,
      drawerName: cheque.drawerName.trim() || customerName,
      amount: cheque.amount,
      dueDate: cheque.dueDate,
      sayadConfirmed: cheque.sayadConfirmed,
    })),
    saftes: draft.saftes.map((safte) => ({
      serial: safte.serial.trim(),
      amount: safte.amount,
      electronic: safte.electronic,
      dueDate: safte.dueDate,
    })),
    note: draft.note.trim() || null,
  };
}

/** Problems worth fixing before sending: the server checks everything again. */
export function contractProblems(draft: ContractDraft, price: number, method: CreditMethod): string[] {
  const problems: string[] = [];
  const { downPayment, financed, scheduled } = draftTotals(draft, price);
  if (!draft.contractDate) problems.push('تاریخ قرارداد را وارد کن');
  if (downPayment > price) problems.push('پیش‌پرداخت از قیمت بیشتر است');
  if (!draft.installments.length) problems.push('جدول اقساط را بساز');
  if (draft.installments.some((row) => !row.dueDate || !row.amount))
    problems.push('سررسید و مبلغ همهٔ اقساط را پر کن');
  if (draft.installments.length && scheduled < financed)
    problems.push(`جمع اقساط ${formatToman(financed - scheduled)} از مانده کمتر است`);
  if (draft.cheques.some((cheque) => !isValidSayadId(cheque.sayadId)))
    problems.push('شناسهٔ صیادی هر چک ۱۶ رقم است');
  if (draft.cheques.some((cheque) => !cheque.bankName.trim() || !cheque.amount || !cheque.dueDate)) {
    problems.push('بانک، مبلغ و سررسید همهٔ چک‌ها را پر کن');
  }
  if (draft.saftes.some((safte) => safte.serial.trim().length < 3 || !safte.amount))
    problems.push('شماره و مبلغ سفته‌ها را پر کن');
  if (
    draft.withGuarantor &&
    (draft.guarantor.name.trim().length < 3 || digitsOnly(draft.guarantor.phone).length !== 11)
  ) {
    problems.push('نام و موبایل ضامن را کامل کن');
  }
  if (method === 'CHEQUE' && !draft.cheques.length) problems.push('چک‌های اقساط را وارد کن');
  if (method === 'SAFTE' && !draft.saftes.length) problems.push('دست‌کم یک سفته ثبت کن');
  return problems;
}

/**
 * The terms of a cheque or promissory-note sale: down payment, schedule,
 * the cheques (one per instalment, in Sayad), promissory notes, guarantor.
 */
export function ContractBuilder({
  method,
  price,
  customerName,
  plan,
  draft,
  onChange,
}: {
  method: CreditMethod;
  price: number;
  customerName: string;
  plan: CreditPlan | null | undefined;
  draft: ContractDraft;
  onChange: (draft: ContractDraft) => void;
}) {
  const id = useId();
  const set = (patch: Partial<ContractDraft>) => onChange({ ...draft, ...patch });
  const totals = draftTotals(draft, price);

  function buildSchedule() {
    if (!draft.firstDueDate) return;
    const rows = buildInstallmentSchedule({
      financed: totals.financed,
      months: draft.months,
      monthlyFeePercent: draft.monthlyFeePercent ?? 0,
      firstDueDate: draft.firstDueDate,
    });
    const installments = rows.map((row) => ({ key: key(), dueDate: row.dueDate, amount: row.amount }));
    const next: Partial<ContractDraft> = { installments };
    if (method === 'CHEQUE') {
      // one cheque per instalment; what was typed for a row stays with that row
      const guarantees = draft.cheques.filter((cheque) => cheque.installmentIndex === null);
      next.cheques = [
        ...rows.map((row, index) => {
          const before = draft.cheques.find((cheque) => cheque.installmentIndex === index + 1);
          return {
            key: before?.key ?? key(),
            installmentIndex: index + 1,
            sayadId: before?.sayadId ?? '',
            serial: before?.serial ?? '',
            bankName: before?.bankName ?? draft.cheques[0]?.bankName ?? '',
            branch: before?.branch ?? '',
            drawerName: before?.drawerName ?? customerName,
            amount: row.amount,
            dueDate: row.dueDate,
            sayadConfirmed: before?.sayadConfirmed ?? false,
          };
        }),
        ...guarantees,
      ];
    }
    onChange({ ...draft, ...next });
  }

  function setInstallment(index: number, patch: Partial<ContractDraft['installments'][number]>) {
    const installments = draft.installments.map((row, i) => (i === index ? { ...row, ...patch } : row));
    // a cheque written for this instalment follows its amount and date
    const cheques = draft.cheques.map((cheque) =>
      cheque.installmentIndex === index + 1
        ? {
            ...cheque,
            ...(patch.amount !== undefined ? { amount: patch.amount } : {}),
            ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate } : {}),
          }
        : cheque,
    );
    set({ installments, cheques });
  }

  function setCheque(index: number, patch: Partial<ChequeDraft>) {
    set({ cheques: draft.cheques.map((cheque, i) => (i === index ? { ...cheque, ...patch } : cheque)) });
  }

  function setSafte(index: number, patch: Partial<SafteDraft>) {
    set({ saftes: draft.saftes.map((safte, i) => (i === index ? { ...safte, ...patch } : safte)) });
  }

  const planHint = plan
    ? [
        plan.minDownPaymentPercent !== null
          ? `پیش‌پرداخت حداقل ${formatNumberFa(plan.minDownPaymentPercent)}٪`
          : null,
        plan.maxMonths !== null ? `حداکثر ${formatNumberFa(plan.maxMonths)} ماه` : null,
        plan.monthlyFeePercent !== null ? `کارمزد ${formatPercentFa(plan.monthlyFeePercent)}٪ در ماه` : null,
        plan.maxFinanced !== null ? `سقف ${formatToman(plan.maxFinanced)}` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <div className="grid gap-5">
      {planHint ? (
        <p className="rounded-2xl bg-surface px-4 py-3 text-[12px] text-muted">
          شرایط {CREDIT_METHOD_LABELS[method]} در تنظیمات: {planHint}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="تاریخ قرارداد" htmlFor={`${id}-date`}>
          <JalaliDateInput
            id={`${id}-date`}
            value={draft.contractDate}
            onChange={(contractDate) => set({ contractDate })}
          />
        </Field>
        <Field
          label="پیش‌پرداخت (تومان)"
          htmlFor={`${id}-down`}
          hint={
            price > 0 && draft.downPayment
              ? `${formatNumberFa(Math.round(((draft.downPayment ?? 0) / price) * 100))}٪ قیمت`
              : undefined
          }
        >
          <MoneyInput
            id={`${id}-down`}
            value={draft.downPayment}
            onChange={(downPayment) => set({ downPayment })}
            showHint={false}
          />
        </Field>
        <Field label="پیش‌پرداخت با" htmlFor={`${id}-channel`}>
          <select
            id={`${id}-channel`}
            className="h-12 w-full rounded-2xl border border-line bg-canvas px-3 text-sm"
            value={draft.downPaymentChannel}
            onChange={(event) => set({ downPaymentChannel: event.target.value as CounterChannel })}
          >
            {(['POS', 'CASH', 'TRANSFER'] as const).map((channel) => (
              <option key={channel} value={channel}>
                {MANUAL_PAYMENT_CHANNEL_LABELS[channel]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-4 rounded-2xl border border-line p-4 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto] sm:items-end">
        <Field label="تعداد اقساط" htmlFor={`${id}-months`}>
          <Input
            id={`${id}-months`}
            type="number"
            min={1}
            max={60}
            inputMode="numeric"
            value={draft.months}
            onChange={(event) => set({ months: Math.max(1, Math.min(60, Number(event.target.value) || 1)) })}
          />
        </Field>
        <Field label="کارمزد ماهانه (٪)" htmlFor={`${id}-fee`}>
          <Input
            id={`${id}-fee`}
            type="number"
            min={0}
            max={15}
            step="0.1"
            inputMode="decimal"
            value={draft.monthlyFeePercent ?? ''}
            onChange={(event) =>
              set({ monthlyFeePercent: event.target.value === '' ? null : Number(event.target.value) })
            }
          />
        </Field>
        <Field label="سررسید قسط اول" htmlFor={`${id}-first`}>
          <JalaliDateInput
            id={`${id}-first`}
            value={draft.firstDueDate}
            onChange={(firstDueDate) => set({ firstDueDate })}
            todayButton={false}
          />
        </Field>
        <Button
          type="button"
          variant="dark"
          onClick={buildSchedule}
          disabled={!draft.firstDueDate || totals.financed <= 0}
          className="sm:mb-6"
        >
          <CalendarRange aria-hidden />
          ساخت جدول اقساط
        </Button>
      </div>

      {draft.installments.length ? (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[34rem] text-[13px]">
            <caption className="sr-only">جدول اقساط</caption>
            <thead className="bg-surface-2 text-[12px] text-muted">
              <tr>
                <th className="px-3 py-2 text-start font-medium">قسط</th>
                <th className="px-3 py-2 text-start font-medium">سررسید</th>
                <th className="px-3 py-2 text-start font-medium">مبلغ (تومان)</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {draft.installments.map((row, index) => (
                <tr key={row.key} className="border-t border-line align-top">
                  <td className="px-3 py-2 tabular">{formatNumberFa(index + 1)}</td>
                  <td className="px-3 py-2">
                    <JalaliDateInput
                      aria-label={`سررسید قسط ${index + 1}`}
                      value={row.dueDate}
                      onChange={(dueDate) => setInstallment(index, { dueDate })}
                      todayButton={false}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <MoneyInput
                      aria-label={`مبلغ قسط ${index + 1}`}
                      value={row.amount}
                      onChange={(amount) => setInstallment(index, { amount })}
                      showHint={false}
                    />
                  </td>
                  <td className="px-1 py-3">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`حذف قسط ${index + 1}`}
                      onClick={() =>
                        set({
                          installments: draft.installments.filter((_, i) => i !== index),
                          cheques: draft.cheques
                            .filter((cheque) => cheque.installmentIndex !== index + 1)
                            .map((cheque) =>
                              cheque.installmentIndex && cheque.installmentIndex > index + 1
                                ? { ...cheque, installmentIndex: cheque.installmentIndex - 1 }
                                : cheque,
                            ),
                        })
                      }
                    >
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface-2 px-3 py-2 text-[12px]">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                const last = draft.installments[draft.installments.length - 1];
                set({
                  installments: [
                    ...draft.installments,
                    {
                      key: key(),
                      dueDate: last?.dueDate ? addJalaliMonths(last.dueDate, 1) : draft.firstDueDate,
                      amount: last?.amount ?? null,
                    },
                  ],
                });
              }}
            >
              <Plus aria-hidden />
              قسط دیگر
            </Button>
            <span
              className={cn('tabular', totals.scheduled < totals.financed ? 'text-danger' : 'text-muted')}
            >
              جمع اقساط {formatToman(totals.scheduled)} · مانده {formatToman(totals.financed)} · کارمزد{' '}
              {formatToman(Math.max(0, totals.markup))}
            </span>
          </div>
        </div>
      ) : (
        <p className="text-[12px] text-muted">
          مانده پس از پیش‌پرداخت: <span className="tabular text-ink">{formatToman(totals.financed)}</span> —
          تعداد و کارمزد را بزن و «ساخت جدول اقساط».
        </p>
      )}

      {method === 'CHEQUE' || draft.cheques.length ? (
        <fieldset className="grid gap-3">
          <legend className="mb-1 text-[14px] font-semibold text-ink">چک‌ها</legend>
          <datalist id={`${id}-banks`}>
            {IRANIAN_BANKS.map((bank) => (
              <option key={bank} value={bank} />
            ))}
          </datalist>
          {draft.cheques.length === 0 ? (
            <p className="text-[12px] text-muted">
              با ساختن جدول اقساط، برای هر قسط یک ردیف چک ساخته می‌شود.
            </p>
          ) : null}
          {draft.cheques.map((cheque, index) => {
            const sayad = digitsOnly(cheque.sayadId);
            const badSayad = sayad.length > 0 && !isValidSayadId(sayad);
            return (
              <fieldset
                key={cheque.key}
                className="grid gap-3 rounded-2xl border border-line p-3 md:grid-cols-6"
              >
                <legend className="px-1 text-[12px] font-medium text-ink">
                  {cheque.installmentIndex ? `چک قسط ${formatNumberFa(cheque.installmentIndex)}` : 'چک ضمانت'}
                </legend>
                <Field
                  label="شناسهٔ صیادی (۱۶ رقم)"
                  htmlFor={`${id}-${cheque.key}-sayad`}
                  className="md:col-span-2"
                  error={badSayad ? 'باید ۱۶ رقم باشد' : undefined}
                >
                  <Input
                    id={`${id}-${cheque.key}-sayad`}
                    dir="ltr"
                    inputMode="numeric"
                    className="font-display tabular"
                    maxLength={20}
                    value={cheque.sayadId}
                    aria-invalid={badSayad || undefined}
                    onChange={(event) => setCheque(index, { sayadId: event.target.value })}
                  />
                </Field>
                <Field label="بانک" htmlFor={`${id}-${cheque.key}-bank`} className="md:col-span-2">
                  <Input
                    id={`${id}-${cheque.key}-bank`}
                    list={`${id}-banks`}
                    value={cheque.bankName}
                    onChange={(event) => setCheque(index, { bankName: event.target.value })}
                  />
                </Field>
                <Field
                  label="سریال (اختیاری)"
                  htmlFor={`${id}-${cheque.key}-serial`}
                  className="md:col-span-2"
                >
                  <Input
                    id={`${id}-${cheque.key}-serial`}
                    dir="ltr"
                    className="font-display"
                    value={cheque.serial}
                    onChange={(event) => setCheque(index, { serial: event.target.value })}
                  />
                </Field>
                <Field label="صاحب حساب" htmlFor={`${id}-${cheque.key}-drawer`} className="md:col-span-2">
                  <Input
                    id={`${id}-${cheque.key}-drawer`}
                    value={cheque.drawerName}
                    placeholder={customerName}
                    onChange={(event) => setCheque(index, { drawerName: event.target.value })}
                  />
                </Field>
                <Field label="مبلغ" htmlFor={`${id}-${cheque.key}-amount`} className="md:col-span-2">
                  <MoneyInput
                    id={`${id}-${cheque.key}-amount`}
                    value={cheque.amount}
                    onChange={(amount) => setCheque(index, { amount })}
                    showHint={false}
                  />
                </Field>
                <Field label="سررسید" htmlFor={`${id}-${cheque.key}-due`} className="md:col-span-2">
                  <JalaliDateInput
                    id={`${id}-${cheque.key}-due`}
                    value={cheque.dueDate}
                    onChange={(dueDate) => setCheque(index, { dueDate })}
                    todayButton={false}
                  />
                </Field>
                <div className="flex items-center justify-between gap-3 md:col-span-6">
                  <label className="flex items-center gap-2 text-[12px] text-ink-muted">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={cheque.sayadConfirmed}
                      onChange={(event) => setCheque(index, { sayadConfirmed: event.target.checked })}
                    />
                    در سامانهٔ صیاد به نام فروشگاه ثبت و تأیید شد
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-danger"
                    onClick={() => set({ cheques: draft.cheques.filter((_, i) => i !== index) })}
                  >
                    <Trash2 aria-hidden />
                    حذف
                  </Button>
                </div>
              </fieldset>
            );
          })}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="justify-self-start"
            onClick={() =>
              set({
                cheques: [
                  ...draft.cheques,
                  {
                    key: key(),
                    installmentIndex: null,
                    sayadId: '',
                    serial: '',
                    bankName: draft.cheques[0]?.bankName ?? '',
                    branch: '',
                    drawerName: customerName,
                    amount: null,
                    dueDate: draft.installments[draft.installments.length - 1]?.dueDate ?? null,
                    sayadConfirmed: false,
                  },
                ],
              })
            }
          >
            <Plus aria-hidden />
            چک ضمانت
          </Button>
        </fieldset>
      ) : null}

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-[14px] font-semibold text-ink">
          سفته‌ها {method === 'CHEQUE' ? '(اختیاری)' : ''}
        </legend>
        {draft.saftes.map((safte, index) => (
          <fieldset
            key={safte.key}
            className="grid gap-3 rounded-2xl border border-line p-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end"
          >
            <legend className="px-1 text-[12px] font-medium text-ink">
              سفتهٔ {formatNumberFa(index + 1)}
            </legend>
            <Field label="شمارهٔ سفته" htmlFor={`${id}-${safte.key}-serial`}>
              <Input
                id={`${id}-${safte.key}-serial`}
                dir="ltr"
                className="font-display"
                value={safte.serial}
                onChange={(event) => setSafte(index, { serial: event.target.value })}
              />
            </Field>
            <Field label="مبلغ" htmlFor={`${id}-${safte.key}-amount`}>
              <MoneyInput
                id={`${id}-${safte.key}-amount`}
                value={safte.amount}
                onChange={(amount) => setSafte(index, { amount })}
                showHint={false}
              />
            </Field>
            <Field label="سررسید (اختیاری)" htmlFor={`${id}-${safte.key}-due`}>
              <JalaliDateInput
                id={`${id}-${safte.key}-due`}
                value={safte.dueDate}
                onChange={(dueDate) => setSafte(index, { dueDate })}
                allowEmpty
                todayButton={false}
              />
            </Field>
            <div className="flex items-center gap-2 pb-6">
              <label className="flex items-center gap-2 text-[12px] text-ink-muted">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={safte.electronic}
                  onChange={(event) => setSafte(index, { electronic: event.target.checked })}
                />
                الکترونیکی
              </label>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="حذف سفته"
                onClick={() => set({ saftes: draft.saftes.filter((_, i) => i !== index) })}
              >
                <Trash2 />
              </Button>
            </div>
          </fieldset>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="justify-self-start"
          onClick={() =>
            set({
              saftes: [
                ...draft.saftes,
                {
                  key: key(),
                  serial: '',
                  // a promissory note usually covers the whole amount still owed, often more
                  amount: totals.scheduled || totals.financed || null,
                  electronic: false,
                  dueDate: null,
                },
              ],
            })
          }
        >
          <Plus aria-hidden />
          سفته
        </Button>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-1 text-[14px] font-semibold text-ink">مشخصات تکمیلی</legend>
        <Field label="کد ملی خریدار (اختیاری)" htmlFor={`${id}-nid`}>
          <Input
            id={`${id}-nid`}
            dir="ltr"
            inputMode="numeric"
            maxLength={10}
            className="font-display"
            value={draft.nationalId}
            onChange={(event) => set({ nationalId: event.target.value })}
          />
        </Field>
        <Field label="نشانی خریدار (اختیاری)" htmlFor={`${id}-address`}>
          <Input
            id={`${id}-address`}
            maxLength={400}
            value={draft.customerAddress}
            onChange={(event) => set({ customerAddress: event.target.value })}
          />
        </Field>
        <label className="flex items-center gap-2 text-[13px] text-ink sm:col-span-2">
          <input
            type="checkbox"
            className="size-4"
            checked={draft.withGuarantor}
            onChange={(event) => set({ withGuarantor: event.target.checked })}
          />
          ضامن دارد
        </label>
        {draft.withGuarantor ? (
          <div className="grid gap-4 sm:col-span-2 sm:grid-cols-3">
            <Field label="نام ضامن" htmlFor={`${id}-g-name`}>
              <Input
                id={`${id}-g-name`}
                value={draft.guarantor.name}
                onChange={(event) => set({ guarantor: { ...draft.guarantor, name: event.target.value } })}
              />
            </Field>
            <Field label="موبایل ضامن" htmlFor={`${id}-g-phone`}>
              <Input
                id={`${id}-g-phone`}
                dir="ltr"
                inputMode="tel"
                className="font-display"
                value={draft.guarantor.phone}
                onChange={(event) => set({ guarantor: { ...draft.guarantor, phone: event.target.value } })}
              />
            </Field>
            <Field label="کد ملی ضامن (اختیاری)" htmlFor={`${id}-g-nid`}>
              <Input
                id={`${id}-g-nid`}
                dir="ltr"
                inputMode="numeric"
                maxLength={10}
                className="font-display"
                value={draft.guarantor.nationalId}
                onChange={(event) =>
                  set({ guarantor: { ...draft.guarantor, nationalId: event.target.value } })
                }
              />
            </Field>
          </div>
        ) : null}
        <Field label="توضیحات قرارداد (اختیاری)" htmlFor={`${id}-note`} className="sm:col-span-2">
          <Input
            id={`${id}-note`}
            maxLength={1000}
            value={draft.note}
            onChange={(event) => set({ note: event.target.value })}
          />
        </Field>
      </fieldset>
    </div>
  );
}
