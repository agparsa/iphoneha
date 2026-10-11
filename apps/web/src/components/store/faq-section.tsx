import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FaqItem } from '@/lib/store-copy';

export type { FaqItem } from '@/lib/store-copy';

/**
 * Questions that open in place. Native `<details>`: every answer is in the
 * HTML a crawler reads (a script accordion leaves closed answers out), it
 * works before any JavaScript loads, and the FAQPage data built from the same
 * `items` matches what is on the page. Build `items` from the store's real
 * terms (`purchaseFaq`, `chequeFaq`, …).
 */
export function FaqSection({ items, className }: { items: FaqItem[]; className?: string }) {
  return (
    <div className={cn('rounded-panel border border-line px-5', className)}>
      {items.map((item) => (
        <details key={item.q} className="group border-b border-line last:border-0">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-start [&::-webkit-details-marker]:hidden">
            <h3 className="text-sm font-medium leading-6 text-ink">{item.q}</h3>
            <Plus
              className="size-4 shrink-0 text-muted transition-transform duration-200 group-open:rotate-45"
              aria-hidden
            />
          </summary>
          <p className="animate-fade-in pb-4 text-[13px] leading-7 text-muted">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
