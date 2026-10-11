'use client';

import type { ColorDto } from '@iphoneha/shared';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ColorSwatch({
  color,
  selected,
  disabled,
  size = 'md',
  onSelect,
  title,
}: {
  color: Pick<ColorDto, 'id' | 'name' | 'hex' | 'code'>;
  selected?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md';
  onSelect?: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={title ?? color.name}
      title={title ?? color.name}
      className={cn(
        'relative grid shrink-0 place-items-center rounded-full border transition-[border-color,transform,box-shadow] duration-300',
        size === 'md' ? 'size-8' : 'size-6',
        selected
          ? 'scale-110 border-brand shadow-[0_0_0_3px_rgb(14_138_92_/_0.15)]'
          : 'border-line hover:scale-110 hover:border-line-strong',
        disabled && 'cursor-not-allowed opacity-35',
      )}
    >
      <span
        className="rounded-full"
        style={{
          backgroundColor: color.hex,
          width: size === 'md' ? 22 : 16,
          height: size === 'md' ? 22 : 16,
          boxShadow: 'inset 0 0 0 1px rgb(8 9 10 / 0.08)',
        }}
      />
      {selected ? (
        <Check
          className={cn(
            'animate-pop absolute text-white mix-blend-difference',
            size === 'md' ? 'size-3.5' : 'size-3',
          )}
          strokeWidth={3}
        />
      ) : null}
    </button>
  );
}
