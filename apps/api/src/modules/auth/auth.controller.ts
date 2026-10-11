import { Body, Controller, Delete, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  sendOtpSchema,
  verifyOtpSchema,
  type SendOtpResponse,
  type SessionDto,
  type UserDto,
  type VerifyOtpResponse,
} from '@iphoneha/shared';
import { Client, CurrentSessionId, CurrentUser } from '../../common/decorators';
import { AuthGuard, OptionalAuthGuard } from '../../common/guards';
import { ZodBody } from '../../common/zod-validation.pipe';
import { CSRF_COOKIE } from '../../common/cookies';
import type { ClientInfo } from '../../common/utils';
import type { AuthUser } from '../../types/express';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly users: UsersService,
  ) {}

  /**
   * Who is signed in, for the storefront's session check. Always 200: a
   * visitor gets `{ user: null }` rather than a 401, which the browser would
   * log as an error on every page a visitor opens.
   */
  @UseGuards(OptionalAuthGuard)
  @Get('session')
  async session(@Req() req: Request): Promise<{ user: UserDto | null }> {
    return { user: req.authUser ? await this.users.getProfile(req.authUser.id) : null };
  }

  /** Returns (and sets) the CSRF token the client echoes in `x-csrf-token`. */
  @Get('csrf')
  csrf(@Req() req: Request): { csrfToken: string } {
    return { csrfToken: (req.cookies?.[CSRF_COOKIE] as string) ?? '' };
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('send-otp')
  sendOtp(
    @Body(new ZodBody(sendOtpSchema)) body: { phone: string },
    @Client() client: ClientInfo,
  ): Promise<SendOtpResponse> {
    return this.auth.sendUserOtp(body.phone, client.ip);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('verify-otp')
  verifyOtp(
    @Body(new ZodBody(verifyOtpSchema)) body: { phone: string; code: string },
    @Client() client: ClientInfo,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<VerifyOtpResponse> {
    return this.auth.verifyUserOtp(body.phone, body.code, client, req, res);
  }

  @UseGuards(AuthGuard)
  @Post('logout')
  logout(
    @CurrentSessionId() sessionId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ loggedOut: true }> {
    return this.auth.logout(sessionId, res, 'USER');
  }

  @UseGuards(AuthGuard)
  @Get('sessions')
  listSessions(@CurrentUser() user: AuthUser, @CurrentSessionId() sessionId: string): Promise<SessionDto[]> {
    return this.sessions.list('USER', user.id, sessionId);
  }

  /** Logs out one other device. */
  @UseGuards(AuthGuard)
  @Delete('sessions/:id')
  async revokeSession(
    @CurrentUser() user: AuthUser,
    @CurrentSessionId() sessionId: string,
    @Param('id') id: string,
  ): Promise<{ revoked: true }> {
    const list = await this.sessions.list('USER', user.id, sessionId);
    if (!list.some((s) => s.id === id)) return { revoked: true };
    await this.sessions.revoke(id);
    return { revoked: true };
  }

  /** Logs out every other device. */
  @UseGuards(AuthGuard)
  @Post('sessions/revoke-others')
  async revokeOthers(
    @CurrentUser() user: AuthUser,
    @CurrentSessionId() sessionId: string,
  ): Promise<{ revoked: number }> {
    const revoked = await this.sessions.revokeAllForSubject('USER', user.id, sessionId);
    return { revoked };
  }
}
