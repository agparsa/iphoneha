import type { Metadata, Viewport } from 'next';
import { getStorefrontConfig } from '@/lib/api/endpoints';
import { estedad, manrope } from '@/lib/fonts';
import { jsonLdScript, organizationLd, webSiteLd } from '@/lib/seo';
import { AppProviders } from '@/providers/app-providers';
import '@/styles/globals.css';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

const baseMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'آیفونی‌ها | خرید آیفون آکبند و اصل با ضمانت اصالت',
    template: '%s | آیفونی‌ها',
  },
  // stays true whatever the settings say: specific warranty months and credit
  // services are only named on pages rendered from the live settings
  description:
    'خرید آیفون آکبند و اورجینال با ضمانت اصالت کالا، گارانتی و امکان خرید اقساطی؛ ارسال به سراسر ایران.',
  applicationName: 'آیفونی‌ها',
  keywords: [
    'خرید آیفون',
    'آیفون ۱۸ پرو',
    'آیفون ۱۷',
    'iPhone 18 Pro Max',
    'آیفون قسطی',
    'آیفون آکبند',
    'iPhone Air',
  ],
  // no site-wide canonical: every indexable page names its own, and a default
  // here would be inherited by any page that forgets to
  openGraph: {
    type: 'website',
    locale: 'fa_IR',
    siteName: 'آیفونی‌ها',
    url: SITE_URL,
    images: [
      { url: '/brand/og-default.png', width: 1200, height: 630, alt: 'آیفونی‌ها — خرید آیفون آکبند و اصل' },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'آیفونی‌ها | خرید آیفون آکبند و اصل',
    description: 'آیفون آکبند و اورجینال با ضمانت اصالت، گارانتی و امکان خرید اقساطی.',
    images: ['/brand/og-default.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  formatDetection: { telephone: false },
};

/**
 * The search consoles' ownership codes come from the admin settings (سئو و
 * آمار), so the owner can verify the site without a new release.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { seo } = await getStorefrontConfig();
  const verification: NonNullable<Metadata['verification']> = {
    ...(seo?.googleVerification ? { google: seo.googleVerification } : {}),
    ...(seo?.yandexVerification ? { yandex: seo.yandexVerification } : {}),
    ...(seo?.bingVerification ? { other: { 'msvalidate.01': seo.bingVerification } } : {}),
  };
  return Object.keys(verification).length > 0 ? { ...baseMetadata, verification } : baseMetadata;
}

export const viewport: Viewport = {
  themeColor: '#0e8a5c',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const config = await getStorefrontConfig();

  return (
    <html lang="fa" dir="rtl" className={`${estedad.variable} ${manrope.variable}`} suppressHydrationWarning>
      <head>
        {/* Organization + WebSite: one copy for the whole site, so every page inherits it */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={jsonLdScript([
            organizationLd(config.store, config),
            webSiteLd(config.store),
          ])}
        />
      </head>
      <body className="min-h-dvh bg-canvas antialiased">
        <AppProviders config={config} initialUser={null} initialCart={null}>
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
