'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  CREDIT_REQUEST_STATUSES,
  CREDIT_REQUEST_STATUS_LABELS,
  formatNumberFa,
  type CreditRequestStatus,
} from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';

/** Status and the staff note of one «درخواست خرید با چک/سفته», saved together. */
export function CreditRequestActions({
  id,
  number,
  status: savedStatus,
  adminNote: savedNote,
}: {
  id: string;
  number: number;
  status: CreditRequestStatus;
  adminNote: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(savedStatus);
  const [note, setNote] = useState(savedNote ?? '');
  const [pending, setPending] = useState(false);

  const noteChanged = note.trim() !== (savedNote ?? '');
  const dirty = status !== savedStatus || noteChanged;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!dirty) return;
    setPending(true);
    try {
      await api.patch(`/admin/credit-requests/${id}`, {
        ...(status !== savedStatus ? { status } : {}),
        ...(noteChanged ? { adminNote: note.trim() || null } : {}),
      });
      toast.success(`درخواست ${formatNumberFa(number)} به‌روز شد`);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  const noteId = `credit-note-${id}`;
  return (
    <form onSubmit={save} className="mt-4 grid gap-3 border-t border-line pt-4">
      <fieldset>
        <legend className="mb-2 text-[12px] font-medium text-ink-muted">وضعیت پیگیری</legend>
        <div className="flex flex-wrap gap-2">
          {CREDIT_REQUEST_STATUSES.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={option === status}
              onClick={() => setStatus(option)}
              className={cn(
                'rounded-pill border px-3 py-1.5 text-[12px] transition-colors',
                option === status
                  ? 'border-ink bg-ink text-white'
                  : 'border-line text-ink-muted hover:bg-surface',
              )}
            >
              {CREDIT_REQUEST_STATUS_LABELS[option]}
            </button>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor={noteId} className="mb-2 block text-[12px] font-medium text-ink-muted">
          یادداشت داخلی (مشتری نمی‌بیند)
        </label>
        <Textarea
          id={noteId}
          rows={2}
          maxLength={500}
          value={note}
          placeholder="مثلاً: مدارک را فرستاد؛ پیش‌پرداخت ۳۰٪، ۱۲ ماهه"
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={pending} disabled={!dirty}>
          ذخیره
        </Button>
      </div>
    </form>
  );
}
