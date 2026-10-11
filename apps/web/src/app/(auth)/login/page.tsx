import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginFlow } from '@/components/store/login-flow';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata: Metadata = {
  title: 'ورود یا ثبت‌نام',
  description: 'ورود به حساب آیفونی‌ها با شماره موبایل و کد تأیید یک‌بارمصرف.',
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full max-w-sm rounded-panel" />}>
      <LoginFlow />
    </Suspense>
  );
}
