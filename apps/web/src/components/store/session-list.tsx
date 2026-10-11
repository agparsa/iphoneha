'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import type { SessionDto } from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { queryKeys } from '@/lib/api/keys';
import { formatDateTimeFa } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function SessionList({ initialSessions }: { initialSessions: SessionDto[] }) {
  const queryClient = useQueryClient();
  const { data: sessions = initialSessions } = useQuery({
    queryKey: queryKeys.sessions,
    queryFn: () => api.get<SessionDto[]>('/auth/sessions'),
    initialData: initialSessions,
  });

  async function revoke(id: string) {
    try {
      await api.delete(`/auth/sessions/${id}`);
      await queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
      toast.success('دستگاه خارج شد');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function revokeOthers() {
    try {
      await api.post('/auth/sessions/revoke-others');
      await queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
      toast.success('سایر دستگاه‌ها خارج شدند');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted">دستگاه‌هایی که با حساب تو وارد شده‌اند.</p>
        {sessions.length > 1 ? (
          <Button size="sm" variant="outline" onClick={revokeOthers}>
            خروج از سایر دستگاه‌ها
          </Button>
        ) : null}
      </div>

      {sessions.map((session) => (
        <article key={session.id} className="flex items-center gap-3 rounded-panel border border-line p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-muted">
            <Smartphone className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
              {session.deviceName ?? 'دستگاه ناشناس'}
              {session.current ? <Badge tone="success">این دستگاه</Badge> : null}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              آخرین فعالیت: {formatDateTimeFa(session.lastSeenAt)}
            </p>
            {session.ip ? (
              <p className="mt-0.5 text-[11px] text-muted-faint font-display">{session.ip}</p>
            ) : null}
          </div>
          {!session.current ? (
            <button
              type="button"
              onClick={() => revoke(session.id)}
              className="grid size-9 shrink-0 place-items-center rounded-full text-muted-faint transition-colors hover:bg-danger-soft hover:text-danger"
              aria-label="خروج از این دستگاه"
            >
              <LogOut className="size-4" />
            </button>
          ) : null}
        </article>
      ))}
    </div>
  );
}
