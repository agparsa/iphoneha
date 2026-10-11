'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { DISCOUNT_TYPES, DISCOUNT_TYPE_LABELS, type DiscountDto, type DiscountType } from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

export function DiscountForm({ discount }: { discount?: DiscountDto } = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(discount?.name ?? '');
  const [type, setType] = useState<DiscountType>(discount?.type ?? 'PERCENT');
  const [value, setValue] = useState(String(discount?.value ?? 10));
  const [maxDiscount, setMaxDiscount] = useState(discount?.maxDiscount ? String(discount.maxDiscount) : '');
  const [minOrderAmount, setMinOrderAmount] = useState(
    discount?.minOrderAmount ? String(discount.minOrderAmount) : '',
  );
  const [isActive, setIsActive] = useState(discount?.isActive ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setPending(true);
    const payload = {
      name,
      type,
      value: Number(value),
      maxDiscount: maxDiscount ? Number(maxDiscount) : null,
      minOrderAmount: minOrderAmount ? Number(minOrderAmount) : null,
      isActive,
    };
    try {
      if (discount) await api.patch(`/admin/discounts/${discount.id}`, payload);
      else await api.post('/admin/discounts', payload);
      toast.success(discount ? 'تخفیف ذخیره شد' : 'تخفیف ساخته شد');
      setOpen(false);
      if (!discount) setName('');
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
        {discount ? (
          <Button size="icon-sm" variant="ghost" aria-label={`ویرایش ${discount.name}`}>
            <Pencil />
          </Button>
        ) : (
          <Button size="md">
            <Plus className="size-4" aria-hidden />
            تخفیف جدید
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        title={discount ? `ویرایش ${discount.name}` : 'تخفیف جدید'}
        className="max-h-[85dvh] overflow-y-auto"
      >
        <form onSubmit={submit} className="grid gap-4">
          <Field label="نام تخفیف" error={errors.name} htmlFor="discount-name">
            <Input id="discount-name" value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="نوع" error={errors.type}>
            <Select value={type} onValueChange={(v) => setType(v as DiscountType)}>
              <SelectTrigger aria-label="نوع تخفیف">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DISCOUNT_TYPES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {DISCOUNT_TYPE_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label={type === 'PERCENT' ? 'درصد تخفیف' : 'مبلغ تخفیف (تومان)'}
            error={errors.value}
            htmlFor="discount-value"
          >
            <Input
              id="discount-value"
              inputMode="numeric"
              dir="ltr"
              className="font-display"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </Field>
          {type === 'PERCENT' ? (
            <Field label="سقف تخفیف (اختیاری)" error={errors.maxDiscount} htmlFor="discount-max">
              <Input
                id="discount-max"
                inputMode="numeric"
                dir="ltr"
                className="font-display"
                value={maxDiscount}
                onChange={(event) => setMaxDiscount(event.target.value)}
              />
            </Field>
          ) : null}
          <Field label="حداقل مبلغ سبد (اختیاری)" error={errors.minOrderAmount} htmlFor="discount-min">
            <Input
              id="discount-min"
              inputMode="numeric"
              dir="ltr"
              className="font-display"
              value={minOrderAmount}
              onChange={(event) => setMinOrderAmount(event.target.value)}
            />
          </Field>

          <label className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3">
            <span className="text-[13px] text-ink">تخفیف فعال است</span>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </label>

          <Button type="submit" size="md" loading={pending}>
            {discount ? 'ذخیره تخفیف' : 'ساخت تخفیف'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
