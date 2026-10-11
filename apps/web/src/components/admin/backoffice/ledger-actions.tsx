'use client';

import { useState } from 'react';
import { BellRing, Pencil, Plus, Wallet } from 'lucide-react';
import {
  CHEQUE_STATUS_LABELS,
  CONTRACT_STATUS_LABELS,
  MANUAL_PAYMENT_CHANNEL_LABELS,
  digitsOnly,
  formatNumberFa,
  formatToman,
  isValidSayadId,
  tehranToday,
  type ChequeAction,
  type ChequeDto,
  type ContractDetailDto,
  type ContractStatus,
  type InstallmentDto,
  type PromissoryNoteDto,
} from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { IRANIAN_BANKS } from './contract-builder';
import { JalaliDateInput, MoneyInput, useAction } from './inputs';

type Channel = 'CASH' | 'POS' | 'TRANSFER' | 'ONLINE';

const selectClass = 'h-12 w-full rounded-2xl border border-line bg-canvas px-3 text-sm';

/** A button that asks once before doing something that is hard to take back. */
export function ConfirmButton({
  label,
  title,
  description,
  confirmLabel = 'بله',
  onConfirm,
  success,
  variant = 'outline',
  size = 'sm',
  icon,
}: {
  label: string;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => Promise<unknown>;
  success: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size}>
          {icon}
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent title={title} description={description}>
        <div className="flex gap-2">
          <Button
            loading={pending === 'confirm'}
            onClick={async () => {
              const done = await run('confirm', onConfirm, success);
              if (done !== undefined) setOpen(false);
            }}
          >
            {confirmLabel}
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            انصراف
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** «ثبت پرداخت»: money received on a contract, for one instalment first and then the next ones. */
export function RecordPaymentDialog({
  contractId,
  installment,
  remaining,
  size = 'sm',
}: {
  contractId: string;
  installment?: Pick<InstallmentDto, 'id' | 'index' | 'remaining'>;
  /** what the whole contract still owes (when known) */
  remaining?: number;
  size?: ButtonProps['size'];
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number | null>(installment?.remaining ?? null);
  const [channel, setChannel] = useState<Channel>('CASH');
  const [reference, setReference] = useState('');
  const [paidAt, setPaidAt] = useState<string | null>(tehranToday());
  const [note, setNote] = useState('');
  const [notify, setNotify] = useState(true);
  const { pending, run } = useAction();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!amount) return;
    const done = await run(
      'pay',
      () =>
        api.post(`/admin/ledger/contracts/${contractId}/payments`, {
          installmentId: installment?.id ?? null,
          amount,
          channel,
          reference: reference.trim() || null,
          paidAt,
          note: note.trim() || null,
          notifyCustomer: notify,
        }),
      `پرداخت ${formatToman(amount)} ثبت شد`,
    );
    if (done !== undefined) setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setAmount(installment?.remaining ?? null);
      }}
    >
      <DialogTrigger asChild>
        <Button
          size={size}
          variant={installment ? 'outline' : 'primary'}
          aria-label={installment ? `ثبت پرداخت قسط ${installment.index}` : undefined}
        >
          <Wallet aria-hidden />
          {installment ? 'پرداخت' : 'ثبت پرداخت'}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={installment ? `پرداخت قسط ${formatNumberFa(installment.index)}` : 'ثبت پرداخت'}
        description={`${remaining !== undefined ? `باقی‌ماندهٔ قرارداد: ${formatToman(remaining)}. ` : ''}مبلغ بیشتر از قسط، به قسط‌های بعدی می‌رود.`}
      >
        <form onSubmit={submit} className="grid gap-4">
          <Field label="مبلغ (تومان)" htmlFor="pay-amount">
            <MoneyInput id="pay-amount" value={amount} onChange={setAmount} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="با" htmlFor="pay-channel">
              <select
                id="pay-channel"
                className={selectClass}
                value={channel}
                onChange={(event) => setChannel(event.target.value as Channel)}
              >
                {(['CASH', 'POS', 'TRANSFER', 'ONLINE'] as const).map((option) => (
                  <option key={option} value={option}>
                    {MANUAL_PAYMENT_CHANNEL_LABELS[option]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="تاریخ" htmlFor="pay-date">
              <JalaliDateInput id="pay-date" value={paidAt} onChange={setPaidAt} />
            </Field>
          </div>
          <Field label="شمارهٔ پیگیری (اختیاری)" htmlFor="pay-ref">
            <Input
              id="pay-ref"
              dir="ltr"
              className="font-display"
              maxLength={80}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
            />
          </Field>
          <Field label="یادداشت (اختیاری)" htmlFor="pay-note">
            <Input
              id="pay-note"
              maxLength={300}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <input
              type="checkbox"
              className="size-4"
              checked={notify}
              onChange={(event) => setNotify(event.target.checked)}
            />
            پیامک «پرداخت قسط ثبت شد» با باقی‌مانده برای مشتری فرستاده شود
          </label>
          <Button
            type="submit"
            loading={pending === 'pay'}
            disabled={!amount || (remaining !== undefined && amount > remaining)}
          >
            ثبت پرداخت
          </Button>
          {amount && remaining !== undefined && amount > remaining ? (
            <p className="text-[12px] text-danger">بیشتر از باقی‌ماندهٔ قرارداد است</p>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A due date moved, the amount changed, a note, or what is left forgiven. */
export function InstallmentEditDialog({ installment }: { installment: InstallmentDto }) {
  const [open, setOpen] = useState(false);
  const [dueDate, setDueDate] = useState<string | null>(installment.dueDate);
  const [amount, setAmount] = useState<number | null>(installment.amount);
  const [note, setNote] = useState(installment.note ?? '');
  const [waive, setWaive] = useState(false);
  const { pending, run } = useAction();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const done = await run(
      'edit',
      () =>
        api.patch(`/admin/ledger/installments/${installment.id}`, {
          ...(dueDate && dueDate !== installment.dueDate ? { dueDate } : {}),
          ...(amount && amount !== installment.amount ? { amount } : {}),
          note: note.trim() || null,
          ...(waive ? { waive: true } : {}),
        }),
      waive ? `باقی‌ماندهٔ قسط ${formatNumberFa(installment.index)} بخشیده شد` : 'قسط به‌روز شد',
    );
    if (done !== undefined) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label={`ویرایش قسط ${installment.index}`}>
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`قسط ${formatNumberFa(installment.index)}`}
        description="جمع قرارداد با تغییر مبلغ به‌روز می‌شود."
      >
        <form onSubmit={submit} className="grid gap-4">
          <Field label="سررسید" htmlFor={`due-${installment.id}`}>
            <JalaliDateInput
              id={`due-${installment.id}`}
              value={dueDate}
              onChange={setDueDate}
              todayButton={false}
            />
          </Field>
          <Field
            label="مبلغ (تومان)"
            htmlFor={`amount-${installment.id}`}
            hint={
              installment.paidAmount ? `تا حالا ${formatToman(installment.paidAmount)} پرداخت شده` : undefined
            }
          >
            <MoneyInput id={`amount-${installment.id}`} value={amount} onChange={setAmount} />
          </Field>
          <Field label="یادداشت" htmlFor={`note-${installment.id}`}>
            <Input
              id={`note-${installment.id}`}
              maxLength={300}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <input
              type="checkbox"
              className="size-4"
              checked={waive}
              onChange={(event) => setWaive(event.target.checked)}
            />
            باقی‌ماندهٔ این قسط ({formatToman(installment.remaining)}) بخشیده شود
          </label>
          <Button type="submit" loading={pending === 'edit'} variant={waive ? 'danger' : 'primary'}>
            ذخیره
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** «یادآوری پیامکی» of one open instalment. */
export function RemindButton({
  installmentId,
  ready,
  remindedAt,
}: {
  installmentId: string;
  ready: boolean;
  remindedAt: string | null;
}) {
  const { pending, run } = useAction();
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label={ready ? 'ارسال پیامک یادآوری' : 'الگوی پیامک یادآوری روی سرور تنظیم نشده'}
      title={
        remindedAt
          ? `آخرین یادآوری: ${new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeZone: 'Asia/Tehran' }).format(new Date(remindedAt))}`
          : 'ارسال پیامک یادآوری'
      }
      disabled={!ready}
      loading={pending === 'remind'}
      onClick={() =>
        run(
          'remind',
          () => api.post(`/admin/ledger/installments/${installmentId}/remind`),
          'پیامک یادآوری فرستاده شد',
        )
      }
    >
      {pending === 'remind' ? null : <BellRing />}
    </Button>
  );
}

const ACTION_OPTIONS: Record<
  ChequeDto['status'],
  { action: ChequeAction; label: string; tone?: 'danger' }[]
> = {
  IN_HAND: [
    { action: 'DEPOSIT', label: 'خواباندن به حساب' },
    { action: 'CLEAR', label: 'وصول شد' },
    { action: 'BOUNCE', label: 'برگشت خورد', tone: 'danger' },
    { action: 'RETURN', label: 'عودت به مشتری' },
  ],
  DEPOSITED: [
    { action: 'CLEAR', label: 'وصول شد' },
    { action: 'BOUNCE', label: 'برگشت خورد', tone: 'danger' },
    { action: 'BACK_IN_HAND', label: 'برگشت از بانک به صندوق' },
  ],
  BOUNCED: [
    { action: 'DEPOSIT', label: 'خواباندن دوباره' },
    { action: 'RETURN', label: 'عودت به مشتری' },
  ],
  CLEARED: [],
  RETURNED: [],
};

/** A cheque's next step: in the bank, cleared (its money pays the instalment), bounced, back to the customer. */
export function ChequeActionDialog({ cheque }: { cheque: ChequeDto }) {
  const options = ACTION_OPTIONS[cheque.status];
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<ChequeAction | null>(null);
  const [date, setDate] = useState<string | null>(tehranToday());
  const [note, setNote] = useState('');
  const { pending, run } = useAction();
  if (!options.length && cheque.sayadConfirmed) return null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!action) return;
    const done = await run(
      'cheque',
      () =>
        api.post(`/admin/ledger/cheques/${cheque.id}/action`, { action, date, note: note.trim() || null }),
      action === 'CONFIRM_SAYAD' ? 'ثبت در صیاد تأیید شد' : 'وضعیت چک به‌روز شد',
    );
    if (done !== undefined) {
      setOpen(false);
      setAction(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" aria-label={`وضعیت چک ${cheque.sayadId}`}>
          وضعیت چک
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`چک ${cheque.bankName} — ${formatToman(cheque.amount)}`}
        description={`شناسهٔ صیادی ${cheque.sayadId} · وضعیت فعلی: ${CHEQUE_STATUS_LABELS[cheque.status]}`}
      >
        <form onSubmit={submit} className="grid gap-4">
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-[13px] font-medium text-ink-muted">چه شد؟</legend>
            {!cheque.sayadConfirmed ? (
              <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-line px-3 py-2 text-[13px] has-[:checked]:border-ink">
                <input
                  type="radio"
                  name="cheque-action"
                  checked={action === 'CONFIRM_SAYAD'}
                  onChange={() => setAction('CONFIRM_SAYAD')}
                />
                در سامانهٔ صیاد به نام فروشگاه تأیید شد
              </label>
            ) : null}
            {options.map((option) => (
              <label
                key={option.action}
                className={`flex cursor-pointer items-center gap-2 rounded-2xl border border-line px-3 py-2 text-[13px] has-[:checked]:border-ink ${option.tone === 'danger' ? 'text-danger' : ''}`}
              >
                <input
                  type="radio"
                  name="cheque-action"
                  checked={action === option.action}
                  onChange={() => setAction(option.action)}
                />
                {option.label}
              </label>
            ))}
          </fieldset>
          {action && action !== 'CONFIRM_SAYAD' ? (
            <Field label="تاریخ" htmlFor={`cheque-date-${cheque.id}`}>
              <JalaliDateInput id={`cheque-date-${cheque.id}`} value={date} onChange={setDate} />
            </Field>
          ) : null}
          {action === 'CLEAR' ? (
            <p className="rounded-2xl bg-success-soft px-4 py-3 text-[12px] text-success">
              مبلغ چک به‌عنوان پرداخت{' '}
              {cheque.installmentIndex ? `قسط ${formatNumberFa(cheque.installmentIndex)}` : 'قسط‌های باز'} ثبت
              می‌شود.
            </p>
          ) : null}
          <Field label="یادداشت (اختیاری)" htmlFor={`cheque-note-${cheque.id}`}>
            <Input
              id={`cheque-note-${cheque.id}`}
              maxLength={300}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
          <Button type="submit" loading={pending === 'cheque'} disabled={!action}>
            ثبت
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A cheque received later: a replacement for a bounced one, or one missing at signing. */
export function AddChequeDialog({ contract }: { contract: ContractDetailDto }) {
  const open_ = contract.installments.filter((row) => row.status === 'PENDING');
  const [open, setOpen] = useState(false);
  const [installmentId, setInstallmentId] = useState<string>('');
  const [sayadId, setSayadId] = useState('');
  const [bankName, setBankName] = useState('');
  const [serial, setSerial] = useState('');
  const [drawerName, setDrawerName] = useState(contract.customerName);
  const [amount, setAmount] = useState<number | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [sayadConfirmed, setSayadConfirmed] = useState(false);
  const { pending, run } = useAction();
  const sayad = digitsOnly(sayadId);

  function pickInstallment(id: string) {
    setInstallmentId(id);
    const row = open_.find((item) => item.id === id);
    if (row) {
      setAmount(row.remaining);
      setDueDate(row.dueDate);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const done = await run(
      'add',
      () =>
        api.post(`/admin/ledger/contracts/${contract.id}/cheques`, {
          installmentId: installmentId || null,
          sayadId: sayad,
          serial: serial.trim() || null,
          bankName: bankName.trim(),
          drawerName: drawerName.trim(),
          amount,
          dueDate,
          sayadConfirmed,
        }),
      'چک ثبت شد',
    );
    if (done !== undefined) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus aria-hidden />
          چک تازه
        </Button>
      </DialogTrigger>
      <DialogContent
        title="ثبت چک"
        description="جایگزین چک برگشتی، یا چکی که هنگام قرارداد نبود."
        className="max-h-[90dvh] overflow-y-auto"
      >
        <form onSubmit={submit} className="grid gap-4">
          <Field label="برای" htmlFor="cheque-installment">
            <select
              id="cheque-installment"
              className={selectClass}
              value={installmentId}
              onChange={(event) => pickInstallment(event.target.value)}
            >
              <option value="">ضمانت کل قرارداد</option>
              {open_.map((row) => (
                <option key={row.id} value={row.id}>
                  قسط {formatNumberFa(row.index)} — {formatToman(row.remaining)}
                  {row.cheque && !['BOUNCED', 'RETURNED'].includes(row.cheque.status) ? ' (چک دارد)' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="شناسهٔ صیادی (۱۶ رقم)"
            htmlFor="cheque-sayad"
            error={sayad && !isValidSayadId(sayad) ? 'باید ۱۶ رقم باشد' : undefined}
          >
            <Input
              id="cheque-sayad"
              dir="ltr"
              inputMode="numeric"
              className="font-display"
              value={sayadId}
              onChange={(event) => setSayadId(event.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="بانک" htmlFor="cheque-bank">
              <Input
                id="cheque-bank"
                list="cheque-banks"
                value={bankName}
                onChange={(event) => setBankName(event.target.value)}
              />
              <datalist id="cheque-banks">
                {IRANIAN_BANKS.map((bank) => (
                  <option key={bank} value={bank} />
                ))}
              </datalist>
            </Field>
            <Field label="سریال (اختیاری)" htmlFor="cheque-serial">
              <Input
                id="cheque-serial"
                dir="ltr"
                className="font-display"
                value={serial}
                onChange={(event) => setSerial(event.target.value)}
              />
            </Field>
            <Field label="صاحب حساب" htmlFor="cheque-drawer">
              <Input
                id="cheque-drawer"
                value={drawerName}
                onChange={(event) => setDrawerName(event.target.value)}
              />
            </Field>
            <Field label="مبلغ" htmlFor="cheque-amount">
              <MoneyInput id="cheque-amount" value={amount} onChange={setAmount} />
            </Field>
          </div>
          <Field label="سررسید" htmlFor="cheque-due">
            <JalaliDateInput id="cheque-due" value={dueDate} onChange={setDueDate} todayButton={false} />
          </Field>
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <input
              type="checkbox"
              className="size-4"
              checked={sayadConfirmed}
              onChange={(event) => setSayadConfirmed(event.target.checked)}
            />
            در سامانهٔ صیاد به نام فروشگاه تأیید شد
          </label>
          <Button
            type="submit"
            loading={pending === 'add'}
            disabled={
              !isValidSayadId(sayad) ||
              !bankName.trim() ||
              !amount ||
              !dueDate ||
              drawerName.trim().length < 3
            }
          >
            ثبت چک
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AddSafteDialog({ contractId, suggested }: { contractId: string; suggested: number }) {
  const [open, setOpen] = useState(false);
  const [serial, setSerial] = useState('');
  const [amount, setAmount] = useState<number | null>(suggested || null);
  const [electronic, setElectronic] = useState(false);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const { pending, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus aria-hidden />
          سفتهٔ تازه
        </Button>
      </DialogTrigger>
      <DialogContent title="ثبت سفته">
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const done = await run(
              'safte',
              () =>
                api.post(`/admin/ledger/contracts/${contractId}/saftes`, {
                  serial: serial.trim(),
                  amount,
                  electronic,
                  dueDate,
                }),
              'سفته ثبت شد',
            );
            if (done !== undefined) setOpen(false);
          }}
          className="grid gap-4"
        >
          <Field label="شمارهٔ سفته" htmlFor="safte-serial">
            <Input
              id="safte-serial"
              dir="ltr"
              className="font-display"
              value={serial}
              onChange={(event) => setSerial(event.target.value)}
            />
          </Field>
          <Field label="مبلغ" htmlFor="safte-amount">
            <MoneyInput id="safte-amount" value={amount} onChange={setAmount} />
          </Field>
          <Field label="سررسید (اختیاری)" htmlFor="safte-due">
            <JalaliDateInput
              id="safte-due"
              value={dueDate}
              onChange={setDueDate}
              allowEmpty
              todayButton={false}
            />
          </Field>
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <input
              type="checkbox"
              className="size-4"
              checked={electronic}
              onChange={(event) => setElectronic(event.target.checked)}
            />
            سفتهٔ الکترونیکی
          </label>
          <Button type="submit" loading={pending === 'safte'} disabled={serial.trim().length < 3 || !amount}>
            ثبت سفته
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A promissory note given back, or taken to be claimed. */
export function SafteActions({ safte }: { safte: PromissoryNoteDto }) {
  const act = (action: 'HOLD' | 'RETURN' | 'CLAIM') => () =>
    api.post(`/admin/ledger/saftes/${safte.id}/action`, { action });
  if (safte.status === 'HELD') {
    return (
      <div className="flex flex-wrap gap-1.5">
        <ConfirmButton
          label="عودت"
          title="عودت سفته"
          description="سفته به مشتری پس داده شد؟ (معمولاً بعد از تسویهٔ کامل)"
          onConfirm={act('RETURN')}
          success="سفته عودت داده شد"
        />
        <ConfirmButton
          label="اجرا"
          variant="ghost"
          title="اجرای سفته"
          description="سفته برای وصول به اجرا گذاشته شد؟"
          onConfirm={act('CLAIM')}
          success="وضعیت سفته «به اجرا گذاشته شده» شد"
        />
      </div>
    );
  }
  return (
    <ConfirmButton
      label="بازگشت به نزد فروشگاه"
      variant="ghost"
      title="سفته دوباره نزد فروشگاه"
      description="این سفته دوباره نزد فروشگاه نگه‌داری می‌شود؟"
      onConfirm={act('HOLD')}
      success="سفته نزد فروشگاه ثبت شد"
    />
  );
}

/** Late payer, back to normal, or the sale undone. */
export function ContractStatusDialog({ contract }: { contract: ContractDetailDto }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<'ACTIVE' | 'DEFAULTED' | 'CANCELLED' | ''>('');
  const [reason, setReason] = useState('');
  const { pending, run } = useAction();
  if (contract.status === 'COMPLETED' || contract.status === 'CANCELLED') return null;
  const targets = (['ACTIVE', 'DEFAULTED', 'CANCELLED'] as const).filter(
    (target) => target !== contract.status,
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          تغییر وضعیت
        </Button>
      </DialogTrigger>
      <DialogContent
        title="وضعیت قرارداد"
        description={`وضعیت فعلی: ${CONTRACT_STATUS_LABELS[contract.status as ContractStatus]}`}
      >
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (!status) return;
            const done = await run(
              'status',
              () =>
                api.post(`/admin/ledger/contracts/${contract.id}/status`, {
                  status,
                  reason: reason.trim() || null,
                }),
              'وضعیت قرارداد به‌روز شد',
            );
            if (done !== undefined) setOpen(false);
          }}
          className="grid gap-4"
        >
          <fieldset className="grid gap-2">
            <legend className="sr-only">وضعیت تازه</legend>
            {targets.map((target) => (
              <label
                key={target}
                className="flex cursor-pointer items-center gap-2 rounded-2xl border border-line px-3 py-2 text-[13px] has-[:checked]:border-ink"
              >
                <input
                  type="radio"
                  name="contract-status"
                  checked={status === target}
                  onChange={() => setStatus(target)}
                />
                {CONTRACT_STATUS_LABELS[target]}
                <span className="text-[11px] text-muted">
                  {target === 'DEFAULTED'
                    ? '— مشتری بدحساب شده؛ پیگیری ادامه دارد'
                    : target === 'CANCELLED'
                      ? '— فروش برگشت خورد؛ دیگر وصول نمی‌شود'
                      : ''}
                </span>
              </label>
            ))}
          </fieldset>
          <Field label={status === 'CANCELLED' ? 'دلیل لغو' : 'توضیح (اختیاری)'} htmlFor="contract-reason">
            <Textarea
              id="contract-reason"
              rows={2}
              maxLength={300}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <Button
            type="submit"
            loading={pending === 'status'}
            disabled={!status || (status === 'CANCELLED' && reason.trim().length < 2)}
            variant={status === 'CANCELLED' ? 'danger' : 'primary'}
          >
            ثبت
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The parts of a contract that may be corrected after signing (not the money). */
export function ContractEditDialog({ contract }: { contract: ContractDetailDto }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    itemDescription: contract.itemDescription,
    nationalId: contract.nationalId ?? '',
    customerAddress: contract.customerAddress ?? '',
    guarantorName: contract.guarantorName ?? '',
    guarantorPhone: contract.guarantorPhone ?? '',
    guarantorNationalId: contract.guarantorNationalId ?? '',
    note: contract.note ?? '',
  });
  const { pending, run } = useAction();
  const field = (name: keyof typeof form, label: string, ltr = false) => (
    <Field label={label} htmlFor={`edit-${name}`}>
      <Input
        id={`edit-${name}`}
        dir={ltr ? 'ltr' : undefined}
        className={ltr ? 'font-display' : undefined}
        value={form[name]}
        onChange={(event) => setForm({ ...form, [name]: event.target.value })}
      />
    </Field>
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <Pencil aria-hidden />
          ویرایش مشخصات
        </Button>
      </DialogTrigger>
      <DialogContent
        title="مشخصات قرارداد"
        description="مبالغ و اقساط از جدول اقساط تغییر می‌کنند."
        className="max-h-[90dvh] overflow-y-auto"
      >
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const done = await run(
              'edit',
              () =>
                api.patch(`/admin/ledger/contracts/${contract.id}`, {
                  itemDescription: form.itemDescription.trim(),
                  nationalId: form.nationalId.trim() || null,
                  customerAddress: form.customerAddress.trim() || null,
                  guarantorName: form.guarantorName.trim() || null,
                  guarantorPhone: digitsOnly(form.guarantorPhone) || null,
                  guarantorNationalId: form.guarantorNationalId.trim() || null,
                  note: form.note.trim() || null,
                }),
              'مشخصات قرارداد ذخیره شد',
            );
            if (done !== undefined) setOpen(false);
          }}
          className="grid gap-4"
        >
          {field('itemDescription', 'شرح کالا')}
          <div className="grid gap-4 sm:grid-cols-2">
            {field('nationalId', 'کد ملی خریدار', true)}
            {field('customerAddress', 'نشانی خریدار')}
            {field('guarantorName', 'نام ضامن')}
            {field('guarantorPhone', 'موبایل ضامن', true)}
            {field('guarantorNationalId', 'کد ملی ضامن', true)}
          </div>
          {field('note', 'توضیحات')}
          <Button type="submit" loading={pending === 'edit'}>
            ذخیره
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A payment recorded by mistake; a cleared cheque's rows are voided together and the cheque goes back to «at the bank». */
export function VoidPaymentButton({ paymentId, cheque }: { paymentId: string; cheque: boolean }) {
  return (
    <ConfirmButton
      label="ابطال"
      variant="ghost"
      size="sm"
      title="ابطال پرداخت"
      description={
        cheque
          ? 'این پرداخت از وصول یک چک آمده؛ همهٔ ردیف‌های همان چک باطل و چک به «در بانک» برمی‌گردد.'
          : 'این پرداخت باطل و مبلغش از قسط‌ها برداشته می‌شود.'
      }
      confirmLabel="باطل شود"
      onConfirm={() => api.post(`/admin/ledger/payments/${paymentId}/void`)}
      success="پرداخت باطل شد"
    />
  );
}
