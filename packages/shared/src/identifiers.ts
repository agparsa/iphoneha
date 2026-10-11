import { toLatinDigits } from './digits';

/** Digits only, from whatever was typed or scanned: «۳۵۶ ۹۳۸-۰۳...» → «35693803...». */
export function digitsOnly(value: string): string {
  return toLatinDigits(value).replace(/\D/g, '');
}

/**
 * A phone's IMEI: 15 digits whose last one is the Luhn check digit. A
 * scanner or a typo that drops or swaps a digit is caught here.
 */
export function isValidImei(value: string): boolean {
  if (!/^\d{15}$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i += 1) {
    let digit = Number(value[i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

/** Iranian national ID (کد ملی): 10 digits with a mod-11 check digit. */
export function isValidNationalId(value: string): boolean {
  if (!/^\d{10}$/.test(value) || /^(\d)\1{9}$/.test(value)) return false;
  const check = Number(value[9]);
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(value[i]) * (10 - i);
  const remainder = sum % 11;
  return remainder < 2 ? check === remainder : check === 11 - remainder;
}

/** A Sayad cheque ID (شناسهٔ صیادی) is 16 digits. */
export function isValidSayadId(value: string): boolean {
  return /^\d{16}$/.test(value);
}
