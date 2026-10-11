import { buildSearchText, parseSearchQuery } from '../search';

const colors = [
  { code: 'black', keywords: ['Black', 'مشکی', 'سیاه'] },
  { code: 'space-black', keywords: ['Space Black', 'مشکی فضایی'] },
  { code: 'deep-blue', keywords: ['Deep Blue', 'آبی تیره'] },
  { code: 'mist-blue', keywords: ['Mist Blue', 'آبی مه‌آلود'] },
  { code: 'cosmic-orange', keywords: ['Cosmic Orange', 'orange', 'نارنجی'] },
];

describe('parseSearchQuery', () => {
  it('extracts model text, storage and colour', () => {
    const r = parseSearchQuery('iPhone 17 Pro Max 256 Black', colors);
    expect(r.textTokens).toEqual(['iphone', '17', 'pro', 'max']);
    expect(r.storages).toEqual([256]);
    expect(r.colorCodes).toEqual(['black']);
  });

  it('understands units and Persian digits', () => {
    expect(parseSearchQuery('آیفون ۵۱۲ گیگ').storages).toEqual([512]);
    expect(parseSearchQuery('1tb').storages).toEqual([1024]);
    expect(parseSearchQuery('2 ترابایت').storages).toEqual([2048]);
    expect(parseSearchQuery('256GB').storages).toEqual([256]);
  });

  it('does not treat model numbers as storage', () => {
    const r = parseSearchQuery('iphone 17', colors);
    expect(r.storages).toEqual([]);
    expect(r.textTokens).toEqual(['iphone', '17']);
  });

  it('prefers the longest colour keyword', () => {
    expect(parseSearchQuery('deep blue', colors).colorCodes).toEqual(['deep-blue']);
    expect(parseSearchQuery('Space Black', colors).colorCodes).toEqual(['space-black']);
    expect(parseSearchQuery('نارنجی', colors).colorCodes).toEqual(['cosmic-orange']);
  });

  it('builds normalized search text', () => {
    expect(buildSearchText(['آیفون ۱۷', 'iPhone 17', null, 2025])).toBe('آیفون 17 iphone 17 2025');
  });
});
