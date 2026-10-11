import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { getStorefrontConfig } from '@/lib/api/endpoints';
import { GoogleAnalytics } from '@/components/analytics/google-analytics';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // a visit can start on the login page (a link in an SMS) and go on to the store
  const config = await getStorefrontConfig();

  return (
    <div className="flex min-h-dvh flex-col">
      <GoogleAnalytics measurementId={config.seo?.ga4MeasurementId} />
      <header className="border-b border-line">
        <div className="container-page flex h-16 items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
            <ArrowRight className="size-4" aria-hidden />
            بازگشت به فروشگاه
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-12">{children}</main>
    </div>
  );
}
