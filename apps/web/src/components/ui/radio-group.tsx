'use client';

import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { cn } from '@/lib/utils';

const RadioGroup = RadioGroupPrimitive.Root;

function RadioCard({
  className,
  children,
  value,
  disabled,
  id,
}: {
  className?: string;
  children: React.ReactNode;
  value: string;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <label
      htmlFor={id ?? value}
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-canvas p-4 transition-colors',
        'has-[[data-state=checked]]:border-ink has-[[data-state=checked]]:bg-surface-2',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <RadioGroupPrimitive.Item
        id={id ?? value}
        value={value}
        disabled={disabled}
        className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-line-strong data-[state=checked]:border-ink"
      >
        <RadioGroupPrimitive.Indicator className="size-2.5 rounded-full bg-ink" />
      </RadioGroupPrimitive.Item>
      <div className="min-w-0 flex-1">{children}</div>
    </label>
  );
}

export { RadioGroup, RadioCard };
