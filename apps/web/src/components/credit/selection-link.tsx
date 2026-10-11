'use client';

import type { ReactNode } from 'react';
import { useCreditSelection, type CreditSelection } from './credit-selection';

/**
 * An in-page link that also picks something for the calculator or the request
 * form — «درخواست» on a row of the price table, a service card that opens that
 * service in the calculator. Without JavaScript (or outside a selection
 * provider) it is a plain `#` link.
 */
export function SelectionLink({
  target,
  patch,
  className,
  children,
  'aria-label': ariaLabel,
}: {
  target: 'request' | 'calculator';
  patch: Partial<CreditSelection>;
  className?: string;
  children: ReactNode;
  'aria-label'?: string;
}) {
  const shared = useCreditSelection();
  return (
    <a
      href={`#${target}`}
      aria-label={ariaLabel}
      className={className}
      onClick={(event) => {
        if (!shared) return;
        event.preventDefault();
        if (target === 'request') {
          shared.request(patch);
          return;
        }
        shared.update(patch);
        document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }}
    >
      {children}
    </a>
  );
}
