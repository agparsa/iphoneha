import 'reflect-metadata';
import { enableBigIntSerialization } from './common/bigint';

enableBigIntSerialization();

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureHttp } from './app.setup';
import { APP_CONFIG, type AppConfig } from './config/env.config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: true });
  const config = app.get<AppConfig>(APP_CONFIG);
  const logger = new Logger('Bootstrap');

  configureHttp(app, config);
  app.enableShutdownHooks();

  if (!config.isProduction) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('iPhoneHa API')
        .setDescription('REST API فروشگاه آیفونی‌ها')
        .setVersion('1.0')
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document);
  }

  // In production the API sits behind the reverse proxy, so it must not be
  // reachable straight from the internet — bind the loopback unless told otherwise.
  const host = process.env.API_BIND ?? (config.isProduction ? '127.0.0.1' : '0.0.0.0');
  await app.listen(config.API_PORT, host);
  logger.log(`API ready on http://${host}:${config.API_PORT}/api (${config.NODE_ENV})`);
  if (!config.isProduction) logger.log(`Swagger: http://localhost:${config.API_PORT}/api/docs`);
}

void bootstrap();
