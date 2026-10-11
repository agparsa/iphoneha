'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { formatNumberFa, type HeroSlideDto } from '@iphoneha/shared';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useStoreConfig } from '@/providers/store-config-provider';
import { ProductImage } from './product-image';
import { RatingStars } from './rating-stars';

export function HeroCarousel({ slides }: { slides: HeroSlideDto[] }) {
  const [index, setIndex] = useState(0);
  // the first slide's phone is simply there (the page's largest paint); later
  // slides fade in
  const [changed, setChanged] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [paused, setPaused] = useState(false);
  const {
    store: { warrantyMonths, name: storeName },
  } = useStoreConfig();

  useEffect(() => {
    if (slides.length < 2 || paused) return;
    timer.current = setInterval(() => {
      setChanged(true);
      setIndex((i) => (i + 1) % slides.length);
    }, 7000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [slides.length, paused]);

  if (slides.length === 0) return null;
  const slide = slides[index]!;
  const dark = slide.theme === 'dark';

  return (
    <section
      className={cn(
        'relative isolate overflow-hidden rounded-[1.75rem] border transition-colors duration-700',
        dark ? 'border-brand-deep bg-brand-deep text-white' : 'border-line bg-surface text-ink',
      )}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
    >
      {dark ? <span aria-hidden className="panel-grid absolute inset-0 -z-10" /> : null}
      <span
        aria-hidden
        className={cn(
          'animate-drift absolute -top-32 -left-24 -z-10 size-[26rem] rounded-full blur-3xl transition-colors duration-700',
          dark ? 'bg-brand/40' : 'bg-brand/10',
        )}
      />
      <span
        aria-hidden
        className={cn(
          'animate-drift-slow absolute -right-20 -bottom-40 -z-10 size-96 rounded-full blur-3xl transition-colors duration-700',
          dark ? 'bg-brand-mint/10' : 'bg-brand-mint/40',
        )}
      />

      <div className="grid items-center gap-6 p-6 pb-16 sm:p-8 sm:pb-16 md:grid-cols-2 md:gap-4 md:p-12 md:pb-12">
        <div key={slide.id} className={changed ? 'animate-fade-up' : undefined}>
          {slide.eyebrow ? (
            <p className={cn('eyebrow', dark && 'text-brand-mint/80')}>{slide.eyebrow}</p>
          ) : null}
          {/* an h2: the page's one h1 names the store, not whichever slide is showing */}
          <h2 className="mt-3 text-3xl font-semibold leading-[1.25] text-balance sm:text-4xl md:text-[2.75rem]">
            {slide.title}
          </h2>
          {slide.subtitle ? (
            <p
              className={cn(
                'mt-4 max-w-md text-[13px] leading-7 sm:text-sm',
                dark ? 'text-white/70' : 'text-muted',
              )}
            >
              {slide.subtitle}
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
            {slide.product?.ratingAvg ? (
              <RatingStars
                value={slide.product.ratingAvg}
                count={slide.product.ratingCount}
                size="md"
                className={dark ? '[&>span:last-child]:text-white/70' : undefined}
              />
            ) : null}
            {slide.product && slide.product.colors.length > 1 ? (
              <span className="flex items-center gap-1.5">
                <span className="flex items-center -space-x-1.5 space-x-reverse" aria-hidden>
                  {slide.product.colors.slice(0, 5).map((color) => (
                    <span
                      key={color.id}
                      className={cn('size-4 rounded-full ring-2', dark ? 'ring-ink' : 'ring-surface')}
                      style={{ backgroundColor: color.hex, boxShadow: 'inset 0 0 0 1px rgb(8 9 10 / 0.12)' }}
                    />
                  ))}
                </span>
                <span className={cn('text-[11px]', dark ? 'text-white/60' : 'text-muted')}>
                  {formatNumberFa(slide.product.colors.length)} رنگ
                </span>
              </span>
            ) : null}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button
              asChild
              size="lg"
              variant={dark ? 'outline' : 'primary'}
              className={cn(
                'shine relative hover:-translate-y-0.5',
                dark && 'border-transparent bg-brand-mint text-brand-deep hover:bg-white',
              )}
              style={dark ? ({ '--shine': 'rgb(255 255 255 / 0.7)' } as CSSProperties) : undefined}
            >
              <Link href={slide.href}>
                {slide.ctaLabel}
                {/* «بیشتر بدانید» alone says nothing out of context: name the model */}
                <span className="sr-only"> — {slide.title}</span>
                <ArrowLeft className="size-4" aria-hidden />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="ghost"
              className={dark ? 'text-white hover:bg-white/10' : 'text-ink hover:bg-canvas'}
            >
              <Link href="/installments">خرید قسطی</Link>
            </Button>
          </div>

          <dl
            className={cn(
              'mt-8 grid max-w-md grid-cols-2 gap-x-4 gap-y-4 border-t pt-5 sm:grid-cols-3',
              dark ? 'border-white/15' : 'border-line',
            )}
          >
            <div>
              <dt className={cn('text-[11px]', dark ? 'text-white/50' : 'text-muted')}>شروع قیمت</dt>
              <dd className="mt-1 whitespace-nowrap text-[13px] font-semibold tabular">
                {slide.price ? formatNumberFa(slide.price) : '—'}
                <span className={cn('ms-1 text-[10px] font-normal', dark ? 'text-white/50' : 'text-muted')}>
                  تومان
                </span>
              </dd>
            </div>
            {slide.monthly ? (
              <div>
                <dt className={cn('text-[11px]', dark ? 'text-white/50' : 'text-muted')}>قسطی از ماهانه</dt>
                <dd className="mt-1 whitespace-nowrap text-[13px] font-semibold tabular">
                  {formatNumberFa(slide.monthly)}
                  <span className={cn('ms-1 text-[10px] font-normal', dark ? 'text-white/50' : 'text-muted')}>
                    تومان
                  </span>
                </dd>
              </div>
            ) : null}
            {warrantyMonths > 0 ? (
              <div className="col-span-2 sm:col-span-1">
                <dt className={cn('text-[11px]', dark ? 'text-white/50' : 'text-muted')}>گارانتی</dt>
                <dd className="mt-1 inline-flex items-center gap-1 text-[13px] font-semibold">
                  <ShieldCheck className="size-3.5" aria-hidden />
                  {formatNumberFa(warrantyMonths)} ماه {storeName}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="relative order-first aspect-square max-h-[22rem] w-full md:order-last md:aspect-auto md:h-[28rem] md:max-h-none">
          <span
            aria-hidden
            className={cn(
              'absolute inset-[12%] rounded-full blur-3xl transition-colors duration-700',
              dark ? 'bg-brand-mint/20' : 'bg-brand/15',
            )}
          />
          <span
            aria-hidden
            className={cn(
              'animate-float-shadow absolute bottom-[3%] left-1/2 h-5 w-2/5 -translate-x-1/2 rounded-[50%] blur-xl',
              dark ? 'bg-black/45' : 'bg-ink/20',
            )}
          />
          <div className="animate-float absolute inset-0">
            <ProductImage
              key={slide.image ?? slide.id}
              src={slide.image}
              alt={slide.title}
              sizes="(min-width: 768px) 520px, 90vw"
              priority
              className={cn('p-2 drop-shadow-[0_28px_40px_rgb(8_9_10_/_0.22)]', changed && 'gallery-in')}
            />
          </div>
        </div>
      </div>

      {slides.length > 1 ? (
        <div className="absolute bottom-5 start-5 flex items-center sm:start-7 md:bottom-7 md:start-11">
          {slides.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setChanged(true);
                setIndex(i);
              }}
              aria-label={`اسلاید ${i + 1}: ${item.title}`}
              aria-current={i === index}
              // a 24px target around a small dot
              className="grid h-6 min-w-6 place-items-center"
            >
              <span
                className={cn(
                  'block h-1.5 rounded-pill transition-all',
                  i === index ? 'w-7' : 'w-1.5',
                  dark
                    ? i === index
                      ? 'bg-white'
                      : 'bg-white/30'
                    : i === index
                      ? 'bg-ink'
                      : 'bg-muted-faint',
                )}
              />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
