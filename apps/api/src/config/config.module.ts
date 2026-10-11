import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { APP_CONFIG, buildAppConfig } from './env.config';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      // Root .env of the monorepo first, then an app-level override
      envFilePath: ['../../.env', '.env'],
    }),
  ],
  providers: [{ provide: APP_CONFIG, useFactory: () => buildAppConfig() }],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
