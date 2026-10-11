/**
 * Why an outgoing request never got an answer — ECONNRESET, ETIMEDOUT,
 * ENOTFOUND, "timed out"… — so a log line says "unreachable" and why, instead
 * of undici's bare "fetch failed".
 */
export function networkReason(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') return 'timed out';
    const cause = (error as Error & { cause?: { code?: string; message?: string } }).cause;
    return cause?.code ?? cause?.message ?? error.message;
  }
  return String(error);
}

/** The first characters of a body that was not the expected JSON (a firewall or proxy page). */
export function bodySnippet(text: string, length = 80): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, length);
}
