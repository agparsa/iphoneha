import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A soft ring that keeps spreading out of a call-to-action. It wraps the
 * button (which clips its own shine) so the ring can grow past its edge, and
 * it animates only transform and opacity, so it costs the page nothing.
 */
export function PulseRing({
  children,
  color = '#0e8a5c',
  active = true,
  className,
}: {
  children: ReactNode;
  /** the ring's colour */
  color?: string;
  /** off for a disabled button */
  active?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn('relative inline-flex rounded-pill', active && 'pulse-ring', className)}
      style={{ '--pulse': color } as CSSProperties}
    >
      {children}
    </span>
  );
}
