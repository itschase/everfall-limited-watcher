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

export async function fetchDiscordChannelMessage(
  token: string,
  channelId: string,
  messageId: string
): Promise<{ ok: boolean; httpStatus: number; message?: any; error?: string }> {
  if (!token || !channelId || !messageId) {
    return {
      ok: false,
      httpStatus: 400,
      error: "Bot token, channelId, and messageId are required.",
    };
  }
  try {
    const res = await fetchDiscordWithRetry(
      `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`,
      {
        method: "GET",
        headers: { Authorization: `Bot ${token}` },
      }
    );
    if (res.ok) {
      const message = await res.json();
      return { ok: true, httpStatus: res.status, message };
    }
    const errText = await res.text().catch(() => "");
    let friendly = `Discord API returned HTTP ${res.status}.`;
    if (res.status === 404) {
      friendly =
        "Discord message not found (HTTP 404). Verify the message ID and channel ID are correct and the message was not deleted.";
    } else if (res.status === 403) {
      friendly =
        "Bot lacks Read Message History / View Channel permission (HTTP 403) in that channel.";
    } else if (res.status === 400) {
      friendly = "Invalid Discord Channel ID or Message ID format (HTTP 400).";
    } else if (errText) {
      friendly = `Discord API ${res.status}: ${errText.slice(0, 180)}`;
    }
    return { ok: false, httpStatus: res.status, error: friendly };
  } catch (err: any) {
    return {
      ok: false,
      httpStatus: 502,
      error: err?.message || "Network error querying Discord message API.",
    };
  }
}

