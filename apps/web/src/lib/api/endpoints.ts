import 'server-only';
import type {
  ArticleDto,
  ArticleSummaryDto,
  CartDto,
  CatalogMetaDto,
  MyContractDto,
  OrderDto,
  OrderSummaryDto,
  Paginated,
  PaymentMethodOptionDto,
  ProductCardDto,
  ProductDetailDto,
  ProductListResponse,
  SessionDto,
  ShippingMethodDto,
  StorefrontConfigDto,
  StorefrontHomeDto,
  StorefrontSitemapDto,
  UserDto,
  AddressDto,
} from '@iphoneha/shared';
import { DEFAULT_CREDIT_SETTINGS, DEFAULT_INSTALLMENT_TERMS, INSTALLMENT_METHODS } from '@iphoneha/shared';
import { apiGet, apiGetOptional, apiGetOr, type ServerFetchOptions } from './server';

/** Public catalog data can be cached briefly; stock is refreshed client-side. */
const PUBLIC_CACHE: ServerFetchOptions = { revalidate: 60, auth: false };

/**
 * Used when the API is unreachable — during a CI build, or if it restarts while
 * a page renders. The layout keeps working and the next revalidation fixes it.
 */
const FALLBACK_CONFIG: StorefrontConfigDto = {
  store: {
    name: 'آیفونی‌ها',
    tagline: 'مرجع تخصصی خرید آیفون',
    phone: '۰۲۱-۹۱۰۰۲۲۳۳',
    supportMobile: null,
    email: null,
    address: '',
    workingHours: '',
    instagram: null,
    telegram: null,
    announcement: '',
    legalName: '',
    warrantyMonths: 18,
    returnDays: 7,
    enamadId: null,
    enamadCode: null,
  },
  commerce: { freeShippingThreshold: 50_000_000, maxQtyPerItem: 5 },
  installments: INSTALLMENT_METHODS.map((method) => DEFAULT_INSTALLMENT_TERMS[method]),
  disabledMethods: [],
  models: [],
  series: [],
  seo: { googleVerification: null, bingVerification: null, yandexVerification: null, ga4MeasurementId: null },
  credit: DEFAULT_CREDIT_SETTINGS,
};

export const getStorefrontConfig = () =>
  apiGetOr<StorefrontConfigDto>('/storefront/config', FALLBACK_CONFIG, {
    ...PUBLIC_CACHE,
    tags: ['storefront'],
  });

export const getStorefrontSitemap = () =>
  apiGetOr<StorefrontSitemapDto>(
    '/storefront/sitemap',
    { products: [], articles: [], catalogUpdatedAt: new Date().toISOString() },
    { ...PUBLIC_CACHE, tags: ['storefront'] },
  );

export const getStorefrontHome = () =>
  apiGet<StorefrontHomeDto>('/storefront/home', { ...PUBLIC_CACHE, tags: ['storefront'] });

export const getCatalogMeta = () =>
  apiGet<CatalogMetaDto>('/catalog/meta', { ...PUBLIC_CACHE, tags: ['catalog'] });

export const listProducts = (searchParams: ServerFetchOptions['searchParams']) =>
  apiGet<ProductListResponse>('/products', { revalidate: 30, auth: false, searchParams, tags: ['catalog'] });

export const getProduct = (slug: string) =>
  apiGetOptional<ProductDetailDto>(`/products/${slug}`, { revalidate: 30, auth: false, tags: ['catalog'] });

// a hiccup fetching “similar models” must not take the product page down
export const getRelatedProducts = (slug: string) =>
  apiGetOr<ProductCardDto[]>(`/products/${slug}/related`, [], {
    revalidate: 60,
    auth: false,
    tags: ['catalog'],
  });

// ─── magazine ────────────────────────────────────────────────────────────────

const ARTICLES_CACHE: ServerFetchOptions = { revalidate: 300, auth: false, tags: ['articles'] };
const NO_ARTICLES = (page: number, pageSize: number): Paginated<ArticleSummaryDto> => ({
  items: [],
  total: 0,
  page,
  pageSize,
  totalPages: 1,
});

/** A page of published articles, newest first; empty (not an error) if the API hiccups. */
export const listArticles = (page = 1, pageSize = 12) =>
  apiGetOr<Paginated<ArticleSummaryDto>>('/articles', NO_ARTICLES(page, pageSize), {
    ...ARTICLES_CACHE,
    searchParams: { page, pageSize },
  });

/** The newest few articles, for “از مجله” blocks on the landing pages. */
export const getLatestArticles = async (count = 3) => (await listArticles(1, count)).items;

export const getArticle = (slug: string) => apiGetOptional<ArticleDto>(`/articles/${slug}`, ARTICLES_CACHE);

export const getCart = () => apiGet<CartDto>('/cart');

export const getMe = () => apiGetOptional<UserDto>('/users/me');

export const getAddresses = () => apiGet<AddressDto[]>('/users/me/addresses');

export const getSessions = () => apiGet<SessionDto[]>('/auth/sessions');

export const listOrders = (page = 1) =>
  apiGet<Paginated<OrderSummaryDto>>('/orders', { searchParams: { page, pageSize: 10 } });

export const getOrder = (id: string) => apiGetOptional<OrderDto>(`/orders/${id}`);

/** The signed-in customer's instalment booklets (دفترچهٔ اقساط) with the store's own cheque or promissory-note plans. */
export const getMyInstallments = () => apiGet<MyContractDto[]>('/users/me/installments');

export const getMyInstallment = (number: string) =>
  apiGetOptional<MyContractDto>(`/users/me/installments/${encodeURIComponent(number)}`);

export const getShippingMethods = (province?: string, subtotal?: number) =>
  apiGet<ShippingMethodDto[]>('/shipping/methods', { searchParams: { province, subtotal } });

export const getPaymentMethods = (amount: number) =>
  apiGet<PaymentMethodOptionDto[]>('/payments/methods', { searchParams: { amount } });
