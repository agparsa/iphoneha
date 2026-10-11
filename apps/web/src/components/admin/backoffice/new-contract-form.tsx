'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  CREDIT_METHOD_LABELS,
  digitsOnly,
  formatNumberFa,
  type ContractDetailDto,
  type CreditMethod,
  type CreditRequestDto,
  type CreditSettings,
} from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  ContractBuilder,
  contractPayload,
  contractProblems,
  emptyContract,
  type ContractDraft,
} from './contract-builder';
import { MoneyInput, formError } from './inputs';

/**
 * A contract on its own: a sale made before the panel had a ledger, or one
 * agreed with a customer who asked on the website («درخواست اقساط»), before
 * the phone goes out on an order.
 */
export function NewContractForm({
  request,
  credit,
}: {
  request: CreditRequestDto | null;
  credit: CreditSettings;
}) {
  const router = useRouter();
  const [method, setMethod] = useState<CreditMethod>(request?.method ?? 'CHEQUE');
  const [name, setName] = useState(request?.name ?? '');
  const [phone, setPhone] = useState(request?.phone ?? '');
  const [item, setItem] = useState(request?.productName ?? '');
  const [price, setPrice] = useState<number | null>(null);
  const [draft, setDraft] = useState<ContractDraft>(() => {
    const plan = (request?.method ?? 'CHEQUE') === 'CHEQUE' ? credit.cheque : credit.safte;
    return { ...emptyContract(plan, 0), months: request?.months ?? emptyContract(plan, 0).months };
  });
  const [notify, setNotify] = useState(true);
  const [problems, setProblems] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const plan = method === 'CHEQUE' ? credit.cheque : credit.safte;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const found: string[] = [];
    if (name.trim().length < 3) found.push('نام مشتری را بنویس');
    if (!/^09\d{9}$/.test(digitsOnly(phone))) found.push('موبایل مشتری را درست وارد کن');
    if (item.trim().length < 3) found.push('شرح کالا را بنویس');
    if (!price) found.push('قیمت نقدی کالا را وارد کن');
    found.push(...contractProblems(draft, price ?? 0, method));
    setProblems(found);
    if (found.length) return;
    setPending(true);
    try {
      const contract = await api.post<ContractDetailDto>('/admin/ledger/contracts', {
        method,
        creditRequestId: request?.id ?? null,
        customer: { name: name.trim(), phone: digitsOnly(phone) },
        itemDescription: item.trim(),
        cashPrice: price,
        ...contractPayload(draft, name.trim()),
        notifyCustomer: notify,
      });
      toast.success(`قرارداد شمارهٔ ${formatNumberFa(contract.number)} ثبت شد`);
      router.push(`/admin/installments/${contract.id}`);
      router.refresh();
    } catch (error) {
      toast.error(formError(error));
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid max-w-4xl gap-4">
      {request ? (
        <p className="rounded-2xl bg-info-soft px-4 py-3 text-[13px] text-info">
          از درخواست شمارهٔ {formatNumberFa(request.number)} ({request.methodLabel}
          {request.productName ? `، ${request.productName}` : ''}
          {request.months ? `، ${formatNumberFa(request.months)} قسط` : ''}). با ثبت قرارداد، درخواست «قرارداد
          بسته شد» می‌شود.
        </p>
      ) : null}
      <section className="grid min-w-0 gap-4 rounded-panel border border-line bg-canvas p-5">
        <h2 className="text-[15px] font-semibold text-ink">خریدار و کالا</h2>
        <div role="radiogroup" aria-label="نوع اقساط" className="flex flex-wrap gap-2">
          {(['CHEQUE', 'SAFTE'] as const).map((option) => (
            <label
              key={option}
              className={cn(
                'flex cursor-pointer items-center rounded-pill border px-4 py-2 text-[13px]',
                method === option
                  ? 'border-ink bg-ink text-white'
                  : 'border-line text-ink-muted hover:bg-surface',
              )}
            >
              <input
                type="radio"
                name="method"
                className="sr-only"
                checked={method === option}
                onChange={() => setMethod(option)}
              />
              {CREDIT_METHOD_LABELS[option]}
            </label>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="نام و نام خانوادگی" htmlFor="contract-name">
            <Input
              id="contract-name"
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label="موبایل" htmlFor="contract-phone">
            <Input
              id="contract-phone"
              dir="ltr"
              inputMode="tel"
              className="font-display"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </Field>
          <Field
            label="شرح کالا"
            htmlFor="contract-item"
            hint="مدل، حافظه و رنگ؛ مثلاً «آیفون ۱۷ پرو ۲۵۶ گیگ نقره‌ای»"
          >
            <Input
              id="contract-item"
              value={item}
              maxLength={300}
              onChange={(event) => setItem(event.target.value)}
            />
          </Field>
          <Field label="قیمت نقدی (تومان)" htmlFor="contract-price">
            <MoneyInput id="contract-price" value={price} onChange={setPrice} />
          </Field>
        </div>
      </section>
      <section className="grid min-w-0 gap-4 rounded-panel border border-line bg-canvas p-5">
        <h2 className="text-[15px] font-semibold text-ink">شرایط اقساط</h2>
        <ContractBuilder
          method={method}
          price={price ?? 0}
          customerName={name.trim()}
          plan={plan}
          draft={draft}
          onChange={setDraft}
        />
      </section>
      {problems.length ? (
        <ul className="grid gap-1 rounded-2xl bg-danger-soft px-4 py-3 text-[12px] text-danger" role="alert">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}
      <label className="flex items-center gap-2 text-[13px] text-ink">
        <input
          type="checkbox"
          className="size-4"
          checked={notify}
          onChange={(event) => setNotify(event.target.checked)}
        />
        پیامک «دفترچهٔ اقساط صادر شد» برای مشتری فرستاده شود (برای ثبت فروش‌های قدیمی بردار)
      </label>
      <Button type="submit" loading={pending} className="justify-self-start">
        ثبت قرارداد
      </Button>
    </form>
  );
}
