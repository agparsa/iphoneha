import { z } from 'zod';
import { PAYMENT_METHODS, type PaymentMethod } from '@iphoneha/shared';

const bool = (def: boolean) =>
  z.preprocess((v) => {
    if (v === undefined || v === '') return def;
    if (typeof v === 'boolean') return v;
    return String(v).toLowerCase() === 'true' || v === '1';
  }, z.boolean());

/** Like `bool`, but stays undefined when unset so the effective value can depend on NODE_ENV. */
const optionalBool = z.preprocess((v) => {
  if (v === undefined || v === '') return undefined;
  if (typeof v === 'boolean') return v;
  return String(v).toLowerCase() === 'true' || v === '1';
}, z.boolean().optional());

const optionalInt = z.preprocess(
  (v) => (v === undefined || v === '' ? undefined : Number(v)),
  z.number().int().positive().optional(),
);

/** An optional value where an empty `KEY=` line in .env counts as unset. */
const optionalText = (schema: z.ZodString) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

/**
 * `live`, `sandbox` (the service's test environment) or `mock`; anything else
 * (a typo) is treated as `mock` — never offered in production.
 */
const liveDriver = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v),
  z.enum(['mock', 'live', 'sandbox']).catch('mock'),
);

const int = (def: number, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  z.preprocess((v) => (v === undefined || v === '' ? def : Number(v)), z.number().int().min(min).max(max));

const csv = z.preprocess(
  (v) =>
    String(v ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  z.array(z.string()),
);

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: int(4000, 1, 65535),
    WEB_URL: z.string().url().default('http://localhost:3000'),
    CORS_ORIGINS: csv,

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

    COOKIE_SECURE: bool(false),
    SESSION_TTL_DAYS: int(30, 1, 365),
    ADMIN_SESSION_TTL_HOURS: int(12, 1, 720),

    OTP_SECRET: z.string().min(16, 'OTP_SECRET must be at least 16 characters'),
    OTP_LENGTH: int(6, 4, 8),
    OTP_TTL_SECONDS: int(120, 30, 900),
    OTP_RESEND_SECONDS: int(60, 10, 600),
    OTP_MAX_ATTEMPTS: int(5, 1, 20),
    OTP_MAX_SENDS_PER_HOUR: int(5, 1, 100),
    OTP_MAX_SENDS_PER_IP_PER_HOUR: int(20, 1, 1000),
    OTP_MAX_VERIFY_PER_15MIN: int(10, 1, 100),
    DEV_EXPOSE_OTP: bool(false),

    SMS_DRIVER: z.enum(['console', 'kavenegar', 'melipayamak']).default('console'),
    KAVENEGAR_API_KEY: z.string().optional(),
    KAVENEGAR_OTP_TEMPLATE: z.string().default('iphoneha-otp'),
    // Melipayamak (ملی‌پیامک): shared service line, one approved pattern per message
    MELIPAYAMAK_USERNAME: z.string().optional(),
    MELIPAYAMAK_PASSWORD: z.string().optional(),
    MELIPAYAMAK_OTP_BODY_ID: optionalInt,
    MELIPAYAMAK_ORDER_PAID_BODY_ID: optionalInt,
    MELIPAYAMAK_ORDER_SHIPPED_BODY_ID: optionalInt,
    // staff alerts (deploy/alerts.sh): «درخواست خرید قسطی تازه» and «سفارش تازه پرداخت شد»
    MELIPAYAMAK_ALERT_REQUEST_BODY_ID: optionalInt,
    MELIPAYAMAK_ALERT_ORDER_BODY_ID: optionalInt,
    // to customers of the store's own instalments: «یادآوری قسط قرارداد {0} به مبلغ {1} تومان با سررسید {2}»
    MELIPAYAMAK_INSTALLMENT_REMINDER_BODY_ID: optionalInt,
    // more customer messages (deploy/sms.sh), each optional: «سفارش موفق», «قسط معوق»,
    // «پرداخت قسط» and «صدور دفترچهٔ اقساط»
    MELIPAYAMAK_ORDER_CONFIRMED_BODY_ID: optionalInt,
    MELIPAYAMAK_INSTALLMENT_OVERDUE_BODY_ID: optionalInt,
    MELIPAYAMAK_INSTALLMENT_PAID_BODY_ID: optionalInt,
    MELIPAYAMAK_CONTRACT_ISSUED_BODY_ID: optionalInt,
    // Never fatal: a wrong value turns the bot off (and says so in the log), it never stops the store.
    ALERT_BOT_SERVICE: z.preprocess(
      (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v),
      z.enum(['telegram', 'bale']).catch('telegram'),
    ),
    ALERT_BOT_TOKEN: optionalText(z.string().trim()),
    ALERT_BOT_CHAT_ID: optionalText(z.string().trim()),

    RESERVATION_TTL_MINUTES: int(15, 1, 1440),
    MAX_QTY_PER_ITEM: int(5, 1, 20),
    // unpaid orders one customer may hold open at a time — each one keeps stock reserved for RESERVATION_TTL_MINUTES
    MAX_OPEN_ORDERS_PER_USER: int(3, 1, 50),

    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_DIR: z.string().default('./storage'),
    S3_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().default('us-east-1'),
    S3_BUCKET: z.string().default('iphoneha-media'),
    S3_ACCESS_KEY: z.string().optional(),
    S3_SECRET_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: bool(true),

    PAYMENT_ONLINE_DRIVER: z.enum(['mock', 'zarinpal']).default('mock'),
    ZARINPAL_MERCHANT_ID: z.string().optional(),
    // unset → sandbox outside production, live gateway in production
    ZARINPAL_SANDBOX: optionalBool,
    // Installment services: `live` talks to the real API with the keys below
    // (deploy/installments.sh writes them); `sandbox` to the service's test
    // environment, which in production only the store's own staff are offered.
    // Never fatal: a service with a key missing is simply not offered, and the
    // log says which key.
    PAYMENT_SNAPPAY_DRIVER: liveDriver,
    PAYMENT_TARA_DRIVER: liveDriver,
    PAYMENT_DIGIPAY_DRIVER: liveDriver,
    // Nasiba publishes no merchant API; its client is written once its documentation arrives
    PAYMENT_NESIBA_DRIVER: z.enum(['mock']).default('mock'),
    PAYMENT_BOJET_DRIVER: liveDriver,
    PAYMENT_AZKIVAM_DRIVER: liveDriver,
    SNAPPAY_BASE_URL: optionalText(z.string().trim()),
    SNAPPAY_CLIENT_ID: optionalText(z.string().trim()),
    SNAPPAY_CLIENT_SECRET: optionalText(z.string()),
    SNAPPAY_USERNAME: optionalText(z.string().trim()),
    SNAPPAY_PASSWORD: optionalText(z.string()),
    SNAPPAY_COMMISSION_TYPE: optionalInt,
    DIGIPAY_BASE_URL: optionalText(z.string().trim()),
    DIGIPAY_CLIENT_ID: optionalText(z.string().trim()),
    DIGIPAY_CLIENT_SECRET: optionalText(z.string()),
    DIGIPAY_USERNAME: optionalText(z.string().trim()),
    DIGIPAY_PASSWORD: optionalText(z.string()),
    DIGIPAY_TICKET_TYPE: optionalInt,
    DIGIPAY_VERIFY_STYLE: z.preprocess(
      (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v),
      z.enum(['body', 'path']).catch('body'),
    ),
    DIGIPAY_SELLER_ID: optionalText(z.string().trim()),
    DIGIPAY_SUPPLIER_ID: optionalText(z.string().trim()),
    AZKIVAM_BASE_URL: optionalText(z.string().trim()),
    AZKIVAM_MERCHANT_ID: optionalText(z.string().trim()),
    AZKIVAM_API_KEY: optionalText(z.string().trim()),
    // Tara (تارا): the merchant's panel credentials and the «gateway code» (serviceId) of the shop
    TARA_BASE_URL: optionalText(z.string().trim()),
    TARA_USERNAME: optionalText(z.string().trim()),
    TARA_PASSWORD: optionalText(z.string()),
    TARA_SERVICE_ID: optionalText(z.string().trim()),
    // the Tara merchandise group phones are sold under (probe() lists the contract's groups); optional
    TARA_GROUP_CODE: optionalText(z.string().trim()),
    // Bajet (باجت, Bank Tejarat): JETPAY credentials and the terminal
    BAJET_BASE_URL: optionalText(z.string().trim()),
    BAJET_USERNAME: optionalText(z.string().trim()),
    BAJET_PASSWORD: optionalText(z.string()),
    BAJET_TERMINAL_ID: optionalText(z.string().trim()),
    // the basket item type Bajet assigned to phones; when unset no basket is sent (it is optional)
    BAJET_PRODUCT_TYPE: optionalInt,
    PAYMENT_DISABLED_METHODS: csv.pipe(z.array(z.enum(PAYMENT_METHODS))),
    // The mock gateway lets the payer approve a payment without paying. It is
    // only for development and tests: unset → allowed outside production only.
    ALLOW_MOCK_PAYMENTS: optionalBool,

    REVALIDATE_SECRET: z.string().default(''),
  })
  .superRefine((env, ctx) => {
    const require = (cond: boolean, path: string, message: string) => {
      if (!cond) ctx.addIssue({ code: 'custom', path: [path], message });
    };
    require(env.SMS_DRIVER !== 'kavenegar' ||
      Boolean(
        env.KAVENEGAR_API_KEY,
      ), 'KAVENEGAR_API_KEY', 'KAVENEGAR_API_KEY is required when SMS_DRIVER=kavenegar');
    require(env.SMS_DRIVER !== 'melipayamak' ||
      Boolean(
        env.MELIPAYAMAK_USERNAME && env.MELIPAYAMAK_PASSWORD && env.MELIPAYAMAK_OTP_BODY_ID,
      ), 'MELIPAYAMAK_OTP_BODY_ID', 'MELIPAYAMAK_USERNAME, MELIPAYAMAK_PASSWORD and MELIPAYAMAK_OTP_BODY_ID are required when SMS_DRIVER=melipayamak');
    require(env.PAYMENT_ONLINE_DRIVER !== 'zarinpal' ||
      Boolean(
        env.ZARINPAL_MERCHANT_ID,
      ), 'ZARINPAL_MERCHANT_ID', 'ZARINPAL_MERCHANT_ID is required when PAYMENT_ONLINE_DRIVER=zarinpal');
    require(env.STORAGE_DRIVER !== 's3' ||
      Boolean(
        env.S3_ACCESS_KEY && env.S3_SECRET_KEY && env.S3_ENDPOINT,
      ), 'S3_ACCESS_KEY', 'S3_ENDPOINT, S3_ACCESS_KEY and S3_SECRET_KEY are required when STORAGE_DRIVER=s3');
    if (env.NODE_ENV === 'production') {
      require(env.COOKIE_SECURE, 'COOKIE_SECURE', 'COOKIE_SECURE must be true in production');
      require(!env.OTP_SECRET.startsWith(
        'change-me',
      ), 'OTP_SECRET', 'OTP_SECRET must be changed from the example value in production');
      // a sandbox payment moves no money but still marks the order paid
      require(env.PAYMENT_ONLINE_DRIVER !== 'zarinpal' ||
        env.ZARINPAL_SANDBOX !== true ||
        env.ALLOW_MOCK_PAYMENTS ===
          true, 'ZARINPAL_SANDBOX', 'ZARINPAL_SANDBOX=true is not allowed in production (set ALLOW_MOCK_PAYMENTS=true only on a staging server)');
    }
  });

export type Env = z.infer<typeof envSchema>;

export interface AppConfig extends Env {
  isProduction: boolean;
  isTest: boolean;
  /** Public base the browser uses for the API, e.g. https://iphoneha.net/api */
  publicApiUrl: string;
  /** Base URL of product images, e.g. /media */
  mediaPublicBase: string;
  /** Effective flag: dev OTP echo is never available in production */
  exposeOtp: boolean;
  /** Whether payment methods backed by the mock gateway may be offered */
  allowMockPayments: boolean;
  /** Effective Zarinpal mode */
  zarinpalSandbox: boolean;
  sessionTtlMs: number;
  adminSessionTtlMs: number;
  reservationTtlMs: number;
}

export function buildAppConfig(raw: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || 'env'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  const env = parsed.data;
  const isProduction = env.NODE_ENV === 'production';
  return {
    ...env,
    isProduction,
    isTest: env.NODE_ENV === 'test',
    publicApiUrl: `${env.WEB_URL.replace(/\/$/, '')}/api`,
    mediaPublicBase: '/media',
    exposeOtp: env.DEV_EXPOSE_OTP && !isProduction,
    allowMockPayments: env.ALLOW_MOCK_PAYMENTS ?? !isProduction,
    zarinpalSandbox: env.ZARINPAL_SANDBOX ?? !isProduction,
    sessionTtlMs: env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    adminSessionTtlMs: env.ADMIN_SESSION_TTL_HOURS * 60 * 60 * 1000,
    reservationTtlMs: env.RESERVATION_TTL_MINUTES * 60 * 1000,
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');

type PaymentDriverConfig = Pick<
  AppConfig,
  | 'allowMockPayments'
  | 'PAYMENT_ONLINE_DRIVER'
  | 'PAYMENT_SNAPPAY_DRIVER'
  | 'PAYMENT_TARA_DRIVER'
  | 'PAYMENT_DIGIPAY_DRIVER'
  | 'PAYMENT_NESIBA_DRIVER'
  | 'PAYMENT_BOJET_DRIVER'
  | 'PAYMENT_AZKIVAM_DRIVER'
> &
  Partial<Pick<AppConfig, LiveInstallmentKey | BaseUrlKey>>;

/** The installment services that can be connected for real, and the keys each needs. */
export const LIVE_INSTALLMENT_KEYS = {
  SNAPPAY: ['SNAPPAY_CLIENT_ID', 'SNAPPAY_CLIENT_SECRET', 'SNAPPAY_USERNAME', 'SNAPPAY_PASSWORD'],
  TARA: ['TARA_USERNAME', 'TARA_PASSWORD', 'TARA_SERVICE_ID'],
  DIGIPAY: ['DIGIPAY_CLIENT_ID', 'DIGIPAY_CLIENT_SECRET', 'DIGIPAY_USERNAME', 'DIGIPAY_PASSWORD'],
  BOJET: ['BAJET_USERNAME', 'BAJET_PASSWORD', 'BAJET_TERMINAL_ID'],
  AZKIVAM: ['AZKIVAM_MERCHANT_ID', 'AZKIVAM_API_KEY'],
} as const;
export type LiveInstallmentMethod = keyof typeof LIVE_INSTALLMENT_KEYS;
type LiveInstallmentKey = (typeof LIVE_INSTALLMENT_KEYS)[LiveInstallmentMethod][number];
export type InstallmentDriver = 'mock' | 'live' | 'sandbox';
export const LIVE_INSTALLMENT_METHODS = Object.keys(LIVE_INSTALLMENT_KEYS) as LiveInstallmentMethod[];

/**
 * Where each service's API lives, for real money and for tests. AzkiVam has
 * no separate test host — its test keys work against the same API — so for
 * AzkiVam `sandbox` only means «offer it to the staff, not to customers».
 * Tara and Bajet publish no test environment at all (`sandbox: null`): their
 * `sandbox` driver needs the test address the service hands out, in
 * `TARA_BASE_URL` / `BAJET_BASE_URL`, or the service is not offered.
 */
export const INSTALLMENT_HOSTS: Record<LiveInstallmentMethod, { live: string; sandbox: string | null }> = {
  SNAPPAY: {
    live: 'https://api.snapppay.ir',
    sandbox: 'https://fms-gateway-staging.apps.public.okd4.teh-1.snappcloud.io',
  },
  TARA: { live: 'https://pay.tara360.ir/pay', sandbox: null },
  DIGIPAY: {
    live: 'https://api.mydigipay.com/digipay/api',
    sandbox: 'https://uat.mydigipay.info/digipay/api',
  },
  BOJET: { live: 'https://jetpay.mybajet.ir', sandbox: null },
  AZKIVAM: { live: 'https://api.azkivam.com', sandbox: 'https://api.azkivam.com' },
};

const LIVE_DRIVER_KEY = {
  SNAPPAY: 'PAYMENT_SNAPPAY_DRIVER',
  TARA: 'PAYMENT_TARA_DRIVER',
  DIGIPAY: 'PAYMENT_DIGIPAY_DRIVER',
  BOJET: 'PAYMENT_BOJET_DRIVER',
  AZKIVAM: 'PAYMENT_AZKIVAM_DRIVER',
} as const;
const BASE_URL_KEY = {
  SNAPPAY: 'SNAPPAY_BASE_URL',
  TARA: 'TARA_BASE_URL',
  DIGIPAY: 'DIGIPAY_BASE_URL',
  BOJET: 'BAJET_BASE_URL',
  AZKIVAM: 'AZKIVAM_BASE_URL',
} as const;
type BaseUrlKey = (typeof BASE_URL_KEY)[LiveInstallmentMethod];

export function installmentDriver(
  config: PaymentDriverConfig,
  method: LiveInstallmentMethod,
): InstallmentDriver {
  return config[LIVE_DRIVER_KEY[method]];
}

/**
 * The API a service is called on: the address set in .env, else the service's
 * own for the driver ('' for `sandbox` on a service without a known test host).
 */
export function installmentBaseUrl(config: PaymentDriverConfig, method: LiveInstallmentMethod): string {
  const hosts = INSTALLMENT_HOSTS[method];
  const url =
    config[BASE_URL_KEY[method]] ||
    (installmentDriver(config, method) === 'sandbox' ? (hosts.sandbox ?? '') : hosts.live);
  return url.replace(/\/+$/, '');
}

/** A test environment's address: a known test host, or staging/sandbox/uat/test/dev as a word of the host name. */
export function isTestHost(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  const known = Object.values(INSTALLMENT_HOSTS).some(
    (hosts) =>
      hosts.sandbox !== null && hosts.sandbox !== hosts.live && new URL(hosts.sandbox).hostname === host,
  );
  return known || /(^|[.-])(staging|stage|sandbox|uat|test|dev)([.-]|$)/.test(host);
}

/**
 * What stops a service set to `live` or `sandbox` from being offered: keys
 * still missing, or an address that cannot be right. Empty when it is ready
 * (or when it is not connected at all).
 */
export function missingLiveKeys(config: PaymentDriverConfig, method: LiveInstallmentMethod): string[] {
  const driver = installmentDriver(config, method);
  if (driver === 'mock') return [];
  const missing: string[] = LIVE_INSTALLMENT_KEYS[method].filter((key) => !config[key]);
  if (method === 'AZKIVAM' && config.AZKIVAM_API_KEY && !/^[0-9a-f]{64}$/i.test(config.AZKIVAM_API_KEY)) {
    missing.push('AZKIVAM_API_KEY (must be 64 hex characters)');
  }
  const urlKey = BASE_URL_KEY[method];
  const url = installmentBaseUrl(config, method);
  if (!url && driver === 'sandbox') {
    missing.push(
      `${urlKey} (this service has no public test environment — set the test address it gave you, or connect the live keys)`,
    );
  } else if (!/^https:\/\/[^/\s]+/i.test(url)) {
    missing.push(`${urlKey} (must be an https:// address)`);
  } else if (driver === 'live' && isTestHost(url)) {
    // a test environment approves payments without money: never behind a `live` switch
    missing.push(`${urlKey} (a test address — test keys go with ${LIVE_DRIVER_KEY[method]}=sandbox)`);
  }
  return missing;
}

/**
 * Services on their test environment where mock payments are not allowed
 * (production): registered and working, but offered at checkout only to the
 * store's own staff — a test payment is approved without money, so no customer
 * may ever pick one, and no storefront page advertises it.
 */
export function staffOnlyPaymentMethods(config: PaymentDriverConfig): PaymentMethod[] {
  if (config.allowMockPayments) return [];
  return LIVE_INSTALLMENT_METHODS.filter(
    (method) =>
      installmentDriver(config, method) === 'sandbox' && missingLiveKeys(config, method).length === 0,
  );
}

/**
 * Payment methods a customer cannot be offered with this configuration: those
 * still wired to the mock gateway when mock payments are not allowed
 * (production), services whose keys are incomplete, and services on their test
 * environment in production (see `staffOnlyPaymentMethods`). None of them is
 * shown to customers, and a customer's request for one is rejected.
 */
export function unavailablePaymentMethods(config: PaymentDriverConfig): PaymentMethod[] {
  const drivers: Record<PaymentMethod, string> = {
    ONLINE: config.PAYMENT_ONLINE_DRIVER,
    SNAPPAY: config.PAYMENT_SNAPPAY_DRIVER,
    TARA: config.PAYMENT_TARA_DRIVER,
    DIGIPAY: config.PAYMENT_DIGIPAY_DRIVER,
    NESIBA: config.PAYMENT_NESIBA_DRIVER,
    BOJET: config.PAYMENT_BOJET_DRIVER,
    AZKIVAM: config.PAYMENT_AZKIVAM_DRIVER,
  };
  return PAYMENT_METHODS.filter((method) => {
    const driver = drivers[method];
    if (driver === 'mock') return !config.allowMockPayments;
    if (!(method in LIVE_INSTALLMENT_KEYS)) return false;
    const live = method as LiveInstallmentMethod;
    return missingLiveKeys(config, live).length > 0 || (driver === 'sandbox' && !config.allowMockPayments);
  });
}
