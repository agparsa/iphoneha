import { getStorefrontConfig } from '@/lib/api/endpoints';
import { renderShareImage, SHARE_IMAGE_SIZE } from './share-image';

/** The picture a shared product link shows in Telegram, WhatsApp and the rest. */
export const size = SHARE_IMAGE_SIZE;
export const contentType = 'image/png';
export const alt = 'آیفونی‌ها — خرید آیفون آکبند و اصل';
export const revalidate = 3600;

// rendered once per model at build time and refreshed hourly, not on every fetch
export async function generateStaticParams() {
  const config = await getStorefrontConfig();
  return config.models.map((model) => ({ slug: model.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return renderShareImage(slug);
}
