import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DEFAULT_INSTALLMENT_TERMS,
  INSTALLMENT_METHODS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_INFO,
  type InstallmentMethod,
  type InstallmentTerms,
  type PaymentConnectionDto,
  type PaymentMethod,
  type PaymentMethodOptionDto,
} from '@iphoneha/shared';
import {
  APP_CONFIG,
  LIVE_INSTALLMENT_METHODS,
  installmentBaseUrl,
  installmentDriver,
  missingLiveKeys,
  staffOnlyPaymentMethods,
  unavailablePaymentMethods,
  type AppConfig,
  type LiveInstallmentMethod,
} from '../../config/env.config';
import { Errors } from '../../common/errors';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { MockGatewayService } from './providers/mock-gateway.service';
import type { PaymentProvider } from './providers/payment-provider.interface';
import { MockOnlineProvider } from './providers/online/mock-online.provider';
import { ZarinpalProvider } from './providers/online/zarinpal.provider';
import {
  MockInstallmentClient,
  type InstallmentGatewayClient,
} from './providers/installment/installment-gateway.client';
import { SnapPayProvider } from './providers/installment/snappay.provider';
import { TaraProvider } from './providers/installment/tara.provider';
import { DigipayProvider } from './providers/installment/digipay.provider';
import { NesibaProvider } from './providers/installment/nesiba.provider';
import { BojetProvider } from './providers/installment/bojet.provider';
import { AzkiVamProvider } from './providers/installment/azkivam.provider';
import { liveInstallmentClient } from './providers/installment/live/factory';

/**
 * Who is about to pay: a customer account (by mobile, or by id when only the
 * order is at hand). Decides whether a service on its test environment is
 * offered — only to the store's own staff.
 */
export type Buyer = { phone: string } | { userId: string };

@Injectable()
export class PaymentProviderRegistry {
  private readonly logger = new Logger('Payments');
  private readonly providers = new Map<PaymentMethod, PaymentProvider>();
  /** Methods no customer can be offered (mock where mocks are not allowed, keys missing, test environments in production). */
  private readonly unavailable: ReadonlySet<PaymentMethod>;
  /** Services on their test environment in production: registered, but offered to the staff only. */
  private readonly staffOnly: ReadonlySet<PaymentMethod>;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly gateway: MockGatewayService,
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
  ) {
    const mockBaseUrl = `${config.publicApiUrl}/payments/mock`;
    const termsFactory = (method: InstallmentMethod) => async (): Promise<InstallmentTerms> => {
      const payments = await this.settings.get('payments');
      return payments.installmentTerms.find((t) => t.method === method) ?? DEFAULT_INSTALLMENT_TERMS[method];
    };
    const installmentClient = (method: InstallmentMethod): InstallmentGatewayClient =>
      // `live`/`sandbox` services are only reached with every key present (an incomplete one is never registered)
      ((LIVE_INSTALLMENT_METHODS as readonly string[]).includes(method)
        ? liveInstallmentClient(method as LiveInstallmentMethod, config)
        : null) ?? new MockInstallmentClient(this.gateway, mockBaseUrl);

    this.unavailable = new Set(unavailablePaymentMethods(config));
    this.staffOnly = new Set(staffOnlyPaymentMethods(config));
    for (const method of LIVE_INSTALLMENT_METHODS) {
      const missing = missingLiveKeys(config, method);
      if (missing.length > 0) {
        this.logger.error(`${method} is not offered: ${missing.join(', ')} — run deploy/installments.sh`);
      } else if (this.staffOnly.has(method)) {
        this.logger.warn(
          `${method} runs on its TEST environment (${installmentBaseUrl(config, method)}): offered only to the store's staff`,
        );
      }
    }
    const register = (method: PaymentMethod, create: () => PaymentProvider): void => {
      // a mock-backed method is never even constructed where mocks are not allowed
      if (!this.unavailable.has(method) || this.staffOnly.has(method)) this.providers.set(method, create());
    };

    register('ONLINE', () =>
      config.PAYMENT_ONLINE_DRIVER === 'zarinpal'
        ? new ZarinpalProvider(config.ZARINPAL_MERCHANT_ID as string, config.zarinpalSandbox)
        : new MockOnlineProvider(this.gateway, mockBaseUrl),
    );
    register('SNAPPAY', () => new SnapPayProvider(installmentClient('SNAPPAY'), termsFactory('SNAPPAY')));
    register('TARA', () => new TaraProvider(installmentClient('TARA'), termsFactory('TARA')));
    register('DIGIPAY', () => new DigipayProvider(installmentClient('DIGIPAY'), termsFactory('DIGIPAY')));
    register('NESIBA', () => new NesibaProvider(installmentClient('NESIBA'), termsFactory('NESIBA')));
    register('BOJET', () => new BojetProvider(installmentClient('BOJET'), termsFactory('BOJET')));
    register('AZKIVAM', () => new AzkiVamProvider(installmentClient('AZKIVAM'), termsFactory('AZKIVAM')));
  }

  get(method: PaymentMethod): PaymentProvider {
    const provider = this.providers.get(method);
    if (!provider)
      throw Errors.badRequest('PAYMENT_METHOD_UNAVAILABLE', 'این روش پرداخت در حال حاضر در دسترس نیست');
    return provider;
  }

  byCode(code: string): PaymentProvider | null {
    for (const provider of this.providers.values()) if (provider.code === code) return provider;
    return null;
  }

  /**
   * Whether the buyer is the store's own staff: a customer account whose
   * mobile belongs to an active admin. Only asked while a service runs on its
   * test environment in production.
   */
  async isStaff(buyer?: Buyer | null): Promise<boolean> {
    if (!buyer || this.staffOnly.size === 0) return false;
    let phone = 'phone' in buyer ? buyer.phone : null;
    if (!phone && 'userId' in buyer) {
      const user = await this.prisma.user.findUnique({
        where: { id: buyer.userId },
        select: { phone: true },
      });
      phone = user?.phone ?? null;
    }
    if (!phone) return false;
    return (await this.prisma.adminUser.count({ where: { phone, isActive: true } })) > 0;
  }

  /**
   * Disabled in settings, disabled by env, or not available with this
   * configuration. With `staff`, the services on their test environment are
   * available too — to the store's staff, never to a customer.
   */
  async disabledMethods(options: { staff?: boolean } = {}): Promise<PaymentMethod[]> {
    const settings = await this.settings.get('payments');
    const unavailable = [...this.unavailable].filter(
      (method) => !(options.staff && this.staffOnly.has(method)),
    );
    return [
      ...new Set([...this.config.PAYMENT_DISABLED_METHODS, ...settings.disabledMethods, ...unavailable]),
    ];
  }

  async assertEnabled(method: PaymentMethod, buyer?: Buyer | null): Promise<PaymentProvider> {
    const staff = this.staffOnly.has(method) && (await this.isStaff(buyer));
    const disabled = await this.disabledMethods({ staff });
    if (disabled.includes(method)) {
      throw Errors.badRequest('PAYMENT_METHOD_DISABLED', 'این روش پرداخت در حال حاضر غیرفعال است');
    }
    return this.get(method);
  }

  /** Payment options shown at checkout, with per-method eligibility for the amount. */
  async options(amount: number, buyer?: Buyer | null): Promise<PaymentMethodOptionDto[]> {
    const disabled = await this.disabledMethods({ staff: await this.isStaff(buyer) });
    const options: PaymentMethodOptionDto[] = [];
    for (const method of PAYMENT_METHODS) {
      if (disabled.includes(method)) continue;
      const provider = this.providers.get(method);
      if (!provider) continue;
      const info = PAYMENT_METHOD_INFO[method];
      const test = this.staffOnly.has(method);
      const eligibility = await provider.checkEligibility({ amount });
      options.push({
        method,
        kind: info.kind,
        name: test ? `${info.name} (آزمایشی)` : info.name,
        tagline: test
          ? 'محیط آزمایشی سرویس: فقط کارکنان فروشگاه این گزینه را می‌بینند و پولی جابه‌جا نمی‌شود'
          : info.tagline,
        color: info.color,
        logo: info.logo,
        eligible: eligibility.eligible,
        reason: eligibility.reason,
        estimate: eligibility.estimate,
      });
    }
    return options;
  }

  /** How each method is connected on this server, for the panel. Only key names, never a key. */
  connections(): PaymentConnectionDto[] {
    const simulator = (method: PaymentMethod): PaymentConnectionDto => ({
      method,
      state: this.config.allowMockPayments ? 'MOCK' : 'OFF',
      detail: null,
    });
    return PAYMENT_METHODS.map((method): PaymentConnectionDto => {
      if (method === 'ONLINE') {
        if (this.config.PAYMENT_ONLINE_DRIVER !== 'zarinpal') return simulator(method);
        return { method, state: this.config.zarinpalSandbox ? 'TEST' : 'LIVE', detail: 'Zarinpal' };
      }
      if (!(LIVE_INSTALLMENT_METHODS as readonly string[]).includes(method)) return simulator(method);
      const live = method as LiveInstallmentMethod;
      const driver = installmentDriver(this.config, live);
      if (driver === 'mock') return simulator(method);
      const missing = missingLiveKeys(this.config, live);
      if (missing.length > 0) return { method, state: 'INCOMPLETE', detail: missing.join(', ') };
      return {
        method,
        state: driver === 'live' ? 'LIVE' : 'TEST',
        detail: installmentBaseUrl(this.config, live),
      };
    });
  }

  /** Terms used by the installment calculator page — only for methods a customer can actually use. */
  async installmentTerms(): Promise<InstallmentTerms[]> {
    const [payments, disabled] = await Promise.all([this.settings.get('payments'), this.disabledMethods()]);
    return INSTALLMENT_METHODS.filter((method) => !disabled.includes(method)).map(
      (method) =>
        payments.installmentTerms.find((t) => t.method === method) ?? DEFAULT_INSTALLMENT_TERMS[method],
    );
  }
}
