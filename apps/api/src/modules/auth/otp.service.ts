import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OtpPurpose } from '@prisma/client';
import { maskPhone } from '@iphoneha/shared';
import { APP_CONFIG, type AppConfig } from '../../config/env.config';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RateLimitService } from '../../infra/redis/rate-limit.service';
import { Errors } from '../../common/errors';
import { hmacSha256, randomNumericCode, safeEqual } from '../../common/utils';
import { NotificationService } from '../notifications/notification.service';

export interface OtpSendResult {
  expiresIn: number;
  resendIn: number;
  codeLength: number;
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimit: RateLimitService,
    private readonly notifications: NotificationService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private hash(phone: string, purpose: OtpPurpose, code: string): string {
    return hmacSha256(this.config.OTP_SECRET, `${phone}:${purpose}:${code}`);
  }

  /**
   * Creates and sends a one-time code.
   * Rate limits: resend cooldown per phone, hourly cap per phone, hourly cap per IP.
   * When `deliver` is false the code is generated but not sent (unknown admin phone).
   */
  async send(phone: string, purpose: OtpPurpose, ip: string, deliver = true): Promise<OtpSendResult> {
    const cooldownKey = `otp:cooldown:${purpose}:${phone}`;
    const cooling = await this.rateLimit.cooldownRemaining(cooldownKey);
    if (cooling > 0) {
      throw Errors.tooMany(`تا ${cooling} ثانیه دیگر می‌توانید کد جدید بگیرید`, cooling);
    }

    const perPhone = await this.rateLimit.hit(
      `otp:send:phone:${purpose}:${phone}`,
      this.config.OTP_MAX_SENDS_PER_HOUR,
      3600,
    );
    if (!perPhone.allowed) {
      throw Errors.tooMany(
        'تعداد درخواست کد تأیید بیش از حد مجاز است. کمی بعد دوباره تلاش کنید',
        perPhone.retryAfterSeconds,
      );
    }

    const perIp = await this.rateLimit.hit(
      `otp:send:ip:${ip}`,
      this.config.OTP_MAX_SENDS_PER_IP_PER_HOUR,
      3600,
    );
    if (!perIp.allowed) {
      throw Errors.tooMany(
        'تعداد درخواست‌ها از این دستگاه زیاد است. کمی بعد دوباره تلاش کنید',
        perIp.retryAfterSeconds,
      );
    }

    const code = randomNumericCode(this.config.OTP_LENGTH);
    const expiresAt = new Date(Date.now() + this.config.OTP_TTL_SECONDS * 1000);

    await this.prisma.$transaction([
      // only the newest code stays valid
      this.prisma.otpCode.updateMany({
        where: { phone, purpose, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.otpCode.create({
        data: {
          phone,
          purpose,
          codeHash: this.hash(phone, purpose, code),
          expiresAt,
          maxAttempts: this.config.OTP_MAX_ATTEMPTS,
          ip,
        },
      }),
    ]);

    await this.rateLimit.setCooldown(cooldownKey, this.config.OTP_RESEND_SECONDS);
    if (deliver) {
      await this.notifications.sendOtp(phone, code);
    } else {
      this.logger.warn(`OTP requested for unknown account ${maskPhone(phone)} (${purpose}) — not delivered`);
    }

    return {
      expiresIn: this.config.OTP_TTL_SECONDS,
      resendIn: this.config.OTP_RESEND_SECONDS,
      codeLength: this.config.OTP_LENGTH,
    };
  }

  /** Verifies a code, consuming it on success. Throws on any failure. */
  async verify(phone: string, purpose: OtpPurpose, code: string, ip: string): Promise<void> {
    const verifyKey = `otp:verify:${purpose}:${phone}:${ip}`;
    const attempts = await this.rateLimit.hit(verifyKey, this.config.OTP_MAX_VERIFY_PER_15MIN, 900);
    if (!attempts.allowed) {
      throw Errors.tooMany(
        'تعداد تلاش‌های ناموفق زیاد است. ۱۵ دقیقه دیگر دوباره تلاش کنید',
        attempts.retryAfterSeconds,
      );
    }

    const record = await this.prisma.otpCode.findFirst({
      where: { phone, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) {
      throw Errors.badRequest('OTP_EXPIRED', 'کد تأیید منقضی شده است. کد جدید بگیرید');
    }
    if (record.attempts >= record.maxAttempts) {
      await this.prisma.otpCode.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
      throw Errors.badRequest('OTP_TOO_MANY_ATTEMPTS', 'تعداد تلاش‌ها بیش از حد مجاز بود. کد جدید بگیرید');
    }

    const matches = safeEqual(record.codeHash, this.hash(phone, purpose, code));
    if (!matches) {
      const updated = await this.prisma.otpCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      if (updated.attempts >= updated.maxAttempts) {
        await this.prisma.otpCode.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
        throw Errors.badRequest('OTP_TOO_MANY_ATTEMPTS', 'تعداد تلاش‌ها بیش از حد مجاز بود. کد جدید بگیرید');
      }
      const remaining = updated.maxAttempts - updated.attempts;
      throw Errors.badRequest('OTP_INVALID', `کد تأیید اشتباه است. ${remaining} تلاش دیگر باقی مانده است`);
    }

    await this.prisma.otpCode.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
    await this.rateLimit.reset(verifyKey);
  }

  /** Housekeeping for expired codes. */
  async purgeExpired(): Promise<number> {
    const result = await this.prisma.otpCode.deleteMany({
      where: { expiresAt: { lt: new Date(Date.now() - 24 * 3600 * 1000) } },
    });
    return result.count;
  }
}
