import Image from 'next/image';
import { PAYMENT_METHOD_INFO, type PaymentMethod } from '@iphoneha/shared';
import { cn } from '@/lib/utils';

/**
 * Brand tile for a payment service; services without artwork get a text tile.
 * Decorative by default: every place it appears also prints the service's
 * name, and a repeated alt would make screen readers say it twice. Pass
 * `label` where the logo stands on its own.
 */
export function PaymentLogo({
  method,
  size = 44,
  rounded = 'xl',
  className,
  label,
}: {
  method: PaymentMethod;
  size?: number;
  rounded?: 'xl' | 'full';
  className?: string;
  /** accessible name when no visible text names the service */
  label?: string;
}) {
  const info = PAYMENT_METHOD_INFO[method];
  const shape = rounded === 'full' ? 'rounded-full' : 'rounded-2xl';

  if (!info.logo) {
    return (
      <span
        className={cn(
          'grid shrink-0 place-items-center text-[11px] font-semibold text-white',
          shape,
          className,
        )}
        style={{ width: size, height: size, backgroundColor: info.color }}
        aria-hidden
      >
        {info.name.slice(0, 2)}
      </span>
    );
  }

  return (
    <span
      className={cn('relative block shrink-0 overflow-hidden border border-line', shape, className)}
      style={{ width: size, height: size }}
    >
      <Image
        src={info.logo}
        alt={label ?? ''}
        width={size}
        height={size}
        className="size-full object-cover"
      />
    </span>
  );
}
