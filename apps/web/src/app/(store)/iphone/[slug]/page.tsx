import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { formatNumberFa } from '@iphoneha/shared';
import { getProduct, getRelatedProducts, getStorefrontConfig } from '@/lib/api/endpoints';
import { breadcrumbLd, jsonLdScript, productLd } from '@/lib/seo';
import { purchaseFaq } from '@/lib/store-copy';
import { absoluteUrl } from '@/lib/utils';
import { Breadcrumbs } from '@/components/store/breadcrumbs';
import { FaqSection } from '@/components/store/faq-section';
import { ProductHighlights } from '@/components/store/product-highlights';
import { ProductInstallments } from '@/components/store/product-installments';
import { ProductSelectionProvider } from '@/components/store/product-selection';
import { Reveal } from '@/components/motion/reveal';
import { ProductRail } from '@/components/store/product-rail';
import { SectionHeader } from '@/components/store/section-header';
import { SpecsTable } from '@/components/store/specs-table';
import { VariantPicker } from '@/components/store/variant-picker';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export const revalidate = 60;

export async function generateStaticParams() {
  const config = await getStorefrontConfig();
  return config.models.map((model) => ({ slug: model.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return { title: 'محصول پیدا نشد' };

  // the colour and capacity the page opens on, as the price-comparison
  // crawlers (Torob, Emalls) read it from these tags; prices in toman
  const shown =
    product.variants.find((variant) => variant.id === product.defaultVariantId) ?? product.variants[0];

  return {
    // the stored SEO title already ends with the brand name
    title: { absolute: product.seoTitle },
    description: product.seoDescription,
    keywords: [product.name, product.nameEn, `خرید ${product.name}`, `${product.name} قسطی`, 'آیفون آکبند'],
    alternates: { canonical: `/iphone/${product.slug}`, languages: { 'fa-IR': `/iphone/${product.slug}` } },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
    },
    openGraph: {
      title: product.seoTitle,
      siteName: 'آیفونی‌ها',
      description: product.seoDescription,
      url: absoluteUrl(`/iphone/${product.slug}`),
      // the picture comes from opengraph-image.tsx next to this page
      type: 'website',
    },
    // this model's own card on X; the picture comes from twitter-image.tsx
    twitter: { card: 'summary_large_image', title: product.seoTitle, description: product.seoDescription },
    ...(shown
      ? {
          other: {
            product_id: product.slug,
            product_name: product.name,
            product_price: shown.price,
            ...(shown.compareAtPrice && shown.compareAtPrice > shown.price
              ? { product_old_price: shown.compareAtPrice }
              : {}),
            availability: shown.availableStock > 0 ? 'instock' : 'outofstock',
            guarantee: product.warranty,
          },
        }
      : {}),
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) notFound();

  const [related, config] = await Promise.all([getRelatedProducts(slug), getStorefrontConfig()]);

  const structuredData = [
    productLd(product, config.store),
    breadcrumbLd(product.breadcrumbs.map((crumb) => ({ name: crumb.name, href: crumb.href }))),
  ];

  return (
    <div className="container-page py-5 md:py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(structuredData)} />

      <Breadcrumbs items={product.breadcrumbs} />
      <ProductSelectionProvider>
        <VariantPicker product={product} />

        <ProductHighlights specs={product.specs} name={product.name} />

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <Reveal>
              <section className="rounded-panel border border-line p-5">
                <h2 className="text-[15px] font-semibold text-ink">درباره {product.name}</h2>
                <p className="mt-3 whitespace-pre-line text-[13px] leading-7 text-muted">
                  {product.description}
                </p>
                <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5 text-[12px]">
                  <div>
                    <dt className="text-muted">گارانتی</dt>
                    <dd className="mt-1 font-medium text-ink">{product.warranty}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">وضعیت رجیستری</dt>
                    <dd className="mt-1 font-medium text-ink">{product.registryLabel}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">سال عرضه</dt>
                    <dd className="mt-1 font-medium text-ink tabular">
                      {formatNumberFa(product.releaseYear)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">تعداد ترکیب‌ها</dt>
                    <dd className="mt-1 font-medium text-ink tabular">
                      {formatNumberFa(product.variants.length)}
                    </dd>
                  </div>
                </dl>
              </section>
            </Reveal>

            <Reveal>
              <SpecsTable specs={product.specs} />
            </Reveal>
          </div>

          <div className="space-y-6">
            <Reveal>
              {/* its own hydration island: the buy box above comes first */}
              <Suspense fallback={null}>
                <ProductInstallments
                  price={product.priceRange.min}
                  productName={product.name}
                  productSlug={product.slug}
                />
              </Suspense>
            </Reveal>
            <Reveal>
              <section>
                <h2 className="mb-3 text-[15px] font-semibold text-ink">سؤال‌های پرتکرار</h2>
                <FaqSection items={purchaseFaq(config)} />
              </section>
            </Reveal>
          </div>
        </div>
      </ProductSelectionProvider>

      {related.length > 0 ? (
        <section className="cv-auto mt-14">
          <SectionHeader title="مدل‌های مشابه" href="/shop" />
          <Suspense fallback={null}>
            <ProductRail products={related} />
          </Suspense>
        </section>
      ) : null}
    </div>
  );
}
