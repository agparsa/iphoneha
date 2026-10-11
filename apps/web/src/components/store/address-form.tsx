'use client';

import { useState } from 'react';
import { IRAN_PROVINCES, toLatinDigits, type AddressDto } from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input, Textarea } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface AddressFormValues {
  title: string;
  recipientName: string;
  mobile: string;
  province: string;
  city: string;
  addressLine: string;
  postalCode: string;
  plaque: string;
  unit: string;
  notes: string;
}

const EMPTY: AddressFormValues = {
  title: '',
  recipientName: '',
  mobile: '',
  province: '',
  city: '',
  addressLine: '',
  postalCode: '',
  plaque: '',
  unit: '',
  notes: '',
};

export function AddressForm({
  address,
  onSaved,
  onCancel,
  submitLabel = 'ذخیره آدرس',
}: {
  address?: AddressDto;
  onSaved: (address: AddressDto) => void;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const [values, setValues] = useState<AddressFormValues>(
    address
      ? {
          title: address.title ?? '',
          recipientName: address.recipientName,
          mobile: address.mobile,
          province: address.province,
          city: address.city,
          addressLine: address.addressLine,
          postalCode: address.postalCode,
          plaque: address.plaque ?? '',
          unit: address.unit ?? '',
          notes: address.notes ?? '',
        }
      : EMPTY,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const set = (key: keyof AddressFormValues) => (value: string) => setValues((v) => ({ ...v, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setPending(true);
    const payload = {
      title: values.title || null,
      recipientName: values.recipientName,
      mobile: toLatinDigits(values.mobile),
      province: values.province,
      city: values.city,
      addressLine: values.addressLine,
      postalCode: toLatinDigits(values.postalCode),
      plaque: values.plaque || null,
      unit: values.unit || null,
      notes: values.notes || null,
    };
    try {
      const saved = address
        ? await api.patch<AddressDto>(`/users/me/addresses/${address.id}`, payload)
        : await api.post<AddressDto>('/users/me/addresses', payload);
      onSaved(saved);
    } catch (cause) {
      if (cause instanceof ApiError && Object.keys(cause.fieldErrors).length > 0)
        setErrors(cause.fieldErrors);
      else setErrors({ _: errorMessage(cause) });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="نام و نام خانوادگی گیرنده" error={errors.recipientName} htmlFor="recipientName">
          <Input
            id="recipientName"
            autoComplete="name"
            value={values.recipientName}
            onChange={(event) => set('recipientName')(event.target.value)}
          />
        </Field>
        <Field label="شماره موبایل گیرنده" error={errors.mobile} htmlFor="mobile">
          <Input
            id="mobile"
            type="tel"
            inputMode="numeric"
            dir="ltr"
            autoComplete="tel"
            placeholder="0912 345 6789"
            className="font-display"
            value={values.mobile}
            onChange={(event) => set('mobile')(event.target.value)}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="استان" error={errors.province}>
          <Select value={values.province || undefined} onValueChange={set('province')}>
            <SelectTrigger aria-label="استان">
              <SelectValue placeholder="انتخاب استان" />
            </SelectTrigger>
            <SelectContent>
              {IRAN_PROVINCES.map((province) => (
                <SelectItem key={province} value={province}>
                  {province}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="شهر" error={errors.city} htmlFor="city">
          <Input id="city" value={values.city} onChange={(event) => set('city')(event.target.value)} />
        </Field>
      </div>

      <Field label="نشانی کامل" error={errors.addressLine} htmlFor="addressLine">
        <Textarea
          id="addressLine"
          rows={3}
          placeholder="خیابان، کوچه، ساختمان…"
          value={values.addressLine}
          onChange={(event) => set('addressLine')(event.target.value)}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="کد پستی" error={errors.postalCode} htmlFor="postalCode">
          <Input
            id="postalCode"
            inputMode="numeric"
            dir="ltr"
            maxLength={12}
            className="font-display"
            value={values.postalCode}
            onChange={(event) => set('postalCode')(event.target.value)}
          />
        </Field>
        <Field label="پلاک" error={errors.plaque} htmlFor="plaque">
          <Input id="plaque" value={values.plaque} onChange={(event) => set('plaque')(event.target.value)} />
        </Field>
        <Field label="واحد" error={errors.unit} htmlFor="unit">
          <Input id="unit" value={values.unit} onChange={(event) => set('unit')(event.target.value)} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="عنوان آدرس (اختیاری)" error={errors.title} htmlFor="title" hint="مثلاً خانه یا محل کار">
          <Input id="title" value={values.title} onChange={(event) => set('title')(event.target.value)} />
        </Field>
        <Field label="توضیح برای پیک (اختیاری)" error={errors.notes} htmlFor="notes">
          <Input id="notes" value={values.notes} onChange={(event) => set('notes')(event.target.value)} />
        </Field>
      </div>

      {errors._ ? <p className="text-[13px] text-danger">{errors._}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="md" loading={pending}>
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" size="md" variant="ghost" onClick={onCancel}>
            انصراف
          </Button>
        ) : null}
      </div>
    </form>
  );
}
