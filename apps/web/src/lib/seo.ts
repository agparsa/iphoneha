import type {
  ArticleDto,
  ProductCardDto,
  ProductDetailDto,
  StoreSettings,
  StorefrontConfigDto,
} from '@iphoneha/shared';
import { tomanToRial } from '@iphoneha/shared';
import { absoluteUrl } from './utils';
import type { FaqItem } from './store-copy';

/**
 * JSON-LD builders. Every value here must also be visible on the page — Google
 * treats structured data that contradicts the rendered page as spam, so these
 * read from the same DTOs the components render.
 */

const ORG_ID = absoluteUrl('/#organization');
const SITE_ID = absoluteUrl('/#website');

export type JsonLd = Record<string, unknown>;

/** Renders a `<script type="application/ld+json">` payload. */
export function jsonLdScript(data: JsonLd | JsonLd[]): { __html: string } {
  return { __html: JSON.stringify(data).replace(/</g, '\\u003c') };
}

/** How a customer can pay today, in words — only methods that are actually live. */
function paymentAccepted(config: Pick<StorefrontConfigDto, 'installments' | 'disabledMethods'>): string {
  return [
    config.disabledMethods.includes('ONLINE') ? null : 'پرداخت آنلاین',
    config.installments.length > 0 ? 'خرید اقساطی آنلاین' : null,
    'چک و سفته',
  ]
    .filter(Boolean)
    .join('، ');
}

export function organizationLd(
  store: StoreSettings,
  config?: Pick<StorefrontConfigDto, 'installments' | 'disabledMethods'>,
): JsonLd {
  const sameAs = [
    store.instagram ? `https://instagram.com/${store.instagram.replace('@', '')}` : null,
    store.telegram ? `https://t.me/${store.telegram.replace('@', '')}` : null,
  ].filter((value): value is string => value !== null);

  return {
    '@context': 'https://schema.org',
    '@type': 'OnlineStore',
    '@id': ORG_ID,
    name: store.name,
    alternateName: 'iPhoneHa',
    url: absoluteUrl('/'),
    logo: absoluteUrl('/brand/logo.png'),
    image: absoluteUrl('/brand/logo.png'),
    description: store.tagline,
    telephone: store.phone,
    ...(store.email ? { email: store.email } : {}),
    ...(store.address
      ? { address: { '@type': 'PostalAddress', streetAddress: store.address, addressCountry: 'IR' } }
      : {}),
    ...(sameAs.length ? { sameAs } : {}),
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: store.phone,
      contactType: 'customer service',
      areaServed: 'IR',
      availableLanguage: ['fa'],
    },
    currenciesAccepted: 'IRR',
    ...(config ? { paymentAccepted: paymentAccepted(config) } : {}),
    ...(store.workingHours ? { openingHours: store.workingHours } : {}),
  };
}

/** WebSite + the search box Google may show under the brand result. */
export function webSiteLd(store: StoreSettings): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': SITE_ID,
    url: absoluteUrl('/'),
    name: store.name,
    inLanguage: 'fa-IR',
    publisher: { '@id': ORG_ID },
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${absoluteUrl('/shop')}?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function faqLd(items: FaqItem[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
}

/** A magazine article, credited to the store (the organisation node the layout renders). */
export function articleLd(article: ArticleDto, store: Pick<StoreSettings, 'name'>): JsonLd {
  const url = absoluteUrl(`/mag/${article.slug}`);
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': `${url}#article`,
    headline: article.title,
    description: article.excerpt,
    ...(article.coverUrl ? { image: [absoluteUrl(article.coverUrl)] } : {}),
    datePublished: article.publishedAt,
    dateModified: article.updatedAt,
    inLanguage: 'fa-IR',
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    author: { '@type': 'Organization', name: store.name, url: absoluteUrl('/') },
    publisher: { '@id': ORG_ID },
    ...(article.focusKeyword ? { keywords: article.focusKeyword } : {}),
  };
}

export function breadcrumbLd(items: { name: string; href: string }[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.href),
    })),
  };
}

/** A listing page: the models in view, in the order they are shown. */
export function itemListLd(products: ProductCardDto[], name: string): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: products.length,
    itemListElement: products.map((product, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: absoluteUrl(`/iphone/${product.slug}`),
      name: product.name,
    })),
  };
}

/** Offers valid to the end of the next month — long enough to stay fresh, short enough to be honest. */
function priceValidUntil(): string {
  const date = new Date();
  date.setMonth(date.getMonth() + 2, 0);
  return date.toISOString().slice(0, 10);
}

export function productLd(
  product: ProductDetailDto,
  store: Pick<StoreSettings, 'returnDays' | 'warrantyMonths'>,
): JsonLd {
  const url = absoluteUrl(`/iphone/${product.slug}`);
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${url}#product`,
    name: product.name,
    alternateName: product.nameEn,
    description: product.seoDescription || product.shortDescription || product.description,
    sku: product.variants[0]?.sku,
    mpn: product.variants[0]?.sku,
    brand: { '@type': 'Brand', name: 'Apple' },
    category: 'گوشی موبایل',
    image: product.images.slice(0, 5).map((image) => absoluteUrl(image.url)),
    ...(product.specs.length
      ? {
          additionalProperty: product.specs.map((spec) => ({
            '@type': 'PropertyValue',
            name: spec.key,
            value: spec.value,
          })),
        }
      : {}),
    ...(product.ratingAvg && product.ratingCount
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: product.ratingAvg,
            reviewCount: product.ratingCount,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'IRR',
      lowPrice: tomanToRial(product.priceRange.min),
      highPrice: tomanToRial(product.priceRange.max),
      offerCount: product.variants.length,
      availability: product.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      priceValidUntil: priceValidUntil(),
      url,
      seller: { '@id': ORG_ID },
      // the return window and warranty come from the store settings the pages
      // render too; fees and shipping times are not claimed because the store
      // has not stated them as fixed promises
      hasMerchantReturnPolicy:
        store.returnDays > 0
          ? {
              '@type': 'MerchantReturnPolicy',
              applicableCountry: 'IR',
              returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
              merchantReturnDays: store.returnDays,
            }
          : {
              '@type': 'MerchantReturnPolicy',
              applicableCountry: 'IR',
              returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted',
            },
      ...(product.warranty && store.warrantyMonths > 0
        ? {
            warranty: {
              '@type': 'WarrantyPromise',
              durationOfWarranty: {
                '@type': 'QuantitativeValue',
                value: store.warrantyMonths,
                unitCode: 'MON',
              },
              warrantyScope: product.warranty,
            },
          }
        : {}),
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'IR' },
      },
    },
  };
}
