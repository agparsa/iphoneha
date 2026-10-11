import { z } from 'zod';
import { INSTALLMENT_METHODS, PAYMENT_METHODS } from '../enums';
import { toLatinDigits } from '../digits';
import { phoneSchema, slugSchema } from './common';

export const storeSettingsSchema = z.object({
  name: z.string().trim().min(2).max(60),
  tagline: z.string().trim().max(120).default(''),
  phone: z.string().trim().min(5).max(30),
  supportMobile: phoneSchema.optional().nullable(),
  email: z.string().trim().email().max(120).optional().nullable(),
  address: z.string().trim().max(300).default(''),
  workingHours: z.string().trim().max(120).default(''),
  instagram: z.string().trim().max(60).optional().nullable(),
  telegram: z.string().trim().max(60).optional().nullable(),
  announcement: z.string().trim().max(160).default(''),
  /** Seller's registered name for the terms page; the store name is used when empty. */
  legalName: z.string().trim().max(120).default(''),
  /** Store warranty on every device, in months (0 = none). Drives every warranty claim on the site. */
  warrantyMonths: z.coerce.number().int().min(0).max(60).default(18),
  /** Days after delivery within which a sealed device can be returned (0 = no returns). */
  returnDays: z.coerce.number().int().min(0).max(60).default(7),
  /** e-Namad trust seal (نماد اعتماد الکترونیکی): the id and code from enamad.ir. */
  enamadId: z
    .string()
    .trim()
    .regex(/^\d{1,12}$/, 'شناسه نماد فقط عدد است')
    .optional()
    .nullable()
    .or(z.literal('').transform(() => null)),
  enamadCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{1,40}$/, 'کد نماد فقط حروف و عدد انگلیسی است')
    .optional()
    .nullable()
    .or(z.literal('').transform(() => null)),
});
export type StoreSettings = z.infer<typeof storeSettingsSchema>;

export const heroBannerSchema = z.object({
  id: z.string().trim().min(1).max(40),
  eyebrow: z.string().trim().max(40).default(''),
  title: z.string().trim().min(2).max(80),
  subtitle: z.string().trim().max(160).default(''),
  productSlug: slugSchema,
  colorCode: z.string().trim().max(60).optional().nullable(),
  ctaLabel: z.string().trim().min(2).max(30).default('مشاهده و خرید'),
  theme: z.enum(['light', 'dark']).default('light'),
});
export type HeroBanner = z.infer<typeof heroBannerSchema>;

export const homeSettingsSchema = z.object({
  heroBanners: z.array(heroBannerSchema).min(1).max(8),
  /** product slugs shown as categories, in order */
  categorySlugs: z.array(slugSchema).max(10),
});
export type HomeSettings = z.infer<typeof homeSettingsSchema>;

export const installmentTermsSchema = z.object({
  method: z.enum(INSTALLMENT_METHODS),
  minDownPaymentPercent: z.coerce.number().int().min(0).max(90),
  maxInstallments: z.coerce.number().int().min(1).max(60),
  annualFeeRate: z.coerce.number().min(0).max(1),
  maxCredit: z.coerce.number().int().min(0),
  approvalTime: z.string().trim().max(60),
  documents: z.string().trim().max(160),
  description: z.string().trim().max(300),
});

export const paymentSettingsSchema = z.object({
  disabledMethods: z.array(z.enum(PAYMENT_METHODS)).default([]),
  installmentTerms: z.array(installmentTermsSchema),
});
export type PaymentSettings = z.infer<typeof paymentSettingsSchema>;

export const commerceSettingsSchema = z.object({
  freeShippingThreshold: z.coerce.number().int().min(0).nullable(),
  maxQtyPerItem: z.coerce.number().int().min(1).max(20),
});
export type CommerceSettings = z.infer<typeof commerceSettingsSchema>;

/**
 * A search-console ownership code. The consoles show it inside a whole
 * `<meta name="…" content="…">` tag, so pasting the tag works too; a blank
 * field means «not set».
 */
const verificationCodeSchema = z
  .preprocess(
    (value) => {
      if (typeof value !== 'string') return value;
      const code = (/content\s*=\s*["']([^"']*)["']/i.exec(value)?.[1] ?? value).trim();
      return code === '' ? null : code;
    },
    z
      .string()
      .regex(/^[\w-]{8,120}$/, 'کد تأیید فقط حروف و عدد انگلیسی، خط تیره و زیرخط دارد')
      .nullable(),
  )
  .default(null);

/**
 * Search engines and analytics. The verification codes only prove ownership
 * to Google Search Console, Bing Webmaster Tools and Yandex Webmaster; the GA4
 * measurement id turns Google Analytics on for the storefront (never the admin).
 */
export const seoSettingsSchema = z.object({
  googleVerification: verificationCodeSchema,
  bingVerification: verificationCodeSchema,
  yandexVerification: verificationCodeSchema,
  ga4MeasurementId: z
    .preprocess(
      (value) => (typeof value === 'string' ? value.trim().toUpperCase() || null : value),
      z
        .string()
        .regex(/^G-[A-Z0-9]{4,20}$/, 'شناسهٔ اندازه‌گیری با G- شروع می‌شود، مثل G-AB12CD34EF')
        .nullable(),
    )
    .default(null),
});
export type SeoSettings = z.infer<typeof seoSettingsSchema>;

const NUMBER_ONLY = { error: 'فقط عدد وارد کن' };

/** A number the owner may leave blank (stored as null); Persian digits and separators are fine. */
function optionalNumber<T extends z.ZodType<number>>(schema: T) {
  return z
    .preprocess((value) => {
      if (value === undefined || value === null) return null;
      if (typeof value === 'number') return value;
      if (typeof value !== 'string') return value;
      const cleaned = toLatinDigits(value)
        .replace(/[,٬،\s]/g, '')
        .replace('٫', '.');
      return cleaned === '' ? null : Number(cleaned);
    }, schema.nullable())
    .default(null);
}

/**
 * The store's own instalment plan with a Sayad cheque or a promissory note.
 * Every figure is optional: until the owner fills them in, the pages explain
 * the process without numbers — they never make one up.
 */
export const creditPlanSchema = z.object({
  /** offered at all */
  enabled: z.boolean().default(true),
  minDownPaymentPercent: optionalNumber(
    z.number(NUMBER_ONLY).int('عدد صحیح وارد کن').min(0, 'حداقل ۰٪').max(90, 'حداکثر ۹۰٪'),
  ),
  maxMonths: optionalNumber(
    z.number(NUMBER_ONLY).int('عدد صحیح وارد کن').min(1, 'حداقل ۱ ماه').max(36, 'حداکثر ۳۶ ماه'),
  ),
  /** flat monthly fee on what is left after the down payment, in percent (4 = 4% a month) */
  monthlyFeePercent: optionalNumber(z.number(NUMBER_ONLY).min(0, 'حداقل ۰٪').max(15, 'حداکثر ۱۵٪ در ماه')),
  /** the most that can be paid this way, in toman (null = no fixed ceiling) */
  maxFinanced: optionalNumber(z.number(NUMBER_ONLY).int('عدد صحیح وارد کن').min(0, 'مبلغ منفی نمی‌شود')),
  /** one document per line */
  documents: z.string().trim().max(600).default(''),
  /** «بدون ضامن» or who has to co-sign */
  guarantor: z.string().trim().max(200).default(''),
  notes: z.string().trim().max(600).default(''),
});
export type CreditPlan = z.infer<typeof creditPlanSchema>;

export const creditSettingsSchema = z.object({
  cheque: creditPlanSchema.default(() => creditPlanSchema.parse({})),
  safte: creditPlanSchema.default(() => creditPlanSchema.parse({})),
  /** from the request to a signed contract, e.g. «کمتر از ۲۴ ساعت کاری» */
  approvalTime: z.string().trim().max(80).default(''),
});
export type CreditSettings = z.infer<typeof creditSettingsSchema>;

const BLANK_CREDIT_PLAN: CreditPlan = {
  enabled: true,
  minDownPaymentPercent: null,
  maxMonths: null,
  monthlyFeePercent: null,
  maxFinanced: null,
  documents: '',
  guarantor: '',
  notes: '',
};

/** Offered, but with no figures yet — what a fresh install shows. */
export const DEFAULT_CREDIT_SETTINGS: CreditSettings = {
  cheque: BLANK_CREDIT_PLAN,
  safte: BLANK_CREDIT_PLAN,
  approvalTime: '',
};

/**
 * Who hears about a new instalment request or a paid order, and which of the
 * two. Staff only: this key is never part of the storefront config. The SMS
 * goes to these mobiles (none listed = the store owner, every active
 * SUPER_ADMIN); the bot message goes to the chat set up on the server.
 */
export const alertSettingsSchema = z.object({
  mobiles: z
    .array(phoneSchema)
    .max(3, 'حداکثر سه شماره')
    .default([])
    .transform((mobiles) => [...new Set(mobiles)]),
  creditRequests: z.boolean().default(true),
  paidOrders: z.boolean().default(true),
});
export type AlertSettings = z.infer<typeof alertSettingsSchema>;

export const DEFAULT_ALERT_SETTINGS: AlertSettings = { mobiles: [], creditRequests: true, paidOrders: true };

/**
 * The store's instalment ledger. Staff only: never part of the storefront
 * config. Reminders go out only once the owner turns them on and the
 * reminder pattern is set on the server.
 */
export const ledgerSettingsSchema = z.object({
  /** SMS each customer before a due date, and again while it is overdue */
  remindersEnabled: z.boolean().default(false),
  /** days before the due date (0 = on the day itself) */
  remindDaysBefore: z.coerce.number().int().min(0, 'حداقل ۰').max(10, 'حداکثر ۱۰ روز').default(2),
  /** remind again every N days while overdue (0 = never) */
  overdueEveryDays: z.coerce.number().int().min(0, 'حداقل ۰').max(30, 'حداکثر ۳۰ روز').default(3),
  /** printed under every contract, one clause per line */
  contractTerms: z.string().trim().max(4000).default(''),
});
export type LedgerSettings = z.infer<typeof ledgerSettingsSchema>;

export const DEFAULT_LEDGER_SETTINGS: LedgerSettings = {
  remindersEnabled: false,
  remindDaysBefore: 2,
  overdueEveryDays: 3,
  contractTerms: '',
};

export const SETTINGS_SCHEMAS = {
  store: storeSettingsSchema,
  home: homeSettingsSchema,
  payments: paymentSettingsSchema,
  commerce: commerceSettingsSchema,
  seo: seoSettingsSchema,
  credit: creditSettingsSchema,
  alerts: alertSettingsSchema,
  ledger: ledgerSettingsSchema,
} as const;
export type SettingsKey = keyof typeof SETTINGS_SCHEMAS;
export const SETTINGS_KEYS = Object.keys(SETTINGS_SCHEMAS) as SettingsKey[];
