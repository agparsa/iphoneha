'use client';

import { useCallback, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatNumberFa, type ImageDto } from '@iphoneha/shared';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { cn } from '@/lib/utils';
import { ProductImage } from './product-image';

/**
 * The product's photos for the selected colour.
 *
 * DEVICE photos (the phone on a transparent background) float over a glow in
 * the colour's own tint and lean towards the pointer; DETAIL photos (close-ups)
 * fill the frame and drift slowly. Changing photo or colour cross-fades.
 * Swipe, arrows and thumbnails all navigate; reduced motion keeps it still.
 */
export function ProductGallery({
  images,
  activeColorId,
  alt,
  accent,
}: {
  images: ImageDto[];
  activeColorId: string | null;
  alt: string;
  /** hex of the selected colour, tints the glow behind the phone */
  accent?: string;
}) {
  const forColor = images.filter((image) => !activeColorId || image.colorId === activeColorId);
  const shown = forColor.length > 0 ? forColor : images;
  const [index, setIndex] = useState(0);
  const [shownColorId, setShownColorId] = useState(activeColorId);
  // the first photo is simply there (it is the page's largest paint); only a
  // photo the visitor switches to fades in
  const [moved, setMoved] = useState(false);

  // switching colour shows that colour's first photo (state adjusted during
  // render rather than in an effect)
  if (shownColorId !== activeColorId) {
    setShownColorId(activeColorId);
    setIndex(0);
    setMoved(true);
  }

  const count = shown.length;
  const safeIndex = Math.min(index, Math.max(0, count - 1));
  const current = shown[safeIndex];
  const go = useCallback(
    (delta: number) => {
      setMoved(true);
      setIndex((i) => (count ? (i + delta + count) % count : 0));
    },
    [count],
  );

  // pointer tilt for whole-device photos (mouse only; touch swipes instead)
  const frame = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });
  const reduced = useReducedMotion();

  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') swipeStart.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event: PointerEvent) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    // right-to-left page: a swipe to the left brings the next photo
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse' || reduced || current?.kind === 'DETAIL' || !frame.current) return;
    const rect = frame.current.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    setTilt({ rx: -y * 9, ry: x * 11 });
  };

  const detail = current?.kind === 'DETAIL';

  return (
    <div>
      <div
        ref={frame}
        className="group relative aspect-square touch-pan-y select-none overflow-hidden rounded-panel border border-line bg-surface-2"
        style={{ '--glow': accent ?? '#0e8a5c' } as CSSProperties}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setTilt({ rx: 0, ry: 0 })}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') go(1);
          if (event.key === 'ArrowRight') go(-1);
        }}
        role="region"
        aria-roledescription="carousel"
        aria-label={`تصاویر ${alt}`}
        tabIndex={0}
      >
        <div aria-hidden className="gallery-glow absolute inset-0" />

        {current ? (
          <div key={current.id} className={cn('absolute inset-0', moved && 'gallery-in')}>
            {detail ? (
              <ProductImage
                src={current.url}
                alt={current.alt ?? alt}
                sizes="(min-width: 1024px) 600px, 92vw"
                fit="cover"
                className="animate-ken-burns"
              />
            ) : (
              <>
                <span
                  aria-hidden
                  className="animate-float-shadow absolute bottom-[7%] left-1/2 h-5 w-1/2 -translate-x-1/2 rounded-[50%] bg-ink/25 blur-xl"
                />
                <div
                  className="tilt absolute inset-0"
                  style={{ '--rx': `${tilt.rx}deg`, '--ry': `${tilt.ry}deg` } as CSSProperties}
                >
                  <div className="animate-float absolute inset-0">
                    <ProductImage
                      src={current.url}
                      alt={current.alt ?? alt}
                      sizes="(min-width: 1024px) 600px, 92vw"
                      priority={safeIndex === 0}
                      className="p-7 drop-shadow-[0_28px_32px_rgb(20_20_22_/_0.18)] sm:p-9"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <ProductImage src={null} alt={alt} className="absolute inset-0" />
        )}

        {count > 1 ? (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="تصویر قبلی"
              className="absolute top-1/2 right-3 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-canvas/85 text-ink opacity-0 shadow-raised backdrop-blur transition-opacity group-hover:opacity-100 focus-visible:opacity-100 md:grid"
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="تصویر بعدی"
              className="absolute top-1/2 left-3 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-canvas/85 text-ink opacity-0 shadow-raised backdrop-blur transition-opacity group-hover:opacity-100 focus-visible:opacity-100 md:grid"
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5 md:hidden" aria-hidden>
              {shown.map((image, i) => (
                <span
                  key={image.id}
                  className={cn(
                    'h-1.5 rounded-pill transition-all duration-300',
                    i === safeIndex ? 'w-5 bg-ink/70' : 'w-1.5 bg-ink/25',
                  )}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>

      {count > 1 ? (
        <div className="mt-3 flex gap-2">
          {shown.map((image, i) => (
            <button
              key={image.id}
              type="button"
              onClick={() => {
                setMoved(true);
                setIndex(i);
              }}
              aria-label={`تصویر ${formatNumberFa(i + 1)}`}
              aria-current={i === safeIndex}
              className={cn(
                'relative size-16 shrink-0 overflow-hidden rounded-xl border bg-surface-2 transition-[border-color,transform,box-shadow] duration-300 hover:-translate-y-0.5',
                i === safeIndex
                  ? 'border-brand shadow-[0_0_0_3px_rgb(14_138_92_/_0.15)]'
                  : 'border-line hover:border-line-strong',
              )}
            >
              <ProductImage
                src={image.url}
                alt={image.alt ?? alt}
                sizes="64px"
                fit={image.kind === 'DETAIL' ? 'cover' : 'contain'}
                className={image.kind === 'DETAIL' ? undefined : 'p-1'}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
