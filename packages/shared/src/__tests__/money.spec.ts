import {
  calcCartTotals,
  calcDiscountPercent,
  formatDecimalFa,
  formatPercentFa,
  formatToman,
  roundToHundredThousand,
  tomanToRial,
  unitDiscount,
} from '../money';

describe('money', () => {
  it('computes discount percent like the spec example (149M → 139M = 7%)', () => {
    expect(calcDiscountPercent(139_000_000, 149_000_000)).toBe(7);
  });

  it('returns 0 when there is no real discount', () => {
    expect(calcDiscountPercent(100, null)).toBe(0);
    expect(calcDiscountPercent(100, 100)).toBe(0);
    expect(calcDiscountPercent(100, 90)).toBe(0);
    expect(unitDiscount(100, 90)).toBe(0);
  });

  it('formats Toman with Persian digits', () => {
    expect(formatToman(139_000_000)).toBe('۱۳۹٬۰۰۰٬۰۰۰ تومان');
  });

  it('rounds and converts', () => {
    expect(roundToHundredThousand(12_345_678)).toBe(12_300_000);
    expect(tomanToRial(1500)).toBe(15000);
  });

  it('calculates cart totals', () => {
    const totals = calcCartTotals([
      { price: 139_000_000, compareAtPrice: 149_000_000, quantity: 2 },
      { price: 50_000_000, compareAtPrice: null, quantity: 1 },
    ]);
    expect(totals).toEqual({
      itemsCount: 3,
      subtotal: 348_000_000,
      itemsDiscount: 20_000_000,
      itemsTotal: 328_000_000,
    });
  });
});

describe('formatDecimalFa', () => {
  it('keeps one decimal for ratings instead of rounding to a whole number', () => {
    expect(formatDecimalFa(4.8)).toBe('۴٫۸');
    expect(formatDecimalFa(5)).toBe('۵');
    expect(formatDecimalFa(4.75)).toBe('۴٫۸');
  });
});

describe('formatPercentFa', () => {
  it('keeps the fraction a fee was set with', () => {
    expect(formatPercentFa(3.5)).toBe('۳٫۵');
    expect(formatPercentFa(4)).toBe('۴');
    expect(formatPercentFa(4.25)).toBe('۴٫۲۵');
  });
});
