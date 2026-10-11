import { toLatinDigits } from './digits';

export const IRAN_MOBILE_REGEX = /^09\d{9}$/;

/**
 * Normalizes an Iranian mobile number to the canonical `09xxxxxxxxx` form.
 * Accepts Persian/Arabic digits, spaces, dashes and the +98 / 0098 / 98 prefixes.
 * Returns null when the input is not a valid mobile number.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = toLatinDigits(String(input)).replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('0098')) digits = '0' + digits.slice(4);
  else if (digits.startsWith('98') && digits.length === 12) digits = '0' + digits.slice(2);
  else if (digits.startsWith('9') && digits.length === 10) digits = '0' + digits;
  return IRAN_MOBILE_REGEX.test(digits) ? digits : null;
}

export function isValidIranMobile(input: string | null | undefined): boolean {
  return normalizePhone(input) !== null;
}

/** 09123456789 → 0912***6789 (for logs and admin lists). */
export function maskPhone(phone: string): string {
  if (phone.length < 8) return phone;
  return `${phone.slice(0, 4)}***${phone.slice(-4)}`;
}
