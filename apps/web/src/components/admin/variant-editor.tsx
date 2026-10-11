'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { toast } from 'sonner';
import {
  SHIPPING_TIMES,
  SHIPPING_TIME_LABELS,
  toLatinDigits,
  type AdminVariantDto,
  type ShippingTime,
} from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

/** «۱۸۹٬۹۰۰٬۰۰۰» or «189,900,000» → 189900000 (a Persian keyboard types Persian digits). */
function toAmount(value: string): number {
  return Number(toLatinDigits(value).replace(/[\s,٬]/g, ''));
}

export function VariantEditor({ variant }: { variant: AdminVariantDto }) {
  const router = useRouter();
  const [price, setPrice] = useState(variant.price > 0 ? String(variant.price) : '');
  const [compareAt, setCompareAt] = useState(variant.compareAtPrice ? String(variant.compareAtPrice) : '');
  const [shippingTime, setShippingTime] = useState<ShippingTime>(variant.shippingTime);
  const [active, setActive] = useState(variant.active);
  const [switchTouched, setSwitchTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  // a colour/capacity the catalogue added has no price and is hidden; typing
  // its first price turns «نمایش در فروشگاه» on, unless the switch was set by hand
  const unpriced = variant.price <= 0;
  const priced = toAmount(price) > 0;
  function changePrice(value: string) {
    setPrice(value);
    if (unpriced && !switchTouched) setActive(toAmount(value) > 0);
  }

  async function save() {
    setErrors({});
    setPending(true);
    try {
      await api.patch(`/admin/variants/${variant.id}`, {
        // an unpriced combination saved without a price keeps having none
        ...(priced || !unpriced ? { price: toAmount(price) } : {}),
        compareAtPrice: compareAt ? toAmount(compareAt) : null,
        shippingTime,
        // nothing goes on sale without a price
        isActive: active && priced,
      });
      toast.success('ترکیب به‌روز شد');
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
    <Dialog>
      <DialogTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label={`ویرایش ${variant.sku}`}>
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`ویرایش ${variant.sku}`}
        description={`${variant.storage.labelFa} · ${variant.color.name}`}
      >
        <div className="grid gap-4">
          <Field label="قیمت فروش (تومان)" error={errors.price} htmlFor={`price-${variant.id}`}>
            <Input
              id={`price-${variant.id}`}
              inputMode="numeric"
              dir="ltr"
              className="font-display"
              value={price}
              placeholder={unpriced ? 'قیمت به تومان' : undefined}
              onChange={(event) => changePrice(event.target.value)}
            />
          </Field>
          <Field
            label="قیمت قبل از تخفیف (اختیاری)"
            error={errors.compareAtPrice}
            htmlFor={`compare-${variant.id}`}
            hint="برای حذف تخفیف، خالی بگذار."
          >
            <Input
              id={`compare-${variant.id}`}
              inputMode="numeric"
              dir="ltr"
              className="font-display"
              value={compareAt}
              onChange={(event) => setCompareAt(event.target.value)}
            />
          </Field>
          <Field label="زمان ارسال" error={errors.shippingTime}>
            <Select value={shippingTime} onValueChange={(value) => setShippingTime(value as ShippingTime)}>
              <SelectTrigger aria-label="زمان ارسال">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SHIPPING_TIMES.map((time) => (
                  <SelectItem key={time} value={time}>
                    {SHIPPING_TIME_LABELS[time]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <label className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3">
            <span className="text-[13px] text-ink">نمایش در فروشگاه</span>
            <Switch
              checked={active && priced}
              disabled={!priced}
              onCheckedChange={(checked) => {
                setSwitchTouched(true);
                setActive(checked);
              }}
            />
          </label>
          {unpriced ? (
            <p className="-mt-2 rounded-2xl bg-warning-soft px-3 py-2.5 text-[12px] leading-6 text-warning">
              این ترکیب هنوز قیمت ندارد و در سایت دیده نمی‌شود. با وارد کردن قیمت فروش، نمایشش در فروشگاه روشن
              می‌شود.
            </p>
          ) : !priced ? (
            <p className="-mt-2 text-[12px] leading-6 text-danger">
              بدون قیمت، این ترکیب در سایت نمایش داده نمی‌شود.
            </p>
          ) : null}

          <Button size="md" loading={pending} onClick={save}>
            ذخیره تغییرات
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
