'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import type { AdminProductDetailDto, SpecDto } from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

export function ProductSettingsForm({ product }: { product: AdminProductDetailDto }) {
  const router = useRouter();
  const [name, setName] = useState(product.name);
  const [tagline, setTagline] = useState(product.tagline ?? '');
  const [description, setDescription] = useState(product.description);
  const [seoTitle, setSeoTitle] = useState(product.seoTitle ?? '');
  const [seoDescription, setSeoDescription] = useState(product.seoDescription ?? '');
  const [isActive, setIsActive] = useState(product.isActive);
  const [isFeatured, setIsFeatured] = useState(product.isFeatured);
  const [specs, setSpecs] = useState<SpecDto[]>(product.specs);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setPending(true);
    try {
      await api.patch(`/admin/products/${product.id}`, {
        name,
        tagline: tagline || null,
        description,
        seoTitle: seoTitle || null,
        seoDescription: seoDescription || null,
        isActive,
        isFeatured,
        // empty rows are dropped so a half-typed line never reaches the API
        specs: specs.filter((spec) => spec.key.trim() && spec.value.trim()),
      });
      toast.success('محصول ذخیره شد');
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
    <form onSubmit={submit} className="grid gap-4">
      <Field label="نام محصول" error={errors.name} htmlFor="p-name">
        <Input id="p-name" value={name} onChange={(event) => setName(event.target.value)} />
      </Field>
      <Field label="شعار" error={errors.tagline} htmlFor="p-tagline">
        <Input id="p-tagline" value={tagline} onChange={(event) => setTagline(event.target.value)} />
      </Field>
      <Field label="توضیحات" error={errors.description} htmlFor="p-description">
        <Textarea
          id="p-description"
          rows={5}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>
      <Field label="عنوان سئو" error={errors.seoTitle} htmlFor="p-seo-title">
        <Input id="p-seo-title" value={seoTitle} onChange={(event) => setSeoTitle(event.target.value)} />
      </Field>
      <Field label="توضیح سئو" error={errors.seoDescription} htmlFor="p-seo-description">
        <Textarea
          id="p-seo-description"
          rows={2}
          value={seoDescription}
          onChange={(event) => setSeoDescription(event.target.value)}
        />
      </Field>

      <section className="rounded-2xl border border-line p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[13px] font-medium text-ink">مشخصات فنی</p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setSpecs((list) => [...list, { key: '', value: '' }])}
          >
            <Plus className="size-4" aria-hidden />
            سطر جدید
          </Button>
        </div>

        {specs.length === 0 ? (
          <p className="text-[12px] text-muted">هنوز مشخصه‌ای ثبت نشده است.</p>
        ) : (
          <ul className="grid gap-2">
            {specs.map((spec, index) => (
              <li key={index} className="flex items-center gap-2">
                <Input
                  aria-label={`عنوان مشخصه ${index + 1}`}
                  placeholder="مثلاً نمایشگر"
                  className="h-10 w-36 shrink-0"
                  value={spec.key}
                  onChange={(event) =>
                    setSpecs((list) =>
                      list.map((item, i) => (i === index ? { ...item, key: event.target.value } : item)),
                    )
                  }
                />
                <Input
                  aria-label={`مقدار مشخصه ${index + 1}`}
                  placeholder="مثلاً ۶.۹ اینچ Super Retina XDR"
                  className="h-10 flex-1"
                  value={spec.value}
                  onChange={(event) =>
                    setSpecs((list) =>
                      list.map((item, i) => (i === index ? { ...item, value: event.target.value } : item)),
                    )
                  }
                />
                <button
                  type="button"
                  onClick={() => setSpecs((list) => list.filter((_, i) => i !== index))}
                  className="grid size-9 shrink-0 place-items-center rounded-full text-muted-faint transition-colors hover:bg-danger-soft hover:text-danger"
                  aria-label={`حذف مشخصه ${index + 1}`}
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <label className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3">
        <span className="text-[13px] text-ink">نمایش در فروشگاه</span>
        <Switch checked={isActive} onCheckedChange={setIsActive} />
      </label>
      <label className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3">
        <span className="text-[13px] text-ink">نمایش در بخش ویژه</span>
        <Switch checked={isFeatured} onCheckedChange={setIsFeatured} />
      </label>

      <Button type="submit" size="md" loading={pending}>
        ذخیره محصول
      </Button>
    </form>
  );
}
