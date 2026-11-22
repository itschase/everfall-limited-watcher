// Single source for the service's monitoring cadence. Keep the external job's
// trigger in sync separately; changing this value cannot reschedule that job.
export const STORE_MONITOR_INTERVAL_MINUTES = 15;
export const SCHEDULED_CRON_INTERVAL_MS = STORE_MONITOR_INTERVAL_MINUTES * 60 * 1000;
export const SCHEDULED_CRON_EXPRESSION = `*/${STORE_MONITOR_INTERVAL_MINUTES} * * * *`;

// Minimum cooldown for non-cron storefront fetches, allowing one minute of jitter.
export const MIN_STORE_CHECK_INTERVAL_MS = (STORE_MONITOR_INTERVAL_MINUTES - 1) * 60 * 1000;

export const CHECK_INTERVAL_LABEL = `Every ${STORE_MONITOR_INTERVAL_MINUTES} minutes`;
export const CHECK_INTERVAL_SHORT = `Every ${STORE_MONITOR_INTERVAL_MINUTES}m`;

export const STORE_HOME_URL = "https://store.everfallcommunity.com/";
export const STORE_CATEGORY_URL = "https://store.everfallcommunity.com/category/limited-cars";
export const DEFAULT_PUBLIC_ORIGIN = "https://everfall-limited-watcher.itschase.workers.dev";

// Refresh only the recognized built-in workflow sentence in older saved pages.
// Other numbers (vehicle delivery estimates, for example) are unrelated.
export function refreshStoreMonitorCadenceCopy(text: string): string {
  return text.replace(
    /(Automated runners inspect the Everfall Limited Cars category\s*\()every\s+\d+\s+minutes?(\))/gi,
    (_match, prefix: string, suffix: string) =>
      `${prefix}${CHECK_INTERVAL_LABEL.toLowerCase()}${suffix}`
  );
}

export function formatScheduledCadence(intervalMs?: number, compact = true): string {
  const minutes = Math.max(
    1,
    Math.round((intervalMs && intervalMs > 0 ? intervalMs : SCHEDULED_CRON_INTERVAL_MS) / 60_000)
  );
  return compact ? `Every ${minutes}m` : `Every ${minutes} minute${minutes === 1 ? "" : "s"}`;
}
