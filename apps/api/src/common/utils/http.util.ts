import type { Request, Response } from 'express';

export interface ClientInfo {
  ip: string;
  userAgent: string | null;
  deviceName: string | null;
}

/** Express `trust proxy` setting: the reverse proxies all run on this machine. */
export const TRUSTED_PROXIES = 'loopback';

/**
 * The visitor's IP, as the proxy in front of us saw it.
 *
 * Express resolves `req.ip` from X-Forwarded-For only across trusted hops
 * (TRUSTED_PROXIES), so entries a visitor adds to the header himself are never
 * used. Reading the header directly would let anyone pick a new "IP" per
 * request and walk around every per-IP limit (OTP sends, login attempts).
 */
export function clientIp(req: Request): string {
  const ip = req.ip ?? req.socket?.remoteAddress ?? '0.0.0.0';
  // ::ffff:5.6.7.8 and 5.6.7.8 are the same visitor
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

export function clientInfo(req: Request): ClientInfo {
  const userAgent = (req.headers['user-agent'] as string | undefined) ?? null;
  return { ip: clientIp(req), userAgent, deviceName: deviceNameFromUserAgent(userAgent) };
}

/** Very small UA summary shown in the "my devices" list. */
export function deviceNameFromUserAgent(ua: string | null): string | null {
  if (!ua) return null;
  const os = /iPhone/i.test(ua)
    ? 'iPhone'
    : /iPad/i.test(ua)
      ? 'iPad'
      : /Android/i.test(ua)
        ? 'Android'
        : /Mac OS X|Macintosh/i.test(ua)
          ? 'macOS'
          : /Windows/i.test(ua)
            ? 'Windows'
            : /Linux/i.test(ua)
              ? 'Linux'
              : null;
  const browser = /Edg\//i.test(ua)
    ? 'Edge'
    : /OPR\//i.test(ua)
      ? 'Opera'
      : /Chrome\//i.test(ua)
        ? 'Chrome'
        : /Safari\//i.test(ua)
          ? 'Safari'
          : /Firefox\//i.test(ua)
            ? 'Firefox'
            : null;
  if (!os && !browser) return null;
  return [browser, os].filter(Boolean).join(' • ');
}

export interface CookieOptions {
  maxAgeMs?: number;
  secure: boolean;
  httpOnly?: boolean;
  path?: string;
}

export function setCookie(res: Response, name: string, value: string, options: CookieOptions): void {
  res.cookie(name, value, {
    httpOnly: options.httpOnly ?? true,
    secure: options.secure,
    sameSite: 'lax',
    path: options.path ?? '/',
    maxAge: options.maxAgeMs,
  });
}

export function clearCookie(res: Response, name: string, secure: boolean, path = '/'): void {
  res.clearCookie(name, { httpOnly: true, secure, sameSite: 'lax', path });
}
