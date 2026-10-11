import { cookies, headers } from 'next/headers';
import { ApiError } from './errors';
import { buildQuery } from './query';

export { buildQuery };

/**
 * Server-side API access. Runs inside the Next.js server, so it talks to the
 * NestJS app directly (API_INTERNAL_URL) instead of going back through the
 * browser-facing /api rewrite.
 */
const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

export interface ServerFetchOptions {
  /** ISR window in seconds for public data; omit for user-specific data. */
  revalidate?: number;
  tags?: string[];
  /** Forward the visitor's cookies (session, guest cart). Default: true. */
  auth?: boolean;
  searchParams?: Record<string, string | number | boolean | undefined | null | (string | number)[]>;
  signal?: AbortSignal;
}

async function requestHeaders(auth: boolean): Promise<HeadersInit> {
  const init: Record<string, string> = { accept: 'application/json' };
  if (!auth) return init;
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const cookie = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
  if (cookie) init.cookie = cookie;
  const forwardedFor = headerStore.get('x-forwarded-for');
  if (forwardedFor) init['x-forwarded-for'] = forwardedFor;
  const userAgent = headerStore.get('user-agent');
  if (userAgent) init['user-agent'] = userAgent;
  return init;
}

/** GET a JSON payload from the API. Throws {@link ApiError} on a non-2xx status. */
export async function apiGet<T>(path: string, options: ServerFetchOptions = {}): Promise<T> {
  const { revalidate, tags, auth = true, searchParams, signal } = options;
  const url = `${API_URL}/api${path}${buildQuery(searchParams)}`;

  const response = await fetch(url, {
    headers: await requestHeaders(auth),
    signal,
    ...(revalidate === undefined ? { cache: 'no-store' as const } : { next: { revalidate, tags } }),
  });

  const text = await response.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) throw new ApiError(response.status, body as never);
  return body as T;
}

/** Same as {@link apiGet} but never throws — secondary page data shouldn't 500 a page. */
export async function apiGetOr<T>(path: string, fallback: T, options: ServerFetchOptions = {}): Promise<T> {
  try {
    return await apiGet<T>(path, options);
  } catch (error) {
    console.error(`[api] ${path} failed, using fallback:`, error instanceof Error ? error.message : error);
    return fallback;
  }
}

/** Same as {@link apiGet} but returns null on 401/404 instead of throwing. */
export async function apiGetOptional<T>(path: string, options: ServerFetchOptions = {}): Promise<T | null> {
  try {
    return await apiGet<T>(path, options);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 404)) return null;
    throw error;
  }
}
