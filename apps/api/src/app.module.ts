import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type Redis from 'ioredis';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './infra/prisma/prisma.module';
import { RedisModule } from './infra/redis/redis.module';
import { REDIS_CLIENT } from './infra/redis/redis.constants';
import { QueueModule } from './infra/queue/queue.module';
import { RedisThrottlerStorage } from './common/throttler/redis-throttler.storage';
import { CsrfMiddleware } from './common/middleware/csrf.middleware';
import { CsrfGuard } from './common/guards';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CartModule } from './modules/cart/cart.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { DevModule } from './modules/dev/dev.module';
import { DiscountsModule } from './modules/discounts/discounts.module';
import { HealthModule } from './modules/health/health.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { NotificationModule } from './modules/notifications/notification.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { SettingsModule } from './modules/settings/settings.module';
import { ShippingModule } from './modules/shipping/shipping.module';
import { StorageModule } from './modules/storage/storage.module';
import { StorefrontModule } from './modules/storefront/storefront.module';
import { FeedsModule } from './modules/feeds/feeds.module';
import { CreditModule } from './modules/credit/credit.module';
import { ContentModule } from './modules/content/content.module';
import { UsersModule } from './modules/users/users.module';
import { AdminModule } from './modules/admin/admin.module';
import { DevicesModule } from './modules/devices/devices.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { BackofficeModule } from './modules/backoffice/backoffice.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    RedisModule,
    QueueModule,
    ThrottlerModule.forRootAsync({
      inject: [REDIS_CLIENT],
      useFactory: (redis: Redis) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
        storage: new RedisThrottlerStorage(redis),
      }),
    }),
    SettingsModule,
    AuditModule,
    NotificationModule,
    StorageModule,
    CatalogModule,
    StorefrontModule,
    FeedsModule,
    CreditModule,
    ContentModule,
    InventoryModule,
    DiscountsModule,
    CartModule,
    ShippingModule,
    PaymentsModule,
    OrdersModule,
    DevicesModule,
    LedgerModule,
    UsersModule,
    AuthModule,
    AdminModule,
    BackofficeModule,
    HealthModule,
    DevModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CsrfMiddleware).forRoutes('*path');
  }
}
