'use client';

import { forwardRef } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background-color,color,border-color,opacity,box-shadow,transform] disabled:pointer-events-none disabled:opacity-45 active:scale-[0.99] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-brand-strong text-white shadow-[0_10px_24px_-14px_rgb(14_138_92_/_0.9)] hover:bg-brand-ink',
        dark: 'bg-ink text-white hover:bg-ink-soft',
        outline: 'border border-line-strong bg-canvas text-ink hover:bg-surface',
        soft: 'bg-surface text-ink hover:bg-surface-3',
        ghost: 'text-ink hover:bg-surface',
        danger: 'bg-danger text-white hover:opacity-90',
        success: 'bg-success text-white hover:opacity-90',
        link: 'text-ink underline underline-offset-4 hover:text-muted',
      },
      size: {
        sm: 'h-9 rounded-pill px-4 text-[13px] [&_svg]:size-4',
        md: 'h-11 rounded-pill px-5 text-sm [&_svg]:size-4',
        lg: 'h-13 rounded-pill px-7 text-[15px] [&_svg]:size-5',
        icon: 'size-10 rounded-full [&_svg]:size-[18px]',
        'icon-sm': 'size-8 rounded-full [&_svg]:size-4',
      },
      block: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', size: 'md', block: false },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, block, asChild, loading, children, disabled, ...props },
  ref,
) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants({ variant, size, block }), className)}
      disabled={disabled ?? loading}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          {children}
        </>
      ) : (
        children
      )}
    </Comp>
  );
});

export { buttonVariants };
