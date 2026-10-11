import { cn } from '@/lib/utils';

/*
 * The green brand pack (monogram «آ»). Plain <img>: the files are small static
 * vectors that next/image would only pass through.
 */

/** Monogram + «آیفونی‌ها» wordmark; `dark` is for dark-green backgrounds. */
export function BrandLogo({ tone = 'light', className }: { tone?: 'light' | 'dark'; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static vector logo
    <img
      src={tone === 'dark' ? '/brand/logo-dark.svg' : '/brand/logo-light.svg'}
      alt="آیفونی‌ها"
      width={722}
      height={210}
      className={cn('h-10 w-auto', className)}
      decoding="async"
    />
  );
}

/** The «آ» monogram on its own (app icons, compact headers). */
export function BrandMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static vector logo
    <img
      src="/brand/mark.svg"
      alt=""
      aria-hidden
      width={128}
      height={128}
      className={cn('size-10', className)}
    />
  );
}
