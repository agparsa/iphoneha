import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { getProduct } from '@/lib/api/endpoints';

/*
 * The picture a shared product link shows in Telegram, WhatsApp and the rest:
 * the phone in its colour on the dark-green brand panel, with the logo and the
 * model's name. The Persian wordmark is vector paths inside the logo, so no
 * Persian text has to be shaped here; the model name is its Latin name.
 * Messaging apps don't all read WebP or transparency, so this is a flat PNG.
 */

export const SHARE_IMAGE_SIZE = { width: 1200, height: 630 };

const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
const MEDIA_ORIGIN = process.env.MEDIA_ORIGIN ?? `${API_URL}/api/media`;

// the white-on-dark logo, read once
const logo = readFile(path.join(process.cwd(), 'public/brand/logo-dark.svg')).then(
  (svg) => `data:image/svg+xml;base64,${svg.toString('base64')}`,
);

/** The product photo as a PNG data URL (the stored photos are WebP). */
async function photoPng(url: string): Promise<string | null> {
  try {
    const source = url.startsWith('/media/') ? `${MEDIA_ORIGIN}/${url.slice('/media/'.length)}` : url;
    const response = await fetch(source, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const png = await sharp(Buffer.from(await response.arrayBuffer()))
      .resize({ width: 520, height: 560, fit: 'inside' })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    return null;
  }
}

/** Rendered by opengraph-image.tsx and twitter-image.tsx beside this file. */
export async function renderShareImage(slug: string): Promise<ImageResponse> {
  const product = await getProduct(slug);
  const image = product?.images.find((item) => item.kind === 'DEVICE') ?? product?.images[0] ?? null;
  const [photo, logoData] = await Promise.all([image ? photoPng(image.url) : null, logo]);

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        background: 'linear-gradient(120deg, #0e8a5c 0%, #0c2b21 55%, #0a241b 100%)',
        padding: '0 72px',
      }}
    >
      <div
        style={{
          display: 'flex',
          width: 520,
          height: 560,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- satori renders plain <img>
          <img src={photo} alt="" style={{ maxWidth: 520, maxHeight: 560, objectFit: 'contain' }} />
        ) : null}
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          flex: 1,
          gap: 28,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- satori renders plain <img> */}
        <img src={logoData} alt="" width={433} height={126} />
        <div style={{ display: 'flex', fontSize: 60, fontWeight: 700, color: '#ffffff', textAlign: 'right' }}>
          {product?.nameEn ?? 'iPhone'}
        </div>
      </div>
    </div>,
    SHARE_IMAGE_SIZE,
  );
}
