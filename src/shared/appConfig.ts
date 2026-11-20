export const STORE_MONITOR_INTERVAL_MINUTES = 7;
export const SCHEDULED_CRON_INTERVAL_MS = STORE_MONITOR_INTERVAL_MINUTES * 60 * 1000;
export const SCHEDULED_CRON_EXPRESSION = `*/${STORE_MONITOR_INTERVAL_MINUTES} * * * *`;

// Minimum cooldown for non-cron storefront fetches (slightly below 7m to tolerate runner jitter)
export const MIN_STORE_CHECK_INTERVAL_MS = (STORE_MONITOR_INTERVAL_MINUTES - 1) * 60 * 1000;

export const CHECK_INTERVAL_LABEL = `Every ${STORE_MONITOR_INTERVAL_MINUTES} minutes`;
export const CHECK_INTERVAL_SHORT = `Every ${STORE_MONITOR_INTERVAL_MINUTES}m`;

export const STORE_HOME_URL = "https://store.everfallcommunity.com/";
export const STORE_CATEGORY_URL = "https://store.everfallcommunity.com/category/limited-cars";
export const DEFAULT_PUBLIC_ORIGIN = "https://everfall-limited-watcher.itschase.workers.dev";

export function formatScheduledCadence(intervalMs?: number, compact = true): string {
  const minutes = Math.max(
    1,
    Math.round((intervalMs && intervalMs > 0 ? intervalMs : SCHEDULED_CRON_INTERVAL_MS) / 60_000)
  );
  return compact ? `Every ${minutes}m` : `Every ${minutes} minute${minutes === 1 ? "" : "s"}`;
}
