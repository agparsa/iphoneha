import type { CSSProperties } from 'react';
import { FileSignature, ScrollText } from 'lucide-react';
import type { CreditMethod, InstallmentMethod } from '@iphoneha/shared';
import { cn } from '@/lib/utils';
import { PaymentLogo } from '@/components/store/payment-logo';

/** The tile for a plan: the service's own logo, or an icon in the plan colour for the store's plans. */
export function PlanIcon({
  method,
  service,
  color,
  size = 28,
  className,
}: {
  method?: CreditMethod;
  service?: InstallmentMethod;
  color: string;
  size?: number;
  className?: string;
}) {
  if (service) return <PaymentLogo method={service} size={size} rounded="full" className={className} />;
  const Icon = method === 'SAFTE' ? ScrollText : FileSignature;
  return (
    <span
      aria-hidden
      style={{ '--plan': color, width: size, height: size } as CSSProperties}
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--plan)_14%,white)] text-[var(--plan)]',
        className,
      )}
    >
      <Icon style={{ width: size * 0.55, height: size * 0.55 }} />
    </span>
  );
}
