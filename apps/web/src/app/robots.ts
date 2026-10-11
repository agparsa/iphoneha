import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/utils';

/**
 * Everything a buyer can browse is crawlable; anything personal or
 * transactional is not. `/shop` itself is allowed, but filtered variants of it
 * carry `robots: noindex, follow` in their metadata so the index doesn't fill
 * up with near-duplicate facet pages.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        // the product feeds for Torob and Emalls are the one public part of /api
        allow: ['/', '/api/feeds/'],
        disallow: ['/account', '/checkout', '/cart', '/login', '/wishlist', '/admin', '/api', '/print'],
      },
      // image crawlers should still see the product photos
      {
        userAgent: 'Googlebot-Image',
        allow: ['/media/', '/brand/', '/covers/'],
        disallow: ['/admin', '/api'],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    // Yandex reads `Host` and wants a bare hostname, not a URL
    host: new URL(absoluteUrl('/')).host,
  };
}
