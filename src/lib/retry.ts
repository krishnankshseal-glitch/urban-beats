export type RetryOptions = { maxAttempts?: number; baseDelayMs?: number; maxDelayMs?: number };

const RETRYABLE_NETWORK_CODES = ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ECONNREFUSED"];

/**
 * Truncated exponential backoff with jitter, per Google's documented retry
 * guidance for its APIs - not a fixed or immediate retry, and capped so a
 * persistent failure still surfaces instead of hanging. Only transient
 * failures are retried: 429, 5xx, and dropped connections. Anything else
 * (400, 401, 403, 404...) is thrown straight away.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 4;
  const baseDelayMs = opts.baseDelayMs ?? 1000;
  const maxDelayMs = opts.maxDelayMs ?? 8000;
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const anyErr = err as any;
      const status = anyErr?.code ?? anyErr?.response?.status;
      const retryable =
        status === 429 ||
        (typeof status === "number" && status >= 500) ||
        (typeof status === "string" && RETRYABLE_NETWORK_CODES.includes(status));
      if (!retryable || attempt === maxAttempts - 1) throw err;
      const delayMs = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      const jitterMs = Math.random() * delayMs * 0.5;
      await new Promise((resolve) => setTimeout(resolve, delayMs + jitterMs));
    }
  }
  throw lastErr;
}
