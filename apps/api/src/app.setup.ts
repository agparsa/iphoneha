import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import type { AppConfig } from './config/env.config';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { noStoreByDefault } from './common/http/no-store.middleware';
import { TRUSTED_PROXIES } from './common/utils/http.util';

/**
 * Everything between the network and the controllers — prefix, body limits,
 * cookies, security headers, caching, proxies, CORS, the error shape. One
 * place, used by `main.ts` and by the integration tests, so what the tests
 * prove is what production runs.
 */
export function configureHttp(app: NestExpressApplication, config: AppConfig): void {
  app.setGlobalPrefix('api');
  app.useBodyParser('json', { limit: '1mb' });
  app.useBodyParser('urlencoded', { limit: '1mb', extended: false });
  app.use(cookieParser());
  app.use(
    helmet({
      // The API answers JSON; the few HTML pages it serves (a payment bridge,
      // the mock gateway) set their own, looser policy on the way out.
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          'default-src': ["'none'"],
          'frame-ancestors': ["'none'"],
          'base-uri': ["'none'"],
          'form-action': ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginEmbedderPolicy: false,
    }),
  );
  if (!config.isProduction) {
    // Swagger UI (development only) is a script-heavy page of its own
    app.use('/api/docs', (_req: Request, res: Response, next: NextFunction) => {
      res.removeHeader('Content-Security-Policy');
      next();
    });
  }
  app.use(noStoreByDefault);
  // Every proxy in front of the API (nginx, and Apache → Next when a request
  // takes that path) runs on this machine. Trusting exactly the loopback makes
  // req.ip the address nginx saw, however many local hops there are, while an
  // X-Forwarded-For the visitor wrote himself is ignored.
  app.set('trust proxy', TRUSTED_PROXIES);
  app.enableCors({
    origin: [config.WEB_URL, ...config.CORS_ORIGINS],
    credentials: true,
    allowedHeaders: ['content-type', 'x-csrf-token', 'idempotency-key', 'accept'],
  });
  app.useGlobalFilters(new AllExceptionsFilter());
}
