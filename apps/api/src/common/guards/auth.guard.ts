import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { SessionService } from '../../modules/auth/session.service';
import { USER_SESSION_COOKIE } from '../cookies';
import { Errors } from '../errors';

/** Requires a valid customer session cookie. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(protected readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = req.cookies?.[USER_SESSION_COOKIE];
    if (!token) throw Errors.unauthorized();
    const resolved = await this.sessions.resolveUser(token);
    if (!resolved) throw Errors.unauthorized('نشست شما منقضی شده است. دوباره وارد شوید');
    req.authUser = resolved.user;
    req.authSessionId = resolved.sessionId;
    return true;
  }
}

/** Attaches the customer when a session exists, but never blocks the request. */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = req.cookies?.[USER_SESSION_COOKIE];
    if (token) {
      const resolved = await this.sessions.resolveUser(token);
      if (resolved) {
        req.authUser = resolved.user;
        req.authSessionId = resolved.sessionId;
      }
    }
    return true;
  }
}
