import { Body, Controller, Get, Post, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { sendOtpSchema, verifyOtpSchema, type AdminMeDto, type SendOtpResponse } from '@iphoneha/shared';
import { Client, CurrentAdmin, CurrentSessionId } from '../../common/decorators';
import { AdminAuthGuard } from '../../common/guards';
import { ZodBody } from '../../common/zod-validation.pipe';
import type { ClientInfo } from '../../common/utils';
import type { AuthAdmin } from '../../types/express';
import { AuthService } from './auth.service';

@ApiTags('admin-auth')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AuthService) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('send-otp')
  sendOtp(
    @Body(new ZodBody(sendOtpSchema)) body: { phone: string },
    @Client() client: ClientInfo,
  ): Promise<SendOtpResponse> {
    return this.auth.sendAdminOtp(body.phone, client.ip);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('verify-otp')
  verifyOtp(
    @Body(new ZodBody(verifyOtpSchema)) body: { phone: string; code: string },
    @Client() client: ClientInfo,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminMeDto> {
    return this.auth.verifyAdminOtp(body.phone, body.code, client, res);
  }

  @UseGuards(AdminAuthGuard)
  @Get('me')
  me(@CurrentAdmin() admin: AuthAdmin): AdminMeDto {
    return AuthService.toAdminDto(admin);
  }

  @UseGuards(AdminAuthGuard)
  @Post('logout')
  logout(
    @CurrentSessionId() sessionId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ loggedOut: true }> {
    return this.auth.logout(sessionId, res, 'ADMIN');
  }
}
