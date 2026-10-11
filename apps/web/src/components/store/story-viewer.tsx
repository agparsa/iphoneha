'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import Image from 'next/image';
import Link from 'next/link';
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Pause, Play, X } from 'lucide-react';
import { formatNumberFa } from '@iphoneha/shared';
import type { StoryGroup, StoryPicture, StorySlide } from '@/lib/story-types';
import { trackStoryClick } from '@/lib/analytics';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { cn, mediaUrl } from '@/lib/utils';
import { StoryAvatarView } from './story-box';

/** How long a slide stays up before the next one. */
const SLIDE_MS = 6_000;
/** A press longer than this pauses the story instead of turning the page. */
const HOLD_MS = 220;
/** The banner card's width: the whole phone, or the 9:16 card on a computer. */
const BANNER_SIZES = '(min-width: 640px) 460px, 100vw';

function subscribeVisibility(onChange: () => void): () => void {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

/** Starts downloading a banner the way the page will ask for it (same size from the srcset). */
function preloadBanner(picture: StoryPicture): void {
  const image = new window.Image();
  image.decoding = 'async';
  image.sizes = BANNER_SIZES;
  if (picture.srcSet) image.srcset = picture.srcSet;
  image.src = picture.src;
}

interface Position {
  group: number;
  slide: number;
}

/**
 * The story itself: full screen on a phone, a 9:16 card on a computer.
 * Right-to-left like the page: tapping the right third goes back, anywhere
 * else goes on; a swipe changes the story, a swipe down or Escape closes it,
 * pressing and holding pauses, and so does the pause button (or Space).
 * Visitors who asked their system for less motion get no clock at all — the
 * slides wait for a tap.
 */
export function StoryViewer({
  groups,
  start,
  onClose,
  onSeen,
}: {
  groups: StoryGroup[];
  start: number;
  onClose: () => void;
  onSeen: (group: StoryGroup) => void;
}) {
  const autoplay = !useReducedMotion();
  const hidden = useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === 'hidden',
    () => false,
  );
  const [position, setPosition] = useState<Position>({ group: start, slide: 0 });
  const [paused, setPaused] = useState(false);
  const [holding, setHolding] = useState(false);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const holdTimer = useRef<number | undefined>(undefined);
  const heldLong = useRef(false);

  const group = groups[position.group]!;
  const slide = group.slides[position.slide]!;
  const slideKey = `${group.id}/${slide.id}`;
  const banner = slide.picture?.shape === 'banner' ? slide.picture : null;
  // a banner is the whole slide: its seconds start once it is on screen
  const ready = !banner || loadedKey === slideKey;
  const running = autoplay && !paused && !holding && !hidden && ready;

  useEffect(() => {
    onSeen(group);
  }, [group, onSeen]);

  // the next banner is fetched while this slide is up
  const upcoming = group.slides[position.slide + 1] ?? groups[position.group + 1]?.slides[0] ?? null;
  useEffect(() => {
    if (upcoming?.picture?.shape === 'banner') preloadBanner(upcoming.picture);
  }, [upcoming]);

  useEffect(() => () => window.clearTimeout(holdTimer.current), []);

  const next = () => {
    if (position.slide + 1 < group.slides.length)
      setPosition({ group: position.group, slide: position.slide + 1 });
    else if (position.group + 1 < groups.length) setPosition({ group: position.group + 1, slide: 0 });
    else onClose();
  };
  const previous = () => {
    if (position.slide > 0) setPosition({ group: position.group, slide: position.slide - 1 });
    else if (position.group > 0) setPosition({ group: position.group - 1, slide: 0 });
  };
  const nextGroup = () => {
    if (position.group + 1 < groups.length) setPosition({ group: position.group + 1, slide: 0 });
    else onClose();
  };
  const previousGroup = () => {
    if (position.group > 0) setPosition({ group: position.group - 1, slide: 0 });
  };
  const atStart = position.group === 0 && position.slide === 0;

  const fromControl = (target: EventTarget) =>
    target instanceof Element && target.closest('a, button') !== null;

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (fromControl(event.target)) return;
    gesture.current = { x: event.clientX, y: event.clientY };
    heldLong.current = false;
    window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => {
      heldLong.current = true;
      setHolding(true);
    }, HOLD_MS);
  };
  const endGesture = () => {
    window.clearTimeout(holdTimer.current);
    gesture.current = null;
    setHolding(false);
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const startPoint = gesture.current;
    const wasHeld = heldLong.current;
    endGesture();
    if (!startPoint) return;
    const dx = event.clientX - startPoint.x;
    const dy = event.clientY - startPoint.y;
    if (dy > 90 && Math.abs(dy) > Math.abs(dx)) {
      onClose();
      return;
    }
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      // right-to-left page: swiping to the left brings the next story
      if (dx < 0) nextGroup();
      else previousGroup();
      return;
    }
    if (wasHeld || Math.abs(dx) > 12 || Math.abs(dy) > 12) return;
    const box = event.currentTarget.getBoundingClientRect();
    if (box.right - event.clientX < box.width / 3) previous();
    else next();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      next();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      previous();
    } else if (event.key === ' ' && autoplay && !fromControl(event.target)) {
      event.preventDefault();
      setPaused((value) => !value);
    }
  };

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-[#030c08]/90 backdrop-blur-sm data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onKeyDown={onKeyDown}
          className="fixed inset-0 z-[60] flex items-center justify-center gap-5 outline-none data-[state=open]:animate-fade-in"
          onClick={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <DialogPrimitive.Title className="sr-only">{`استوری ${group.label}`}</DialogPrimitive.Title>

          <SideButton label="قبلی" onClick={previous} disabled={atStart}>
            <ChevronRight className="size-5" aria-hidden />
          </SideButton>

          <div
            className="story-stage relative flex h-dvh w-full touch-none select-none flex-col overflow-hidden text-white [-webkit-touch-callout:none] sm:h-[min(92dvh,860px)] sm:w-auto sm:aspect-[9/16] sm:rounded-[28px] sm:shadow-[0_40px_120px_-30px_rgb(0_0_0/0.8)]"
            style={{ '--story': group.color } as CSSProperties}
            // «توقف» also stops the floating and drifting, not just the clock
            data-paused={paused || undefined}
            // pressing and holding pauses: no «save image» menu on top of it
            onContextMenu={(event) => {
              if (!fromControl(event.target)) event.preventDefault();
            }}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={endGesture}
            onPointerLeave={() => {
              if (gesture.current) endGesture();
            }}
          >
            <span aria-hidden className="panel-grid absolute inset-0" />
            <span
              aria-hidden
              className="animate-drift absolute -top-24 -left-20 size-80 rounded-full bg-white/10 blur-3xl"
            />
            {banner ? (
              <BannerCard key={slideKey} picture={banner} onLoaded={() => setLoadedKey(slideKey)} />
            ) : null}
            {/* keeps the white header readable over any colour or artwork */}
            <span
              aria-hidden
              className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/45 via-black/15 to-transparent"
            />

            {/* progress, one bar per slide; it fills from the right like the page reads */}
            <div
              className="relative z-10 flex gap-1 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]"
              aria-hidden
            >
              {group.slides.map((item, index) => (
                <span key={item.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
                  {index < position.slide ? <span className="block size-full bg-white" /> : null}
                  {index === position.slide ? (
                    autoplay ? (
                      <span
                        key={slideKey}
                        className="animate-progress block size-full bg-white"
                        style={
                          {
                            '--progress-duration': `${SLIDE_MS}ms`,
                            animationPlayState: running ? 'running' : 'paused',
                          } as CSSProperties
                        }
                        onAnimationEnd={next}
                      />
                    ) : (
                      <span className="block size-full bg-white" />
                    )
                  ) : null}
                </span>
              ))}
            </div>

            <div className="relative z-10 flex items-center gap-2.5 px-3 pt-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white p-[2px]">
                <StoryAvatarView avatar={group.avatar} color={group.color} size={32} />
              </span>
              <p className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                {group.label}
                <span className="ms-2 text-[11px] font-normal text-white/80">
                  {formatNumberFa(position.slide + 1)} از {formatNumberFa(group.slides.length)}
                </span>
              </p>
              {autoplay ? (
                <button
                  type="button"
                  onClick={() => setPaused((value) => !value)}
                  className="grid size-10 place-items-center rounded-full text-white transition-colors hover:bg-white/15"
                  aria-label={paused ? 'ادامهٔ پخش' : 'توقف'}
                >
                  {paused ? (
                    <Play className="size-[18px]" aria-hidden />
                  ) : (
                    <Pause className="size-[18px]" aria-hidden />
                  )}
                </button>
              ) : null}
              <DialogPrimitive.Close
                className="grid size-10 place-items-center rounded-full text-white transition-colors hover:bg-white/15"
                aria-label="بستن"
              >
                <X className="size-5" aria-hidden />
              </DialogPrimitive.Close>
            </div>

            {banner ? (
              // the banner carries its own words; the heading is for screen readers
              <div className="relative z-10 flex-1">
                <h2 className="sr-only">{slide.title}</h2>
              </div>
            ) : (
              <SlideContent key={slideKey} slide={slide} group={group} />
            )}

            <div className="relative z-10 px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              <Link
                href={slide.cta.href}
                onClick={() => {
                  trackStoryClick(group.id, group.label, slide.id);
                  onClose();
                }}
                className="flex h-13 w-full items-center justify-center gap-2 rounded-pill bg-white text-[15px] font-semibold text-ink shadow-[0_18px_40px_-18px_rgb(0_0_0/0.6)] transition-transform active:scale-[0.98]"
              >
                {slide.cta.label}
                <ArrowLeft className="size-4" aria-hidden />
              </Link>
            </div>
          </div>

          <SideButton label="بعدی" onClick={next}>
            <ChevronLeft className="size-5" aria-hidden />
          </SideButton>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** The arrows beside the card on a computer (a phone taps and swipes instead). */
function SideButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="hidden size-11 shrink-0 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 disabled:invisible sm:grid"
      aria-label={label}
    >
      {children}
    </button>
  );
}

/**
 * A service's own 4:5 banner, shown like a post shared in a story: a card
 * between the header and the button, over a soft glow of the service colour.
 */
function BannerCard({ picture, onLoaded }: { picture: StoryPicture; onLoaded: () => void }) {
  return (
    <span className="absolute inset-x-4 top-[5.75rem] bottom-[6.25rem]">
      <span
        aria-hidden
        className="absolute inset-x-6 top-1/2 h-3/5 -translate-y-1/2 rounded-full bg-white/25 blur-3xl"
      />
      <picture>
        <source srcSet={picture.srcSet} sizes={BANNER_SIZES} />
        {/* width and height stay auto: the card keeps the banner's shape inside both limits */}
        <img
          src={picture.src}
          alt={picture.alt}
          decoding="async"
          draggable={false}
          onLoad={onLoaded}
          onError={onLoaded}
          className="animate-pop absolute inset-0 m-auto h-auto max-h-full w-auto max-w-full rounded-[26px] shadow-[0_30px_70px_-25px_rgb(0_0_0/0.75)] ring-1 ring-white/25"
        />
      </picture>
    </span>
  );
}

function SlideContent({ slide, group }: { slide: StorySlide; group: StoryGroup }) {
  const picture = slide.picture;
  const src = picture ? mediaUrl(picture.src) : null;
  const points = slide.points ?? [];
  const stats = slide.stats ?? [];
  const items = points.map((point, index) => (
    <li
      key={point}
      className="animate-fade-up flex items-center gap-3 rounded-2xl bg-white/12 px-3.5 py-2.5 text-[13px] leading-6 backdrop-blur-sm"
      style={{ animationDelay: `${120 + index * 70}ms` }}
    >
      <span
        aria-hidden
        className={cn(
          'grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-bold',
          slide.ordered ? 'bg-white text-ink' : 'bg-white/20 text-white',
        )}
      >
        {slide.ordered ? formatNumberFa(index + 1) : <Check className="size-4" />}
      </span>
      {point}
    </li>
  ));

  return (
    <div className="animate-fade-up relative z-10 flex min-h-0 flex-1 flex-col justify-end gap-4 px-5 pb-2">
      {picture && src ? (
        picture.shape === 'product' ? (
          <div className="relative mx-auto -mb-2 min-h-24 w-full max-w-[18rem] flex-1">
            <span
              aria-hidden
              className="absolute inset-x-8 bottom-4 h-10 rounded-full bg-black/40 blur-2xl"
            />
            <Image
              src={src}
              alt={picture.alt}
              fill
              sizes="(min-width: 640px) 288px, 70vw"
              className="animate-float object-contain drop-shadow-[0_30px_40px_rgb(0_0_0/0.45)]"
            />
          </div>
        ) : (
          <div className="relative aspect-[1600/840] w-full shrink-0 overflow-hidden rounded-2xl shadow-[0_24px_50px_-24px_rgb(0_0_0/0.7)] ring-1 ring-white/15">
            <Image
              src={src}
              alt={picture.alt}
              fill
              sizes="(min-width: 640px) 420px, 90vw"
              className="object-cover"
            />
          </div>
        )
      ) : (
        // the story's own icon or logo floats in the empty space — when there is room for it
        <div aria-hidden className="relative min-h-0 flex-1 [container-type:size]">
          <span className="absolute inset-0 m-auto hidden size-36 [@container(min-height:9.5rem)]:block">
            <span className="animate-float relative grid size-full place-items-center rounded-full bg-white/10 shadow-[0_30px_60px_-30px_rgb(0_0_0/0.7)] ring-1 ring-white/25 backdrop-blur-md">
              <span className="absolute -inset-8 -z-10 rounded-full bg-[var(--story)] opacity-60 blur-3xl" />
              <StoryAvatarView avatar={group.avatar} color={group.color} size={100} />
            </span>
          </span>
        </div>
      )}

      <div>
        <p className="inline-flex rounded-pill bg-white/15 px-3 py-1 text-[11px] font-medium text-white backdrop-blur">
          {slide.eyebrow}
        </p>
        <h2 className="mt-3 text-[26px] leading-[1.35] font-bold text-balance">{slide.title}</h2>
        {slide.body ? <p className="mt-2.5 text-[14px] leading-7 text-white/90">{slide.body}</p> : null}
      </div>

      {stats.length > 0 ? (
        <dl className={cn('grid gap-2', stats.length > 1 && 'grid-cols-2')}>
          {stats.map((stat, index) => (
            <div
              key={stat.label}
              className="animate-fade-up rounded-2xl bg-white/12 px-3.5 py-3 backdrop-blur-sm"
              style={{ animationDelay: `${120 + index * 70}ms` }}
            >
              <dt className="text-[11px] leading-5 text-white/80">{stat.label}</dt>
              <dd className="mt-1 text-[16px] leading-6 font-bold tabular">
                {stat.value}
                {stat.unit ? (
                  <span className="ms-1 text-[11px] font-normal text-white/80">{stat.unit}</span>
                ) : null}
              </dd>
              {stat.note ? <dd className="mt-1 text-[10.5px] leading-5 text-white/80">{stat.note}</dd> : null}
            </div>
          ))}
        </dl>
      ) : null}

      {items.length > 0 ? (
        slide.ordered ? (
          <ol className="grid gap-2">{items}</ol>
        ) : (
          <ul className="grid gap-2">{items}</ul>
        )
      ) : null}
    </div>
  );
}
