import sharp from 'sharp';
import type { SeedColor } from './seed-data';

/**
 * Renders the product mockup used by the seed: a device drawn from the colour's
 * gradient stops on a transparent canvas, so the same file sits cleanly on any
 * surface the storefront uses. Produces a WebP buffer, so the storage/image
 * pipeline is exercised exactly like a real upload.
 */
export async function renderDeviceImage(
  color: SeedColor,
  size: { width: number; height: number } = { width: 1000, height: 1300 },
): Promise<{ data: Buffer; width: number; height: number }> {
  const stops = color.stops.map((s) => `<stop offset="${s.offset}%" stop-color="${s.color}"/>`).join('');
  const wall = color.wall.map((s) => `<stop offset="${s.offset}%" stop-color="${s.color}"/>`).join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 1000 1300">
  <defs>
    <linearGradient id="body" x1="0.1" y1="0" x2="0.9" y2="1">${stops}</linearGradient>
    <radialGradient id="screen" cx="0.28" cy="0.12" r="1.1">${wall}</radialGradient>
    <linearGradient id="gloss" x1="0" y1="0" x2="1" y2="1">
      <stop offset="30%" stop-color="rgba(255,255,255,0)"/>
      <stop offset="46%" stop-color="rgba(255,255,255,0.18)"/>
      <stop offset="60%" stop-color="rgba(255,255,255,0)"/>
    </linearGradient>
    <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="18"/>
    </filter>
  </defs>
  <ellipse cx="500" cy="1118" rx="228" ry="22" fill="rgba(12,16,22,0.13)" filter="url(#soft)"/>
  <g>
    <rect x="285" y="170" width="430" height="920" rx="58" ry="60" fill="url(#body)"/>
    <rect x="285" y="170" width="430" height="920" rx="58" ry="60" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="2"/>
    <rect x="298" y="183" width="404" height="894" rx="48" ry="50" fill="url(#screen)"/>
    <rect x="298" y="183" width="404" height="894" rx="48" ry="50" fill="url(#gloss)"/>
    <rect x="437" y="205" width="126" height="32" rx="16" fill="#04060a"/>
    <rect x="430" y="1044" width="140" height="6" rx="3" fill="rgba(255,255,255,0.55)"/>
    <rect x="713" y="380" width="6" height="96" rx="3" fill="rgba(255,255,255,0.35)"/>
    <rect x="281" y="350" width="6" height="58" rx="3" fill="rgba(255,255,255,0.3)"/>
    <rect x="281" y="428" width="6" height="94" rx="3" fill="rgba(255,255,255,0.3)"/>
  </g>
</svg>`;

  const result = await sharp(Buffer.from(svg))
    .webp({ quality: 88, alphaQuality: 100 })
    .toBuffer({ resolveWithObject: true });
  return { data: result.data, width: result.info.width, height: result.info.height };
}
