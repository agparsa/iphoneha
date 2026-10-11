'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { AdminStorageDto } from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

/** Creates or edits a storage capacity (shared by every product). */
export function StorageDialog({ storage }: { storage?: AdminStorageDto }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [capacityGb, setCapacityGb] = useState(String(storage?.capacityGb ?? ''));
  const [label, setLabel] = useState(storage?.label ?? '');
  const [labelFa, setLabelFa] = useState(storage?.labelFa ?? '');
  const [sortOrder, setSortOrder] = useState(String(storage?.sortOrder ?? 0));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setPending(true);
    const gb = Number(capacityGb);
    const payload = {
      capacityGb: gb,
      label: label || (gb >= 1024 ? `${gb / 1024}TB` : `${gb}GB`),
      labelFa: labelFa || (gb >= 1024 ? `${gb / 1024} ترابایت` : `${gb} گیگابایت`),
      sortOrder: Number(sortOrder || 0),
    };
    try {
      if (storage) await api.patch(`/admin/storages/${storage.id}`, payload);
      else await api.post('/admin/storages', payload);
      toast.success('ظرفیت ذخیره شد');
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
        {storage ? (
          <Button size="icon-sm" variant="ghost" aria-label={`ویرایش ${storage.labelFa}`}>
            <Pencil />
          </Button>
        ) : (
          <Button size="sm" variant="outline">
            <Plus className="size-4" aria-hidden />
            ظرفیت جدید
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={storage ? `ویرایش ${storage.labelFa}` : 'ظرفیت جدید'}>
        <form onSubmit={submit} className="grid gap-4">
          <Field
            label="ظرفیت (گیگابایت)"
            error={errors.capacityGb}
            htmlFor="storage-gb"
            hint="۱ ترابایت = ۱۰۲۴"
          >
            <Input
              id="storage-gb"
              inputMode="numeric"
              dir="ltr"
              className="font-display"
              value={capacityGb}
              onChange={(event) => setCapacityGb(event.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="برچسب انگلیسی" error={errors.label} htmlFor="storage-label" hint="خالی = خودکار">
              <Input
                id="storage-label"
                dir="ltr"
                className="font-display"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
              />
            </Field>
            <Field label="برچسب فارسی" error={errors.labelFa} htmlFor="storage-label-fa" hint="خالی = خودکار">
              <Input
                id="storage-label-fa"
                value={labelFa}
                onChange={(event) => setLabelFa(event.target.value)}
              />
            </Field>
          </div>
          <Field label="ترتیب نمایش" error={errors.sortOrder} htmlFor="storage-sort">
            <Input
              id="storage-sort"
              inputMode="numeric"
              dir="ltr"
              className="font-display"
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
            />
          </Field>

          <Button type="submit" size="md" loading={pending}>
            ذخیره ظرفیت
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
