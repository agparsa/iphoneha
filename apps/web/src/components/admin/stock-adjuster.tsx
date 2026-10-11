'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Boxes } from 'lucide-react';
import { toast } from 'sonner';
import {
  INVENTORY_MOVEMENT_LABELS,
  formatNumberFa,
  type AdminVariantDto,
  type InventoryMovementDto,
} from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { formatDateTimeFa } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export function StockAdjuster({ variant }: { variant: AdminVariantDto }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'delta' | 'set'>('delta');
  const [value, setValue] = useState('1');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const { data: movements } = useQuery({
    queryKey: ['movements', variant.id],
    queryFn: () => api.get<InventoryMovementDto[]>(`/admin/inventory/${variant.id}/movements`),
    enabled: open,
  });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setPending(true);
    try {
      await api.post(`/admin/inventory/${variant.id}/adjust`, { mode, value: Number(value), reason });
      toast.success('موجودی به‌روز شد');
      setReason('');
      router.refresh();
    } catch (cause) {
      if (cause instanceof ApiError && Object.keys(cause.fieldErrors).length > 0)
        setErrors(cause.fieldErrors);
      else toast.error(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label={`تغییر موجودی ${variant.sku}`}>
          <Boxes />
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`موجودی ${variant.sku}`}
        description={`${variant.productName} — ${variant.storage.labelFa} · ${variant.color.name}`}
      >
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid grid-cols-2 gap-2">
            {(['delta', 'set'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMode(option)}
                className={cn(
                  'rounded-2xl border px-3 py-2.5 text-[13px] transition-colors',
                  mode === option
                    ? 'border-ink bg-surface-2 text-ink'
                    : 'border-line text-muted hover:bg-surface',
                )}
              >
                {option === 'delta' ? 'افزایش / کاهش' : 'تنظیم عدد دقیق'}
              </button>
            ))}
          </div>

          <Field
            label={mode === 'delta' ? 'مقدار تغییر (مثبت یا منفی)' : 'موجودی جدید'}
            error={errors.value}
            htmlFor={`value-${variant.id}`}
            hint={`موجودی فعلی: ${formatNumberFa(variant.stock)} — رزروشده: ${formatNumberFa(variant.reservedStock)}`}
          >
            <Input
              id={`value-${variant.id}`}
              inputMode="numeric"
              dir="ltr"
              className="font-display"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </Field>

          <Field label="دلیل تغییر" error={errors.reason} htmlFor={`reason-${variant.id}`}>
            <Input
              id={`reason-${variant.id}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="مثلاً: ورود کالای جدید"
            />
          </Field>

          <Button type="submit" size="md" loading={pending}>
            ثبت تغییر
          </Button>
        </form>

        {movements && movements.length > 0 ? (
          <div className="mt-5 border-t border-line pt-4">
            <p className="mb-2 text-[13px] font-medium text-ink">آخرین تغییرات</p>
            <ul className="grid max-h-48 gap-2 overflow-y-auto text-[12px]">
              {movements.slice(0, 10).map((movement) => (
                <li key={movement.id} className="flex items-start justify-between gap-3">
                  <span className="text-muted">
                    {INVENTORY_MOVEMENT_LABELS[movement.type]}
                    {movement.reason ? ` — ${movement.reason}` : ''}
                    <span className="block text-[11px] text-muted-faint">
                      {formatDateTimeFa(movement.createdAt)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'shrink-0 tabular',
                      movement.quantity >= 0 ? 'text-success' : 'text-danger',
                    )}
                  >
                    {movement.quantity >= 0 ? '+' : '−'}
                    {formatNumberFa(Math.abs(movement.quantity))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
