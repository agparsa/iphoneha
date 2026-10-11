import {
  PAYMENT_METHOD_INFO,
  type CreditSettings,
  type PaymentMethod,
  type StorefrontConfigDto,
} from '@iphoneha/shared';
import type { BannerSlide } from '@/components/store/banner-carousel';

/**
 * Which banners the storefront shows. Every banner makes a promise — «buy with
 * your SnappPay credit», «twelve months with a promissory note» — so each one
 * is only listed while the store can keep it: a credit service's banner while
 * that service is switched on, the promissory-note banners while that plan is
 * offered. Connecting a service (deploy/installments.sh) is what brings its
 * banner up; nothing here needs editing.
 */

type BannerConfig = Pick<StorefrontConfigDto, 'installments' | 'credit'>;

/** «خرید قسطی آیفون با … — شرایط این طرح»: one per service, for the instalments page. */
const PLAN_FILES: Partial<Record<PaymentMethod, string>> = {
  SNAPPAY: 'snappay',
  TARA: 'tara',
  AZKIVAM: 'azkivam',
  BOJET: 'bojet',
};

/** «اعتبار … داری؟ آیفون آکبندت رو از ما بخر». */
const CREDIT_FILES: Partial<Record<PaymentMethod, string>> = {
  SNAPPAY: 'credit-snappay',
  DIGIPAY: 'credit-digipay',
  BOJET: 'credit-bojet',
};

/** The five logos on «با هر اعتباری که داری»: that banner is only true once all five are on. */
const ALL_LENDERS: PaymentMethod[] = ['SNAPPAY', 'DIGIPAY', 'BOJET', 'AZKIVAM', 'TARA'];

/** The promissory-note banner promises twelve instalments. */
const SAFTE_BANNER_MONTHS = 12;

/** The trade-in banner opens the promissory-note request form with the plan written in. */
export const TRADE_IN_HREF = '/installments/safte?plan=trade-in#request';

const calculatorHref = (method: PaymentMethod) => `/installments?service=${method.toLowerCase()}#calculator`;

function planBanner(method: PaymentMethod): BannerSlide | null {
  const file = PLAN_FILES[method];
  if (!file) return null;
  const name = PAYMENT_METHOD_INFO[method].name;
  return {
    key: `plan-${file}`,
    file,
    href: calculatorHref(method),
    alt: `خرید قسطی آیفون با ${name} — شرایط این طرح`,
    name: `طرح ${name}`,
  };
}

function creditBanner(method: PaymentMethod): BannerSlide | null {
  const file = CREDIT_FILES[method];
  if (!file) return null;
  const name = PAYMENT_METHOD_INFO[method].name;
  return {
    key: file,
    file,
    href: calculatorHref(method),
    alt: `اعتبار ${name} داری؟ آیفون آکبندت را از ما بخر — خرید با اعتبار ${name}`,
    name: `خرید با اعتبار ${name}`,
  };
}

const present = (slide: BannerSlide | null): slide is BannerSlide => slide !== null;

/** The store's own promissory-note plans: offered with or without any credit service. */
export function safteBanners(credit: CreditSettings): BannerSlide[] {
  const { safte } = credit;
  if (!safte.enabled) return [];
  const slides: BannerSlide[] = [];
  // not while the settings cap the plan below the months the banner names
  if (safte.maxMonths === null || safte.maxMonths >= SAFTE_BANNER_MONTHS) {
    slides.push({
      key: 'safte-12',
      file: 'safte-12',
      href: '/installments/safte',
      alt: 'آیفون قسطی ۱۲ ماهه، فقط با سفته — خرید آیفون آکبند با اقساط ۱۲ ماهه؛ شرایط طرح',
      name: 'آیفون قسطی ۱۲ ماهه با سفته',
    });
  }
  slides.push({
    key: 'safte-trade-in',
    file: 'safte-trade-in',
    href: TRADE_IN_HREF,
    alt: 'آیفون قدیمی‌ات را عوض کن — طرح تعویض آیفون قدیمی با آیفون جدید، فقط با سفته؛ شرایط تعویض',
    name: 'طرح تعویض آیفون با سفته',
  });
  return slides;
}

/**
 * The home page: the store's own plans first, then the credit services that are
 * on — one «any credit you have» banner once all five are, otherwise a banner
 * per service (its «have credit?» artwork where there is one, its plan banner
 * where not).
 */
export function homeBanners(config: BannerConfig): BannerSlide[] {
  const live: PaymentMethod[] = config.installments.map((term) => term.method);
  const services = ALL_LENDERS.every((method) => live.includes(method))
    ? [
        {
          key: 'credit-all',
          file: 'credit-all',
          href: '/installments',
          alt: 'با هر اعتباری که داری، آیفون آکبند را از آیفونی‌ها بخر — اسنپ‌پی، دیجی‌پی، باجت، ازکی‌وام و تارا',
          name: 'خرید با اعتبار همهٔ سرویس‌ها',
        },
      ]
    : live.map((method) => creditBanner(method) ?? planBanner(method)).filter(present);
  return [...safteBanners(config.credit), ...services];
}

/** The instalments page: the store's own plans, then each switched-on service's plan. */
export function hubBanners(config: BannerConfig): BannerSlide[] {
  const live: PaymentMethod[] = config.installments.map((term) => term.method);
  return [...safteBanners(config.credit), ...live.map(planBanner).filter(present)];
}
