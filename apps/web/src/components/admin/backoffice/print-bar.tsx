'use client';

import { useEffect } from 'react';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** The toolbar above a printable page (hidden on paper); `auto` opens the print dialog once the page is ready. */
export function PrintBar({ title, hint, auto = false }: { title: string; hint?: string; auto?: boolean }) {
  useEffect(() => {
    if (!auto) return;
    const timer = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(timer);
  }, [auto]);
  return (
    <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-3 px-4 print:hidden">
      <div>
        <p className="text-[14px] font-semibold text-ink">{title}</p>
        {hint ? <p className="mt-0.5 text-[12px] text-muted">{hint}</p> : null}
      </div>
      <Button size="sm" onClick={() => window.print()}>
        <Printer aria-hidden />
        چاپ
      </Button>
    </div>
  );
}
