import type { ApiErrorBody } from '@iphoneha/shared';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, body: Partial<ApiErrorBody> | null, fallback = 'خطای غیرمنتظره‌ای رخ داد.') {
    super(body?.message ?? fallback);
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.code ?? 'UNKNOWN';
    this.details = body?.details;
  }

  get fieldErrors(): Record<string, string> {
    const details = this.details as { fields?: Record<string, string> } | undefined;
    return details?.fields ?? {};
  }

  get isAuth(): boolean {
    return this.status === 401;
  }
}

/** Persian message for a failed request, safe to show in a toast. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'ارتباط با سرور برقرار نشد. دوباره تلاش کنید.';
}
