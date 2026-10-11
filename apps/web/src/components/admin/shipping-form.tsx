'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { IRAN_PROVINCES, type ShippingMethodAdminDto } from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

export function ShippingMethodForm({ method }: { method?: ShippingMethodAdminDto }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(method?.code ?? '');
  const [name, setName] = useState(method?.name ?? '');
  const [calculator, setCalculator] = useState(method?.calculator ?? 'flat');
  const [baseCost, setBaseCost] = useState(String(method?.baseCost ?? 0));
  const [freeThreshold, setFreeThreshold] = useState(
    method?.freeThreshold ? String(method.freeThreshold) : '',
  );
  const [etaLabel, setEtaLabel] = useState(method?.etaLabel ?? '');
  const [provinces, setProvinces] = useState<string[]>(method?.allowedProvinces ?? []);
  const [isActive, setIsActive] = useState(method?.isActive ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setPending(true);
    const payload = {
      code,
      name,
      calculator,
      baseCost: Number(baseCost),
      freeThreshold: freeThreshold ? Number(freeThreshold) : null,
      etaLabel,
      allowedProvinces: provinces,
      isActive,
      description: method?.description ?? null,
      sortOrder: method?.sortOrder ?? 0,
    };
    try {
      if (method) await api.patch(`/admin/shipping-methods/${method.id}`, payload);
      else await api.post('/admin/shipping-methods', payload);
      toast.success('روش ارسال ذخیره شد');
      setOpen(false);
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
        {method ? (
          <Button size="icon-sm" variant="ghost" aria-label={`ویرایش ${method.name}`}>
            <Pencil />
          </Button>
        ) : (
          <Button size="md">
            <Plus className="size-4" aria-hidden />
            روش ارسال جدید
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        title={method ? `ویرایش ${method.name}` : 'روش ارسال جدید'}
        className="max-h-[85dvh] overflow-y-auto"
      >
        <form onSubmit={submit} className="grid gap-4">
          <Field label="نام" error={errors.name} htmlFor="ship-name">
            <Input id="ship-name" value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="کد" error={errors.code} htmlFor="ship-code" hint="مثلاً tehran-courier">
            <Input
              id="ship-code"
              dir="ltr"
              className="font-display"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              disabled={Boolean(method)}
            />
          </Field>
          <Field label="نوع محاسبه" error={errors.calculator}>
            <Select value={calculator} onValueChange={setCalculator}>
              <SelectTrigger aria-label="نوع محاسبه">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="flat">هزینه ثابت</SelectItem>
                <SelectItem value="city_courier">پیک شهری</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="هزینه پایه (تومان)" error={errors.baseCost} htmlFor="ship-cost">
            <Input
              id="ship-cost"
              inputMode="numeric"
              dir="ltr"
              className="font-display"
              value={baseCost}
              onChange={(event) => setBaseCost(event.target.value)}
            />
          </Field>
          <Field label="ارسال رایگان از (اختیاری)" error={errors.freeThreshold} htmlFor="ship-free">
            <Input
              id="ship-free"
              inputMode="numeric"
              dir="ltr"
              className="font-display"
              value={freeThreshold}
              onChange={(event) => setFreeThreshold(event.target.value)}
            />
          </Field>
          <Field label="زمان تحویل" error={errors.etaLabel} htmlFor="ship-eta">
            <Input id="ship-eta" value={etaLabel} onChange={(event) => setEtaLabel(event.target.value)} />
          </Field>

          <div>
            <p className="mb-2 text-[13px] font-medium text-ink-muted">
              استان‌های مجاز <span className="text-[11px] text-muted">(خالی = همه استان‌ها)</span>
            </p>
            <div className="grid max-h-40 grid-cols-2 gap-2 overflow-y-auto rounded-2xl border border-line p-3">
              {IRAN_PROVINCES.map((province) => (
                <label key={province} className="flex items-center gap-2 text-[12px] text-ink-muted">
                  <Checkbox
                    checked={provinces.includes(province)}
                    onCheckedChange={(checked) =>
                      setProvinces((list) =>
                        checked ? [...list, province] : list.filter((item) => item !== province),
                      )
                    }
                  />
                  {province}
                </label>
              ))}
            </div>
          </div>

          <label className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3">
            <span className="text-[13px] text-ink">فعال</span>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </label>

          <Button type="submit" size="md" loading={pending}>
            ذخیره
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
