'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

const noopSubscribe = () => () => {};

/**
 * `false` while rendering on the server and during the first client render,
 * `true` afterwards — lets time-dependent UI stay out of the hydrated HTML.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/** Seconds remaining, ticking down to zero. Passing a new `seconds` restarts it. */
export function useCountdown(seconds: number): number {
  const [remaining, setRemaining] = useState(seconds);
  const [startedFrom, setStartedFrom] = useState(seconds);

  // adjusting state while rendering (not in an effect) is the documented way to
  // react to a changed prop: https://react.dev/learn/you-might-not-need-an-effect
  if (startedFrom !== seconds) {
    setStartedFrom(seconds);
    setRemaining(seconds);
  }

  useEffect(() => {
    if (seconds <= 0) return;
    const id = setInterval(() => {
      setRemaining((value) => (value <= 1 ? 0 : value - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [seconds]);

  return remaining;
}

/** Seconds remaining until an ISO timestamp (e.g. a reservation expiry). */
export function useDeadline(iso: string | null | undefined): number {
  // `now` only advances from the interval below, so the value stays at most one
  // second stale after the deadline changes — and no state is set while rendering
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!iso) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [iso]);

  if (!iso) return 0;
  return Math.max(0, Math.floor((new Date(iso).getTime() - now) / 1000));
}
