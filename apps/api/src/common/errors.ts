import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Domain error with a stable machine-readable code plus a Persian message
 * that can be shown to the customer as-is.
 */
export class AppError extends HttpException {
  constructor(
    readonly code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    readonly details?: unknown,
  ) {
    super({ statusCode: status, code, message, details }, status);
  }
}

export const Errors = {
  validation: (details: unknown) =>
    new AppError('VALIDATION_ERROR', 'اطلاعات ارسالی معتبر نیست', HttpStatus.BAD_REQUEST, details),
  unauthorized: (message = 'برای ادامه وارد حساب کاربری شوید') =>
    new AppError('UNAUTHORIZED', message, HttpStatus.UNAUTHORIZED),
  forbidden: (message = 'دسترسی لازم را ندارید') => new AppError('FORBIDDEN', message, HttpStatus.FORBIDDEN),
  notFound: (message = 'موردی پیدا نشد') => new AppError('NOT_FOUND', message, HttpStatus.NOT_FOUND),
  conflict: (code: string, message: string, details?: unknown) =>
    new AppError(code, message, HttpStatus.CONFLICT, details),
  tooMany: (message: string, retryAfterSeconds?: number) =>
    new AppError('TOO_MANY_REQUESTS', message, HttpStatus.TOO_MANY_REQUESTS, { retryAfterSeconds }),
  badRequest: (code: string, message: string, details?: unknown) =>
    new AppError(code, message, HttpStatus.BAD_REQUEST, details),
  internal: (message = 'خطای غیرمنتظره رخ داد') =>
    new AppError('INTERNAL_ERROR', message, HttpStatus.INTERNAL_SERVER_ERROR),
} as const;
