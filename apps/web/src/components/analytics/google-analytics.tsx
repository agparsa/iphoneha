import Script from 'next/script';
import { CallTracker } from './call-tracker';

/**
 * Google Analytics 4, only when the owner set a measurement id (admin → سئو و
 * آمار). The tiny queue runs as the HTML is parsed, so an event a component
 * sends while the page hydrates is kept; the tag itself loads after the page
 * is interactive and never competes with the first paint. Page views on
 * client-side navigations come from GA's own history tracking.
 */
export function GoogleAnalytics({ measurementId }: { measurementId: string | null | undefined }) {
  // the admin validates the id; checked again because it is written into a script
  if (!measurementId || !/^G-[A-Z0-9]{4,20}$/.test(measurementId)) return null;

  const queue = [
    'window.dataLayer=window.dataLayer||[];',
    'window.gtag=window.gtag||function(){dataLayer.push(arguments);};',
    "gtag('js',new Date());",
    `gtag('config',${JSON.stringify(measurementId)});`,
  ].join('');

  return (
    <>
      <script id="ga4-queue" dangerouslySetInnerHTML={{ __html: queue }} />
      <Script
        id="ga4-tag"
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      <CallTracker />
    </>
  );
}
