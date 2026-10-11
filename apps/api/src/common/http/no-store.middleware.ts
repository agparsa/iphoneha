import type { NextFunction, Request, Response } from 'express';

/**
 * Every API answer is per-visitor unless a route explicitly opts out (the media
 * route does, with a long public max-age).
 *
 * On cPanel the nginx in front of Apache caches plain `200` responses for an
 * hour by default, keyed on the URL only. Without this header it would serve
 * one visitor's cart, profile or orders to the next visitor on the same URL.
 */
export function noStoreByDefault(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control', 'no-store');
  next();
}
