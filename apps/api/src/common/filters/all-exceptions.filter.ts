import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppError } from '../errors';

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const body = this.toBody(exception);

    if (body.statusCode >= 500) {
      this.logger.error(
        `${req.method} ${req.originalUrl} → ${body.statusCode} ${body.code}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else if (body.statusCode !== HttpStatus.NOT_FOUND) {
      this.logger.warn(`${req.method} ${req.originalUrl} → ${body.statusCode} ${body.code}: ${body.message}`);
    }

    if (res.headersSent) return;
    res.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown): ErrorBody {
    if (exception instanceof AppError) {
      const response = exception.getResponse() as ErrorBody;
      return { ...response, statusCode: exception.getStatus() };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const message =
        typeof response === 'string'
          ? response
          : ((response as { message?: string | string[] }).message ?? exception.message);
      const code = (response as { code?: string }).code ?? httpCode(status);
      const text = Array.isArray(message) ? message.join('، ') : message;
      return {
        statusCode: status,
        code,
        message:
          status === HttpStatus.TOO_MANY_REQUESTS
            ? 'تعداد درخواست‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کنید'
            : status === HttpStatus.NOT_FOUND &&
                /^Cannot (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) /.test(text)
              ? // the framework's «Cannot GET /path» names the method and the path back; the answer is the same either way
                'موردی پیدا نشد'
              : text,
      };
    }
    // errors raised before a handler runs — the body parser (too large, bad
    // JSON), multer (too many files) — carry their own HTTP status; they are
    // the client's doing, not a failure of ours
    const status = clientErrorStatus(exception);
    if (status !== null) {
      return {
        statusCode: status,
        code: httpCode(status),
        message: CLIENT_ERROR_MESSAGES[status] ?? 'درخواست نامعتبر است',
      };
    }
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'خطای غیرمنتظره رخ داد',
    };
  }
}

const CLIENT_ERROR_MESSAGES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'درخواست نامعتبر است',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'حجم درخواست بیش از حد مجاز است',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'قالب درخواست پشتیبانی نمی‌شود',
  [HttpStatus.REQUEST_TIMEOUT]: 'ارسال درخواست ناتمام ماند',
};

/** The 4xx status a middleware error carries (`status`/`statusCode`), null for anything else. */
function clientErrorStatus(exception: unknown): number | null {
  if (!exception || typeof exception !== 'object') return null;
  const raw =
    (exception as { status?: unknown; statusCode?: unknown }).status ??
    (exception as { statusCode?: unknown }).statusCode;
  const status = Number(raw);
  return Number.isInteger(status) && status >= 400 && status < 500 ? status : null;
}

function httpCode(status: number): string {
  switch (status) {
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHORIZED';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';
    case HttpStatus.CONFLICT:
      return 'CONFLICT';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'TOO_MANY_REQUESTS';
    case HttpStatus.PAYLOAD_TOO_LARGE:
      return 'PAYLOAD_TOO_LARGE';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST';
  }
}
