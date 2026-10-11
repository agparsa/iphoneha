import type { Metadata } from 'next';
import { listArticles } from '@/lib/api/endpoints';
import { MAG_PAGE_SIZE, MagazineList } from '@/components/mag/magazine-list';

const TITLE = 'مجله آیفونی‌ها | راهنمای خرید آیفون قسطی با چک و سفته';
const DESCRIPTION =
  'راهنمای خرید آیفون قسطی: خرید با چک صیادی و سفته، محاسبهٔ اقساط، استعلام چک و نکته‌های پیش از خرید گوشی؛ از مجلهٔ آیفونی‌ها.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: '/mag' },
  openGraph: {
    type: 'website',
    url: '/mag',
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: '/brand/og-default.png', width: 1200, height: 630, alt: 'مجلهٔ آیفونی‌ها' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/brand/og-default.png'],
  },
};

export const revalidate = 300;

export default async function MagazinePage() {
  return <MagazineList list={await listArticles(1, MAG_PAGE_SIZE)} />;
}
