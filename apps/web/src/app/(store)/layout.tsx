import { getStorefrontConfig } from '@/lib/api/endpoints';
import { GoogleAnalytics } from '@/components/analytics/google-analytics';
import { BottomNav } from '@/components/store/bottom-nav';
import { CartSheet } from '@/components/store/cart-sheet';
import { SiteFooter } from '@/components/store/site-footer';
import { SiteHeader } from '@/components/store/site-header';

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const config = await getStorefrontConfig();

  return (
    <div className="flex min-h-dvh flex-col">
      <GoogleAnalytics measurementId={config.seo?.ga4MeasurementId} />
      <SiteHeader />
      <main className="flex-1 pb-20 lg:pb-0">{children}</main>
      <SiteFooter config={config} />
      <BottomNav />
      <CartSheet />
    </div>
  );
}
