import {
  PAYMENT_METHOD_INFO,
  estimateCreditPlan,
  formatNumberFa,
  formatToman,
  type ArticleSummaryDto,
  type CreditMethod,
  type HeroSlideDto,
  type InstallmentMethod,
  type StorefrontConfigDto,
} from '@iphoneha/shared';
import {
  CREDIT_COLORS,
  CREDIT_PAGES,
  chequeSteps,
  installmentSteps,
  offeredMethods,
  planDocuments,
  planFacts,
  planOf,
  planSummary,
  readyCreditPlan,
  safteSteps,
  serviceCalculatorPlans,
  storeCalculatorPlans,
} from './credit';
import type { StoryGroup, StoryStat } from './story-types';

export type { StoryAvatar, StoryGroup, StoryPicture, StorySlide, StoryStat } from './story-types';

/**
 * The stories at the top of the home page: one circle per way to buy an
 * iPhone in instalments. Everything comes from the live settings, like the
 * instalment pages — the store's own cheque and promissory-note plans while
 * they are switched on, and a credit service (SnapPay, DigiPay, Bajet…) only
 * while it is really offered at checkout. A story never advertises a way to
 * pay that the customer cannot then use.
 */

/** The credit services that have their own 4:5 artwork in /public/banners/installments. */
const STORY_BANNERS: Partial<Record<InstallmentMethod, string>> = {
  SNAPPAY: 'snappay',
  TARA: 'tara',
  AZKIVAM: 'azkivam',
  BOJET: 'bojet',
};

const BRAND_COLOR = '#0e8a5c';
const GUIDE_COLOR = '#1d4ed8';

/** «چک صیادی، سفته و اسنپ‌پی» */
function listFa(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join('، ')} و ${items.at(-1)}`;
}

function shorten(text: string, max = 170): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, clean.lastIndexOf(' ', max)).replace(/[،,؛:]$/, '')}…`;
}

/**
 * The lowest monthly instalment the calculator shows for this price — each
 * plan at its smallest down payment and its most months, exactly as the
 * calculator opens — and what it assumes.
 */
function lowestMonthly(config: StorefrontConfigDto, price: number): StoryStat | null {
  let best: { name: string; down: number; months: number; monthly: number } | null = null;
  for (const plan of [...storeCalculatorPlans(config), ...serviceCalculatorPlans(config)]) {
    const estimate = estimateCreditPlan(price, readyCreditPlan(plan), {
      downPaymentPercent: plan.minDownPaymentPercent,
      months: plan.maxMonths,
    });
    // a ceiling below the price can leave nothing to pay in instalments
    if (estimate.monthly <= 0 || estimate.downPaymentPercent >= 100) continue;
    if (!best || estimate.monthly < best.monthly) {
      best = {
        name: plan.name,
        down: estimate.downPaymentPercent,
        months: estimate.months,
        monthly: estimate.monthly,
      };
    }
  }
  if (!best) return null;
  // no-break spaces keep «۳۶ قسط» and «پیش‌پرداخت ۱۰٪» on one line each
  const down = best.down === 0 ? 'بدون\u00a0پیش‌پرداخت' : `پیش‌پرداخت\u00a0${formatNumberFa(best.down)}٪`;
  return {
    label: 'قسط ماهانه از',
    value: formatNumberFa(best.monthly),
    unit: 'تومان',
    note: `${best.name} · ${down} · ${formatNumberFa(best.months)}\u00a0قسط`,
  };
}

function hubStory(config: StorefrontConfigDto, hero: HeroSlideDto | null): StoryGroup | null {
  const methods = offeredMethods(config);
  const services = config.installments;
  if (methods.length === 0 && services.length === 0) return null;

  const ways = [
    ...methods.map((method) => CREDIT_PAGES[method].short),
    ...services.map((term) => PAYMENT_METHOD_INFO[term.method].name),
  ];
  const hasCalculator = storeCalculatorPlans(config).length + serviceCalculatorPlans(config).length > 0;
  const productName = hero?.product?.name ?? null;
  const price = hero?.price ?? null;
  const monthly = price ? lowestMonthly(config, price) : null;
  const stats: StoryStat[] =
    price && monthly
      ? [
          {
            label: productName ? `شروع قیمت ${productName}` : 'شروع قیمت',
            value: formatNumberFa(price),
            unit: 'تومان',
          },
          monthly,
        ]
      : [];

  return {
    id: 'installments',
    label: 'آیفون قسطی',
    color: BRAND_COLOR,
    avatar: hero?.image
      ? { kind: 'image', src: hero.image, fit: 'contain' }
      : { kind: 'plan', method: methods[0] ?? 'CHEQUE' },
    slides: [
      {
        id: 'intro',
        eyebrow: 'خرید قسطی آیفون',
        title: 'آیفونت را قسطی بخر',
        body: `با ${listFa(ways)}؛ قرارداد غیرحضوری و ارسال آیفون آکبند به همهٔ شهرهای ایران.`,
        picture: hero?.image ? { src: hero.image, alt: productName ?? 'آیفون', shape: 'product' } : undefined,
        cta: { label: 'روش‌های خرید قسطی', href: '/installments' },
      },
      hasCalculator
        ? {
            id: 'calculator',
            eyebrow: 'محاسبهٔ قسط',
            title: 'قسط ماهانه‌ات را همین حالا ببین',
            body: 'مدل، پیش‌پرداخت و تعداد اقساط را انتخاب کن؛ قسط ماهانه و جمع کل پرداختی همان لحظه حساب می‌شود.',
            stats: stats.length > 0 ? stats : undefined,
            cta: { label: 'محاسبهٔ قسط', href: '/installments#calculator' },
          }
        : {
            id: 'steps',
            eyebrow: 'مراحل خرید',
            title: 'چند قدم تا آیفون',
            points: installmentSteps(config).map((step) => step.title),
            ordered: true,
            cta:
              methods.length > 0
                ? { label: 'ثبت درخواست', href: '/installments#request' }
                : { label: 'روش‌های خرید قسطی', href: '/installments' },
          },
    ],
  };
}

function planStory(config: StorefrontConfigDto, method: CreditMethod): StoryGroup {
  const plan = planOf(config, method);
  const page = CREDIT_PAGES[method];
  const facts = planFacts(plan, config).map((fact) => `${fact.label}: ${fact.value}`);
  const cheque = method === 'CHEQUE';
  return {
    id: cheque ? 'cheque' : 'safte',
    label: page.short,
    color: CREDIT_COLORS[method],
    avatar: { kind: 'plan', method },
    slides: [
      {
        id: 'terms',
        eyebrow: page.title,
        title: cheque ? 'خرید آیفون با چک صیادی' : 'خرید آیفون با سفته',
        body: `${planSummary(plan)}.`,
        // the owner's figures when he has entered them, otherwise what to have ready
        points: facts.length > 0 ? facts.slice(0, 4) : planDocuments(plan, method).slice(0, 3),
        cta: { label: cheque ? 'شرایط خرید با چک' : 'شرایط خرید با سفته', href: page.path },
      },
      {
        id: 'steps',
        eyebrow: 'مراحل',
        title: cheque ? 'مراحل خرید با چک' : 'مراحل خرید با سفته',
        points: (cheque ? chequeSteps : safteSteps)(config).map((step) => step.title),
        ordered: true,
        cta: { label: 'ثبت درخواست', href: `${page.path}#request` },
      },
    ],
  };
}

function serviceStory(config: StorefrontConfigDto, method: InstallmentMethod): StoryGroup | null {
  const term = config.installments.find((candidate) => candidate.method === method);
  if (!term) return null;
  const info = PAYMENT_METHOD_INFO[method];
  const banner = STORY_BANNERS[method];
  const href = `/installments?service=${method.toLowerCase()}#calculator`;
  const points = [
    term.minDownPaymentPercent === 0
      ? 'بدون پیش‌پرداخت'
      : `پیش‌پرداخت از ${formatNumberFa(term.minDownPaymentPercent)}٪`,
    `تا ${formatNumberFa(term.maxInstallments)} قسط`,
    term.maxCredit > 0 ? `سقف اعتبار ${formatToman(term.maxCredit)}` : null,
    term.approvalTime ? `بررسی: ${term.approvalTime}` : null,
  ].filter((point): point is string => Boolean(point));

  return {
    id: method.toLowerCase(),
    label: info.name,
    color: info.color,
    avatar: { kind: 'service', method },
    slides: [
      banner
        ? {
            id: 'banner',
            eyebrow: 'خرید قسطی آیفون',
            title: `خرید قسطی آیفون با ${info.name}`,
            picture: {
              src: `/banners/installments/${banner}-mobile.webp`,
              srcSet: `/banners/installments/${banner}-mobile-540.webp 540w, /banners/installments/${banner}-mobile.webp 1080w`,
              alt: `خرید قسطی آیفون با ${info.name}`,
              shape: 'banner',
            },
            cta: { label: `شرایط ${info.name}`, href },
          }
        : {
            id: 'intro',
            eyebrow: info.tagline,
            title: `خرید قسطی آیفون با ${info.name}`,
            body: term.description || undefined,
            cta: { label: `شرایط ${info.name}`, href },
          },
      {
        id: 'terms',
        eyebrow: info.name,
        title: `شرایط ${info.name}`,
        body: term.documents ? `مدارک: ${term.documents}` : undefined,
        points,
        cta: { label: `محاسبهٔ قسط با ${info.name}`, href },
      },
    ],
  };
}

function guideStory(articles: ArticleSummaryDto[]): StoryGroup | null {
  const picked = articles.slice(0, 3);
  if (picked.length === 0) return null;
  const cover = picked.find((article) => article.coverUrl)?.coverUrl ?? null;
  return {
    id: 'mag',
    label: 'راهنما',
    color: GUIDE_COLOR,
    avatar: cover ? { kind: 'image', src: cover, fit: 'cover' } : { kind: 'plan', method: 'CHEQUE' },
    slides: picked.map((article) => ({
      id: article.slug,
      eyebrow: 'مجلهٔ آیفونی‌ها',
      title: article.title,
      body: shorten(article.excerpt),
      picture: article.coverUrl
        ? { src: article.coverUrl, alt: article.coverAlt ?? article.title, shape: 'cover' as const }
        : undefined,
      cta: { label: 'خواندن مقاله', href: `/mag/${article.slug}` },
    })),
  };
}

export function installmentStories({
  config,
  hero,
  articles,
}: {
  config: StorefrontConfigDto;
  /** the first home banner: its phone is the face of the «آیفون قسطی» story */
  hero: HeroSlideDto | null;
  articles: ArticleSummaryDto[];
}): StoryGroup[] {
  return [
    hubStory(config, hero),
    ...offeredMethods(config).map((method) => planStory(config, method)),
    ...config.installments.map((term) => serviceStory(config, term.method)),
    guideStory(articles),
  ].filter((group): group is StoryGroup => group !== null);
}
