import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { roleHasPermission, type Permission } from '@iphoneha/shared';
import { SessionService } from '../../modules/auth/session.service';
import { ADMIN_SESSION_COOKIE } from '../cookies';
import { PERMISSIONS_KEY } from '../decorators';
import { Errors } from '../errors';

/** Requires a valid admin session cookie. */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = req.cookies?.[ADMIN_SESSION_COOKIE];
    if (!token) throw Errors.unauthorized('برای ورود به پنل مدیریت وارد شوید');
    const resolved = await this.sessions.resolveAdmin(token);
    if (!resolved) throw Errors.unauthorized('نشست مدیریت منقضی شده است. دوباره وارد شوید');
    req.authAdmin = resolved.admin;
    req.authSessionId = resolved.sessionId;
    return true;
  }
}

/** Checks @RequirePermissions() against the admin's role. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;
    const req = context.switchToHttp().getRequest<Request>();
    const admin = req.authAdmin;
    if (!admin) throw Errors.unauthorized('برای ورود به پنل مدیریت وارد شوید');
    const ok = required.every((permission) => roleHasPermission(admin.role, permission));
    if (!ok) throw Errors.forbidden('برای این عملیات دسترسی ندارید');
    return true;
  }
}
