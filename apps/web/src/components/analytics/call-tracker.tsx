'use client';

import { useEffect } from 'react';
import { trackCallClick } from '@/lib/analytics';

/**
 * Reports a tap on any `tel:` link as `click_to_call`, so a call started from
 * the instalment pages counts as a conversion like a sent form. One listener
 * for the whole page instead of an onClick on every phone link.
 */
export function CallTracker() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.('a[href^="tel:"]');
      if (link) trackCallClick(window.location.pathname);
    };
    document.addEventListener('click', onClick, { capture: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, []);
  return null;
}
