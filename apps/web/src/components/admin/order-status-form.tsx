'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input, Textarea } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function OrderStatusForm({
  orderId,
  current,
  allowed,
  trackingCode,
}: {
  orderId: string;
  current: OrderStatus;
  allowed: OrderStatus[];
  trackingCode: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [note, setNote] = useState('');
  const [tracking, setTracking] = useState(trackingCode ?? '');
  const [pending, setPending] = useState(false);

  if (allowed.length === 0) {
    return (
      <p className="text-[13px] text-muted">وضعیت «{ORDER_STATUS_LABELS[current]}» تغییر دیگری نمی‌پذیرد.</p>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!status) return;
    setPending(true);
    try {
      await api.patch(`/admin/orders/${orderId}`, {
        status,
        note: note.trim() || null,
        trackingCode: tracking.trim() || null,
      });
      toast.success('وضعیت سفارش به‌روز شد');
      setStatus('');
      setNote('');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <Field label="وضعیت جدید">
        <Select value={status || undefined} onValueChange={(value) => setStatus(value as OrderStatus)}>
          <SelectTrigger aria-label="وضعیت جدید">
            <SelectValue placeholder="انتخاب وضعیت" />
          </SelectTrigger>
          <SelectContent>
            {allowed.map((option) => (
              <SelectItem key={option} value={option}>
                {ORDER_STATUS_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="کد رهگیری پستی (اختیاری)" htmlFor="tracking">
        <Input
          id="tracking"
          dir="ltr"
          className="font-display"
          value={tracking}
          onChange={(e) => setTracking(e.target.value)}
        />
      </Field>

      <Field label="یادداشت (اختیاری)" htmlFor="note">
        <Textarea id="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <Button type="submit" size="md" loading={pending} disabled={!status}>
        ثبت تغییر وضعیت
      </Button>
    </form>
  );
}
