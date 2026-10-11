'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { CustomerNoteDto } from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { formatDateTimeFa } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { useAction } from './inputs';

/** The staff's notes on a customer: calls, promises, preferences. The customer never sees them. */
export function CustomerNotes({
  userId,
  notes,
  canWrite,
  canDeleteAny,
  adminName,
}: {
  userId: string;
  notes: CustomerNoteDto[];
  canWrite: boolean;
  /** a manager removes any note; the others only their own */
  canDeleteAny: boolean;
  adminName: string;
}) {
  const [body, setBody] = useState('');
  const { pending, run } = useAction();
  return (
    <div className="grid gap-3">
      {canWrite ? (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (body.trim().length < 2) return;
            const done = await run(
              'add',
              () => api.post(`/admin/customers/${userId}/notes`, { body: body.trim() }),
              'یادداشت ثبت شد',
            );
            if (done !== undefined) setBody('');
          }}
          className="grid gap-2"
        >
          <label htmlFor="customer-note" className="sr-only">
            یادداشت تازه
          </label>
          <Textarea
            id="customer-note"
            rows={2}
            maxLength={1000}
            placeholder="مثلاً: قسط سوم را قول داد تا پنجشنبه بیاورد"
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            className="justify-self-start"
            loading={pending === 'add'}
            disabled={body.trim().length < 2}
          >
            افزودن یادداشت
          </Button>
        </form>
      ) : null}
      {notes.length === 0 ? (
        <p className="text-[13px] text-muted">یادداشتی نیست.</p>
      ) : (
        <ul className="grid gap-2">
          {notes.map((note) => (
            <li
              key={note.id}
              className="flex items-start justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3"
            >
              <div>
                <p className="whitespace-pre-line text-[13px] leading-6 text-ink">{note.body}</p>
                <p className="mt-1 text-[11px] text-muted">
                  {note.authorName ?? '—'} · {formatDateTimeFa(note.createdAt)}
                </p>
              </div>
              {canWrite && (canDeleteAny || note.authorName === adminName) ? (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="حذف یادداشت"
                  loading={pending === note.id}
                  onClick={() =>
                    run(note.id, () => api.delete(`/admin/customer-notes/${note.id}`), 'یادداشت حذف شد')
                  }
                >
                  {pending === note.id ? null : <Trash2 />}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
