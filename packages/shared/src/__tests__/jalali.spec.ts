import {
  addDaysIso,
  addJalaliMonths,
  daysBetweenIso,
  formatJalali,
  formatJalaliInput,
  isIsoDate,
  isLeapJalaliYear,
  isValidJalali,
  isoToJalali,
  jalaliMonthLength,
  jalaliMonthRange,
  jalaliToIso,
  parseJalaliInput,
  tehranDayStart,
  tehranToday,
} from '../jalali';

/** The platform's own Persian calendar, as the reference. */
const reference = new Intl.DateTimeFormat('en-US-u-ca-persian', {
  timeZone: 'UTC',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
});
function intlJalali(date: Date) {
  const parts = Object.fromEntries(reference.formatToParts(date).map((p) => [p.type, p.value]));
  return { jy: Number(parts.year), jm: Number(parts.month), jd: Number(parts.day) };
}

describe('jalali', () => {
  it('agrees with the platform calendar on every day from 1398 to 1415', () => {
    const start = Date.UTC(2019, 2, 1);
    const end = Date.UTC(2037, 2, 31);
    for (let t = start; t <= end; t += 86_400_000) {
      const date = new Date(t);
      const iso = date.toISOString().slice(0, 10);
      const expected = intlJalali(date);
      expect(isoToJalali(iso)).toEqual(expected);
      expect(jalaliToIso(expected)).toBe(iso);
    }
  });

  it('knows the leap years and month lengths', () => {
    expect(isLeapJalaliYear(1403)).toBe(true);
    expect(isLeapJalaliYear(1404)).toBe(false);
    expect(isLeapJalaliYear(1408)).toBe(true);
    expect(jalaliMonthLength(1403, 12)).toBe(30);
    expect(jalaliMonthLength(1404, 12)).toBe(29);
    expect(jalaliMonthLength(1405, 6)).toBe(31);
    expect(jalaliMonthLength(1405, 7)).toBe(30);
    expect(isValidJalali(1404, 12, 30)).toBe(false);
    expect(isValidJalali(1403, 12, 30)).toBe(true);
  });

  it('reads what the staff type, in any digits', () => {
    expect(parseJalaliInput('1405/07/04')).toBe('2026-09-26');
    expect(parseJalaliInput('۱۴۰۵/۷/۴')).toBe('2026-09-26');
    expect(parseJalaliInput(' 1405-7-4 ')).toBe('2026-09-26');
    expect(parseJalaliInput('05/07/04')).toBe('2026-09-26');
    expect(parseJalaliInput('1404/12/30')).toBeNull();
    expect(parseJalaliInput('1405/13/01')).toBeNull();
    expect(parseJalaliInput('2026-09-26')).toBeNull();
    expect(parseJalaliInput('')).toBeNull();
  });

  it('writes dates for fields and for reading', () => {
    expect(formatJalaliInput('2026-09-26')).toBe('1405/07/04');
    expect(formatJalali('2026-09-26')).toBe('۱۴۰۵/۰۷/۰۴');
    expect(formatJalali('2026-09-26', 'long')).toBe('۴ مهر ۱۴۰۵');
  });

  it('steps a schedule month by month on the same Jalali day, clamped in short months', () => {
    // 31 Shahrivar 1405 → 30 Mehr (30 days) → back to 31 in the first half of the year
    const start = parseJalaliInput('1405/06/31')!;
    expect(formatJalaliInput(addJalaliMonths(start, 1))).toBe('1405/07/30');
    expect(formatJalaliInput(addJalaliMonths(start, 6, 31))).toBe('1405/12/29');
    expect(formatJalaliInput(addJalaliMonths(start, 7, 31))).toBe('1406/01/31');
    expect(formatJalaliInput(addJalaliMonths(parseJalaliInput('1405/11/10')!, 3))).toBe('1406/02/10');
    expect(formatJalaliInput(addJalaliMonths(parseJalaliInput('1405/02/10')!, -3))).toBe('1404/11/10');
  });

  it('gives month ranges and day arithmetic', () => {
    expect(jalaliMonthRange(1405, 7)).toEqual({ from: '2026-09-23', to: '2026-10-22' });
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetweenIso('2026-09-26', '2026-10-06')).toBe(10);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2028-02-29')).toBe(true);
  });

  it('uses Tehran time for «today» and for day boundaries', () => {
    // 21:00 UTC on 25 Sep is already 00:30 on 26 Sep in Tehran
    expect(tehranToday(new Date('2026-09-25T21:00:00Z'))).toBe('2026-09-26');
    expect(tehranToday(new Date('2026-09-25T20:29:00Z'))).toBe('2026-09-25');
    expect(tehranDayStart('2026-09-26').toISOString()).toBe('2026-09-25T20:30:00.000Z');
  });
});
