import { maskPhone, normalizePhone } from '../phone';
import { normalizeSearchText, toLatinDigits, toPersianDigits } from '../digits';

describe('normalizePhone', () => {
  it.each([
    ['09123456789', '09123456789'],
    ['9123456789', '09123456789'],
    ['+989123456789', '09123456789'],
    ['00989123456789', '09123456789'],
    ['989123456789', '09123456789'],
    ['۰۹۱۲۳۴۵۶۷۸۹', '09123456789'],
    ['٠٩١٢٣٤٥٦٧٨٩', '09123456789'],
    ['0912 345 6789', '09123456789'],
    ['0912-345-6789', '09123456789'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(['', '0912345678', '091234567890', '08123456789', 'abc', '0212345678', '+1 415 555 0100'])(
    'rejects %s',
    (input) => {
      expect(normalizePhone(input)).toBeNull();
    },
  );

  it('masks phones', () => {
    expect(maskPhone('09123456789')).toBe('0912***6789');
  });
});

describe('digits', () => {
  it('converts digits both ways', () => {
    expect(toLatinDigits('آیفون ۱۷ پرو ٢٥٦')).toBe('آیفون 17 پرو 256');
    expect(toPersianDigits('09123')).toBe('۰۹۱۲۳');
  });

  it('normalizes search text', () => {
    expect(normalizeSearchText('  iPhone ۱۷ Pro‌Max, مشكي! ')).toBe('iphone 17 pro max مشکی');
  });
});
