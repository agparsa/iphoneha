'use client';

import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Appears once the visitor is well down the page; hidden from AT while inert. */
export function ScrollToTop() {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > 700);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="بازگشت به بالای صفحه"
      tabIndex={shown ? undefined : -1}
      aria-hidden={!shown}
      className={cn(
        'fixed bottom-24 end-4 z-30 grid size-11 place-items-center rounded-full border border-line bg-canvas/95 text-ink shadow-card transition-[opacity,transform] duration-300 ease-out-quint lg:bottom-8 lg:end-8',
        shown ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0',
      )}
    >
      <ArrowUp className="size-[18px]" aria-hidden />
    </button>
  );
}
