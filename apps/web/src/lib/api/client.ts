'use client';

import { ApiError } from './errors';
import { buildQuery } from './query';

const CSRF_COOKIE = 'ih_csrf';

function csrfToken(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : null;
}

export interface ClientRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  searchParams?: Record<string, string | number | boolean | undefined | null | (string | number)[]>;
  signal?: AbortSignal;
  /** extra request headers, e.g. `Idempotency-Key` on checkout */
  headers?: Record<string, string>;
}

/**
 * Browser-side API access. Goes to the same-origin /api path (rewritten to the
 * NestJS app) so session cookies stay first-party, and echoes the CSRF cookie
 * back in the `x-csrf-token` header for mutating requests.
 */
export async function apiFetch<T>(path: string, options: ClientRequestOptions = {}): Promise<T> {
  const { method = 'GET', body, searchParams, signal, headers: extraHeaders } = options;
  const headers: Record<string, string> = { accept: 'application/json', ...extraHeaders };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET') {
    let token = csrfToken();
    if (!token) {
      // the cookie is issued on any GET — fetch it once, then retry
      await fetch('/api/auth/csrf', { credentials: 'include' });
      token = csrfToken();
    }
    if (token) headers['x-csrf-token'] = token;
  }

  const response = await fetch(`/api${path}${buildQuery(searchParams)}`, {
    method,
    headers,
    credentials: 'include',
    signal,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) throw new ApiError(response.status, payload as never);
  return payload as T;
}

/** Multipart upload (product images) — same CSRF/cookie rules as {@link apiFetch}. */
export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  let token = csrfToken();
  if (!token) {
    await fetch('/api/auth/csrf', { credentials: 'include' });
    token = csrfToken();
  }

  const response = await fetch(`/api${path}`, {
    method: 'POST',
    headers: token ? { 'x-csrf-token': token, accept: 'application/json' } : { accept: 'application/json' },
    credentials: 'include',
    body: form,
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) throw new ApiError(response.status, payload as never);
  return payload as T;
}

export const api = {
  get: <T>(path: string, searchParams?: ClientRequestOptions['searchParams']) =>
    apiFetch<T>(path, { searchParams }),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    apiFetch<T>(path, { method: 'POST', body, headers }),
  patch: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'DELETE', body }),
};
