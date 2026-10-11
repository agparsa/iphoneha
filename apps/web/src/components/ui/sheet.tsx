'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

function SheetOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        'fixed inset-0 z-50 bg-ink/25 backdrop-blur-[2px]',
        'data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out',
        className,
      )}
      {...props}
    />
  );
}

const sheetVariants = cva('fixed z-50 flex flex-col bg-canvas', {
  variants: {
    side: {
      bottom:
        'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[1.75rem] border-t border-line data-[state=open]:animate-sheet-up data-[state=closed]:animate-sheet-down',
      end: 'inset-y-0 end-0 w-full max-w-md border-s border-line [--ih-panel-offset:100%] rtl:[--ih-panel-offset:-100%] data-[state=open]:animate-panel-in data-[state=closed]:animate-panel-out',
      start:
        'inset-y-0 start-0 w-full max-w-md border-e border-line [--ih-panel-offset:-100%] rtl:[--ih-panel-offset:100%] data-[state=open]:animate-panel-in data-[state=closed]:animate-panel-out',
    },
  },
  defaultVariants: { side: 'bottom' },
});

interface SheetContentProps
  extends React.ComponentProps<typeof DialogPrimitive.Content>, VariantProps<typeof sheetVariants> {
  title: string;
  description?: string;
  /** hide the built-in close button (e.g. a full-screen flow with its own) */
  hideClose?: boolean;
}

function SheetContent({
  className,
  side,
  title,
  description,
  hideClose,
  children,
  ...props
}: SheetContentProps) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Content className={cn(sheetVariants({ side }), className)} {...props}>
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-base font-semibold text-ink">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1 text-xs text-muted">
                {description}
              </DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            )}
          </div>
          {hideClose ? null : (
            <DialogPrimitive.Close
              className="-me-1 grid size-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink"
              aria-label="بستن"
            >
              <X className="size-[18px]" />
            </DialogPrimitive.Close>
          )}
        </div>
        {children}
      </DialogPrimitive.Content>
    </SheetPortal>
  );
}

export { Sheet, SheetTrigger, SheetClose, SheetContent };
