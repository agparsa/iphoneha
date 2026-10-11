import localFont from 'next/font/local';

/**
 * Persian UI face: Estedad (variable weight 100–900, SIL Open Font License —
 * assets/fonts/OFL-Estedad.txt), self-hosted, no external font CDN. The Arabic
 * subset carries Persian letters and digits, the Latin one the rest.
 */
export const estedad = localFont({
  src: [
    { path: '../assets/fonts/estedad-arabic.woff2', weight: '100 900', style: 'normal' },
    { path: '../assets/fonts/estedad-latin.woff2', weight: '100 900', style: 'normal' },
  ],
  variable: '--font-estedad',
  display: 'swap',
  preload: true,
  fallback: ['system-ui', 'sans-serif'],
});

/** Latin display face used for prices, numbers and English eyebrows. */
export const manrope = localFont({
  src: [{ path: '../assets/fonts/manrope-latin.woff2', weight: '200 800', style: 'normal' }],
  variable: '--font-manrope',
  display: 'swap',
  preload: false,
  fallback: ['system-ui', 'sans-serif'],
});
