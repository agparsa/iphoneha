'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, type = 'text', ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        'h-12 w-full rounded-2xl border border-line bg-canvas px-4 text-sm text-ink placeholder:text-muted-faint',
        'transition-colors focus:border-ink-muted focus:outline-none disabled:bg-surface disabled:text-muted',
        'aria-invalid:border-danger',
        className,
      )}
      {...props}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 3, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        className={cn(
          'w-full rounded-2xl border border-line bg-canvas px-4 py-3 text-sm text-ink placeholder:text-muted-faint',
          'transition-colors focus:border-ink-muted focus:outline-none aria-invalid:border-danger',
          className,
        )}
        {...props}
      />
    );
  },
);
