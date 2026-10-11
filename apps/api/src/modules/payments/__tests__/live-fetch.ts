/**
 * A scripted payment service behind a fake `fetch`: each route answers with a
 * function of the request, and every request is recorded (method, path,
 * query, headers, parsed body).
 */
export interface RecordedCall {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Record<string, string>;
  body: unknown;
  rawBody: string | FormData | null;
}

export type Route = (call: RecordedCall) => Response | Promise<Response> | Error;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export function fakeService(routes: Record<string, Route>) {
  const calls: RecordedCall[] = [];
  const impl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    const rawBody = (init.body ?? null) as string | FormData | null;
    let body: unknown = null;
    if (typeof rawBody === 'string') {
      try {
        body = JSON.parse(rawBody);
      } catch {
        body = Object.fromEntries(new URLSearchParams(rawBody));
      }
    } else if (rawBody instanceof FormData) {
      body = Object.fromEntries(rawBody.entries());
    }
    const method = (init.method ?? 'GET').toUpperCase();
    const call: RecordedCall = {
      method,
      path: url.pathname,
      query: url.searchParams,
      headers,
      body,
      rawBody,
    };
    calls.push(call);
    const route = routes[`${method} ${url.pathname}`];
    if (!route) throw new Error(`unexpected ${method} ${url.pathname}`);
    const answer = await route(call);
    if (answer instanceof Error) throw answer;
    return answer;
  }) as unknown as typeof fetch;
  return {
    impl,
    calls,
    /** «POST /x» for every call, in order */
    trail: () => calls.map((c) => `${c.method} ${c.path}`),
    count: (key: string) => calls.filter((c) => `${c.method} ${c.path}` === key).length,
  };
}

export const unreachable = () => new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } });
