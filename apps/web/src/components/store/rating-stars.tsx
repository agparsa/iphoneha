import { useId } from 'react';
import { formatDecimalFa, formatNumberFa } from '@iphoneha/shared';
import { cn } from '@/lib/utils';

const STAR =
  'M12 2.6l2.9 5.88 6.5.95-4.7 4.58 1.11 6.47L12 17.42 6.19 20.48 7.3 14.01 2.6 9.43l6.5-.95L12 2.6z';
/** the stars are drawn on a 24-unit grid with a 4-unit gap, then scaled to the requested pixel size */
const UNIT = 24;
const GAP = 4;
const WIDTH = 5 * UNIT + 4 * GAP;

/**
 * Half-step star rating as ONE small svg (a star path reused five times, and
 * the golden part clipped to the rating) — a page with twenty ratings used to
 * carry two hundred separate icons. The stars are decorative: the wrapper
 * carries the label, so screen readers hear «۴.۸ از ۵» once.
 */
export function RatingStars({
  value,
  count,
  size = 'sm',
  showCount = true,
  className,
}: {
  value: number | null;
  count?: number;
  size?: 'sm' | 'md';
  showCount?: boolean;
  className?: string;
}) {
  const id = useId();
  if (value === null || value <= 0) return null;
  const rounded = Math.round(value * 10) / 10;
  const px = size === 'md' ? 14 : 11;
  const full = Math.floor(rounded);
  const partial = rounded - full;
  // the rating fills from the right, the way the page reads
  const filled = full * (UNIT + GAP) + partial * UNIT;
  const starId = `${id}s`;
  const clipId = `${id}c`;

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        role="img"
        aria-label={`${formatDecimalFa(rounded)} از ۵${count ? ` بر پایه ${formatNumberFa(count)} نظر` : ''}`}
        className="inline-flex"
      >
        <svg
          width={(WIDTH / UNIT) * px}
          height={px}
          viewBox={`0 0 ${WIDTH} ${UNIT}`}
          fill="currentColor"
          className="block"
          aria-hidden
        >
          <defs>
            <path id={starId} d={STAR} />
            <clipPath id={clipId}>
              <rect x={WIDTH - filled} y="0" width={filled} height={UNIT} />
            </clipPath>
          </defs>
          <g className="text-hairline-ink">
            {[0, 1, 2, 3, 4].map((index) => (
              <use key={index} href={`#${starId}`} x={WIDTH - (index + 1) * UNIT - index * GAP} />
            ))}
          </g>
          <g className="text-warning" clipPath={`url(#${clipId})`}>
            {[0, 1, 2, 3, 4].map((index) => (
              <use key={index} href={`#${starId}`} x={WIDTH - (index + 1) * UNIT - index * GAP} />
            ))}
          </g>
        </svg>
      </span>
      <span className={cn('tabular text-muted', size === 'md' ? 'text-[12px]' : 'text-[11px]')}>
        {formatDecimalFa(rounded)}
        {showCount && count ? <span className="text-muted-faint"> ({formatNumberFa(count)})</span> : null}
      </span>
    </span>
  );
}
