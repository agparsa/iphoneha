import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { toLatinDigits } from '@iphoneha/shared';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * A dialable `tel:` link from a number written any way — «۰۲۱-۹۱۰۰۲۲۳۳» in the
 * settings becomes `tel:02191002233`; phones do not dial Persian digits.
 */
export function telHref(phone: string): string {
  return `tel:${toLatinDigits(phone).replace(/[^\d+]/g, '')}`;
}

/** «۱۴۰۳/۰۶/۳۰» */
export function formatDateFa(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('fa-IR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Tehran',
  }).format(date);
}

/** «۳۰ شهریور ۱۴۰۳، ۱۴:۰۵» */
export function formatDateTimeFa(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('fa-IR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tehran',
  }).format(date);
}

/** «۳ دقیقه» — countdown label for OTP timers and reservations. */
export function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return new Intl.NumberFormat('fa-IR', { minimumIntegerDigits: 2, useGrouping: false })
    .format(m)
    .concat(':')
    .concat(new Intl.NumberFormat('fa-IR', { minimumIntegerDigits: 2, useGrouping: false }).format(s));
}

export function absoluteUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  return new URL(path, base).toString();
}

/** Media paths coming from the API are proxied through /media by next.config. */
export function mediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
  return url.startsWith('/') ? url : `/${url}`;
}

/**
 * A «where to go after signing in» that stays on this site: a path starting
 * with a single «/» (never «//host» or a full URL, which would let a link on
 * another site send a signed-in customer anywhere). Anything else → fallback.
 */
export function safeInternalPath(value: string | null | undefined, fallback = '/account'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  if (/[\x00-\x1f\s]/.test(value)) return fallback;
  return value;
}
