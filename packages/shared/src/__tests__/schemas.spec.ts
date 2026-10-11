import {
  DEFAULT_ALERT_SETTINGS,
  addressSchema,
  alertSettingsSchema,
  checkoutSchema,
  createVariantSchema,
  inventoryAdjustSchema,
  productListQuerySchema,
  createCreditRequestSchema,
  creditSettingsSchema,
  sendOtpSchema,
  updateCreditRequestSchema,
  seoSettingsSchema,
  verifyOtpSchema,
} from '../index';
import {
  DEFAULT_INSTALLMENT_TERMS,
  creditMonthOptions,
  creditPlanReady,
  estimateCreditPlan,
  estimateInstallment,
} from '../payments';
import { stockLabel, stockStatusOf } from '../stock';
import { buildInstallmentSchedule } from '../ledger';

describe('schemas', () => {
  it('normalizes phones in sendOtp', () => {
    expect(sendOtpSchema.parse({ phone: '+98 912 345 6789' })).toEqual({ phone: '09123456789' });
    expect(sendOtpSchema.safeParse({ phone: '12345' }).success).toBe(false);
  });

  it('accepts Persian OTP digits', () => {
    expect(verifyOtpSchema.parse({ phone: '09123456789', code: '۱۲۳۴۵۶' }).code).toBe('123456');
    expect(verifyOtpSchema.safeParse({ phone: '09123456789', code: '12a' }).success).toBe(false);
  });

  it('parses catalog queries', () => {
    const q = productListQuerySchema.parse({
      storage: '256,512',
      color: 'black',
      inStock: 'true',
      discounted: '0',
      shippingTime: 'SAME_DAY',
      sort: 'price_asc',
      page: '2',
    });
    expect(q).toMatchObject({
      storage: [256, 512],
      color: ['black'],
      inStock: true,
      discounted: false,
      shippingTime: ['SAME_DAY'],
      sort: 'price_asc',
      page: 2,
      pageSize: 12,
    });
    expect(productListQuerySchema.parse({}).sort).toBe('featured');
    expect(productListQuerySchema.safeParse({ shippingTime: 'TOMORROW' }).success).toBe(false);
  });

  it('validates addresses', () => {
    const ok = addressSchema.safeParse({
      recipientName: 'سارا محمدی',
      mobile: '09123456789',
      province: 'تهران',
      city: 'تهران',
      addressLine: 'خیابان ولیعصر، کوچه نمونه، پلاک ۱۲',
      postalCode: '۱۲۳۴۵۶۷۸۹۰',
    });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.postalCode).toBe('1234567890');
    expect(addressSchema.safeParse({ recipientName: 'a' }).success).toBe(false);
  });

  it('requires exactly one destination at checkout', () => {
    const base = { shippingMethodId: 'sm1', paymentMethod: 'ONLINE' };
    expect(checkoutSchema.safeParse(base).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...base, addressId: 'a1' }).success).toBe(true);
  });

  it('rejects compareAt below price', () => {
    const r = createVariantSchema.safeParse({
      colorId: 'c',
      storageId: 's',
      sku: 'ip17-256-blk',
      price: 100,
      compareAtPrice: 90,
      shippingTime: 'SAME_DAY',
    });
    expect(r.success).toBe(false);
    const ok = createVariantSchema.parse({
      colorId: 'c',
      storageId: 's',
      sku: 'ip17-256-blk',
      price: 100,
      compareAtPrice: 120,
      shippingTime: 'SAME_DAY',
    });
    expect(ok.sku).toBe('IP17-256-BLK');
  });

  it('validates inventory adjustments', () => {
    expect(inventoryAdjustSchema.safeParse({ mode: 'set', value: -1, reason: 'شمارش' }).success).toBe(false);
    expect(inventoryAdjustSchema.safeParse({ mode: 'delta', value: -1, reason: 'خرابی' }).success).toBe(true);
    expect(inventoryAdjustSchema.safeParse({ mode: 'delta', value: 0, reason: 'x y' }).success).toBe(false);
  });
});

describe('seo settings', () => {
  it('takes a verification code bare or inside the whole meta tag', () => {
    const parsed = seoSettingsSchema.parse({
      googleVerification:
        '<meta name="google-site-verification" content="aB3_dE5-fG7hI9jK1lM3nO5pQ7rS9tU1vW3xY5z" />',
      bingVerification: '  0123456789ABCDEF0123456789ABCDEF ',
      yandexVerification: '',
      ga4MeasurementId: ' g-ab12cd34ef ',
    });
    expect(parsed).toEqual({
      googleVerification: 'aB3_dE5-fG7hI9jK1lM3nO5pQ7rS9tU1vW3xY5z',
      bingVerification: '0123456789ABCDEF0123456789ABCDEF',
      yandexVerification: null,
      ga4MeasurementId: 'G-AB12CD34EF',
    });
  });

  it('starts empty and refuses anything that could break out of the page head', () => {
    expect(seoSettingsSchema.parse({})).toEqual({
      googleVerification: null,
      bingVerification: null,
      yandexVerification: null,
      ga4MeasurementId: null,
    });
    expect(
      seoSettingsSchema.safeParse({ googleVerification: 'abc"><script>alert(1)</script>' }).success,
    ).toBe(false);
    expect(seoSettingsSchema.safeParse({ ga4MeasurementId: 'UA-12345-1' }).success).toBe(false);
    expect(seoSettingsSchema.safeParse({ ga4MeasurementId: "G-ABC');alert(1)//" }).success).toBe(false);
  });
});

describe('cheque and promissory-note plans', () => {
  it('reads blanks as «not set» and Persian figures as numbers', () => {
    const parsed = creditSettingsSchema.parse({
      cheque: {
        minDownPaymentPercent: '۳۰',
        maxMonths: '12',
        monthlyFeePercent: '۳٫۵',
        maxFinanced: '۲۰۰٬۰۰۰٬۰۰۰',
        documents: 'کارت ملی\nدسته‌چک صیادی',
      },
      safte: { minDownPaymentPercent: '', maxMonths: null },
    });
    expect(parsed.cheque).toMatchObject({
      enabled: true,
      minDownPaymentPercent: 30,
      maxMonths: 12,
      monthlyFeePercent: 3.5,
      maxFinanced: 200_000_000,
    });
    expect(parsed.safte).toMatchObject({
      minDownPaymentPercent: null,
      maxMonths: null,
      monthlyFeePercent: null,
    });
    expect(parsed.approvalTime).toBe('');
    expect(creditPlanReady(parsed.cheque)).toBe(true);
    expect(creditPlanReady(parsed.safte)).toBe(false);
    expect(creditPlanReady({ ...parsed.cheque, enabled: false })).toBe(false);
  });

  it('refuses figures outside what a real plan can be', () => {
    const bad = creditSettingsSchema.safeParse({
      cheque: { minDownPaymentPercent: 95, maxMonths: 'دوازده' },
    });
    expect(bad.success).toBe(false);
    const paths = bad.success ? [] : bad.error.issues.map((issue) => issue.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['cheque.minDownPaymentPercent', 'cheque.maxMonths']));
  });

  it('quotes a flat monthly fee on what is left after the down payment', () => {
    const plan = creditSettingsSchema.parse({
      cheque: { minDownPaymentPercent: 30, maxMonths: 10, monthlyFeePercent: 4 },
    }).cheque;
    if (!creditPlanReady(plan)) throw new Error('plan should be ready');
    const estimate = estimateCreditPlan(100_000_000, plan);
    // 30% down, 70M left, 4% × 10 months = +40% → 98M over 10 months
    expect(estimate).toMatchObject({ downPayment: 30_000_000, financed: 70_000_000, months: 10 });
    expect(estimate.totalRepayment).toBe(98_000_000);
    expect(estimate.monthly).toBe(9_800_000);
    expect(estimate.raisedForCeiling).toBe(false);
    expect(creditMonthOptions(10)).toEqual([3, 4, 6, 9, 10]);
  });

  it('quotes to the toman: rounded down payment, exact fee, instalments that add up to the total', () => {
    const plan = creditSettingsSchema.parse({
      safte: { minDownPaymentPercent: 25, maxMonths: 12, monthlyFeePercent: 4.5 },
    }).safte;
    if (!creditPlanReady(plan)) throw new Error('plan should be ready');
    const estimate = estimateCreditPlan(112_900_000, plan, { months: 7 });
    // 25% of 112.9M = 28.225M, rounded up to 28.3M; 84.6M left
    expect(estimate.downPayment).toBe(28_300_000);
    expect(estimate.financed).toBe(84_600_000);
    // 4.5% × 7 = 31.5% of 84.6M = 26,649,000
    expect(estimate.fee).toBe(26_649_000);
    expect(estimate.totalRepayment).toBe(111_249_000);
    expect(estimate.installments).toHaveLength(7);
    expect(estimate.installments.reduce((sum, value) => sum + value, 0)).toBe(estimate.totalRepayment);
    expect(estimate.monthly % 10_000).toBe(0);
    expect(estimate.installments.slice(0, -1).every((value) => value === estimate.monthly)).toBe(true);
    expect(estimate.lastInstallment).toBe(estimate.totalRepayment - estimate.monthly * 6);
    expect(estimate.totalCost).toBe(estimate.downPayment + estimate.totalRepayment);

    // the panel writes the contract with the same figures
    const rows = buildInstallmentSchedule({
      financed: estimate.financed,
      months: 7,
      monthlyFeePercent: 4.5,
      firstDueDate: '2026-11-01',
    });
    expect(rows.map((row) => row.amount)).toEqual(estimate.installments);
  });

  it('never quotes a negative or drifting instalment, whatever the price', () => {
    const plan = creditSettingsSchema.parse({
      cheque: { minDownPaymentPercent: 0, maxMonths: 36, monthlyFeePercent: 3.7 },
    }).cheque;
    if (!creditPlanReady(plan)) throw new Error('plan should be ready');
    for (const price of [1_000, 99_999, 7_777_777, 58_900_000, 999_999_999]) {
      for (const months of [1, 3, 11, 36]) {
        const e = estimateCreditPlan(price, plan, { months });
        expect(e.installments.every((value) => value >= 0)).toBe(true);
        expect(e.installments.reduce((sum, value) => sum + value, 0)).toBe(e.totalRepayment);
        expect(e.downPayment + e.financed).toBe(price);
      }
    }
  });

  it('raises the down payment when the rest would pass the ceiling', () => {
    const plan = creditSettingsSchema.parse({
      cheque: { minDownPaymentPercent: 20, maxMonths: 6, monthlyFeePercent: 0, maxFinanced: 60_000_000 },
    }).cheque;
    if (!creditPlanReady(plan)) throw new Error('plan should be ready');
    const estimate = estimateCreditPlan(100_000_000, plan);
    expect(estimate.raisedForCeiling).toBe(true);
    expect(estimate.downPaymentPercent).toBe(40);
    expect(estimate.financed).toBe(60_000_000);
  });
});

describe('credit request form', () => {
  const valid = { name: 'علی رضایی', phone: '۰۹۱۲۱۲۳۴۵۶۷', method: 'CHEQUE' };

  it('normalises the phone and turns empty optional fields into null', () => {
    const parsed = createCreditRequestSchema.parse({ ...valid, city: '  ', note: '' });
    expect(parsed).toMatchObject({ phone: '09121234567', city: null, note: null });
  });

  it('only accepts a site path as the source page', () => {
    expect(createCreditRequestSchema.safeParse({ ...valid, source: '/installments/cheque' }).success).toBe(
      true,
    );
    expect(createCreditRequestSchema.safeParse({ ...valid, source: 'https://x.example/' }).success).toBe(
      false,
    );
    expect(createCreditRequestSchema.safeParse({ ...valid, source: '/a?b=c' }).success).toBe(false);
  });

  it('leaves the staff note alone when an update only changes the status', () => {
    expect(updateCreditRequestSchema.parse({ status: 'CONTACTED' })).toEqual({ status: 'CONTACTED' });
    expect(updateCreditRequestSchema.parse({ adminNote: '' })).toEqual({ adminNote: null });
    expect(updateCreditRequestSchema.parse({ adminNote: ' تماس فردا ' })).toEqual({ adminNote: 'تماس فردا' });
    expect(updateCreditRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe('staff alert settings', () => {
  it('turns both alerts on and texts the owner until someone else is listed', () => {
    expect(alertSettingsSchema.parse({})).toEqual(DEFAULT_ALERT_SETTINGS);
    expect(DEFAULT_ALERT_SETTINGS).toEqual({ mobiles: [], creditRequests: true, paidOrders: true });
  });

  it('normalises the mobiles and drops a number typed twice', () => {
    const parsed = alertSettingsSchema.parse({ mobiles: ['۰۹۱۲۱۲۳۴۵۶۷', '0912 123 4567', '+989351234567'] });
    expect(parsed.mobiles).toEqual(['09121234567', '09351234567']);
  });

  it('takes at most three valid mobiles', () => {
    expect(alertSettingsSchema.safeParse({ mobiles: ['0912'] }).success).toBe(false);
    const four = ['09121111111', '09122222222', '09123333333', '09124444444'];
    expect(alertSettingsSchema.safeParse({ mobiles: four }).success).toBe(false);
  });
});

describe('helpers', () => {
  it('estimates installments', () => {
    const e = estimateInstallment(100_000_000, DEFAULT_INSTALLMENT_TERMS.DIGIPAY, { months: 12 });
    expect(e.downPayment).toBe(25_000_000);
    expect(e.financed).toBe(75_000_000);
    expect(e.totalRepayment).toBe(92_250_000);
    expect(e.monthly).toBe(7_700_000);
    const snap = estimateInstallment(100_000_000, DEFAULT_INSTALLMENT_TERMS.SNAPPAY, { months: 12 });
    expect(snap.months).toBe(4);
  });

  it('labels stock', () => {
    expect(stockStatusOf(0)).toBe('OUT_OF_STOCK');
    expect(stockStatusOf(2)).toBe('LOW_STOCK');
    expect(stockStatusOf(3)).toBe('IN_STOCK');
    expect(stockLabel(2)).toBe('فقط ۲ عدد');
    expect(stockLabel(10)).toBe('موجود');
    expect(stockLabel(0)).toBe('ناموجود');
  });
});
