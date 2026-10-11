import type { MetadataRoute } from 'next';
import { getStorefrontConfig, getStorefrontSitemap } from '@/lib/api/endpoints';
import { CREDIT_PAGES, offeredMethods } from '@/lib/credit';
import { absoluteUrl, mediaUrl } from '@/lib/utils';

export const revalidate = 3600;

/**
 * Product URLs carry their real `updatedAt`, so a crawler only re-fetches a
 * model whose price, photos or text actually changed. Private routes
 * (cart, checkout, account, wishlist) are deliberately absent — robots.txt
 * disallows them too.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ products, articles, catalogUpdatedAt }, config] = await Promise.all([
    getStorefrontSitemap(),
    getStorefrontConfig(),
  ]);
  const catalogDate = new Date(catalogUpdatedAt);
  // the instalment pages list prices, so they change with the catalogue
  const creditRoutes: MetadataRoute.Sitemap = offeredMethods(config).map((method) => ({
    url: absoluteUrl(CREDIT_PAGES[method].path),
    lastModified: catalogDate,
    changeFrequency: 'weekly',
    priority: 0.8,
    images: [absoluteUrl(`/covers/installments-${method === 'CHEQUE' ? 'cheque' : 'safte'}.jpg`)],
  }));
  const newestArticle = articles.reduce<Date | null>((latest, article) => {
    const date = new Date(article.updatedAt);
    return latest === null || date > latest ? date : latest;
  }, null);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), lastModified: catalogDate, changeFrequency: 'daily', priority: 1 },
    { url: absoluteUrl('/shop'), lastModified: catalogDate, changeFrequency: 'daily', priority: 0.9 },
    {
      url: absoluteUrl('/installments'),
      lastModified: catalogDate,
      changeFrequency: 'weekly',
      priority: 0.8,
      images: [absoluteUrl('/covers/installments.jpg')],
    },
    ...creditRoutes,
    ...(articles.length > 0
      ? [
          {
            url: absoluteUrl('/mag'),
            lastModified: newestArticle ?? catalogDate,
            changeFrequency: 'weekly' as const,
            priority: 0.6,
          },
        ]
      : []),
    { url: absoluteUrl('/guide'), lastModified: catalogDate, changeFrequency: 'monthly', priority: 0.6 },
    { url: absoluteUrl('/about'), changeFrequency: 'yearly', priority: 0.4 },
    { url: absoluteUrl('/contact'), changeFrequency: 'yearly', priority: 0.4 },
    { url: absoluteUrl('/terms'), changeFrequency: 'yearly', priority: 0.3 },
    { url: absoluteUrl('/privacy'), changeFrequency: 'yearly', priority: 0.3 },
  ];

  const productRoutes: MetadataRoute.Sitemap = products.map((product) => ({
    url: absoluteUrl(`/iphone/${product.slug}`),
    lastModified: new Date(product.updatedAt),
    changeFrequency: 'daily',
    priority: 0.9,
    // every colour's photos, not only the ones the first paint shows
    images: (product.images ?? []).map((image) => absoluteUrl(image)),
  }));

  const articleRoutes: MetadataRoute.Sitemap = articles.map((article) => {
    const image = mediaUrl(article.image);
    return {
      url: absoluteUrl(`/mag/${article.slug}`),
      lastModified: new Date(article.updatedAt),
      changeFrequency: 'monthly',
      priority: 0.6,
      // absoluteUrl leaves a full URL (a cover on the media origin) as it is
      ...(image ? { images: [absoluteUrl(image)] } : {}),
    };
  });

  return [...staticRoutes, ...productRoutes, ...articleRoutes];
}
