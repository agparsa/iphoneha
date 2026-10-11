'use client';

import { useState } from 'react';
import { Check, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/** Native share sheet where the browser has one, clipboard copy everywhere else. */
export function ShareButton({ title, className }: { title: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function onShare() {
    const url = window.location.href;
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('نشانی صفحه کپی شد');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // the visitor dismissed the share sheet, or the clipboard is blocked
    }
  }

  return (
    <button
      type="button"
      onClick={onShare}
      aria-label={`اشتراک‌گذاری ${title}`}
      title="اشتراک‌گذاری"
      className={cn(
        'grid size-9 place-items-center rounded-full border border-line text-muted transition-colors hover:text-ink',
        className,
      )}
    >
      {copied ? (
        <Check className="size-[17px] text-success" aria-hidden />
      ) : (
        <Share2 className="size-[17px]" strokeWidth={1.8} aria-hidden />
      )}
    </button>
  );
}
