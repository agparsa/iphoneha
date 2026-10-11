import Link from 'next/link';
import { formatNumberFa, formatToman } from '@iphoneha/shared';
import { cn } from '@/lib/utils';

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-ink">{title}</h1>
        {description ? <p className="mt-1 text-[13px] text-muted">{description}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'neutral' | 'success' | 'danger';
}) {
  return (
    <div className="rounded-panel border border-line p-4">
      <p className="text-[12px] text-muted">{label}</p>
      <p
        className={cn(
          'mt-2 text-xl font-semibold tabular',
          tone === 'success' && 'text-success',
          tone === 'danger' && 'text-danger',
          tone === 'neutral' && 'text-ink',
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-[11px] text-muted-faint">{hint}</p> : null}
    </div>
  );
}

export function Money({ value, className }: { value: number; className?: string }) {
  return <span className={cn('tabular', className)}>{formatToman(value)}</span>;
}

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-x-auto rounded-panel border border-line', className)}>
      <table className="w-full min-w-[42rem] border-collapse text-start text-[13px]">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        'border-b border-line bg-surface-2 px-4 py-3 text-start text-[12px] font-medium text-muted',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <td className={cn('border-b border-line px-4 py-3 align-middle text-ink-muted', className)}>
      {children}
    </td>
  );
}

export function EmptyRow({ colSpan, label = 'موردی یافت نشد' }: { colSpan: number; label?: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-[13px] text-muted">
        {label}
      </td>
    </tr>
  );
}

/** Server-side pagination that keeps the current query string. */
export function TablePagination({
  page,
  totalPages,
  total,
  basePath,
  params,
}: {
  page: number;
  totalPages: number;
  total: number;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  if (totalPages <= 1) {
    return <p className="mt-3 text-[12px] text-muted">{formatNumberFa(total)} مورد</p>;
  }

  const href = (target: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== 'page') search.set(key, value);
    }
    if (target > 1) search.set('page', String(target));
    const query = search.toString();
    return query ? `${basePath}?${query}` : basePath;
  };

  return (
    <div className="mt-3 flex items-center justify-between gap-3">
      <p className="text-[12px] text-muted">
        صفحه {formatNumberFa(page)} از {formatNumberFa(totalPages)} — {formatNumberFa(total)} مورد
      </p>
      <div className="flex gap-1.5">
        {page > 1 ? (
          <Link
            href={href(page - 1)}
            className="rounded-pill border border-line px-3 py-1.5 text-[12px] text-ink"
          >
            قبلی
          </Link>
        ) : null}
        {page < totalPages ? (
          <Link
            href={href(page + 1)}
            className="rounded-pill border border-line px-3 py-1.5 text-[12px] text-ink"
          >
            بعدی
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/** A row of filter links for one query parameter; the other parameters stay, the page resets. */
export function FilterChips({
  basePath,
  params,
  name,
  options,
  allLabel = 'همه',
  label,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  name: string;
  options: { value: string; label: string }[];
  allLabel?: string | null;
  label?: string;
}) {
  const href = (value: string | null) => {
    const search = new URLSearchParams();
    for (const [key, current] of Object.entries(params)) {
      if (current && key !== name && key !== 'page') search.set(key, current);
    }
    if (value) search.set(name, value);
    const query = search.toString();
    return query ? `${basePath}?${query}` : basePath;
  };
  const current = params[name];
  const chip = (active: boolean) =>
    cn(
      'shrink-0 rounded-pill border px-3 py-1.5 text-[12px] transition-colors',
      active ? 'border-ink bg-ink text-white' : 'border-line text-ink-muted hover:bg-surface',
    );
  return (
    <nav className="no-scrollbar flex items-center gap-2 overflow-x-auto" aria-label={label}>
      {label ? <span className="shrink-0 text-[12px] text-muted">{label}:</span> : null}
      {allLabel ? (
        <Link href={href(null)} className={chip(!current)} aria-current={!current ? 'page' : undefined}>
          {allLabel}
        </Link>
      ) : null}
      {options.map((option) => (
        <Link
          key={option.value}
          href={href(option.value)}
          className={chip(current === option.value)}
          aria-current={current === option.value ? 'page' : undefined}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}

/** A titled white panel for a page section. */
export function Panel({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('min-w-0 rounded-panel border border-line bg-canvas p-4 lg:p-5', className)}>
      {title || action ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title ? <h2 className="text-[15px] font-semibold text-ink">{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}
