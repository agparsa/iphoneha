'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { AddressDto } from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { queryKeys } from '@/lib/api/keys';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { AddressForm } from './address-form';

export function AddressBook({ initialAddresses }: { initialAddresses: AddressDto[] }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<AddressDto | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: addresses = initialAddresses } = useQuery({
    queryKey: queryKeys.addresses,
    queryFn: () => api.get<AddressDto[]>('/users/me/addresses'),
    initialData: initialAddresses,
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: queryKeys.addresses });
  }

  async function remove(id: string) {
    try {
      await api.delete(`/users/me/addresses/${id}`);
      await refresh();
      toast.success('آدرس حذف شد');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function setDefault(id: string) {
    try {
      await api.post(`/users/me/addresses/${id}/default`);
      await refresh();
      toast.success('آدرس پیش‌فرض تغییر کرد');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  if (creating || editing) {
    return (
      <section className="rounded-panel border border-line p-5">
        <h2 className="mb-4 text-[15px] font-semibold text-ink">{editing ? 'ویرایش آدرس' : 'آدرس جدید'}</h2>
        <AddressForm
          address={editing ?? undefined}
          onSaved={async () => {
            await refresh();
            setEditing(null);
            setCreating(false);
            toast.success('آدرس ذخیره شد');
          }}
          onCancel={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      </section>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="flex justify-end">
        <Button size="md" onClick={() => setCreating(true)}>
          <Plus className="size-4" aria-hidden />
          آدرس جدید
        </Button>
      </div>

      {addresses.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="هنوز آدرسی ثبت نکرده‌ای"
          description="برای تکمیل خرید حداقل یک آدرس لازم است."
          className="border-dashed"
        />
      ) : (
        addresses.map((address) => (
          <article key={address.id} className="rounded-panel border border-line p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
                  {address.title || address.recipientName}
                  {address.isDefault ? <Badge tone="neutral">پیش‌فرض</Badge> : null}
                </p>
                <p className="mt-1.5 text-[12px] leading-6 text-muted">
                  {address.province}، {address.city} — {address.addressLine}
                </p>
                <p className="mt-1 text-[11px] text-muted-faint font-display">
                  {address.mobile} · {address.postalCode}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {!address.isDefault ? (
                  <button
                    type="button"
                    onClick={() => setDefault(address.id)}
                    className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink"
                    aria-label="انتخاب به‌عنوان پیش‌فرض"
                  >
                    <Star className="size-4" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setEditing(address)}
                  className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink"
                  aria-label="ویرایش آدرس"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(address.id)}
                  className="grid size-9 place-items-center rounded-full text-muted-faint transition-colors hover:bg-danger-soft hover:text-danger"
                  aria-label="حذف آدرس"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          </article>
        ))
      )}
    </div>
  );
}
