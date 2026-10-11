'use client';

import { useCallback, useEffect, useState } from 'react';

const KEY = 'ih:wishlist';
const EVENT = 'ih:wishlist-change';

function read(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    // private mode, blocked storage, corrupted value — the list is optional
    return [];
  }
}

function write(slugs: string[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(slugs.slice(0, 50)));
  } catch {
    /* ignore — the heart still works for this page view */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

/**
 * Favourites live in this browser only (no account needed, nothing sent to the
 * server), which is why every read and write is wrapped in try/catch.
 */
export function useWishlist() {
  const [slugs, setSlugs] = useState<string[]>([]);

  useEffect(() => {
    const sync = () => setSlugs(read());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const toggle = useCallback((slug: string) => {
    const current = read();
    const next = current.includes(slug) ? current.filter((item) => item !== slug) : [slug, ...current];
    write(next);
    setSlugs(next);
    return next.includes(slug);
  }, []);

  const has = useCallback((slug: string) => slugs.includes(slug), [slugs]);

  return { slugs, count: slugs.length, toggle, has };
}
