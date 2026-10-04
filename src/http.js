/** Polite HTTP for the Internet Archive: retries with backoff, timeouts and a user agent */

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const USER_AGENT =
  "wp-wayback-restore (+https://github.com/AmrElshabrawyDev/wp-wayback-restore)";

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504, 520, 522, 524]);

/**
 * fetch() with a timeout and retries on network errors and 429/5xx.
 * Resolves with the final Response (which may be a non-OK status) or throws
 * after the last network failure.
 */
export async function fetchWithRetry(url, { retries = 4, timeout = 30_000, fetchImpl = fetch, log } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchImpl(url, {
        headers: { "user-agent": USER_AGENT },
        redirect: "follow",
        signal: AbortSignal.timeout(timeout),
      });
      if (!RETRYABLE.has(response.status) || attempt === retries) return response;
      const retryAfter = Number(response.headers?.get?.("retry-after"));
      await response.body?.cancel?.();
      lastError = new Error(`HTTP ${response.status}`);
      await sleep(retryAfter > 0 ? retryAfter * 1000 : backoff(attempt));
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      await sleep(backoff(attempt));
    }
    log?.(`  retry ${attempt + 1}/${retries} ${url} (${lastError.message})`);
  }
  throw lastError;
}

/** 2s, 4s, 8s, 16s… with a little jitter */
const backoff = (attempt) => 2000 * 2 ** attempt + Math.random() * 500;
