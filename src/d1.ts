// Pure Web-Standard Cloudflare D1 schema bootstrap & query helpers
// Never import node:*, vite, or access process here (Workers compatible).

const initializedDbs = new WeakSet<object>();
const initializingDbs = new WeakMap<object, Promise<void>>();
const migratedDomains = new WeakMap<object, Map<string, Promise<void>>>();

export function getD1Database(env: any): D1Database | null {
  const db = env?.DB as D1Database | undefined;
  if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") {
    return null;
  }
  return db;
}

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS listings (
    id TEXT PRIMARY KEY,
    first_seen_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    last_verified_at INTEGER,
    sold_out_at INTEGER,
    is_available INTEGER NOT NULL DEFAULT 1,
    last_http_status INTEGER,
    payload_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_listings_first_seen ON listings(first_seen_at DESC)`,
  `CREATE TABLE IF NOT EXISTS listing_overrides (
    listing_id TEXT PRIMARY KEY,
    updated_at INTEGER NOT NULL,
    data_json TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS monitor_state (
    key TEXT PRIMARY KEY,
    updated_at INTEGER NOT NULL,
    value_json TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS monitor_logs (
    id TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    source TEXT NOT NULL,
    status TEXT NOT NULL,
    data_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_monitor_logs_ts ON monitor_logs(timestamp DESC)`,
  `CREATE TABLE IF NOT EXISTS guilds (
    guild_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL DEFAULT '',
    environment TEXT NOT NULL DEFAULT 'production',
    widget_template_id TEXT,
    config_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS guild_messages (
    guild_id TEXT NOT NULL,
    listing_id TEXT NOT NULL,
    channel_id TEXT NOT NULL DEFAULT '',
    message_id TEXT,
    sent_at INTEGER NOT NULL,
    updated_at INTEGER,
    updated_sold_out_at INTEGER,
    is_sold_out_rendered INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, listing_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_guild_messages_guild ON guild_messages(guild_id)`,
  `CREATE INDEX IF NOT EXISTS idx_guild_messages_msgid ON guild_messages(message_id)`,
  `CREATE TABLE IF NOT EXISTS delivery_logs (
    id TEXT PRIMARY KEY,
    listing_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    data_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_delivery_logs_ts ON delivery_logs(timestamp DESC)`,
  `CREATE TABLE IF NOT EXISTS widgets (
    id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    deployed_at INTEGER NOT NULL,
    last_synced_at INTEGER,
    last_sync_status TEXT,
    last_content_hash TEXT,
    data_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_widgets_guild ON widgets(guild_id)`,
];

export async function ensureD1Schema(db: D1Database): Promise<void> {
  if (initializedDbs.has(db)) return;
  const existingPromise = initializingDbs.get(db);
  if (existingPromise) {
    await existingPromise;
    return;
  }

  const initPromise = (async () => {
    const stmts = SCHEMA_STATEMENTS.map((sql) => db.prepare(sql));
    await db.batch(stmts);
    initializedDbs.add(db);
  })();

  initializingDbs.set(db, initPromise);
  try {
    await initPromise;
  } finally {
    initializingDbs.delete(db);
  }
}

export async function getMonitorStateValue<T = unknown>(
  db: D1Database,
  key: string
): Promise<T | null> {
  await ensureD1Schema(db);
  const row = await db
    .prepare("SELECT value_json FROM monitor_state WHERE key = ?")
    .bind(key)
    .first<{ value_json: string }>();
  if (!row?.value_json) return null;
  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    return null;
  }
}

export async function setMonitorStateValue(
  db: D1Database,
  key: string,
  value: unknown,
  updatedAt = Date.now()
): Promise<void> {
  await ensureD1Schema(db);
  await db
    .prepare(
      `INSERT INTO monitor_state (key, updated_at, value_json)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET updated_at = excluded.updated_at, value_json = excluded.value_json`
    )
    .bind(key, updatedAt, JSON.stringify(value))
    .run();
}

export async function ensureDomainMigrated(
  db: D1Database,
  domain: string,
  migrator: () => Promise<void>
): Promise<void> {
  await ensureD1Schema(db);
  let domainMap = migratedDomains.get(db);
  if (!domainMap) {
    domainMap = new Map<string, Promise<void>>();
    migratedDomains.set(db, domainMap);
  }

  const inFlight = domainMap.get(domain);
  if (inFlight) {
    await inFlight;
    return;
  }

  const migrationKey = `migration:${domain}`;
  const run = (async () => {
    const marker = await db
      .prepare("SELECT updated_at FROM monitor_state WHERE key = ?")
      .bind(migrationKey)
      .first<{ updated_at: number }>();
    if (marker) return;

    await migrator();

    await setMonitorStateValue(db, migrationKey, { done: true, migratedAt: Date.now() });
  })();

  domainMap.set(domain, run);
  try {
    await run;
  } catch (err) {
    // Allow retry if migration itself failed transiently
    domainMap.delete(domain);
    throw err;
  }
}
