import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Permission } from '@iphoneha/shared';
import { clientInfo, type ClientInfo } from '../utils';
import type { AuthAdmin, AuthUser } from '../../types/express';

export const PERMISSIONS_KEY = 'required_permissions';
export const RequirePermissions = (...permissions: Permission[]) => SetMetadata(PERMISSIONS_KEY, permissions);

export const SKIP_CSRF_KEY = 'skip_csrf';
export const SkipCsrf = () => SetMetadata(SKIP_CSRF_KEY, true);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest<Request>().authUser as AuthUser;
});

export const OptionalUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser | null => {
  return ctx.switchToHttp().getRequest<Request>().authUser ?? null;
});

export const CurrentAdmin = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthAdmin => {
  return ctx.switchToHttp().getRequest<Request>().authAdmin as AuthAdmin;
});

export const CurrentSessionId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  return ctx.switchToHttp().getRequest<Request>().authSessionId as string;
});

export const Client = createParamDecorator((_data: unknown, ctx: ExecutionContext): ClientInfo => {
  return clientInfo(ctx.switchToHttp().getRequest<Request>());
});
