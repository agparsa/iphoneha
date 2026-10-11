import {
  bulkPriceSchema,
  calendarDaySchema,
  contractCreateSchema,
  deviceReceiveSchema,
  manualOrderSchema,
  reportQuerySchema,
} from '../schemas/backoffice';
import { isValidImei, isValidNationalId, isValidSayadId } from '../identifiers';
import { ORDER_PAYMENT_METHODS, PAYMENT_METHODS, isOfflinePaymentMethod } from '../enums';
import { paymentMethodName } from '../payments';
import { ROLE_PERMISSIONS } from '../permissions';
import { buildInstallmentSchedule, scheduleMarkup } from '../ledger';
import { isLeapJalaliYear, isoToJalali, jalaliToIso } from '../jalali';

const IMEI_A = '490154203237518';
const IMEI_B = '356938035643809';

describe('identifiers', () => {
  it('checks IMEIs with the Luhn digit', () => {
    expect(isValidImei(IMEI_A)).toBe(true);
    expect(isValidImei('490154203237519')).toBe(false);
    expect(isValidImei('49015420323751')).toBe(false);
  });

  it('checks national IDs and Sayad IDs', () => {
    expect(isValidNationalId('0012345679')).toBe(true);
    expect(isValidNationalId('1234567891')).toBe(true);
    expect(isValidNationalId('0012345678')).toBe(false);
    expect(isValidNationalId('1111111111')).toBe(false);
    expect(isValidSayadId('1234567890123456')).toBe(true);
    expect(isValidSayadId('123456789012345')).toBe(false);
  });
});

describe('back-office schemas', () => {
  it('takes a day as ISO or as typed in Jalali', () => {
    expect(calendarDaySchema.parse('1405/07/04')).toBe('2026-09-26');
    expect(calendarDaySchema.parse('2026-09-26')).toBe('2026-09-26');
    expect(calendarDaySchema.safeParse('1405/12/30').success).toBe(false);
  });

  it('reads scanned IMEIs in any digits and refuses a batch with the same phone twice', () => {
    const ok = deviceReceiveSchema.parse({
      variantId: 'v1',
      units: [{ imei: '۴۹۰۱۵۴ ۲۰۳۲۳۷۵۱۸' }, { imei: IMEI_B, imei2: '' }],
    });
    expect(ok.units.map((u) => u.imei)).toEqual([IMEI_A, IMEI_B]);
    expect(ok.units[1]!.imei2).toBeNull();
    expect(ok.costPrice).toBeNull();

    const twice = deviceReceiveSchema.safeParse({
      variantId: 'v1',
      units: [{ imei: IMEI_A }, { imei: IMEI_A }],
    });
    expect(twice.success).toBe(false);
    const bad = deviceReceiveSchema.safeParse({ variantId: 'v1', units: [{ imei: '490154203237519' }] });
    expect(bad.success).toBe(false);
  });

  const contract = {
    method: 'CHEQUE',
    customer: { name: 'مشتری آزمایشی', phone: '09121234567' },
    itemDescription: 'آیفون ۱۷ پرو ۲۵۶ گیگ',
    cashPrice: 100_000_000,
    downPayment: 30_000_000,
    contractDate: '1405/07/04',
    installments: [
      { dueDate: '1405/08/04', amount: 40_000_000 },
      { dueDate: '1405/09/04', amount: 40_000_000 },
    ],
    cheques: [
      {
        installmentIndex: 1,
        sayadId: '1234567890123456',
        bankName: 'ملت',
        drawerName: 'مشتری آزمایشی',
        amount: 40_000_000,
        dueDate: '1405/08/04',
      },
    ],
  };

  it('accepts a contract and normalises its dates', () => {
    const parsed = contractCreateSchema.parse(contract);
    expect(parsed.contractDate).toBe('2026-09-26');
    expect(parsed.installments[0]!.dueDate).toBe('2026-10-26');
    expect(parsed.guarantor).toBeNull();
    expect(parsed.downPaymentChannel).toBe('POS');
  });

  it('refuses a contract that cannot be right', () => {
    const issues = (input: unknown) =>
      (contractCreateSchema.safeParse(input).error?.issues ?? []).map((i) => i.message);
    expect(issues({ ...contract, downPayment: 200_000_000 })).toContain('پیش‌پرداخت از قیمت کالا بیشتر است');
    expect(
      issues({ ...contract, installments: [contract.installments[1], contract.installments[0]] }),
    ).toContain('سررسیدها باید به ترتیب باشند');
    expect(issues({ ...contract, cheques: [contract.cheques[0], { ...contract.cheques[0] }] })).toEqual(
      expect.arrayContaining(['این شناسهٔ صیادی تکراری است']),
    );
    expect(issues({ ...contract, cheques: [{ ...contract.cheques[0], installmentIndex: 5 }] })).toContain(
      'چنین قسطی نیست',
    );
    expect(issues({ ...contract, nationalId: '0012345678' })).toContain('کد ملی معتبر نیست');
  });

  it('describes a phone or in-store order with any of the three payment ways', () => {
    const base = {
      source: 'IN_STORE',
      customer: { phone: '+98 912 123 4567' },
      items: [{ variantId: 'v1', quantity: 1 }],
      delivery: { type: 'PICKUP' },
    };
    const cash = manualOrderSchema.parse({ ...base, payment: { method: 'IN_STORE', channel: 'POS' } });
    expect(cash.customer.phone).toBe('09121234567');
    expect(cash.discount).toBe(0);
    expect(cash.items[0]!.deviceIds).toEqual([]);

    const cheque = manualOrderSchema.parse({
      ...base,
      payment: { method: 'CHEQUE', contract: { ...contract, method: undefined } },
    });
    expect(cheque.payment.method).toBe('CHEQUE');

    expect(manualOrderSchema.safeParse({ ...base, payment: { method: 'ONLINE' } }).success).toBe(false);
    expect(
      manualOrderSchema.safeParse({ ...base, items: [], payment: { method: 'IN_STORE', channel: 'CASH' } })
        .success,
    ).toBe(false);
  });

  it('bounds bulk price changes and report ranges', () => {
    expect(bulkPriceSchema.parse({ variantIds: ['a'], mode: 'PERCENT', value: '5' })).toMatchObject({
      rounding: 100_000,
      dryRun: true,
      target: 'PRICE',
    });
    expect(
      bulkPriceSchema.safeParse({ variantIds: ['a'], mode: 'PERCENT', value: 5, rounding: 500 }).success,
    ).toBe(false);
    expect(reportQuerySchema.safeParse({ from: '1405/07/10', to: '1405/07/01' }).success).toBe(false);
    expect(reportQuerySchema.parse({ from: '1405/07/01', to: '1405/07/30' })).toEqual({
      from: '2026-09-23',
      to: '2026-10-22',
    });
  });
});

describe('offline payment methods', () => {
  it('are orders’ payment methods but never checkout ones', () => {
    expect(ORDER_PAYMENT_METHODS).toEqual([...PAYMENT_METHODS, 'IN_STORE', 'CHEQUE', 'SAFTE']);
    expect(isOfflinePaymentMethod('CHEQUE')).toBe(true);
    expect(isOfflinePaymentMethod('SNAPPAY')).toBe(false);
    expect(paymentMethodName('SAFTE')).toBe('اقساط با سفته');
    expect(paymentMethodName('ONLINE')).toBe('پرداخت آنلاین');
  });

  it('are recorded only by managers; support staff read the ledger and keep notes', () => {
    expect(ROLE_PERMISSIONS.MANAGER).toEqual(
      expect.arrayContaining(['orders.create', 'installments.write', 'reports.read']),
    );
    expect(ROLE_PERMISSIONS.SUPPORT).toEqual(expect.arrayContaining(['installments.read', 'users.notes']));
    expect(ROLE_PERMISSIONS.SUPPORT).not.toContain('installments.write');
    expect(ROLE_PERMISSIONS.WAREHOUSE).not.toContain('orders.create');
  });
});

describe('buildInstallmentSchedule', () => {
  it('splits the financed amount and the flat monthly fee into equal rounded instalments', () => {
    const rows = buildInstallmentSchedule({
      financed: 50_000_000,
      months: 6,
      monthlyFeePercent: 4,
      firstDueDate: '2026-10-26',
    });
    // 50M × (1 + 24%) = 62M: 10,330,000 × 5 and the rest in the last
    expect(rows.map((r) => r.amount)).toEqual([
      10_330_000, 10_330_000, 10_330_000, 10_330_000, 10_330_000, 10_350_000,
    ]);
    expect(rows.reduce((sum, r) => sum + r.amount, 0)).toBe(62_000_000);
    expect(scheduleMarkup(rows, 50_000_000)).toBe(12_000_000);
  });

  it('keeps the Jalali day of the month, clamped in shorter months', () => {
    // 31 Shahrivar 1405 → 30 Mehr (Mehr has 30 days) → 30 Aban → … → 29/30 Esfand
    const first = jalaliToIso({ jy: 1405, jm: 6, jd: 31 });
    const rows = buildInstallmentSchedule({
      financed: 12_000_000,
      months: 7,
      monthlyFeePercent: 0,
      firstDueDate: first,
    });
    expect(rows.map((r) => isoToJalali(r.dueDate))).toEqual([
      { jy: 1405, jm: 6, jd: 31 },
      { jy: 1405, jm: 7, jd: 30 },
      { jy: 1405, jm: 8, jd: 30 },
      { jy: 1405, jm: 9, jd: 30 },
      { jy: 1405, jm: 10, jd: 30 },
      { jy: 1405, jm: 11, jd: 30 },
      { jy: 1405, jm: 12, jd: isLeapJalaliYear(1405) ? 30 : 29 },
    ]);
  });

  it('never leaves the last instalment at zero', () => {
    const rows = buildInstallmentSchedule({
      financed: 25_000,
      months: 3,
      monthlyFeePercent: 0,
      firstDueDate: '2026-10-26',
      rounding: 100_000,
    });
    expect(rows.every((r) => r.amount > 0)).toBe(true);
    expect(rows.reduce((sum, r) => sum + r.amount, 0)).toBe(25_000);
  });
});
