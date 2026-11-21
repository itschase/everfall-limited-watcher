const DEFAULT_PUBLIC_ORIGIN = "https://everfall-limited-watcher.itschase.workers.dev";

function validateSyncUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("PRESENCE_SYNC_URL must be a valid URL.");
  }
  const isLocalHttp =
    url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !isLocalHttp) ||
    url.pathname !== "/api/internal/bot/presence" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "The presence sync endpoint must be HTTPS and use /api/internal/bot/presence (HTTP is allowed only on localhost)."
    );
  }
  return url.toString();
}

export function resolvePresenceSyncUrl(env: {
  PRESENCE_SYNC_URL?: string;
  PUBLIC_ORIGIN?: string;
}): string {
  const configuredUrl = env.PRESENCE_SYNC_URL?.trim();
  if (configuredUrl) return validateSyncUrl(configuredUrl);

  const configuredOrigin = env.PUBLIC_ORIGIN?.trim() || DEFAULT_PUBLIC_ORIGIN;
  let origin: URL;
  try {
    origin = new URL(configuredOrigin);
  } catch {
    throw new Error("PUBLIC_ORIGIN must be a valid HTTPS origin.");
  }
  if (origin.username || origin.password || origin.search || origin.hash) {
    throw new Error("PUBLIC_ORIGIN must not include credentials, a query, or a fragment.");
  }
  return validateSyncUrl(
    new URL("/api/internal/bot/presence", origin.origin).toString()
  );
}
