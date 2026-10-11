'use client';

import { useEffect, useRef, useState } from 'react';
import { formatNumberFa } from '@iphoneha/shared';

/**
 * A number that counts to its new value instead of jumping — used for prices
 * when the capacity or plan changes. Settles on the exact value; intermediate
 * frames are rounded to thousands so they read like prices, not noise.
 */
export function AnimatedNumber({
  value,
  duration = 650,
  format = formatNumberFa,
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
}) {
  const [shown, setShown] = useState(value);
  const current = useRef(value);

  useEffect(() => {
    const from = current.current;
    if (from === value) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      current.current = value;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no animation, jump straight there
      setShown(value);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 4);
      const next = progress < 1 ? Math.round((from + (value - from) * eased) / 1000) * 1000 : value;
      current.current = next;
      setShown(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return <>{format(shown)}</>;
}
