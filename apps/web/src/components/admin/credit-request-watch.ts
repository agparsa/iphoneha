'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { toPersianDigits, type CreditRequestSummaryDto } from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { notifyInBackground } from './browser-alerts';

/** How often the open panel asks whether a request came in (background tabs are throttled to this anyway). */
const POLL_MS = 60_000;
const REQUESTS_PATH = '/admin/credit-requests';

/**
 * Keeps the «درخواست‌های اقساط» badge current while the panel is open, and
 * announces a request that just came in: a toast in the panel, plus a system
 * notification when the tab is in the background and the browser allows it.
 *
 * `initial` is what the server rendered (null: this admin cannot see requests).
 */
export function useCreditRequestWatch(initial: CreditRequestSummaryDto | null): number {
  const router = useRouter();
  const pathname = usePathname();
  const [waiting, setWaiting] = useState(initial?.new ?? 0);

  // a new server render (after a status is saved, or router.refresh) has the freshest count
  const [renderedNew, setRenderedNew] = useState(initial?.new);
  if (initial?.new !== renderedNew) {
    setRenderedNew(initial?.new);
    setWaiting(initial?.new ?? 0);
  }

  const latestSeen = useRef<number | null>(initial?.latestNumber ?? null);
  const initialLatest = initial?.latestNumber ?? null;
  useEffect(() => {
    if (initialLatest !== null && (latestSeen.current === null || initialLatest > latestSeen.current)) {
      latestSeen.current = initialLatest;
    }
  }, [initialLatest]);

  const onRequestsPage = useRef(false);
  useEffect(() => {
    onRequestsPage.current = pathname.startsWith(REQUESTS_PATH);
  }, [pathname]);

  const watching = initial !== null;
  useEffect(() => {
    if (!watching) return;
    let stopped = false;

    const open = () => {
      if (onRequestsPage.current) router.refresh();
      else router.push(REQUESTS_PATH);
    };

    async function poll() {
      if (stopped) return;
      try {
        const summary = await api.get<CreditRequestSummaryDto>('/admin/credit-requests/summary');
        if (stopped) return;
        setWaiting(summary.new);
        const previous = latestSeen.current;
        if (summary.latestNumber === null || (previous !== null && summary.latestNumber <= previous)) return;
        latestSeen.current = summary.latestNumber;

        const number = toPersianDigits(summary.latestNumber);
        // the list on screen shows it right away
        if (onRequestsPage.current) router.refresh();
        toast('درخواست خرید قسطی تازه', {
          description: `درخواست شمارهٔ ${number} منتظر تماس شماست.`,
          duration: 20_000,
          action: onRequestsPage.current ? undefined : { label: 'مشاهده', onClick: open },
        });
        notifyInBackground('درخواست خرید قسطی تازه', `شمارهٔ ${number} منتظر تماس است — آیفونی‌ها`, open);
      } catch (error) {
        // signed out or no longer allowed: stop asking; offline: try again next time
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) stopped = true;
      }
    }

    const timer = window.setInterval(() => void poll(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [watching, router]);

  return waiting;
}
