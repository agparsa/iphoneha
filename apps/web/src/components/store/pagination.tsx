'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatNumberFa } from '@iphoneha/shared';
import { cn } from '@/lib/utils';

export function Pagination({ page, totalPages }: { page: number; totalPages: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (totalPages <= 1) return null;

  function go(next: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (next <= 1) params.delete('page');
    else params.set('page', String(next));
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1,
  );

  return (
    <nav className="mt-8 flex items-center justify-center gap-1.5" aria-label="صفحه‌بندی">
      <button
        type="button"
        onClick={() => go(page - 1)}
        disabled={page <= 1}
        className="grid size-9 place-items-center rounded-full border border-line text-ink disabled:opacity-35"
        aria-label="صفحه قبل"
      >
        <ChevronRight className="size-4" />
      </button>

      {pages.map((item, index) => (
        <span key={item} className="flex items-center gap-1.5">
          {index > 0 && item - pages[index - 1]! > 1 ? <span className="text-muted-faint">…</span> : null}
          <button
            type="button"
            onClick={() => go(item)}
            aria-current={item === page}
            className={cn(
              'grid size-9 place-items-center rounded-full border text-[13px] tabular transition-colors',
              item === page ? 'border-ink bg-ink text-white' : 'border-line text-ink-muted hover:bg-surface',
            )}
          >
            {formatNumberFa(item)}
          </button>
        </span>
      ))}

      <button
        type="button"
        onClick={() => go(page + 1)}
        disabled={page >= totalPages}
        className="grid size-9 place-items-center rounded-full border border-line text-ink disabled:opacity-35"
        aria-label="صفحه بعد"
      >
        <ChevronLeft className="size-4" />
      </button>
    </nav>
  );
}
