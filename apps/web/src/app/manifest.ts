import type { MetadataRoute } from 'next';

/** Web app manifest — colours and icons from the green brand pack. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'آیفونی‌ها — فروش آیفون آکبند',
    short_name: 'آیفونی‌ها',
    lang: 'fa',
    dir: 'rtl',
    start_url: '/',
    display: 'standalone',
    theme_color: '#0e8a5c',
    background_color: '#f5f2ec',
    icons: [
      { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/brand/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
