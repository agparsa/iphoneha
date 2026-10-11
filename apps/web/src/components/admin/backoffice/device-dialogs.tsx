'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Pencil, ScanBarcode } from 'lucide-react';
import {
  DEVICE_UNIT_STATUS_LABELS,
  digitsOnly,
  formatNumberFa,
  isValidImei,
  type DeviceReceiveResultDto,
  type DeviceUnitDto,
} from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { MoneyInput, useAction } from './inputs';
import { VariantPicker } from './variant-picker';

interface ParsedLine {
  line: number;
  imei: string;
  imei2: string | null;
  serialNumber: string | null;
  problem: string | null;
}

/**
 * One phone per line: its IMEI, then optionally the second IMEI and the
 * serial number, separated by a comma, a space or a tab — the way a barcode
 * scanner or a spreadsheet column pastes them.
 */
export function parseImeiLines(text: string): ParsedLine[] {
  const seen = new Set<string>();
  return text
    .split(/\r?\n/)
    .map((raw, index) => ({ raw: raw.trim(), line: index + 1 }))
    .filter(({ raw }) => raw)
    .map(({ raw, line }) => {
      const parts = raw.split(/[,\t;،\s]+/).filter(Boolean);
      const imei = digitsOnly(parts[0] ?? '');
      const second = parts[1] && /^[\d۰-۹]{15}$/.test(parts[1]) ? digitsOnly(parts[1]) : null;
      const serial = (second ? parts[2] : parts[1]) ?? null;
      let problem: string | null = null;
      if (!isValidImei(imei)) problem = 'IMEI باید ۱۵ رقم و معتبر باشد';
      else if (second && !isValidImei(second)) problem = 'IMEI دوم معتبر نیست';
      else if (seen.has(imei) || (second && seen.has(second))) problem = 'تکراری';
      seen.add(imei);
      if (second) seen.add(second);
      return { line, imei, imei2: second, serialNumber: serial ? serial.slice(0, 40) : null, problem };
    });
}

/** «ورود کالا با IMEI»: phones received from a supplier raise the stock of their colour and capacity. */
export function ReceiveDevicesDialog({ defaultVariantId = null }: { defaultVariantId?: string | null }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [variantId, setVariantId] = useState<string | null>(defaultVariantId);
  const [text, setText] = useState('');
  const [costPrice, setCostPrice] = useState<number | null>(null);
  const [supplier, setSupplier] = useState('');
  const [note, setNote] = useState('');
  const { pending, run } = useAction();
  const lines = useMemo(() => parseImeiLines(text), [text]);
  const problems = lines.filter((line) => line.problem);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!variantId || !lines.length || problems.length) return;
    const result = await run(
      'receive',
      () =>
        api.post<DeviceReceiveResultDto>('/admin/devices/receive', {
          variantId,
          units: lines.map(({ imei, imei2, serialNumber }) => ({ imei, imei2, serialNumber })),
          costPrice,
          supplier: supplier.trim() || null,
          note: note.trim() || null,
        }),
      (done) => `${formatNumberFa(done.created)} گوشی ثبت شد؛ موجودی این مدل: ${formatNumberFa(done.stock)}`,
    );
    if (result) {
      setText('');
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'pricing'] });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <ScanBarcode aria-hidden />
          ورود کالا با IMEI
        </Button>
      </DialogTrigger>
      <DialogContent
        title="ورود کالا با IMEI"
        description="هر خط یک گوشی: IMEI، و در صورت نیاز IMEI دوم و شماره سریال با فاصله یا ویرگول. موجودی همین مدل به همین تعداد بالا می‌رود."
        className="max-h-[90dvh] max-w-xl overflow-y-auto"
      >
        <form onSubmit={submit} className="grid gap-4">
          <Field label="مدل، حافظه و رنگ" htmlFor="receive-variant">
            <VariantPicker
              id="receive-variant"
              value={variantId}
              onChange={(row) => setVariantId(row?.variantId ?? null)}
            />
          </Field>
          <Field
            label="IMEIها"
            htmlFor="receive-imeis"
            hint={
              lines.length ? `${formatNumberFa(lines.length)} گوشی` : 'با بارکدخوان هم می‌شود: هر اسکن یک خط'
            }
          >
            <Textarea
              id="receive-imeis"
              dir="ltr"
              rows={6}
              className="font-display tabular"
              placeholder={'356789012345678\n356789012345686, 356789012345694, F2LXQ1ABCD'}
              value={text}
              onChange={(event) => setText(event.target.value)}
              aria-invalid={problems.length > 0 || undefined}
            />
          </Field>
          {problems.length ? (
            <ul
              className="grid gap-1 rounded-2xl bg-danger-soft px-4 py-3 text-[12px] text-danger"
              role="alert"
            >
              {problems.slice(0, 6).map((line) => (
                <li key={line.line}>
                  خط {formatNumberFa(line.line)}: {line.problem}{' '}
                  <span className="font-display" dir="ltr">
                    {line.imei}
                  </span>
                </li>
              ))}
              {problems.length > 6 ? <li>و {formatNumberFa(problems.length - 6)} خط دیگر</li> : null}
            </ul>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="قیمت خرید هر گوشی (تومان، اختیاری)"
              htmlFor="receive-cost"
              hint="برای سود ناخالص در گزارش فروش"
            >
              <MoneyInput id="receive-cost" value={costPrice} onChange={setCostPrice} />
            </Field>
            <Field label="تأمین‌کننده (اختیاری)" htmlFor="receive-supplier">
              <Input
                id="receive-supplier"
                value={supplier}
                maxLength={80}
                onChange={(event) => setSupplier(event.target.value)}
              />
            </Field>
          </div>
          <Field label="یادداشت (اختیاری)" htmlFor="receive-note">
            <Input
              id="receive-note"
              value={note}
              maxLength={300}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
          <Button
            type="submit"
            loading={pending === 'receive'}
            disabled={!variantId || !lines.length || problems.length > 0}
          >
            ثبت {lines.length ? formatNumberFa(lines.length) : ''} گوشی
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The condition, cost or note of a phone; its sale and return follow its order. */
export function DeviceActions({ device }: { device: DeviceUnitDto }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<'IN_STOCK' | 'RETURNED' | 'DEFECTIVE'>(
    device.status === 'SOLD' ? 'IN_STOCK' : device.status,
  );
  const [costPrice, setCostPrice] = useState<number | null>(device.costPrice);
  const [supplier, setSupplier] = useState(device.supplier ?? '');
  const [note, setNote] = useState(device.note ?? '');
  const { pending, run } = useAction();
  const sold = device.status === 'SOLD';

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const done = await run(
      'save',
      () =>
        api.patch(`/admin/devices/${device.id}`, {
          ...(sold ? {} : { status }),
          costPrice,
          supplier: supplier.trim() || null,
          note: note.trim() || null,
        }),
      'گوشی به‌روز شد',
    );
    if (done !== undefined) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label={`ویرایش گوشی ${device.imei}`}>
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`گوشی ${device.imei}`}
        description={`${device.productName} — ${device.variantTitle}`}
      >
        <form onSubmit={save} className="grid gap-4">
          {sold ? (
            <p className="rounded-2xl bg-surface px-4 py-3 text-[12px] text-muted">
              این گوشی روی سفارش {device.order?.orderNumber} فروخته شده؛ وضعیتش با لغو یا مرجوعی همان سفارش
              عوض می‌شود.
            </p>
          ) : (
            <fieldset>
              <legend className="mb-2 text-[13px] font-medium text-ink-muted">وضعیت</legend>
              <div className="flex flex-wrap gap-2">
                {(['IN_STOCK', 'RETURNED', 'DEFECTIVE'] as const).map((option) => (
                  <label
                    key={option}
                    className="flex cursor-pointer items-center gap-2 rounded-pill border border-line px-3 py-2 text-[12px] has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-white"
                  >
                    <input
                      type="radio"
                      name="device-status"
                      className="sr-only"
                      checked={status === option}
                      onChange={() => setStatus(option)}
                    />
                    {DEVICE_UNIT_STATUS_LABELS[option]}
                  </label>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted">
                «معیوب» از موجودی قابل فروش کم می‌شود و با برگشت به «در انبار» دوباره اضافه می‌شود.
              </p>
            </fieldset>
          )}
          <Field label="قیمت خرید (تومان)" htmlFor={`cost-${device.id}`}>
            <MoneyInput id={`cost-${device.id}`} value={costPrice} onChange={setCostPrice} />
          </Field>
          <Field label="تأمین‌کننده" htmlFor={`supplier-${device.id}`}>
            <Input
              id={`supplier-${device.id}`}
              value={supplier}
              maxLength={80}
              onChange={(event) => setSupplier(event.target.value)}
            />
          </Field>
          <Field label="یادداشت" htmlFor={`note-${device.id}`}>
            <Textarea
              id={`note-${device.id}`}
              rows={2}
              value={note}
              maxLength={300}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
          <Button type="submit" loading={pending === 'save'}>
            ذخیره
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
