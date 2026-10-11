import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type Redis from 'ioredis';
import { AppModule } from '../../src/app.module';
import { configureHttp } from '../../src/app.setup';
import { APP_CONFIG, type AppConfig } from '../../src/config/env.config';
import { PrismaService } from '../../src/infra/prisma/prisma.service';
import { REDIS_CLIENT } from '../../src/infra/redis/redis.constants';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  redis: Redis;
  baseUrl: string;
  http: () => request.Agent;
}

/** `configure` can swap providers, e.g. a recording SMS gateway: `(b) => b.overrideProvider(X).useValue(y)`. */
export async function createTestApp(
  configure: (builder: TestingModuleBuilder) => TestingModuleBuilder = (builder) => builder,
): Promise<TestContext> {
  const moduleRef = await configure(Test.createTestingModule({ imports: [AppModule] })).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: true });
  // exactly what main.ts puts in front of the controllers: headers, limits, cookies, proxies, CORS
  configureHttp(app, app.get<AppConfig>(APP_CONFIG));
  await app.init();
  // One real listening server: parallel agents would otherwise race on
  // supertest's implicit listen() and drop connections.
  await app.listen(0, '127.0.0.1');
  const url = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  const prisma = app.get(PrismaService);
  const redis = app.get<Redis>(REDIS_CLIENT);

  return {
    app,
    prisma,
    redis,
    baseUrl: url,
    http: () => request.agent(url),
  };
}

export async function closeTestApp(ctx: TestContext): Promise<void> {
  await ctx.app.close();
}
