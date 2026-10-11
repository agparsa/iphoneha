import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ADMIN_ROLE_LABELS,
  ROLE_PERMISSIONS,
  type AdminMeDto,
  type SendOtpResponse,
  type VerifyOtpResponse,
} from '@iphoneha/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { Errors } from '../../common/errors';
import { GUEST_CART_COOKIE } from '../../common/cookies';
import { clearCookie, type ClientInfo } from '../../common/utils';
import { APP_CONFIG, type AppConfig } from '../../config/env.config';
import { Inject } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { CartService } from '../cart/cart.service';
import { OtpService } from './otp.service';
import { SessionService } from './session.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly sessions: SessionService,
    private readonly users: UsersService,
    private readonly cart: CartService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async sendUserOtp(phone: string, ip: string): Promise<SendOtpResponse> {
    const result = await this.otp.send(phone, 'USER_LOGIN', ip);
    return { sent: true, phone, ...result };
  }

  async verifyUserOtp(
    phone: string,
    code: string,
    client: ClientInfo,
    req: Request,
    res: Response,
  ): Promise<VerifyOtpResponse> {
    await this.otp.verify(phone, 'USER_LOGIN', code, client.ip);
    const { user, isNew } = await this.users.upsertByPhone(phone);
    const { token } = await this.sessions.create('USER', user.id, client);
    this.sessions.attachCookie(res, 'USER', token);

    const guestToken = req.cookies?.[GUEST_CART_COOKIE] as string | undefined;
    if (guestToken) {
      await this.cart.mergeGuestCartIntoUser(guestToken, user.id);
      clearCookie(res, GUEST_CART_COOKIE, this.config.COOKIE_SECURE);
    }

    return {
      user: UsersService.toDto(user),
      isNewUser: isNew,
      needsProfile: !(user.firstName && user.lastName),
    };
  }

  async logout(
    sessionId: string,
    res: Response,
    kind: 'USER' | 'ADMIN' = 'USER',
  ): Promise<{ loggedOut: true }> {
    await this.sessions.revoke(sessionId);
    this.sessions.clearCookie(res, kind);
    return { loggedOut: true };
  }

  // ─── Admin ─────────────────────────────────────────────────────────────────

  /**
   * Admin codes are only delivered to registered, active admin phones.
   * The response never reveals whether the number belongs to an admin.
   */
  async sendAdminOtp(phone: string, ip: string): Promise<SendOtpResponse> {
    const admin = await this.prisma.adminUser.findUnique({ where: { phone } });
    const result = await this.otp.send(phone, 'ADMIN_LOGIN', ip, Boolean(admin?.isActive));
    return { sent: true, phone, ...result };
  }

  async verifyAdminOtp(phone: string, code: string, client: ClientInfo, res: Response): Promise<AdminMeDto> {
    await this.otp.verify(phone, 'ADMIN_LOGIN', code, client.ip);
    const admin = await this.prisma.adminUser.findUnique({ where: { phone } });
    if (!admin || !admin.isActive) {
      throw Errors.unauthorized('این شماره دسترسی به پنل مدیریت ندارد');
    }
    await this.prisma.adminUser.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
    const { token } = await this.sessions.create('ADMIN', admin.id, client);
    this.sessions.attachCookie(res, 'ADMIN', token);
    return AuthService.toAdminDto(admin);
  }

  static toAdminDto(admin: {
    id: string;
    phone: string;
    name: string;
    role: AdminMeDto['role'];
  }): AdminMeDto {
    return {
      id: admin.id,
      phone: admin.phone,
      name: admin.name,
      role: admin.role,
      roleLabel: ADMIN_ROLE_LABELS[admin.role],
      permissions: [...ROLE_PERMISSIONS[admin.role]],
    };
  }
}
