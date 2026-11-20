type KvCategory = "bot_health_snapshot" | "guild_controls" | "bot_guilds";
type KvOperation = "get" | "put";

const counts = new Map<string, number>();
let operationsSinceReport = 0;
let lastReportAt = Date.now();

export async function withKvMetrics<T>(
  category: KvCategory,
  operation: KvOperation,
  action: () => Promise<T>
): Promise<T> {
  try {
    const result = await action();
    recordKvOperation(category, operation, "success");
    return result;
  } catch (error) {
    recordKvOperation(category, operation, "failure");
    throw error;
  }
}

function recordKvOperation(
  category: KvCategory,
  operation: KvOperation,
  outcome: "success" | "failure"
): void {
  const key = `${category}.${operation}.${outcome}`;
  counts.set(key, (counts.get(key) || 0) + 1);
  operationsSinceReport++;

  const now = Date.now();
  if (operationsSinceReport < 100 && now - lastReportAt < 60_000) return;

  console.info(
    "[kv-usage]",
    JSON.stringify({
      intervalMs: now - lastReportAt,
      counts: Object.fromEntries(counts),
    })
  );
  counts.clear();
  operationsSinceReport = 0;
  lastReportAt = now;
}
