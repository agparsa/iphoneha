'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { AdminColorDto } from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

/** Creates or edits a colour of the catalogue (shared by every product). */
export function ColorDialog({ color }: { color?: AdminColorDto }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: color?.code ?? '',
    name: color?.name ?? '',
    nameEn: color?.nameEn ?? '',
    hex: color?.hex ?? '#1c1c1e',
    finish: color?.finish ?? '',
    aliases: (color?.aliases ?? []).join('، '),
    sortOrder: String(color?.sortOrder ?? 0),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const set = (key: keyof typeof form) => (value: string) => setForm((state) => ({ ...state, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setPending(true);
    const payload = {
      code: form.code.trim().toLowerCase(),
      name: form.name,
      nameEn: form.nameEn,
      hex: form.hex,
      finish: form.finish || null,
      aliases: form.aliases
        .split(/[،,]/)
        .map((item) => item.trim())
        .filter(Boolean),
      sortOrder: Number(form.sortOrder || 0),
    };
    try {
      if (color) await api.patch(`/admin/colors/${color.id}`, payload);
      else await api.post('/admin/colors', payload);
      toast.success('رنگ ذخیره شد');
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
        {color ? (
          <Button size="icon-sm" variant="ghost" aria-label={`ویرایش ${color.name}`}>
            <Pencil />
          </Button>
        ) : (
          <Button size="sm" variant="outline">
            <Plus className="size-4" aria-hidden />
            رنگ جدید
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={color ? `ویرایش ${color.name}` : 'رنگ جدید'}>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="نام فارسی" error={errors.name} htmlFor="color-name">
              <Input id="color-name" value={form.name} onChange={(e) => set('name')(e.target.value)} />
            </Field>
            <Field label="نام انگلیسی" error={errors.nameEn} htmlFor="color-name-en">
              <Input
                id="color-name-en"
                dir="ltr"
                className="font-display"
                value={form.nameEn}
                onChange={(e) => set('nameEn')(e.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="کد" error={errors.code} htmlFor="color-code" hint="مثلاً cosmic-orange">
              <Input
                id="color-code"
                dir="ltr"
                className="font-display"
                value={form.code}
                disabled={Boolean(color)}
                onChange={(e) => set('code')(e.target.value)}
              />
            </Field>
            <Field label="کد رنگ" error={errors.hex} htmlFor="color-hex">
              <div className="flex items-center gap-2">
                <Input
                  id="color-hex"
                  dir="ltr"
                  className="font-display"
                  value={form.hex}
                  onChange={(e) => set('hex')(e.target.value)}
                />
                <span
                  className="size-11 shrink-0 rounded-2xl border border-line"
                  style={{ backgroundColor: /^#[0-9a-fA-F]{6}$/.test(form.hex) ? form.hex : undefined }}
                  aria-hidden
                />
              </div>
            </Field>
          </div>

          <Field label="جنس/پرداخت (اختیاری)" error={errors.finish} htmlFor="color-finish">
            <Input id="color-finish" value={form.finish} onChange={(e) => set('finish')(e.target.value)} />
          </Field>

          <Field
            label="نام‌های دیگر برای جست‌وجو"
            error={errors.aliases}
            htmlFor="color-aliases"
            hint="با کاما جدا کن؛ مثلاً: نارنجی، اورنج، orange"
          >
            <Input id="color-aliases" value={form.aliases} onChange={(e) => set('aliases')(e.target.value)} />
          </Field>

          <Field label="ترتیب نمایش" error={errors.sortOrder} htmlFor="color-sort">
            <Input
              id="color-sort"
              inputMode="numeric"
              dir="ltr"
              className="font-display"
              value={form.sortOrder}
              onChange={(e) => set('sortOrder')(e.target.value)}
            />
          </Field>

          <Button type="submit" size="md" loading={pending}>
            ذخیره رنگ
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
