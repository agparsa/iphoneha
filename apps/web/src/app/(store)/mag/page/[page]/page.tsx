import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { formatNumberFa } from '@iphoneha/shared';
import { listArticles } from '@/lib/api/endpoints';
import { MAG_PAGE_SIZE, MagazineList, magPageHref } from '@/components/mag/magazine-list';

type Params = Promise<{ page: string }>;

function pageNumber(raw: string): number | null {
  const page = Number(raw);
  return Number.isInteger(page) && page >= 1 && page <= 1000 ? page : null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const page = pageNumber((await params).page);
  if (!page) return {};
  const title = `مجله آیفونی‌ها — صفحهٔ ${formatNumberFa(page)}`;
  return {
    title: { absolute: title },
    alternates: { canonical: magPageHref(page) },
    openGraph: {
      type: 'website',
      url: magPageHref(page),
      title,
      images: [{ url: '/brand/og-default.png', width: 1200, height: 630, alt: 'مجلهٔ آیفونی‌ها' }],
    },
  };
}

// older pages render on the first visit and are then cached like the first one
export const revalidate = 300;
export function generateStaticParams(): { page: string }[] {
  return [];
}

export default async function MagazinePageN({ params }: { params: Params }) {
  const page = pageNumber((await params).page);
  if (!page) notFound();
  if (page === 1) permanentRedirect('/mag');
  const list = await listArticles(page, MAG_PAGE_SIZE);
  if (page > list.totalPages) notFound();
  return <MagazineList list={list} />;
}
