/**
 * The Persian (Jalali) calendar, for the dates the staff type and read: due
 * dates of instalments and cheques, report ranges, printed contracts.
 *
 * Conversion is the jalaali-js algorithm (Borkowski's arithmetic, exact for
 * the years 1–3177 AP). Calendar days travel as ISO dates, «2026-09-26»:
 * Postgres `date` columns hold them without a time zone, and «today» is
 * Tehran's today. Tehran is UTC+03:30 all year since Iran dropped daylight
 * saving time in 1401 (2022).
 */

export interface JalaliDate {
  jy: number;
  jm: number;
  jd: number;
}

export const JALALI_MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
] as const;

const BREAKS = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178,
];

const div = (a: number, b: number): number => Math.trunc(a / b);
const mod = (a: number, b: number): number => a - Math.trunc(a / b) * b;

/** Leap state of a Jalali year and the March day of its Nowruz. */
function jalCal(jy: number): { leap: number; gy: number; march: number } {
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0]!;
  let jump = 0;
  if (jy < jp || jy >= BREAKS[BREAKS.length - 1]!) throw new RangeError(`Jalali year ${jy} is out of range`);
  for (let i = 1; i < BREAKS.length; i += 1) {
    const jm = BREAKS[i]!;
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

/** Gregorian date → Julian day number. */
function g2d(gy: number, gm: number, gd: number): number {
  const d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  return d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
}

/** Julian day number → Gregorian date. */
function d2g(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631;
  j += div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function j2d(jy: number, jm: number, jd: number): number {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn: number): JalaliDate {
  const { gy } = d2g(jdn);
  let jy = gy - 621;
  const r = jalCal(jy);
  let k = jdn - g2d(gy, 3, r.march);
  if (k >= 0) {
    if (k <= 185) return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
}

export function toJalali(gy: number, gm: number, gd: number): JalaliDate {
  return d2j(g2d(gy, gm, gd));
}

export function toGregorian(jy: number, jm: number, jd: number): { gy: number; gm: number; gd: number } {
  return d2g(j2d(jy, jm, jd));
}

export function isLeapJalaliYear(jy: number): boolean {
  return jalCal(jy).leap === 0;
}

export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isLeapJalaliYear(jy) ? 30 : 29;
}

export function isValidJalali(jy: number, jm: number, jd: number): boolean {
  return (
    Number.isInteger(jy) &&
    Number.isInteger(jm) &&
    Number.isInteger(jd) &&
    jy >= 1 &&
    jy <= 3177 &&
    jm >= 1 &&
    jm <= 12 &&
    jd >= 1 &&
    jd <= jalaliMonthLength(jy, jm)
  );
}

// ─── ISO calendar days ─────────────────────────────────────────────────────

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** «2026-09-26» → { gy, gm, gd }; throws on anything else. */
function parseIso(iso: string): { gy: number; gm: number; gd: number } {
  const match = ISO_DATE.exec(iso);
  if (!match) throw new RangeError(`not an ISO date: ${iso}`);
  return { gy: Number(match[1]), gm: Number(match[2]), gd: Number(match[3]) };
}

export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}

export function isoToJalali(iso: string): JalaliDate {
  const { gy, gm, gd } = parseIso(iso);
  return toJalali(gy, gm, gd);
}

export function jalaliToIso({ jy, jm, jd }: JalaliDate): string {
  const { gy, gm, gd } = toGregorian(jy, jm, jd);
  return `${pad(gy, 4)}-${pad(gm)}-${pad(gd)}`;
}

/** A `date` column value (UTC midnight) → «2026-09-26». */
export function dateToIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** «2026-09-26» → the Date a Postgres `date` column takes (UTC midnight). */
export function isoToDate(iso: string): Date {
  const { gy, gm, gd } = parseIso(iso);
  return new Date(Date.UTC(gy, gm - 1, gd));
}

export function addDaysIso(iso: string, days: number): string {
  const date = isoToDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return dateToIso(date);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetweenIso(from: string, to: string): number {
  return Math.round((isoToDate(to).getTime() - isoToDate(from).getTime()) / 86_400_000);
}

const TEHRAN_OFFSET_MS = 3.5 * 3_600_000;

/** Tehran's calendar day at `now`, «2026-09-26». */
export function tehranToday(now: Date = new Date()): string {
  return new Date(now.getTime() + TEHRAN_OFFSET_MS).toISOString().slice(0, 10);
}

/** The instant a Tehran calendar day starts (for timestamp columns such as order dates). */
export function tehranDayStart(iso: string): Date {
  return new Date(isoToDate(iso).getTime() - TEHRAN_OFFSET_MS);
}

/**
 * The same Jalali day of the month, `months` later (earlier when negative),
 * clamped to shorter months: 31 Shahrivar + 1 month → 30 Mehr.
 * `dayOfMonth` keeps a schedule on its original day after a short month.
 */
export function addJalaliMonths(iso: string, months: number, dayOfMonth?: number): string {
  const { jy, jm, jd } = isoToJalali(iso);
  const index = jy * 12 + (jm - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const day = Math.min(dayOfMonth ?? jd, jalaliMonthLength(year, month));
  return jalaliToIso({ jy: year, jm: month, jd: day });
}

/** First and last ISO day of a Jalali month. */
export function jalaliMonthRange(jy: number, jm: number): { from: string; to: string } {
  return {
    from: jalaliToIso({ jy, jm, jd: 1 }),
    to: jalaliToIso({ jy, jm, jd: jalaliMonthLength(jy, jm) }),
  };
}

// ─── Typing and reading ────────────────────────────────────────────────────

const PERSIAN = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC = '٠١٢٣٤٥٦٧٨٩';
const latin = (text: string): string =>
  text.replace(/[۰-۹٠-٩]/g, (ch) => String(PERSIAN.includes(ch) ? PERSIAN.indexOf(ch) : ARABIC.indexOf(ch)));
const persian = (text: string): string => text.replace(/[0-9]/g, (d) => PERSIAN[Number(d)]!);

/**
 * What the staff type — «1405/07/10», «۱۴۰۵/۷/۱۰», «1405-07-10» — as an ISO
 * date, or null when it is not a real Jalali day between 1300 and 1499. A
 * two-digit year means 14xx («05/7/10»).
 */
export function parseJalaliInput(text: string): string | null {
  const match = /^\s*(\d{2}|\d{4})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*$/.exec(latin(text));
  if (!match) return null;
  let jy = Number(match[1]);
  if (jy < 100) jy += 1400;
  // a Gregorian year typed by mistake («2026/09/26») is not a Jalali one
  if (jy < 1300 || jy > 1499) return null;
  const jm = Number(match[2]);
  const jd = Number(match[3]);
  if (!isValidJalali(jy, jm, jd)) return null;
  return jalaliToIso({ jy, jm, jd });
}

/** «1405/07/10» with Latin digits — the value of a date field. */
export function formatJalaliInput(iso: string): string {
  const { jy, jm, jd } = isoToJalali(iso);
  return `${jy}/${pad(jm)}/${pad(jd)}`;
}

/** «۱۴۰۵/۰۷/۱۰», or «۱۰ مهر ۱۴۰۵» with `long`. */
export function formatJalali(iso: string, style: 'numeric' | 'long' = 'numeric'): string {
  const { jy, jm, jd } = isoToJalali(iso);
  if (style === 'long') return persian(`${jd} ${JALALI_MONTHS[jm - 1]} ${jy}`);
  return persian(`${jy}/${pad(jm)}/${pad(jd)}`);
}
