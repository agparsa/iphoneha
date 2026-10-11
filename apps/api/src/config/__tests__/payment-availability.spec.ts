import {
  buildAppConfig,
  installmentBaseUrl,
  isTestHost,
  missingLiveKeys,
  staffOnlyPaymentMethods,
  unavailablePaymentMethods,
} from '../env.config';

const base = {
  DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/db',
  REDIS_URL: 'redis://127.0.0.1:6379/0',
  OTP_SECRET: 'a-long-random-secret-for-tests-only',
};
const production = { ...base, NODE_ENV: 'production', COOKIE_SECURE: 'true' };
const ALL = ['ONLINE', 'SNAPPAY', 'TARA', 'DIGIPAY', 'NESIBA', 'BOJET', 'AZKIVAM'];

describe('payment availability', () => {
  it('offers every mock-backed method in development', () => {
    const config = buildAppConfig({ ...base, NODE_ENV: 'development' });
    expect(config.allowMockPayments).toBe(true);
    expect(config.zarinpalSandbox).toBe(true);
    expect(unavailablePaymentMethods(config)).toEqual([]);
  });

  it('never offers a mock-backed method in production', () => {
    const config = buildAppConfig(production);
    expect(config.allowMockPayments).toBe(false);
    expect(unavailablePaymentMethods(config)).toEqual(ALL);
  });

  it('keeps a real Zarinpal gateway in production, on the live endpoint', () => {
    const config = buildAppConfig({
      ...production,
      PAYMENT_ONLINE_DRIVER: 'zarinpal',
      ZARINPAL_MERCHANT_ID: 'm-1',
    });
    expect(config.zarinpalSandbox).toBe(false);
    expect(unavailablePaymentMethods(config)).toEqual(ALL.filter((m) => m !== 'ONLINE'));
  });

  it('refuses a Zarinpal sandbox in production — it marks orders paid without money', () => {
    expect(() =>
      buildAppConfig({
        ...production,
        PAYMENT_ONLINE_DRIVER: 'zarinpal',
        ZARINPAL_MERCHANT_ID: 'm-1',
        ZARINPAL_SANDBOX: 'true',
      }),
    ).toThrow(/ZARINPAL_SANDBOX/);
  });

  it('allows mocks on a production-like staging server only when asked explicitly', () => {
    const config = buildAppConfig({ ...production, ALLOW_MOCK_PAYMENTS: 'true' });
    expect(unavailablePaymentMethods(config)).toEqual([]);
  });

  it('offers a live installment service in production once every key is there', () => {
    const snapp = {
      PAYMENT_SNAPPAY_DRIVER: 'live',
      SNAPPAY_CLIENT_ID: 'id',
      SNAPPAY_CLIENT_SECRET: 'secret',
      SNAPPAY_USERNAME: 'id-purchase',
      SNAPPAY_PASSWORD: 'pw',
    };
    const config = buildAppConfig({ ...production, ...snapp });
    expect(unavailablePaymentMethods(config)).toEqual(ALL.filter((m) => m !== 'SNAPPAY'));
  });

  it('never stops the store for a live service with a key missing: it is just not offered', () => {
    const config = buildAppConfig({
      ...production,
      PAYMENT_DIGIPAY_DRIVER: 'live',
      DIGIPAY_CLIENT_ID: 'id',
      PAYMENT_AZKIVAM_DRIVER: 'live',
      AZKIVAM_MERCHANT_ID: '12345',
      AZKIVAM_API_KEY: 'not-hex',
    });
    expect(missingLiveKeys(config, 'DIGIPAY')).toEqual([
      'DIGIPAY_CLIENT_SECRET',
      'DIGIPAY_USERNAME',
      'DIGIPAY_PASSWORD',
    ]);
    expect(missingLiveKeys(config, 'AZKIVAM')).toEqual(['AZKIVAM_API_KEY (must be 64 hex characters)']);
    expect(unavailablePaymentMethods(config)).toEqual(ALL);
    // not even in development, where mocks are allowed: a half-configured live service is off
    const dev = buildAppConfig({ ...base, NODE_ENV: 'development', PAYMENT_DIGIPAY_DRIVER: 'live' });
    expect(unavailablePaymentMethods(dev)).toEqual(['DIGIPAY']);
  });

  it('keeps a service on its test environment for the staff in production, and offers it to all in development', () => {
    const snapp = {
      PAYMENT_SNAPPAY_DRIVER: 'sandbox',
      SNAPPAY_CLIENT_ID: 'id',
      SNAPPAY_CLIENT_SECRET: 'secret',
      SNAPPAY_USERNAME: 'id-purchase',
      SNAPPAY_PASSWORD: 'pw',
    };
    const config = buildAppConfig({ ...production, ...snapp });
    expect(unavailablePaymentMethods(config)).toEqual(ALL);
    expect(staffOnlyPaymentMethods(config)).toEqual(['SNAPPAY']);
    expect(installmentBaseUrl(config, 'SNAPPAY')).toBe(
      'https://fms-gateway-staging.apps.public.okd4.teh-1.snappcloud.io',
    );
    expect(
      installmentBaseUrl(buildAppConfig({ ...production, PAYMENT_DIGIPAY_DRIVER: 'sandbox' }), 'DIGIPAY'),
    ).toBe('https://uat.mydigipay.info/digipay/api');

    const dev = buildAppConfig({ ...base, NODE_ENV: 'development', ...snapp });
    expect(unavailablePaymentMethods(dev)).toEqual([]);
    expect(staffOnlyPaymentMethods(dev)).toEqual([]);

    // test keys half typed in: not even for the staff
    const half = buildAppConfig({
      ...production,
      PAYMENT_DIGIPAY_DRIVER: 'sandbox',
      DIGIPAY_CLIENT_ID: 'id',
    });
    expect(staffOnlyPaymentMethods(half)).toEqual([]);
    expect(unavailablePaymentMethods(half)).toContain('DIGIPAY');
  });

  it('never lets a `live` switch point at a test environment, which approves payments without money', () => {
    const azki = {
      PAYMENT_AZKIVAM_DRIVER: 'live',
      AZKIVAM_MERCHANT_ID: '12345',
      AZKIVAM_API_KEY: 'a'.repeat(64),
    };
    expect(unavailablePaymentMethods(buildAppConfig({ ...production, ...azki }))).not.toContain('AZKIVAM');
    for (const url of [
      'https://uat.mydigipay.info/digipay/api',
      'https://fms-gateway-staging.apps.public.okd4.teh-1.snappcloud.io',
      'https://sandbox.azkivam.com',
      'https://api-test.azkivam.com/',
    ]) {
      const config = buildAppConfig({ ...production, ...azki, AZKIVAM_BASE_URL: url });
      expect(missingLiveKeys(config, 'AZKIVAM')).toEqual([
        expect.stringMatching(/^AZKIVAM_BASE_URL \(a test address/),
      ]);
      expect(unavailablePaymentMethods(config)).toContain('AZKIVAM');
    }
    const plain = buildAppConfig({ ...production, ...azki, AZKIVAM_BASE_URL: 'http://api.azkivam.com' });
    expect(missingLiveKeys(plain, 'AZKIVAM')).toEqual(['AZKIVAM_BASE_URL (must be an https:// address)']);
    // «dev» or «test» inside a word of a real host name is not a test host
    expect(isTestHost('https://api.devpay.ir')).toBe(false);
    expect(isTestHost('https://api.snapppay.ir')).toBe(false);
    expect(isTestHost('https://latest.mydigipay.com')).toBe(false);
  });

  it('connects Tara and Bajet with their own keys, and asks for a test address before a sandbox they do not publish', () => {
    const tara = {
      PAYMENT_TARA_DRIVER: 'live',
      TARA_USERNAME: 'u',
      TARA_PASSWORD: 'p',
      TARA_SERVICE_ID: '4410',
    };
    const bajet = {
      PAYMENT_BOJET_DRIVER: 'live',
      BAJET_USERNAME: 'u',
      BAJET_PASSWORD: 'p',
      BAJET_TERMINAL_ID: '880011',
    };
    const config = buildAppConfig({ ...production, ...tara, ...bajet });
    expect(unavailablePaymentMethods(config)).toEqual(ALL.filter((m) => m !== 'TARA' && m !== 'BOJET'));
    expect(installmentBaseUrl(config, 'TARA')).toBe('https://pay.tara360.ir/pay');
    expect(installmentBaseUrl(config, 'BOJET')).toBe('https://jetpay.mybajet.ir');
    expect(
      missingLiveKeys(
        buildAppConfig({ ...production, PAYMENT_BOJET_DRIVER: 'live', BAJET_USERNAME: 'u' }),
        'BOJET',
      ),
    ).toEqual(['BAJET_PASSWORD', 'BAJET_TERMINAL_ID']);

    // no public test environment: `sandbox` needs the address the service handed out
    const blind = buildAppConfig({ ...production, ...tara, PAYMENT_TARA_DRIVER: 'sandbox' });
    expect(missingLiveKeys(blind, 'TARA')).toEqual([
      expect.stringMatching(/^TARA_BASE_URL \(this service has no public test environment/),
    ]);
    expect(staffOnlyPaymentMethods(blind)).toEqual([]);
    const given = buildAppConfig({
      ...production,
      ...bajet,
      PAYMENT_BOJET_DRIVER: 'sandbox',
      BAJET_BASE_URL: 'https://jetpay-test.mybajet.ir/',
    });
    expect(missingLiveKeys(given, 'BOJET')).toEqual([]);
    expect(staffOnlyPaymentMethods(given)).toEqual(['BOJET']);
    expect(installmentBaseUrl(given, 'BOJET')).toBe('https://jetpay-test.mybajet.ir');
    // and that same address never passes as live
    expect(
      missingLiveKeys(
        buildAppConfig({ ...production, ...bajet, BAJET_BASE_URL: 'https://jetpay-test.mybajet.ir' }),
        'BOJET',
      ),
    ).toEqual([expect.stringMatching(/^BAJET_BASE_URL \(a test address/)]);
  });

  it('reads a mistyped driver as mock (never offered in production) instead of failing to start', () => {
    const config = buildAppConfig({ ...production, PAYMENT_SNAPPAY_DRIVER: 'Lvie' });
    expect(config.PAYMENT_SNAPPAY_DRIVER).toBe('mock');
    expect(buildAppConfig({ ...production, PAYMENT_SNAPPAY_DRIVER: ' LIVE ' }).PAYMENT_SNAPPAY_DRIVER).toBe(
      'live',
    );
    expect(buildAppConfig({ ...production, PAYMENT_SNAPPAY_DRIVER: 'Sandbox' }).PAYMENT_SNAPPAY_DRIVER).toBe(
      'sandbox',
    );
  });

  it('requires credentials and the OTP pattern for Melipayamak', () => {
    expect(() =>
      buildAppConfig({ ...production, SMS_DRIVER: 'melipayamak', MELIPAYAMAK_USERNAME: 'u' }),
    ).toThrow(/MELIPAYAMAK/);
    const config = buildAppConfig({
      ...production,
      SMS_DRIVER: 'melipayamak',
      MELIPAYAMAK_USERNAME: 'u',
      MELIPAYAMAK_PASSWORD: 'p',
      MELIPAYAMAK_OTP_BODY_ID: '12345',
    });
    expect(config.MELIPAYAMAK_OTP_BODY_ID).toBe(12345);
    expect(config.MELIPAYAMAK_ORDER_PAID_BODY_ID).toBeUndefined();
  });
});
