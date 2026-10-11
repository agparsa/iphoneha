import { Body, Controller, Get, HttpCode, Inject, Post, Query } from '@nestjs/common';
import type Redis from 'ioredis';
import { ApiExcludeController } from '@nestjs/swagger';
import { z } from 'zod';
import { phoneSchema } from '@iphoneha/shared';
import { APP_CONFIG, type AppConfig } from '../../config/env.config';
import { Errors } from '../../common/errors';
import { ZodBody, ZodQuery } from '../../common/zod-validation.pipe';
import { RateLimitService } from '../../infra/redis/rate-limit.service';
import { REDIS_CLIENT } from '../../infra/redis/redis.constants';
import { NotificationService } from '../notifications/notification.service';

const querySchema = z.object({ phone: phoneSchema });
const resetSchema = z.object({ phone: phoneSchema.optional(), ip: z.string().trim().max(60).optional() });

/**
 * Development helper used by the local login page and the e2e tests.
 * Hard-disabled when NODE_ENV=production or DEV_EXPOSE_OTP=false.
 */
@ApiExcludeController()
@Controller('dev')
export class DevController {
  constructor(
    private readonly notifications: NotificationService,
    private readonly rateLimit: RateLimitService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Get('otp')
  async otp(
    @Query(new ZodQuery(querySchema)) query: { phone: string },
  ): Promise<{ phone: string; code: string }> {
    if (!this.config.exposeOtp) throw Errors.notFound();
    const code = await this.notifications.peekDevOtp(query.phone);
    if (!code) throw Errors.notFound('کدی برای این شماره ثبت نشده است');
    return { phone: query.phone, code };
  }

  /**
   * Clears the OTP cooldown and hourly budgets so a local E2E run can sign in
   * repeatedly. Disabled with the same flag as the OTP peek above.
   */
  @Post('reset-otp-limits')
  async resetOtpLimits(
    @Body(new ZodBody(resetSchema)) body: { phone?: string; ip?: string },
  ): Promise<{ cleared: number }> {
    if (!this.config.exposeOtp) throw Errors.notFound();

    const keys: string[] = [];
    for (const purpose of ['USER_LOGIN', 'ADMIN_LOGIN']) {
      if (body.phone) {
        keys.push(`otp:cooldown:${purpose}:${body.phone}`, `otp:send:phone:${purpose}:${body.phone}`);
        keys.push(`otp:verify:${purpose}:${body.phone}:${body.ip ?? '127.0.0.1'}`);
      }
    }
    keys.push(`otp:send:ip:${body.ip ?? '127.0.0.1'}`);

    await Promise.all(keys.map((key) => this.rateLimit.reset(key)));
    return { cleared: keys.length };
  }

  /**
   * Clears the per-visitor request throttles (the instalment request form
   * allows five per ten minutes), so an E2E run can send it again and again.
   */
  @Post('reset-throttles')
  @HttpCode(200)
  async resetThrottles(): Promise<{ cleared: number }> {
    if (!this.config.exposeOtp) throw Errors.notFound();
    let cleared = 0;
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.scan(cursor, 'MATCH', 'throttle:*', 'COUNT', 200);
      cursor = next;
      if (keys.length) cleared += await this.redis.del(...keys);
    } while (cursor !== '0');
    return { cleared };
  }
}
