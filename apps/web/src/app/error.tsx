'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-lg font-semibold text-ink">مشکلی پیش آمد</h1>
      <p className="max-w-sm text-[13px] leading-7 text-muted">
        در بارگذاری این صفحه خطایی رخ داد. لطفاً دوباره تلاش کن؛ اگر تکرار شد با پشتیبانی تماس بگیر.
      </p>
      <Button onClick={reset}>تلاش دوباره</Button>
    </div>
  );
}
