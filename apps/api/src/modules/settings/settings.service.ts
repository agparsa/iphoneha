import { Injectable } from '@nestjs/common';
import {
  DEFAULT_ALERT_SETTINGS,
  DEFAULT_CREDIT_SETTINGS,
  DEFAULT_LEDGER_SETTINGS,
  DEFAULT_INSTALLMENT_TERMS,
  INSTALLMENT_METHODS,
  SETTINGS_SCHEMAS,
  type AlertSettings,
  type CommerceSettings,
  type CreditSettings,
  type HomeSettings,
  type LedgerSettings,
  type PaymentSettings,
  type SeoSettings,
  type SettingsKey,
  type StoreSettings,
} from '@iphoneha/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CacheService } from '../../infra/redis/cache.service';
import { Errors } from '../../common/errors';

export const DEFAULT_SETTINGS = {
  store: {
    name: 'آیفونی‌ها',
    tagline: 'مرجع تخصصی خرید آیفون',
    phone: '۰۲۱-۹۱۰۰۲۲۳۳',
    supportMobile: null,
    email: null,
    address: '',
    workingHours: 'شنبه تا پنجشنبه، ۱۰ تا ۲۰',
    instagram: null,
    telegram: null,
    announcement: 'ارسال رایگان سفارش‌های بالای ۵۰ میلیون تومان به سراسر ایران',
    legalName: '',
    warrantyMonths: 18,
    returnDays: 7,
    enamadId: null,
    enamadCode: null,
  } satisfies StoreSettings,
  home: {
    heroBanners: [],
    categorySlugs: [],
  } satisfies HomeSettings,
  payments: {
    disabledMethods: [],
    installmentTerms: INSTALLMENT_METHODS.map((method) => DEFAULT_INSTALLMENT_TERMS[method]),
  } satisfies PaymentSettings,
  commerce: {
    freeShippingThreshold: 50_000_000,
    maxQtyPerItem: 5,
  } satisfies CommerceSettings,
  // nothing is verified or tracked until the owner pastes his own codes
  seo: {
    googleVerification: null,
    bingVerification: null,
    yandexVerification: null,
    ga4MeasurementId: null,
  } satisfies SeoSettings,
  // offered, but no figure is shown until the owner enters his real terms
  credit: DEFAULT_CREDIT_SETTINGS,
  // staff only: never part of the storefront config
  alerts: DEFAULT_ALERT_SETTINGS,
  // staff only: the instalment ledger's reminders and contract text
  ledger: DEFAULT_LEDGER_SETTINGS,
} as const;

type SettingsMap = {
  store: StoreSettings;
  home: HomeSettings;
  payments: PaymentSettings;
  commerce: CommerceSettings;
  seo: SeoSettings;
  credit: CreditSettings;
  alerts: AlertSettings;
  ledger: LedgerSettings;
};

@Injectable()
export class SettingsService {
  private static readonly NAMESPACE = 'settings';
  private static readonly TTL = 120;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async get<K extends SettingsKey>(key: K): Promise<SettingsMap[K]> {
    const cacheKey = await this.cache.versionedKey(SettingsService.NAMESPACE, key);
    const cached = await this.cache.get<SettingsMap[K]>(cacheKey);
    if (cached) return cached;

    const row = await this.prisma.setting.findUnique({ where: { key } });
    const schema = SETTINGS_SCHEMAS[key];
    const parsed = row ? schema.safeParse(row.value) : null;
    const value = (parsed?.success ? parsed.data : DEFAULT_SETTINGS[key]) as SettingsMap[K];
    await this.cache.set(cacheKey, value, SettingsService.TTL);
    return value;
  }

  async all(): Promise<SettingsMap> {
    const [store, home, payments, commerce, seo, credit, alerts, ledger] = await Promise.all([
      this.get('store'),
      this.get('home'),
      this.get('payments'),
      this.get('commerce'),
      this.get('seo'),
      this.get('credit'),
      this.get('alerts'),
      this.get('ledger'),
    ]);
    return { store, home, payments, commerce, seo, credit, alerts, ledger };
  }

  async set<K extends SettingsKey>(key: K, value: unknown): Promise<SettingsMap[K]> {
    const schema = SETTINGS_SCHEMAS[key];
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      throw Errors.validation({
        fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.') || '_', i.message])),
      });
    }
    await this.prisma.setting.upsert({
      where: { key },
      create: { key, value: parsed.data as object },
      update: { value: parsed.data as object },
    });
    await this.cache.bumpVersion(SettingsService.NAMESPACE);
    return parsed.data as SettingsMap[K];
  }
}
