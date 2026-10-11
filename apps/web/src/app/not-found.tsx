import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-5xl font-semibold text-ink font-display">۴۰۴</p>
      <h1 className="text-lg font-semibold text-ink">صفحه‌ای که دنبالش بودی پیدا نشد</h1>
      <p className="max-w-sm text-[13px] leading-7 text-muted">
        ممکن است آدرس تغییر کرده باشد یا محصول دیگر در دسترس نباشد.
      </p>
      <div className="mt-2 flex gap-2">
        <Button asChild>
          <Link href="/">صفحه اصلی</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/shop">فروشگاه</Link>
        </Button>
      </div>
    </div>
  );
}
