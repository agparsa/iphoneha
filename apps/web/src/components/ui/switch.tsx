'use client';

import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-pill border border-line bg-surface-3 transition-colors',
        'data-[state=checked]:border-ink data-[state=checked]:bg-ink',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-5 rounded-full bg-white shadow-hairline transition-transform data-[state=checked]:-translate-x-5 rtl:data-[state=checked]:translate-x-5 rtl:data-[state=unchecked]:translate-x-0" />
    </SwitchPrimitive.Root>
  );
}
