import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-panel border border-line px-6 py-12',
        className,
      )}
    >
      <span className="grid size-12 place-items-center rounded-full bg-surface text-muted">
        <Icon className="size-5" />
      </span>
      <p className="text-sm font-medium text-ink">{title}</p>
      {description ? (
        <p className="max-w-xs text-center text-[13px] leading-6 text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
