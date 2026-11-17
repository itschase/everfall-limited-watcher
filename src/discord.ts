// Shared Web-Standard Discord REST helper with 429 rate-limit retry & backoff

export interface DiscordFetchOptions {
  maxRetries?: number;
  maxRetryDelayMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getRetryDelayMs(res: Response, maxRetryDelayMs: number): Promise<number> {
  let retrySeconds = 0;

  try {
    const cloned = res.clone();
    const contentType = cloned.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body: any = await cloned.json();
      if (typeof body?.retry_after === "number" && Number.isFinite(body.retry_after)) {
        retrySeconds = body.retry_after;
      }
    }
  } catch {
    // Ignore non-JSON bodies
  }

  if (retrySeconds <= 0) {
    const headerVal =
      res.headers.get("retry-after") || res.headers.get("x-ratelimit-reset-after");
    const parsed = headerVal ? Number(headerVal) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
      retrySeconds = parsed;
    }
  }

  const delayMs = retrySeconds > 0 ? Math.ceil(retrySeconds * 1000) + 100 : 500;
  return Math.min(Math.max(delayMs, 100), maxRetryDelayMs);
}

export async function fetchDiscordWithRetry(
  url: string,
  init: RequestInit = {},
  options: DiscordFetchOptions = {}
): Promise<Response> {
  const maxRetries = options.maxRetries ?? 3;
  const maxRetryDelayMs = options.maxRetryDelayMs ?? 5000;

  let attempt = 0;
  for (;;) {
    const res = await fetch(url, init);
    if (res.status !== 429 || attempt >= maxRetries) {
      return res;
    }

    const delayMs = await getRetryDelayMs(res, maxRetryDelayMs);
    attempt++;
    await sleep(delayMs);
  }
}
