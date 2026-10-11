'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { REGISTRY_STATUSES, REGISTRY_STATUS_LABELS, type RegistryStatus } from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Field } from '@/components/ui/label';
import { Input, Textarea } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

const THIS_YEAR = new Date().getFullYear();

/** Creates a product shell; colours/capacities are added as variants afterwards. */
export function ProductCreateDialog({ series }: { series: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    nameEn: '',
    slug: '',
    model: '',
    series: series[0] ?? '',
    releaseYear: String(THIS_YEAR),
    tagline: '',
    description: '',
    warranty: '۱۸ ماه گارانتی آیفونی‌ها',
    basePrice: '',
    registryStatus: 'REGISTERED' as RegistryStatus,
    isActive: true,
    isFeatured: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const set = (key: keyof typeof form) => (value: string) => setForm((state) => ({ ...state, [key]: value }));

  // «iPhone 17 Pro» → «iphone-17-pro»
  function slugFromEnglish(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setPending(true);
    try {
      const created = await api.post<{ id: string }>('/admin/products', {
        ...form,
        slug: form.slug || slugFromEnglish(form.nameEn),
        model: form.model || form.nameEn,
        releaseYear: Number(form.releaseYear),
        basePrice: Number(form.basePrice || 0),
        tagline: form.tagline || null,
        specs: [],
        sortOrder: 0,
      });
      toast.success('محصول ساخته شد — حالا ترکیب‌های رنگ و حافظه را اضافه کن');
      setOpen(false);
      router.push(`/admin/products/${created.id}`);
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
        <Button size="md">
          <Plus className="size-4" aria-hidden />
          محصول جدید
        </Button>
      </DialogTrigger>
      <DialogContent title="محصول جدید" className="max-h-[85dvh] max-w-lg overflow-y-auto">
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="نام فارسی" error={errors.name} htmlFor="np-name">
              <Input id="np-name" value={form.name} onChange={(e) => set('name')(e.target.value)} />
            </Field>
            <Field label="نام انگلیسی" error={errors.nameEn} htmlFor="np-name-en">
              <Input
                id="np-name-en"
                dir="ltr"
                className="font-display"
                value={form.nameEn}
                onChange={(e) => {
                  set('nameEn')(e.target.value);
                  if (!form.slug) setForm((s) => ({ ...s, slug: slugFromEnglish(e.target.value) }));
                }}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="slug" error={errors.slug} htmlFor="np-slug" hint="در آدرس صفحه استفاده می‌شود">
              <Input
                id="np-slug"
                dir="ltr"
                className="font-display"
                value={form.slug}
                onChange={(e) => set('slug')(e.target.value)}
              />
            </Field>
            <Field label="سری" error={errors.series}>
              <Select value={form.series || undefined} onValueChange={set('series')}>
                <SelectTrigger aria-label="سری">
                  <SelectValue placeholder="انتخاب سری" />
                </SelectTrigger>
                <SelectContent>
                  {series.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="سال عرضه" error={errors.releaseYear} htmlFor="np-year">
              <Input
                id="np-year"
                inputMode="numeric"
                dir="ltr"
                className="font-display"
                value={form.releaseYear}
                onChange={(e) => set('releaseYear')(e.target.value)}
              />
            </Field>
            <Field label="قیمت پایه (تومان)" error={errors.basePrice} htmlFor="np-price">
              <Input
                id="np-price"
                inputMode="numeric"
                dir="ltr"
                className="font-display"
                value={form.basePrice}
                onChange={(e) => set('basePrice')(e.target.value)}
              />
            </Field>
          </div>

          <Field label="شعار (اختیاری)" error={errors.tagline} htmlFor="np-tagline">
            <Input id="np-tagline" value={form.tagline} onChange={(e) => set('tagline')(e.target.value)} />
          </Field>

          <Field label="توضیحات" error={errors.description} htmlFor="np-description">
            <Textarea
              id="np-description"
              rows={4}
              value={form.description}
              onChange={(e) => set('description')(e.target.value)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="گارانتی" error={errors.warranty} htmlFor="np-warranty">
              <Input
                id="np-warranty"
                value={form.warranty}
                onChange={(e) => set('warranty')(e.target.value)}
              />
            </Field>
            <Field label="وضعیت رجیستری" error={errors.registryStatus}>
              <Select
                value={form.registryStatus}
                onValueChange={(value) => setForm((s) => ({ ...s, registryStatus: value as RegistryStatus }))}
              >
                <SelectTrigger aria-label="وضعیت رجیستری">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REGISTRY_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {REGISTRY_STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3">
              <span className="text-[13px] text-ink">نمایش در فروشگاه</span>
              <Switch
                checked={form.isActive}
                onCheckedChange={(checked) => setForm((s) => ({ ...s, isActive: checked }))}
              />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3">
              <span className="text-[13px] text-ink">محصول ویژه</span>
              <Switch
                checked={form.isFeatured}
                onCheckedChange={(checked) => setForm((s) => ({ ...s, isFeatured: checked }))}
              />
            </label>
          </div>

          <Button type="submit" size="md" loading={pending}>
            ساخت محصول
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
