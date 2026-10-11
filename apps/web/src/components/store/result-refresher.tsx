'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Payment callbacks can land a moment later — re-check the result a few times. */
export function ResultRefresher({
  intervalMs = 4000,
  attempts = 5,
}: {
  intervalMs?: number;
  attempts?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    let count = 0;
    const id = setInterval(() => {
      count += 1;
      router.refresh();
      if (count >= attempts) clearInterval(id);
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs, attempts]);

  return <p className="mt-4 text-[11px] text-muted-faint">در حال بررسی وضعیت پرداخت…</p>;
}
