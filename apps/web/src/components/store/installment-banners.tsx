'use client';

import { useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PAYMENT_METHOD_INFO, type PaymentMethod } from '@iphoneha/shared';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { cn } from '@/lib/utils';

/** Credit services that have a banner pair in /public/banners/installments. */
const BANNER_FILES: Partial<Record<PaymentMethod, string>> = {
  SNAPPAY: 'snappay',
  TARA: 'tara',
  AZKIVAM: 'azkivam',
  BOJET: 'bojet',
};

/** How long each banner stays up before the next one slides in. */
const INTERVAL_MS = 6500;

/** The services among `methods` that have a banner, in the same order. */
export function servicesWithBanner(methods: PaymentMethod[]): PaymentMethod[] {
  return methods.filter((method) => BANNER_FILES[method]);
}

/**
 * Banners for the credit services that are live right now — pass only the
 * services the store has switched on, so a banner never advertises a plan
 * nobody can buy with. Each one opens the instalment calculator with its
 * service chosen. The row turns on its own (the dot under the current banner
 * fills up as it waits), stops while hovered or focused, swipes on touch and
 * stays put for visitors who prefer less motion.
 */
export function InstallmentBanners({
  methods,
  className,
  priority = false,
}: {
  methods: PaymentMethod[];
  className?: string;
  /** the banner is the page's first picture (the instalments page): fetch it before anything else */
  priority?: boolean;
}) {
  const slides = servicesWithBanner(methods);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useReducedMotion();
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  const count = slides.length;
  if (count === 0) return null;
  const current = Math.min(index, count - 1);
  const go = (delta: number) => setIndex((i) => (i + delta + count) % count);
  const rotating = count > 1 && !reduced;

  const onPointerDown = (event: PointerEvent) => {
    swiped.current = false;
    if (event.pointerType !== 'mouse') swipeStart.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event: PointerEvent) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || count < 2) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      swiped.current = true;
      // right-to-left page: swiping to the left brings the next banner
      go(dx < 0 ? 1 : -1);
    }
  };
  // a swipe ends on top of a link; it must not also open it
  const onClickCapture = (event: MouseEvent) => {
    if (swiped.current) {
      event.preventDefault();
      swiped.current = false;
    }
  };

  return (
    <section
      className={cn(
        'group relative touch-pan-y select-none overflow-hidden rounded-panel border border-line bg-surface',
        className,
      )}
      aria-roledescription="carousel"
      aria-label="طرح‌های خرید قسطی"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onClickCapture={onClickCapture}
    >
      <div className="relative aspect-[4/5] sm:aspect-[64/15]">
        {slides.map((method, i) => {
          const file = BANNER_FILES[method]!;
          const name = PAYMENT_METHOD_INFO[method].name;
          const active = i === current;
          // every slide sits in the viewport (stacked, transparent), so «lazy» alone
          // would still fetch all of them at once: only the one showing and its two
          // neighbours carry a picture; the rest get theirs when their turn comes near
          const pictured =
            count <= 3 || active || i === (current + 1) % count || i === (current + count - 1) % count;
          return (
            <Link
              key={method}
              href={`/installments?service=${method.toLowerCase()}#calculator`}
              aria-hidden={!active}
              tabIndex={active ? undefined : -1}
              draggable={false}
              className={cn(
                'absolute inset-0 block transition-[opacity,transform] duration-700 ease-out-quint',
                active ? 'z-10 scale-100 opacity-100' : 'pointer-events-none scale-[1.04] opacity-0',
              )}
            >
              {/* a tall crop for phones, a wide one above; each in three widths so a
                  phone never downloads the 2560px banner (a 2× phone takes the 720) */}
              {pictured ? (
                <picture>
                  <source
                    media="(max-width: 639px)"
                    srcSet={`/banners/installments/${file}-mobile-540.webp 540w, /banners/installments/${file}-mobile-720.webp 720w, /banners/installments/${file}-mobile.webp 1080w`}
                    sizes="calc(100vw - 2rem)"
                  />
                  <img
                    src={`/banners/installments/${file}-desktop.webp`}
                    srcSet={`/banners/installments/${file}-desktop-1280.webp 1280w, /banners/installments/${file}-desktop.webp 2560w`}
                    sizes="(min-width: 1280px) 1232px, calc(100vw - 2rem)"
                    alt={`خرید قسطی آیفون با ${name} — شرایط این طرح`}
                    className="size-full object-cover"
                    loading={priority && i === 0 ? 'eager' : 'lazy'}
                    fetchPriority={priority && i === 0 ? 'high' : 'low'}
                    decoding="async"
                    draggable={false}
                  />
                </picture>
              ) : (
                <span className="sr-only">{`خرید قسطی آیفون با ${name}`}</span>
              )}
              {active ? <span aria-hidden className="shine absolute inset-0" /> : null}
            </Link>
          );
        })}
      </div>

      {count > 1 ? (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="طرح قبلی"
            className="absolute top-1/2 right-3 z-20 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-canvas/85 text-ink opacity-0 shadow-raised backdrop-blur transition-opacity group-hover:opacity-100 focus-visible:opacity-100 md:grid"
          >
            <ChevronRight className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="طرح بعدی"
            className="absolute top-1/2 left-3 z-20 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-canvas/85 text-ink opacity-0 shadow-raised backdrop-blur transition-opacity group-hover:opacity-100 focus-visible:opacity-100 md:grid"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </button>

          <div className="absolute bottom-2 left-1/2 z-20 flex -translate-x-1/2 items-center rounded-pill bg-ink/30 px-1">
            {slides.map((method, i) => (
              <button
                key={method}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`طرح ${PAYMENT_METHOD_INFO[method].name}`}
                aria-current={i === current}
                className="grid h-6 min-w-6 place-items-center px-0.5"
              >
                <span
                  className={cn(
                    'relative block h-1.5 overflow-hidden rounded-pill transition-all duration-500',
                    i === current ? 'w-7 bg-white/40' : 'w-1.5 bg-white/60',
                  )}
                >
                  {i === current && rotating ? (
                    <span
                      // a new key restarts the fill for every banner
                      key={`${method}-${current}`}
                      className="animate-progress absolute inset-0 rounded-pill bg-white"
                      style={
                        {
                          '--progress-duration': `${INTERVAL_MS}ms`,
                          animationPlayState: paused ? 'paused' : 'running',
                        } as CSSProperties
                      }
                      // the fill running out is what turns to the next banner, so
                      // pausing the animation pauses the rotation with it
                      onAnimationEnd={() => go(1)}
                    />
                  ) : i === current ? (
                    <span className="absolute inset-0 rounded-pill bg-white" />
                  ) : null}
                </span>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
