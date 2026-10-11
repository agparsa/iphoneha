import path from 'node:path';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

// The monorepo keeps a single .env at the root; load it before Next reads env vars.
loadEnvConfig(path.resolve(process.cwd(), '../..'));

const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
const mediaOrigin = process.env.MEDIA_ORIGIN ?? `${apiUrl}/api/media`;

const isProduction = process.env.NODE_ENV === 'production';
// the public address of the site decides the TLS-only directives, not the build mode:
// a production build served over plain http (a local check) must keep working
const servesHttps = (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.WEB_URL ?? '').startsWith('https://');

/**
 * What a page of the site may load. Scripts: the site's own and Google's tag
 * (inline is needed by Next's own hydration; the pages are static/ISR, so a
 * per-request nonce is not an option). Everything else is locked to the site
 * itself, plus the enamad seal image and the analytics beacons.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? '' : " 'unsafe-eval'"} https://www.googletagmanager.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://trustseal.enamad.ir https://*.google-analytics.com https://*.googletagmanager.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com",
  "media-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  ...(servesHttps ? ['upgrade-insecure-requests'] : []),
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@iphoneha/shared'],
  poweredByHeader: false,
  compress: true,
  // icon and helper barrels are tree-shaken per import instead of pulling the
  // whole package into the first-load bundle
  experimental: {
    optimizePackageImports: ['lucide-react', '@iphoneha/shared'],
    // The stylesheet has grown to ~100 KB; inlined it was written into every
    // page twice more (the RSC payload carries it too) — a third of the HTML.
    // As a file it is fetched once, compressed, and cached across pages.
    inlineCss: false,
  },
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  images: {
    formats: ['image/avif', 'image/webp'],
    // Product images are served same-origin through the /media rewrite below.
    localPatterns: [
      { pathname: '/media/**' },
      { pathname: '/brand/**' },
      { pathname: '/payments/**' },
      // magazine covers and the instalment pages' share images
      { pathname: '/covers/**' },
    ],
  },
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${apiUrl}/api/:path*` },
      { source: '/media/:path*', destination: `${mediaOrigin}/:path*` },
    ];
  },
  async headers() {
    return [
      {
        // every page and asset of the site; /api answers come from the API with its own headers
        source: '/((?!api/).*)',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // only meaningful over HTTPS, and only once the domain really serves TLS
          ...(servesHttps
            ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
            : []),
        ],
      },
      {
        // product photos are content-addressed by the API and safe to cache long
        source: '/media/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000, stale-while-revalidate=86400' }],
      },
      {
        source: '/brand/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000, immutable' }],
      },
      {
        // redrawn only by a release, which may keep the file name
        source: '/covers/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' }],
      },
    ];
  },
};

export default nextConfig;
