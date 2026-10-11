import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import type { BreadcrumbDto } from '@iphoneha/shared';

export function Breadcrumbs({ items }: { items: BreadcrumbDto[] }) {
  if (items.length === 0) return null;
  return (
    // painted over the page with its own background: a hero's blurred glow
    // reaches up under the links, and automated contrast checks (axe) don't
    // see that the hero clips it
    <nav aria-label="مسیر صفحه" className="relative z-10 mb-5 bg-canvas">
      <ol className="flex flex-wrap items-center gap-1 text-[11px] text-muted">
        {items.map((item, index) => (
          <li key={item.href} className="flex items-center gap-1">
            {index > 0 ? <ChevronLeft className="size-3 text-muted-faint" aria-hidden /> : null}
            {index === items.length - 1 ? (
              <span className="text-ink-muted">{item.name}</span>
            ) : (
              <Link href={item.href} className="transition-colors hover:text-ink">
                {item.name}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
