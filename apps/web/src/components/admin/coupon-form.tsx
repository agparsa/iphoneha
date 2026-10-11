'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { CouponDto, DiscountDto } from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

export function CouponForm({ discounts, coupon }: { discounts: DiscountDto[]; coupon?: CouponDto }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(coupon?.code ?? '');
  const [discountId, setDiscountId] = useState(coupon?.discountId ?? discounts[0]?.id ?? '');
  const [usageLimit, setUsageLimit] = useState(coupon?.usageLimit ? String(coupon.usageLimit) : '');
  const [perUserLimit, setPerUserLimit] = useState(String(coupon?.perUserLimit ?? 1));
  const [isActive, setIsActive] = useState(coupon?.isActive ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setPending(true);
    const payload = {
      code: code.toUpperCase(),
      discountId,
      usageLimit: usageLimit ? Number(usageLimit) : null,
      perUserLimit: Number(perUserLimit),
      isActive,
    };
    try {
      if (coupon) await api.patch(`/admin/coupons/${coupon.id}`, payload);
      else await api.post('/admin/coupons', payload);
      toast.success(coupon ? 'کد تخفیف ذخیره شد' : 'کد تخفیف ساخته شد');
      setOpen(false);
      if (!coupon) setCode('');
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
        {coupon ? (
          <Button size="icon-sm" variant="ghost" aria-label={`ویرایش ${coupon.code}`}>
            <Pencil />
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled={discounts.length === 0}>
            <Plus className="size-4" aria-hidden />
            کد جدید
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={coupon ? `ویرایش ${coupon.code}` : 'کد تخفیف جدید'}>
        <form onSubmit={submit} className="grid gap-4">
          <Field label="کد" error={errors.code} htmlFor="coupon-code" hint="فقط حروف انگلیسی و عدد">
            <Input
              id="coupon-code"
              dir="ltr"
              className="font-display uppercase"
              value={code}
              disabled={Boolean(coupon)}
              onChange={(event) => setCode(event.target.value)}
            />
          </Field>
          <Field label="تخفیف مرتبط" error={errors.discountId}>
            <Select value={discountId} onValueChange={setDiscountId}>
              <SelectTrigger aria-label="تخفیف مرتبط">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {discounts.map((discount) => (
                  <SelectItem key={discount.id} value={discount.id}>
                    {discount.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="سقف کل استفاده (اختیاری)" error={errors.usageLimit} htmlFor="coupon-usage">
            <Input
              id="coupon-usage"
              inputMode="numeric"
              dir="ltr"
              className="font-display"
              value={usageLimit}
              onChange={(event) => setUsageLimit(event.target.value)}
            />
          </Field>
          <Field label="سقف استفاده هر کاربر" error={errors.perUserLimit} htmlFor="coupon-per-user">
            <Input
              id="coupon-per-user"
              inputMode="numeric"
              dir="ltr"
              className="font-display"
              value={perUserLimit}
              onChange={(event) => setPerUserLimit(event.target.value)}
            />
          </Field>

          <label className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3">
            <span className="text-[13px] text-ink">کد فعال است</span>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </label>

          <Button type="submit" size="md" loading={pending}>
            {coupon ? 'ذخیره کد' : 'ساخت کد'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
