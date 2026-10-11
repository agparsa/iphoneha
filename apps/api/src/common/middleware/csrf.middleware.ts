import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../../config/env.config';
import { CSRF_COOKIE } from '../cookies';
import { randomToken } from '../utils';

/** Issues the readable CSRF cookie the web client echoes back in a header. */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  use(req: Request, res: Response, next: NextFunction): void {
    if (!req.cookies?.[CSRF_COOKIE]) {
      const token = randomToken(16);
      res.cookie(CSRF_COOKIE, token, {
        httpOnly: false,
        secure: this.config.COOKIE_SECURE,
        sameSite: 'lax',
        path: '/',
        maxAge: 12 * 60 * 60 * 1000,
      });
      req.cookies = { ...(req.cookies ?? {}), [CSRF_COOKIE]: token };
    }
    next();
  }
}
