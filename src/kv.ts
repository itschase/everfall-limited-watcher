// D1-first storage helpers with non-destructive one-time imports from legacy KV records.

import {
  createDefaultPresentationConfig,
  DEFAULT_IN_STOCK_TEMPLATE,
  DEFAULT_SITE_PAGES_CONFIG,
  DEFAULT_SOLD_OUT_TEMPLATE,
  DEFAULT_WIDGET_TEMPLATE,
  normalizeAnnouncementTemplate,
  normalizeSitePagesConfig,
  normalizeWidgetTemplateConfig,
  PresentationConfigBundle,
  WidgetTemplateConfig,
} from "./shared/presentation";
import { VehicleMetadataOverride } from "./shared/features";
import {
  ensureD1Schema,
  ensureDomainMigrated,
  getD1Database,
  getMonitorStateValue,
  setMonitorStateValue,
} from "./d1";
import { withKvMetrics } from "./kvMetrics";

export type GuildConfig = {
  channelId: string;
  roleIds: string[]; // Discord role IDs to mention
  environment?: "production" | "test";
  embedConfig?: EmbedConfig;
  widgetTemplateId?: string;
};

export type SentListingMessageMeta = {
  listingId: string;
  channelId: string;
  messageId?: string;
  sentAt: number;
  updatedAt?: number;
  updatedSoldOutAt?: number;
  isSoldOutRendered?: boolean;
};

export type WidgetSyncHistoryEntry = {
  timestamp: number;
  status: "ok" | "error" | "skipped";
  httpStatus?: number;
  error?: string;
  trigger: string;
  contentHash?: string;
};

export type WidgetDeployment = {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string;
  deployedAt: number;
  deployedBy?: string;
  deployedByUsername?: string;
  lastSyncedAt?: number;
  lastAttemptedSyncAt?: number;
  lastSyncStatus?: "ok" | "error" | "skipped";
  lastSyncError?: string;
  templateId?: string;
  customTemplate?: WidgetTemplateConfig | null;
  configVersion?: number;
  lastCatalogVersion?: number;
  lastContentHash?: string;
  history?: WidgetSyncHistoryEntry[];
};

export type PendingWidgetConfirmation = {
  token: string;
  guildId: string;
  channelId: string;
  userId: string;
  username?: string;
  templateId?: string;
  createdAt: number;
  expiresAt: number;
};

export type ListingRecord = {
  id: string;
  firstSeenAt: number;
  lastSeenAt: number;
  lastVerifiedAt?: number;
  soldOutAt?: number;
  isAvailable: boolean;
  lastHttpStatus?: number;
  payload: any;
};

export type MonitorLogSource = "manual" | "cron-fetch" | "scrapling" | "scheduled" | "other";

export type MonitorStatus = {
  checkedAt: number;
  lastSuccessAt?: number;
  lastFetchCronSuccessAt?: number;
  lastSource?: MonitorLogSource;
  listingCount: number;
  authoritative: boolean;
  isChecking?: boolean;
  mode?: "fast" | "reduced";
  notice?: string;
  catalogVersion?: number;
  listingSummary?: {
    total: number;
    available: number;
    soldOut: number;
  };
};

export type MonitorLogAttempt = {
  url: string;
  httpStatus: number | null;
  cloudflareChallenge: boolean;
  responseLength: number | null;
  durationMs: number;
  note?: string;
};

export type MonitorLogEntry = {
  id: string;
  timestamp: number;
  source: MonitorLogSource;
  status: "success" | "blocked" | "error";
  httpStatus: number | null;
  cloudflareChallenge: boolean;
  authoritative: boolean;
  responseLength: number | null;
  targetUrl: string;
  listingCount: number;
  newDiscoveries: number;
  durationMs: number;
  message: string;
  detectedListingIds?: string[];
  detectedListingNames?: string[];
  soldOutListingIds?: string[];
  dispatchedDrops?: number;
  preservedHistoryCount?: number;
  runner?: string;
  workflowRunUrl?: string;
  attempts?: MonitorLogAttempt[];
};

export type DeliveryLogEntry = {
  id: string;
  listingId: string;
  listingName: string;
  guildId: string;
  channelId: string;
  messageId?: string;
  method: "auto" | "manual" | "test" | "setup" | "recovery";
  environment: "production" | "test";
  status: "delivered" | "failed" | "updated";
  httpStatus?: number;
  error?: string;
  timestamp: number;
};

export type EmbedConfig = {
  color?: string;
  titlePrefix?: string;
  footerText?: string;
  galleryHeading?: string;
  storeButtonLabel?: string;
  soldOutButtonLabel?: string;
  showDetectionTime?: boolean;
  showLastVerified?: boolean;
};

export const DEFAULT_EMBED_CONFIG: Required<EmbedConfig> = {
  color: "#F59E0B",
  titlePrefix: "<:everfall:1571981507973746868> Limited Edition Drop:",
  footerText: "Everfall Limited Watcher • Verified Drop Alert",
  galleryHeading: "",
  storeButtonLabel: "View Package on Everfall",
  soldOutButtonLabel: "Open Everfall Store",
  showDetectionTime: true,
  showLastVerified: true,
};

async function executeD1Batch(db: D1Database, statements: D1PreparedStatement[]): Promise<void> {
  if (statements.length === 0) return;
  for (let i = 0; i < statements.length; i += 50) {
    await db.batch(statements.slice(i, i + 50));
  }
}

async function listKeysByPrefix(kv: KVNamespace, prefix: string): Promise<string[]> {
  if (typeof kv.list !== "function") return [];
  const names: string[] = [];
  let cursor: string | undefined;
  try {
    for (;;) {
      const page = await kv.list({ prefix, limit: 1000, cursor });
      for (const item of page.keys) names.push(item.name);
      if (page.list_complete || !page.cursor) break;
      cursor = page.cursor;
    }
  } catch (err) {
    console.error(`Error listing KV keys for prefix ${prefix}:`, err);
  }
  return names;
}

const LISTING_SNAPSHOT_KEY = "listings:snapshot";

export type CatalogSnapshot = {
  version: number;
  records: ListingRecord[];
};

function normalizeSnapshotRecord(value: any, fallbackId?: string): ListingRecord | null {
  if (!value || typeof value !== "object") return null;
  const id = String(value.id || fallbackId || "").trim();
  if (!id) return null;
  const firstSeenAt = value.firstSeenAt || value.ts || Date.now();
  const lastSeenAt = value.lastSeenAt || value.ts || firstSeenAt;
  return {
    id,
    firstSeenAt,
    lastSeenAt,
    lastVerifiedAt: value.lastVerifiedAt || lastSeenAt,
    soldOutAt: value.soldOutAt || undefined,
    isAvailable: value.isAvailable !== false,
    lastHttpStatus: value.lastHttpStatus,
    payload: value.payload || {},
  };
}

function summarizeRecords(records: ListingRecord[]): {
  total: number;
  available: number;
  soldOut: number;
} {
  let available = 0;
  for (const r of records) {
    if (r.isAvailable) available++;
  }
  return {
    total: records.length,
    available,
    soldOut: records.length - available,
  };
}

function sameSemanticListingContent(a: any, b: any): boolean {
  return (
    String(a?.name || "") === String(b?.name || "") &&
    String(a?.description || "") === String(b?.description || "") &&
    String(a?.url || "") === String(b?.url || "") &&
    JSON.stringify(Array.isArray(a?.images) ? a.images : []) ===
      JSON.stringify(Array.isArray(b?.images) ? b.images : [])
  );
}

async function readSnapshotFromKv(kv: KVNamespace): Promise<CatalogSnapshot | null> {
  const raw = await kv.get(LISTING_SNAPSHOT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const records = parsed
        .map((r) => normalizeSnapshotRecord(r))
        .filter((r): r is ListingRecord => Boolean(r))
        .sort((a, b) => b.firstSeenAt - a.firstSeenAt);
      const maxTs = records.reduce(
        (max, r) => Math.max(max, r.firstSeenAt, r.soldOutAt || 0),
        0
      );
      return { version: maxTs || 1, records };
    }
    if (parsed && Array.isArray(parsed.records)) {
      const records = parsed.records
        .map((r: any) => normalizeSnapshotRecord(r))
        .filter((r: ListingRecord | null): r is ListingRecord => Boolean(r))
        .sort((a: ListingRecord, b: ListingRecord) => b.firstSeenAt - a.firstSeenAt);
      return {
        version: typeof parsed.version === "number" && parsed.version > 0 ? parsed.version : 1,
        records,
      };
    }
  } catch {
    return null;
  }
  return null;
}

async function syncSnapshotRecord(
  kv: KVNamespace,
  record: ListingRecord,
  bumpVersion: boolean
): Promise<CatalogSnapshot> {
  const current = (await readSnapshotFromKv(kv)) || { version: Date.now(), records: [] };
  const idx = current.records.findIndex((item) => item.id === record.id);
  const nextRecords = [...current.records];
  if (idx >= 0) {
    nextRecords[idx] = record;
  } else {
    nextRecords.push(record);
  }
  nextRecords.sort((a, b) => b.firstSeenAt - a.firstSeenAt);
  const nextSnapshot: CatalogSnapshot = {
    version: bumpVersion ? Date.now() : current.version || Date.now(),
    records: nextRecords,
  };
  await kv.put(LISTING_SNAPSHOT_KEY, JSON.stringify(nextSnapshot));
  return nextSnapshot;
}

export async function purgePublicEdgeCaches(originHint?: string): Promise<void> {
  if (typeof caches === "undefined" || !(caches as any)?.default) return;
  const edgeCache = (caches as any).default as Cache;
  const origins = new Set<string>(["https://everfall-limited-watcher.itschase.workers.dev"]);
  if (typeof originHint === "string" && /^https?:\/\//i.test(originHint)) {
    try {
      origins.add(new URL(originHint).origin);
    } catch {
      // ignore invalid origin
    }
  }
  await Promise.all(
    [...origins].flatMap((origin) => [
      edgeCache.delete(new Request(`${origin}/api/public/status`, { method: "GET" })).catch(() => false),
      edgeCache.delete(new Request(`${origin}/api/public/listings`, { method: "GET" })).catch(() => false),
      edgeCache.delete(new Request(`${origin}/api/public/presentation`, { method: "GET" })).catch(() => false),
    ])
  );
}

export async function purgeListingMediaEdgeCaches(
  listingId: string,
  originHint?: string
): Promise<void> {
  if (typeof caches === "undefined" || !(caches as any)?.default) return;
  const edgeCache = (caches as any).default as Cache;
  const origins = new Set<string>(["https://everfall-limited-watcher.itschase.workers.dev"]);
  if (typeof originHint === "string" && /^https?:\/\//i.test(originHint)) {
    try {
      origins.add(new URL(originHint).origin);
    } catch {
      // ignore invalid origin
    }
  }
  const tasks: Promise<boolean>[] = [];
  for (const origin of origins) {
    for (let i = 0; i < 10; i++) {
      tasks.push(
        edgeCache
          .delete(new Request(`${origin}/media/listings/${listingId}/${i}`, { method: "GET" }))
          .catch(() => false)
      );
    }
  }
  await Promise.all(tasks);
}

// ---------- D1 Lazy Migration Helpers (Non-Destructive) ----------

async function ensureGuildsMigrated(db: D1Database, kv?: KVNamespace): Promise<void> {
  await ensureDomainMigrated(db, "guilds", async () => {
    if (!kv) return;
    let ids: string[] = [];
    const rawIdx = await kv.get("guilds:all");
    if (rawIdx) {
      try {
        const parsed = JSON.parse(rawIdx);
        if (Array.isArray(parsed)) ids = parsed.map(String).filter(Boolean);
      } catch {
        ids = [];
      }
    }
    if (ids.length === 0) {
      const listedKeys = await listKeysByPrefix(kv, "guild:");
      ids = [
        ...new Set(
          listedKeys
            .filter((name) => !name.includes(":sent:") && !name.includes(":messages"))
            .map((name) => name.slice("guild:".length))
            .filter(Boolean)
        ),
      ];
    }
    if (ids.length === 0) return;

    const stmts: D1PreparedStatement[] = [];
    const now = Date.now();
    await Promise.all(
      ids.map(async (gid) => {
        const raw = await kv.get(`guild:${gid}`);
        if (!raw) return;
        try {
          const cfg = JSON.parse(raw) as GuildConfig;
          stmts.push(
            db
              .prepare(
                `INSERT OR IGNORE INTO guilds (guild_id, channel_id, environment, widget_template_id, config_json, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?)`
              )
              .bind(
                gid,
                String(cfg.channelId || ""),
                cfg.environment === "test" ? "test" : "production",
                cfg.widgetTemplateId || null,
                JSON.stringify(cfg),
                now
              )
          );
        } catch {
          // skip corrupted guild config
        }
      })
    );
    await executeD1Batch(db, stmts);
  });
}

async function ensureListingsMigrated(db: D1Database, kv?: KVNamespace): Promise<void> {
  await ensureDomainMigrated(db, "listings", async () => {
    if (!kv) return;
    let snapshot = await readSnapshotFromKv(kv);
    if (!snapshot || snapshot.records.length === 0) {
      let allIds: string[] = [];
      const registryRaw = await kv.get("listings:all");
      if (registryRaw) {
        try {
          const parsed = JSON.parse(registryRaw);
          if (Array.isArray(parsed)) allIds = parsed.map(String).filter(Boolean);
        } catch {
          allIds = [];
        }
      }
      if (allIds.length === 0) {
        const listedKeys = await listKeysByPrefix(kv, "listing:");
        allIds = [...new Set(listedKeys.map((k) => k.slice("listing:".length)).filter(Boolean))];
      }
      const rows = await Promise.all(
        allIds.map(async (id) => {
          const raw = await kv.get(`listing:${id}`);
          if (!raw) return null;
          try {
            return normalizeSnapshotRecord(JSON.parse(raw), id);
          } catch {
            return null;
          }
        })
      );
      const valid = rows.filter((r): r is ListingRecord => Boolean(r));
      snapshot = {
        version: Date.now(),
        records: valid,
      };
    }

    if (snapshot && snapshot.records.length > 0) {
      const stmts = snapshot.records.map((r) =>
        db
          .prepare(
            `INSERT OR IGNORE INTO listings (id, first_seen_at, last_seen_at, last_verified_at, sold_out_at, is_available, last_http_status, payload_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            r.id,
            r.firstSeenAt,
            r.lastSeenAt,
            r.lastVerifiedAt ?? r.lastSeenAt,
            r.soldOutAt ?? null,
            r.isAvailable ? 1 : 0,
            r.lastHttpStatus ?? null,
            JSON.stringify(r.payload || {})
          )
      );
      await executeD1Batch(db, stmts);
      await setMonitorStateValue(db, "catalog:version", snapshot.version || Date.now());
    }
  });
}

async function ensureGuildMessagesMigrated(
  db: D1Database,
  kv: KVNamespace | undefined,
  guildId: string
): Promise<void> {
  await ensureDomainMigrated(db, `guild_messages:${guildId}`, async () => {
    if (!kv) return;
    let map: Record<string, SentListingMessageMeta> = {};
    const consolidatedRaw = await kv.get(`guild:${guildId}:messages`);
    if (consolidatedRaw) {
      try {
        const parsed = JSON.parse(consolidatedRaw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          map = parsed as Record<string, SentListingMessageMeta>;
        }
      } catch {
        map = {};
      }
    }
    if (Object.keys(map).length === 0) {
      const prefix = `guild:${guildId}:sent:`;
      const keys = await listKeysByPrefix(kv, prefix);
      await Promise.all(
        keys.map(async (key) => {
          const listingId = key.slice(prefix.length);
          if (!listingId) return;
          const val = await kv.get(key);
          if (!val) return;
          try {
            const parsed = JSON.parse(val);
            if (parsed && typeof parsed === "object") {
              map[listingId] = {
                listingId,
                channelId: String(parsed.channelId || ""),
                messageId: parsed.messageId ? String(parsed.messageId) : undefined,
                sentAt: Number(parsed.sentAt || Date.now()),
                updatedAt: parsed.updatedAt ? Number(parsed.updatedAt) : undefined,
                updatedSoldOutAt: parsed.updatedSoldOutAt ? Number(parsed.updatedSoldOutAt) : undefined,
                isSoldOutRendered: Boolean(parsed.isSoldOutRendered),
              };
              return;
            }
          } catch {
            // numeric legacy timestamp
          }
          map[listingId] = {
            listingId,
            channelId: "",
            sentAt: Number(val) || Date.now(),
          };
        })
      );
    }

    const entries = Object.values(map);
    if (entries.length === 0) return;
    const stmts = entries.map((m) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO guild_messages (guild_id, listing_id, channel_id, message_id, sent_at, updated_at, updated_sold_out_at, is_sold_out_rendered)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          guildId,
          m.listingId,
          m.channelId || "",
          m.messageId || null,
          m.sentAt || Date.now(),
          m.updatedAt ?? null,
          m.updatedSoldOutAt ?? null,
          m.isSoldOutRendered ? 1 : 0
        )
    );
    await executeD1Batch(db, stmts);
  });
}

async function ensureWidgetsMigrated(db: D1Database, kv?: KVNamespace): Promise<void> {
  await ensureDomainMigrated(db, "widgets", async () => {
    if (!kv) return;
    const map = await readWidgetRegistryMap(kv, true);
    const widgets = Object.values(map);
    if (widgets.length === 0) return;
    const stmts = widgets.map((w) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO widgets (id, guild_id, channel_id, message_id, deployed_at, last_synced_at, last_sync_status, last_content_hash, data_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          w.id,
          w.guildId,
          w.channelId,
          w.messageId,
          w.deployedAt,
          w.lastSyncedAt ?? null,
          w.lastSyncStatus ?? null,
          w.lastContentHash ?? null,
          JSON.stringify(w)
        )
    );
    await executeD1Batch(db, stmts);
  });
}

async function ensureOverridesMigrated(db: D1Database, kv?: KVNamespace): Promise<void> {
  await ensureDomainMigrated(db, "listing_overrides", async () => {
    if (!kv) return;
    const raw = await kv.get(LISTING_OVERRIDES_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Record<string, VehicleMetadataOverride>;
      const entries = Object.entries(parsed || {});
      if (entries.length === 0) return;
      const stmts = entries.map(([lid, ov]) =>
        db
          .prepare(
            `INSERT OR IGNORE INTO listing_overrides (listing_id, updated_at, data_json)
             VALUES (?, ?, ?)`
          )
          .bind(lid, Number(ov?.updatedAt || Date.now()), JSON.stringify({ ...ov, listingId: lid }))
      );
      await executeD1Batch(db, stmts);
    } catch {
      // ignore corrupted legacy overrides
    }
  });
}

async function ensureMonitorLogsMigrated(db: D1Database, kv?: KVNamespace): Promise<void> {
  await ensureDomainMigrated(db, "monitor_logs", async () => {
    if (!kv) return;
    const raw = await kv.get(MONITOR_LOG_KEY);
    if (!raw) return;
    try {
      const cutoff = Date.now() - MONITOR_LOG_RETENTION_MS;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const retained = parsed.filter(
        (item: any) => item && typeof item.timestamp === "number" && item.timestamp >= cutoff
      );
      if (retained.length === 0) return;
      const stmts = retained.slice(0, 600).map((entry: MonitorLogEntry) =>
        db
          .prepare(
            `INSERT OR IGNORE INTO monitor_logs (id, timestamp, source, status, data_json)
             VALUES (?, ?, ?, ?, ?)`
          )
          .bind(
            entry.id || crypto.randomUUID(),
            entry.timestamp,
            entry.source || "other",
            entry.status || "error",
            JSON.stringify(entry)
          )
      );
      await executeD1Batch(db, stmts);
    } catch {
      // ignore corrupted legacy logs
    }
  });
}

async function ensureDeliveryLogsMigrated(db: D1Database, kv?: KVNamespace): Promise<void> {
  await ensureDomainMigrated(db, "delivery_logs", async () => {
    if (!kv) return;
    const raw = await kv.get(DELIVERY_LOG_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) return;
      const stmts = parsed.slice(0, 100).map((entry: DeliveryLogEntry) =>
        db
          .prepare(
            `INSERT OR IGNORE INTO delivery_logs (id, listing_id, guild_id, timestamp, data_json)
             VALUES (?, ?, ?, ?, ?)`
          )
          .bind(
            entry.id || crypto.randomUUID(),
            entry.listingId || "",
            entry.guildId || "",
            entry.timestamp || Date.now(),
            JSON.stringify(entry)
          )
      );
      await executeD1Batch(db, stmts);
    } catch {
      // ignore corrupted delivery logs
    }
  });
}

// ---------- Guild Configs ----------

export async function getGuildConfig(env: any, guildId: string): Promise<GuildConfig | null> {
  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  if (db) {
    await ensureGuildsMigrated(db, kv);
    const row = await db
      .prepare("SELECT config_json FROM guilds WHERE guild_id = ?")
      .bind(guildId)
      .first<{ config_json: string }>();
    if (!row?.config_json) return null;
    try {
      return JSON.parse(row.config_json) as GuildConfig;
    } catch {
      return null;
    }
  }
  if (!kv) return null;
  const raw = await kv.get(`guild:${guildId}`);
  return raw ? JSON.parse(raw) : null;
}

export async function setGuildConfig(env: any, guildId: string, cfg: GuildConfig): Promise<void> {
  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  if (db) {
    await ensureGuildsMigrated(db, kv);
    await db
      .prepare(
        `INSERT INTO guilds (guild_id, channel_id, environment, widget_template_id, config_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(guild_id) DO UPDATE SET
           channel_id = excluded.channel_id,
           environment = excluded.environment,
           widget_template_id = excluded.widget_template_id,
           config_json = excluded.config_json,
           updated_at = excluded.updated_at`
      )
      .bind(
        guildId,
        String(cfg.channelId || ""),
        cfg.environment === "test" ? "test" : "production",
        cfg.widgetTemplateId || null,
        JSON.stringify(cfg),
        Date.now()
      )
      .run();
    return;
  }

  if (!kv) return;
  await kv.put(`guild:${guildId}`, JSON.stringify(cfg));
  try {
    const allGuildsRaw = await kv.get("guilds:all");
    const allGuilds: string[] = allGuildsRaw ? JSON.parse(allGuildsRaw) : [];
    if (!allGuilds.includes(guildId)) {
      allGuilds.push(guildId);
      await kv.put("guilds:all", JSON.stringify(allGuilds));
    }
  } catch (err) {
    console.error("Error updating guilds:all registry:", err);
  }
}

export async function getAllGuildIds(env: any): Promise<string[]> {
  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  if (db) {
    await ensureGuildsMigrated(db, kv);
    const res = await db.prepare("SELECT guild_id FROM guilds ORDER BY guild_id ASC").all<{
      guild_id: string;
    }>();
    return res.results.map((r) => r.guild_id).filter(Boolean);
  }

  if (!kv) return [];
  const raw = await kv.get("guilds:all");
  if (raw !== null) {
    try {
      const parsed: string[] = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch {
      // Fall through to one-time index rebuild if corrupted
    }
  }
  const listedKeys = await listKeysByPrefix(kv, "guild:");
  const ids = [
    ...new Set(
      listedKeys
        .filter((name) => !name.includes(":sent:"))
        .map((name) => name.slice("guild:".length))
        .filter(Boolean)
    ),
  ];
  await kv.put("guilds:all", JSON.stringify(ids));
  return ids;
}

export async function addGuildRole(env: any, guildId: string, roleId: string): Promise<void> {
  const cfg = (await getGuildConfig(env, guildId)) ?? { channelId: "", roleIds: [] };
  if (!cfg.roleIds.includes(roleId)) cfg.roleIds.push(roleId);
  await setGuildConfig(env, guildId, cfg);
}

export async function removeGuildRole(env: any, guildId: string, roleId: string): Promise<void> {
  const cfg = await getGuildConfig(env, guildId);
  if (!cfg) return;
  cfg.roleIds = cfg.roleIds.filter((r) => r !== roleId);
  await setGuildConfig(env, guildId, cfg);
}

// ---------- Listings Catalog ----------

function listingRowToRecord(row: any): ListingRecord | null {
  if (!row || !row.id) return null;
  let payload: any = {};
  try {
    payload = row.payload_json ? JSON.parse(row.payload_json) : {};
  } catch {
    payload = {};
  }
  return {
    id: String(row.id),
    firstSeenAt: Number(row.first_seen_at),
    lastSeenAt: Number(row.last_seen_at),
    lastVerifiedAt:
      row.last_verified_at !== null && row.last_verified_at !== undefined
        ? Number(row.last_verified_at)
        : Number(row.last_seen_at),
    soldOutAt:
      row.sold_out_at !== null && row.sold_out_at !== undefined
        ? Number(row.sold_out_at)
        : undefined,
    isAvailable: Number(row.is_available) === 1,
    lastHttpStatus:
      row.last_http_status !== null && row.last_http_status !== undefined
        ? Number(row.last_http_status)
        : undefined,
    payload,
  };
}

export async function getListingRecordById(
  env: any,
  listingId: string
): Promise<ListingRecord | null> {
  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  if (db) {
    await ensureListingsMigrated(db, kv);
    const row = await db
      .prepare("SELECT * FROM listings WHERE id = ?")
      .bind(listingId)
      .first();
    return listingRowToRecord(row);
  }
  if (!kv) return null;
  const raw = await kv.get(`listing:${listingId}`);
  if (raw) {
    try {
      return normalizeSnapshotRecord(JSON.parse(raw), listingId);
    } catch {
      return null;
    }
  }
  const snap = await getCatalogSnapshot(env);
  return snap.records.find((r) => r.id === listingId) || null;
}

export async function isListingSeen(env: any, listingId: string): Promise<boolean> {
  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  if (db) {
    await ensureListingsMigrated(db, kv);
    const row = await db
      .prepare("SELECT id FROM listings WHERE id = ?")
      .bind(listingId)
      .first<{ id: string }>();
    return Boolean(row?.id);
  }
  if (!kv) return false;
  const val = await kv.get(`listing:${listingId}`);
  return !!val;
}

export async function markListingSeen(env: any, listingId: string, payload: any = {}): Promise<void> {
  await upsertListingRecord(env, listingId, payload, true);
}

function isPlaceholderListingPayload(payload: any, listingId: string): boolean {
  if (!payload) return true;
  const name = String(payload.name || "");
  const images = Array.isArray(payload.images) ? payload.images : [];
  return (
    name === `Limited Vehicle #${listingId}` ||
    (images.length === 0 && !payload.description)
  );
}

export async function upsertListingRecord(
  env: any,
  listingId: string,
  payload: any,
  isAvailable: boolean,
  options: {
    firstSeenAtOverride?: number;
    lastHttpStatus?: number;
    markVerified?: boolean;
    minWriteIntervalMs?: number;
  } = {}
): Promise<ListingRecord> {
  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  const now = Date.now();

  if (db) {
    await ensureListingsMigrated(db, kv);
    const existingRow = await db
      .prepare("SELECT * FROM listings WHERE id = ?")
      .bind(listingId)
      .first();
    const existing = listingRowToRecord(existingRow);

    const firstSeenAt = existing?.firstSeenAt || options.firstSeenAtOverride || now;
    const mergedPayload =
      existing?.payload &&
      !isPlaceholderListingPayload(existing.payload, listingId) &&
      isPlaceholderListingPayload(payload, listingId)
        ? existing.payload
        : { ...(existing?.payload || {}), ...payload };

    const existingImages: string[] = Array.isArray(existing?.payload?.images)
      ? existing.payload.images
      : [];
    const nextImages: string[] = Array.isArray(mergedPayload?.images) ? mergedPayload.images : [];
    if (
      existingImages.length > 0 &&
      existingImages.every((u) => typeof u === "string" && u.includes(`/media/listings/${listingId}/`)) &&
      (nextImages.length === 0 ||
        nextImages.some((u) => typeof u === "string" && !u.includes(`/media/listings/${listingId}/`)))
    ) {
      mergedPayload.images = existingImages;
    }

    const soldOutAt = isAvailable ? undefined : existing?.soldOutAt || now;
    const lastVerifiedAt =
      options.markVerified !== false
        ? now
        : existing?.lastVerifiedAt || existing?.lastSeenAt || firstSeenAt;

    if (
      existing &&
      options.minWriteIntervalMs &&
      existing.isAvailable === isAvailable &&
      (existing.lastHttpStatus ?? null) === (options.lastHttpStatus ?? existing.lastHttpStatus ?? null) &&
      now - (existing.lastVerifiedAt || existing.lastSeenAt || 0) < options.minWriteIntervalMs &&
      JSON.stringify(existing.payload || {}) === JSON.stringify(mergedPayload || {})
    ) {
      return existing;
    }

    const semanticChanged =
      !existing ||
      existing.isAvailable !== isAvailable ||
      !sameSemanticListingContent(existing.payload || {}, mergedPayload || {});

    const record: ListingRecord = {
      id: listingId,
      firstSeenAt,
      lastSeenAt: now,
      lastVerifiedAt,
      soldOutAt,
      isAvailable,
      lastHttpStatus: options.lastHttpStatus ?? existing?.lastHttpStatus,
      payload: mergedPayload,
    };

    await db
      .prepare(
        `INSERT INTO listings (id, first_seen_at, last_seen_at, last_verified_at, sold_out_at, is_available, last_http_status, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           first_seen_at = excluded.first_seen_at,
           last_seen_at = excluded.last_seen_at,
           last_verified_at = excluded.last_verified_at,
           sold_out_at = excluded.sold_out_at,
           is_available = excluded.is_available,
           last_http_status = excluded.last_http_status,
           payload_json = excluded.payload_json`
      )
      .bind(
        record.id,
        record.firstSeenAt,
        record.lastSeenAt,
        record.lastVerifiedAt ?? record.lastSeenAt,
        record.soldOutAt ?? null,
        record.isAvailable ? 1 : 0,
        record.lastHttpStatus ?? null,
        JSON.stringify(record.payload || {})
      )
      .run();

    if (semanticChanged) {
      await setMonitorStateValue(db, "catalog:version", now, now);
    } else {
      const existingVer = await getMonitorStateValue<number>(db, "catalog:version");
      if (!existingVer) {
        await setMonitorStateValue(db, "catalog:version", now, now);
      }
    }
    return record;
  }

  if (!kv) {
    return {
      id: listingId,
      firstSeenAt: options.firstSeenAtOverride || now,
      lastSeenAt: now,
      lastVerifiedAt: options.markVerified !== false ? now : undefined,
      soldOutAt: isAvailable ? undefined : now,
      isAvailable,
      lastHttpStatus: options.lastHttpStatus,
      payload,
    };
  }

  const existingRaw = await kv.get(`listing:${listingId}`);
  const existing: any = existingRaw ? JSON.parse(existingRaw) : null;
  const firstSeenAt = existing?.firstSeenAt || existing?.ts || options.firstSeenAtOverride || now;
  const mergedPayload =
    existing?.payload &&
    !isPlaceholderListingPayload(existing.payload, listingId) &&
    isPlaceholderListingPayload(payload, listingId)
      ? existing.payload
      : { ...(existing?.payload || {}), ...payload };

  const existingImages: string[] = Array.isArray(existing?.payload?.images)
    ? existing.payload.images
    : [];
  const nextImages: string[] = Array.isArray(mergedPayload?.images) ? mergedPayload.images : [];
  if (
    existingImages.length > 0 &&
    existingImages.every((u) => typeof u === "string" && u.includes(`/media/listings/${listingId}/`)) &&
    (nextImages.length === 0 ||
      nextImages.some((u) => typeof u === "string" && !u.includes(`/media/listings/${listingId}/`)))
  ) {
    mergedPayload.images = existingImages;
  }

  const soldOutAt = isAvailable ? undefined : existing?.soldOutAt || now;
  const lastVerifiedAt =
    options.markVerified !== false
      ? now
      : existing?.lastVerifiedAt || existing?.lastSeenAt || firstSeenAt;

  if (
    existing &&
    options.minWriteIntervalMs &&
    existing.isAvailable === isAvailable &&
    (existing.lastHttpStatus ?? null) === (options.lastHttpStatus ?? existing.lastHttpStatus ?? null) &&
    now - (existing.lastVerifiedAt || existing.lastSeenAt || 0) < options.minWriteIntervalMs &&
    JSON.stringify(existing.payload || {}) === JSON.stringify(mergedPayload || {})
  ) {
    return {
      id: listingId,
      firstSeenAt,
      lastSeenAt: existing.lastSeenAt || firstSeenAt,
      lastVerifiedAt: existing.lastVerifiedAt || existing.lastSeenAt || firstSeenAt,
      soldOutAt: existing.soldOutAt || undefined,
      isAvailable: existing.isAvailable !== false,
      lastHttpStatus: existing.lastHttpStatus,
      payload: existing.payload || mergedPayload,
    };
  }

  const semanticChanged =
    !existing ||
    existing.isAvailable !== isAvailable ||
    !sameSemanticListingContent(existing.payload || {}, mergedPayload || {});

  const record: ListingRecord = {
    id: listingId,
    firstSeenAt,
    lastSeenAt: now,
    lastVerifiedAt,
    soldOutAt,
    isAvailable,
    lastHttpStatus: options.lastHttpStatus ?? existing?.lastHttpStatus,
    payload: mergedPayload,
  };
  await kv.put(`listing:${listingId}`, JSON.stringify(record));

  const registryRaw = await kv.get("listings:all");
  const registry: string[] = registryRaw ? JSON.parse(registryRaw) : [];
  if (!registry.includes(listingId)) {
    registry.push(listingId);
    await kv.put("listings:all", JSON.stringify(registry));
  }
  await syncSnapshotRecord(kv, record, semanticChanged);
  return record;
}

export async function setListingAvailability(
  env: any,
  listingId: string,
  isAvailable: boolean,
  lastHttpStatus?: number
): Promise<void> {
  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  const now = Date.now();

  if (db) {
    await ensureListingsMigrated(db, kv);
    const existingRow = await db
      .prepare("SELECT * FROM listings WHERE id = ?")
      .bind(listingId)
      .first();
    const record = listingRowToRecord(existingRow);
    if (!record) return;
    const availabilityChanged = record.isAvailable !== isAvailable;
    const nextSoldOutAt = !isAvailable ? record.soldOutAt || now : null;
    await db
      .prepare(
        `UPDATE listings
         SET is_available = ?, last_seen_at = ?, last_verified_at = ?, sold_out_at = ?, last_http_status = COALESCE(?, last_http_status)
         WHERE id = ?`
      )
      .bind(isAvailable ? 1 : 0, now, now, nextSoldOutAt, lastHttpStatus ?? null, listingId)
      .run();
    if (availabilityChanged) {
      await setMonitorStateValue(db, "catalog:version", now, now);
    }
    return;
  }

  if (!kv) return;
  const raw = await kv.get(`listing:${listingId}`);
  if (!raw) return;
  const record = JSON.parse(raw) as ListingRecord;
  const availabilityChanged = record.isAvailable !== isAvailable;
  record.isAvailable = isAvailable;
  record.lastSeenAt = now;
  record.lastVerifiedAt = now;
  if (lastHttpStatus !== undefined) record.lastHttpStatus = lastHttpStatus;
  if (!isAvailable) {
    record.soldOutAt = record.soldOutAt || now;
  } else {
    record.soldOutAt = undefined;
  }
  await kv.put(`listing:${listingId}`, JSON.stringify(record));
  const normalized = normalizeSnapshotRecord(record, listingId);
  if (normalized) {
    await syncSnapshotRecord(kv, normalized, availabilityChanged);
  }
}

export async function getCatalogSnapshot(env: any): Promise<CatalogSnapshot> {
  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  if (db) {
    await ensureListingsMigrated(db, kv);
    const [rowsRes, storedVersion] = await Promise.all([
      db.prepare("SELECT * FROM listings ORDER BY first_seen_at DESC").all(),
      getMonitorStateValue<number>(db, "catalog:version"),
    ]);
    const records = rowsRes.results
      .map(listingRowToRecord)
      .filter((r): r is ListingRecord => Boolean(r));
    return {
      version: typeof storedVersion === "number" && storedVersion > 0 ? storedVersion : records.length > 0 ? 1 : 0,
      records,
    };
  }

  if (!kv) return { version: 0, records: [] };
  const snapshot = await readSnapshotFromKv(kv);
  if (snapshot) return snapshot;

  let allIds: string[] | null = null;
  const registryRaw = await kv.get("listings:all");
  if (registryRaw !== null) {
    try {
      const parsed: string[] = JSON.parse(registryRaw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        allIds = [...new Set(parsed.filter(Boolean))];
      }
    } catch {
      allIds = null;
    }
  }
  if (!allIds) {
    const listedKeys = await listKeysByPrefix(kv, "listing:");
    allIds = [...new Set(listedKeys.map((name) => name.slice("listing:".length)).filter(Boolean))];
    if (allIds.length > 0) {
      await kv.put("listings:all", JSON.stringify(allIds));
    }
  }

  const rawRecords = await Promise.all(
    allIds.map(async (id) => {
      const raw = await kv.get(`listing:${id}`);
      if (!raw) return null;
      return normalizeSnapshotRecord(JSON.parse(raw), id);
    })
  );
  const records = rawRecords
    .filter((record): record is ListingRecord => Boolean(record))
    .sort((a, b) => b.firstSeenAt - a.firstSeenAt);

  const built: CatalogSnapshot = { version: Date.now(), records };
  if (records.length > 0) {
    await kv.put(LISTING_SNAPSHOT_KEY, JSON.stringify(built));
  }
  return built;
}

export async function getCatalogSummary(env: any): Promise<{
  version: number;
  summary: { total: number; available: number; soldOut: number };
}> {
  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  if (db) {
    await ensureListingsMigrated(db, kv);
    const [counts, version] = await Promise.all([
      db
        .prepare(
          "SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN is_available = 1 THEN 1 ELSE 0 END), 0) AS available FROM listings"
        )
        .first<{ total: number; available: number }>(),
      getMonitorStateValue<number>(db, "catalog:version"),
    ]);
    const total = Number(counts?.total || 0);
    const available = Number(counts?.available || 0);
    return {
      version: typeof version === "number" && version > 0 ? version : total > 0 ? 1 : 0,
      summary: {
        total,
        available,
        soldOut: Math.max(0, total - available),
      },
    };
  }
  const snapshot = await getCatalogSnapshot(env);
  return {
    version: snapshot.version,
    summary: summarizeRecords(snapshot.records),
  };
}

export async function getListingHistory(env: any): Promise<ListingRecord[]> {
  const snapshot = await getCatalogSnapshot(env);
  return snapshot.records;
}

export async function setMonitorStatus(env: any, status: MonitorStatus): Promise<void> {
  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  if (db) {
    await ensureD1Schema(db);
    await setMonitorStateValue(db, "monitor:last_check", status);
    await setMonitorStateValue(db, "migration:monitor_status", { done: true, migratedAt: Date.now() });
    return;
  }
  if (kv) await kv.put("monitor:last_check", JSON.stringify(status));
}

export async function getMonitorStatus(env: any): Promise<MonitorStatus | null> {
  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  if (db) {
    await ensureDomainMigrated(db, "monitor_status", async () => {
      if (!kv) return;
      const raw = await kv.get("monitor:last_check");
      if (!raw) return;
      try {
        await setMonitorStateValue(db, "monitor:last_check", JSON.parse(raw));
      } catch {
        // ignore invalid legacy status
      }
    });
    return await getMonitorStateValue<MonitorStatus>(db, "monitor:last_check");
  }
  if (!kv) return null;
  const raw = await kv.get("monitor:last_check");
  return raw ? JSON.parse(raw) : null;
}

export async function updateListingImages(
  env: any,
  listingId: string,
  images: string[]
): Promise<ListingRecord | null> {
  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  const now = Date.now();

  if (db) {
    await ensureListingsMigrated(db, kv);
    const existing = await getListingRecordById(env, listingId);
    if (!existing) return null;
    const nextRecord: ListingRecord = {
      ...existing,
      payload: {
        ...(existing.payload || {}),
        images,
      },
    };
    await db
      .prepare("UPDATE listings SET payload_json = ? WHERE id = ?")
      .bind(JSON.stringify(nextRecord.payload), listingId)
      .run();
    await setMonitorStateValue(db, "catalog:version", now, now);

    const [monitor, summary] = await Promise.all([getMonitorStatus(env), getCatalogSummary(env)]);
    if (monitor) {
      await setMonitorStatus(env, {
        ...monitor,
        catalogVersion: now,
        listingSummary: summary.summary,
      });
    }
    return nextRecord;
  }

  if (!kv) return null;
  const raw = await kv.get(`listing:${listingId}`);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  const existing = normalizeSnapshotRecord(parsed, listingId);
  if (!existing) return null;
  const nextRecord: ListingRecord = {
    ...existing,
    payload: {
      ...(existing.payload || {}),
      images,
    },
  };
  await kv.put(`listing:${listingId}`, JSON.stringify(nextRecord));
  const nextSnap = await syncSnapshotRecord(kv, nextRecord, true);

  const monitor = await getMonitorStatus(env);
  if (monitor) {
    const avail = nextSnap.records.filter((r) => r.isAvailable).length;
    await setMonitorStatus(env, {
      ...monitor,
      catalogVersion: nextSnap.version,
      listingSummary: {
        total: nextSnap.records.length,
        available: avail,
        soldOut: nextSnap.records.length - avail,
      },
    });
  }
  return nextRecord;
}

// ---------- Per-Server (Guild) Delivery Tracking ----------

export async function getGuildSentMessages(
  env: any,
  guildId: string
): Promise<Record<string, SentListingMessageMeta>> {
  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;

  if (db) {
    await ensureGuildMessagesMigrated(db, kv, guildId);
    const rows = await db
      .prepare("SELECT * FROM guild_messages WHERE guild_id = ?")
      .bind(guildId)
      .all<any>();
    const map: Record<string, SentListingMessageMeta> = {};
    for (const row of rows.results) {
      const lid = String(row.listing_id || "");
      if (!lid) continue;
      map[lid] = {
        listingId: lid,
        channelId: String(row.channel_id || ""),
        ...(row.message_id ? { messageId: String(row.message_id) } : {}),
        sentAt: Number(row.sent_at || Date.now()),
        ...(row.updated_at ? { updatedAt: Number(row.updated_at) } : {}),
        ...(row.updated_sold_out_at ? { updatedSoldOutAt: Number(row.updated_sold_out_at) } : {}),
        isSoldOutRendered: Number(row.is_sold_out_rendered) === 1,
      };
    }
    return map;
  }

  if (!kv) return {};
  const consolidatedRaw = await kv.get(`guild:${guildId}:messages`);
  if (consolidatedRaw) {
    try {
      const parsed = JSON.parse(consolidatedRaw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, SentListingMessageMeta>;
      }
    } catch {
      // fall through
    }
  }

  const prefix = `guild:${guildId}:sent:`;
  const keys = await listKeysByPrefix(kv, prefix);
  const map: Record<string, SentListingMessageMeta> = {};
  await Promise.all(
    keys.map(async (key) => {
      const listingId = key.slice(prefix.length);
      if (!listingId) return;
      const val = await kv.get(key);
      if (!val) return;
      try {
        const parsed = JSON.parse(val);
        if (parsed && typeof parsed === "object") {
          map[listingId] = {
            listingId,
            channelId: String(parsed.channelId || ""),
            messageId: parsed.messageId ? String(parsed.messageId) : undefined,
            sentAt: Number(parsed.sentAt || Date.now()),
            updatedAt: parsed.updatedAt ? Number(parsed.updatedAt) : undefined,
            updatedSoldOutAt: parsed.updatedSoldOutAt ? Number(parsed.updatedSoldOutAt) : undefined,
            isSoldOutRendered: Boolean(parsed.isSoldOutRendered),
          };
          return;
        }
      } catch {
        // numeric legacy timestamp
      }
      map[listingId] = {
        listingId,
        channelId: "",
        sentAt: Number(val) || Date.now(),
      };
    })
  );
  if (Object.keys(map).length > 0) {
    await kv.put(`guild:${guildId}:messages`, JSON.stringify(map));
  }
  return map;
}

export async function listSentListingIdsForGuild(
  env: any,
  guildId: string
): Promise<Record<string, boolean>> {
  const msgs = await getGuildSentMessages(env, guildId);
  const map: Record<string, boolean> = {};
  for (const id of Object.keys(msgs)) {
    map[id] = true;
  }
  return map;
}

export async function isListingSentToGuild(
  env: any,
  guildId: string,
  listingId: string
): Promise<boolean> {
  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  if (db) {
    await ensureGuildMessagesMigrated(db, kv, guildId);
    const row = await db
      .prepare("SELECT listing_id FROM guild_messages WHERE guild_id = ? AND listing_id = ?")
      .bind(guildId, listingId)
      .first<{ listing_id: string }>();
    return Boolean(row?.listing_id);
  }
  if (!kv) return false;
  const msgs = await getGuildSentMessages(env, guildId);
  if (msgs[listingId]) return true;
  const val = await kv.get(`guild:${guildId}:sent:${listingId}`);
  return !!val;
}

export async function findGuildMessageByMessageId(
  env: any,
  messageId: string
): Promise<{ guildId: string; meta: SentListingMessageMeta } | null> {
  const cleanMsgId = String(messageId || "").trim();
  if (!cleanMsgId) return null;

  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  if (db) {
    const guildIds = await getAllGuildIds(env);
    for (const gid of guildIds) {
      await ensureGuildMessagesMigrated(db, kv, gid);
    }
    const row = await db
      .prepare("SELECT * FROM guild_messages WHERE message_id = ? LIMIT 1")
      .bind(cleanMsgId)
      .first<any>();
    if (!row) return null;
    return {
      guildId: String(row.guild_id),
      meta: {
        listingId: String(row.listing_id),
        channelId: String(row.channel_id || ""),
        messageId: row.message_id ? String(row.message_id) : undefined,
        sentAt: Number(row.sent_at || Date.now()),
        updatedAt: row.updated_at ? Number(row.updated_at) : undefined,
        updatedSoldOutAt: row.updated_sold_out_at ? Number(row.updated_sold_out_at) : undefined,
        isSoldOutRendered: Number(row.is_sold_out_rendered) === 1,
      },
    };
  }

  const guildIds = await getAllGuildIds(env);
  for (const gid of guildIds) {
    const msgs = await getGuildSentMessages(env, gid);
    for (const meta of Object.values(msgs)) {
      if (meta?.messageId === cleanMsgId) {
        return { guildId: gid, meta };
      }
    }
  }
  return null;
}

export async function markListingSentToGuild(
  env: any,
  guildId: string,
  listingId: string,
  meta?: {
    channelId?: string;
    messageId?: string;
    isUpdate?: boolean;
    isSoldOutRendered?: boolean;
    sentAtOverride?: number;
  }
): Promise<void> {
  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  const now = Date.now();

  if (db) {
    await ensureGuildMessagesMigrated(db, kv, guildId);
    const prevRow = await db
      .prepare("SELECT * FROM guild_messages WHERE guild_id = ? AND listing_id = ?")
      .bind(guildId, listingId)
      .first<any>();

    const sentAt =
      typeof meta?.sentAtOverride === "number" && meta.sentAtOverride > 0
        ? meta.sentAtOverride
        : prevRow?.sent_at
          ? Number(prevRow.sent_at)
          : now;
    const updatedAt = meta?.isUpdate ? now : prevRow?.updated_at ? Number(prevRow.updated_at) : null;
    const isSoldOut =
      meta?.isSoldOutRendered !== undefined
        ? meta.isSoldOutRendered
        : prevRow
          ? Number(prevRow.is_sold_out_rendered) === 1
          : false;
    const updatedSoldOutAt =
      isSoldOut && !prevRow?.updated_sold_out_at
        ? now
        : prevRow?.updated_sold_out_at
          ? Number(prevRow.updated_sold_out_at)
          : null;

    await db
      .prepare(
        `INSERT INTO guild_messages (guild_id, listing_id, channel_id, message_id, sent_at, updated_at, updated_sold_out_at, is_sold_out_rendered)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(guild_id, listing_id) DO UPDATE SET
           channel_id = excluded.channel_id,
           message_id = excluded.message_id,
           sent_at = excluded.sent_at,
           updated_at = excluded.updated_at,
           updated_sold_out_at = excluded.updated_sold_out_at,
           is_sold_out_rendered = excluded.is_sold_out_rendered`
      )
      .bind(
        guildId,
        listingId,
        meta?.channelId || String(prevRow?.channel_id || ""),
        meta?.messageId || (prevRow?.message_id ? String(prevRow.message_id) : null),
        sentAt,
        updatedAt,
        updatedSoldOutAt,
        isSoldOut ? 1 : 0
      )
      .run();
    return;
  }

  if (!kv) return;
  const currentMap = await getGuildSentMessages(env, guildId);
  const prev = currentMap[listingId];
  const nextMeta: SentListingMessageMeta = {
    listingId,
    channelId: meta?.channelId || prev?.channelId || "",
    messageId: meta?.messageId || prev?.messageId,
    sentAt:
      typeof meta?.sentAtOverride === "number" && meta.sentAtOverride > 0
        ? meta.sentAtOverride
        : prev?.sentAt || now,
    updatedAt: meta?.isUpdate ? now : prev?.updatedAt,
    updatedSoldOutAt:
      meta?.isSoldOutRendered && !prev?.updatedSoldOutAt ? now : prev?.updatedSoldOutAt,
    isSoldOutRendered:
      meta?.isSoldOutRendered !== undefined ? meta.isSoldOutRendered : prev?.isSoldOutRendered,
  };
  currentMap[listingId] = nextMeta;
  await kv.put(`guild:${guildId}:messages`, JSON.stringify(currentMap));
}

// ---------- Per-Server & Multi-Channel Deployed Status Widget Registry (/widget) ----------
export const WIDGET_REGISTRY_KEY = "widgets:registry";
const LEGACY_WIDGET_INDEX_KEY = "widgets:all";
const WIDGET_IDS_INDEX_KEY = "widgets:all_ids";
const WIDGET_INSTANCE_PREFIX = "widget_instance:";

function normalizeWidgetRecord(raw: any): WidgetDeployment | null {
  if (!raw || typeof raw !== "object") return null;
  const guildId = String(raw.guildId || "").trim();
  const channelId = String(raw.channelId || "").trim();
  const messageId = String(raw.messageId || "").trim();
  if (!guildId || !channelId || !messageId) return null;
  const id = String(raw.id || `${guildId}:${channelId}`).trim();
  return {
    id,
    guildId,
    channelId,
    messageId,
    deployedAt: Number(raw.deployedAt || Date.now()),
    ...(raw.deployedBy ? { deployedBy: String(raw.deployedBy) } : {}),
    ...(raw.deployedByUsername ? { deployedByUsername: String(raw.deployedByUsername) } : {}),
    ...(raw.lastSyncedAt ? { lastSyncedAt: Number(raw.lastSyncedAt) } : {}),
    ...(raw.lastAttemptedSyncAt ? { lastAttemptedSyncAt: Number(raw.lastAttemptedSyncAt) } : {}),
    ...(raw.lastSyncStatus ? { lastSyncStatus: raw.lastSyncStatus } : {}),
    ...(raw.lastSyncError ? { lastSyncError: String(raw.lastSyncError) } : {}),
    ...(raw.templateId ? { templateId: String(raw.templateId) } : {}),
    ...(raw.customTemplate ? { customTemplate: raw.customTemplate } : {}),
    ...(typeof raw.configVersion === "number" ? { configVersion: raw.configVersion } : {}),
    ...(typeof raw.lastCatalogVersion === "number" ? { lastCatalogVersion: raw.lastCatalogVersion } : {}),
    ...(raw.lastContentHash ? { lastContentHash: String(raw.lastContentHash) } : {}),
    history: Array.isArray(raw.history) ? raw.history.slice(0, 15) : [],
  };
}

async function readWidgetRegistryMap(
  kv: KVNamespace,
  readOnly = false
): Promise<Record<string, WidgetDeployment>> {
  const consolidatedRaw = await kv.get(WIDGET_REGISTRY_KEY);
  if (consolidatedRaw !== null) {
    try {
      const parsed = JSON.parse(consolidatedRaw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const clean: Record<string, WidgetDeployment> = {};
        for (const [k, val] of Object.entries(parsed)) {
          const normalized = normalizeWidgetRecord(val);
          if (normalized) clean[normalized.id || k] = normalized;
        }
        return clean;
      }
    } catch {
      // fall through
    }
  }

  const resultMap: Record<string, WidgetDeployment> = {};
  let ids: string[] = [];
  const rawIdx = await kv.get(WIDGET_IDS_INDEX_KEY);
  if (rawIdx) {
    try {
      const parsed = JSON.parse(rawIdx);
      if (Array.isArray(parsed)) ids = parsed.map(String).filter(Boolean);
    } catch {
      ids = [];
    }
  }
  if (ids.length === 0) {
    const instanceKeys = await listKeysByPrefix(kv, WIDGET_INSTANCE_PREFIX);
    ids = instanceKeys.map((k) => k.slice(WIDGET_INSTANCE_PREFIX.length)).filter(Boolean);
  }

  await Promise.all(
    ids.map(async (id) => {
      const raw = await kv.get(`${WIDGET_INSTANCE_PREFIX}${id}`);
      if (!raw) return;
      try {
        const normalized = normalizeWidgetRecord(JSON.parse(raw));
        if (normalized) resultMap[normalized.id] = normalized;
      } catch {
        // skip
      }
    })
  );

  let legacyGuildIds: string[] = [];
  const rawLegacyIdx = await kv.get(LEGACY_WIDGET_INDEX_KEY);
  if (rawLegacyIdx) {
    try {
      const parsed = JSON.parse(rawLegacyIdx);
      if (Array.isArray(parsed)) legacyGuildIds = parsed.map(String).filter(Boolean);
    } catch {
      legacyGuildIds = [];
    }
  } else {
    const legacyKeys = await listKeysByPrefix(kv, "widget:");
    legacyGuildIds = legacyKeys.map((k) => k.slice("widget:".length)).filter(Boolean);
  }

  for (const guildId of legacyGuildIds) {
    const raw = await kv.get(`widget:${guildId}`);
    if (!raw) continue;
    try {
      const normalized = normalizeWidgetRecord(JSON.parse(raw));
      if (normalized && !resultMap[normalized.id]) {
        resultMap[normalized.id] = normalized;
      }
    } catch {
      // skip
    }
  }

  if (!readOnly && Object.keys(resultMap).length > 0) {
    await kv.put(WIDGET_REGISTRY_KEY, JSON.stringify(resultMap));
  }
  return resultMap;
}

export async function getAllWidgetDeployments(env: any): Promise<WidgetDeployment[]> {
  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  if (db) {
    await ensureWidgetsMigrated(db, kv);
    const res = await db
      .prepare("SELECT data_json FROM widgets ORDER BY deployed_at DESC")
      .all<{ data_json: string }>();
    return res.results
      .map((r) => {
        try {
          return normalizeWidgetRecord(JSON.parse(r.data_json));
        } catch {
          return null;
        }
      })
      .filter((w): w is WidgetDeployment => Boolean(w));
  }
  if (!kv) return [];
  const map = await readWidgetRegistryMap(kv);
  return Object.values(map).sort((a, b) => b.deployedAt - a.deployedAt);
}

export async function getAllWidgetGuildIds(env: any): Promise<string[]> {
  const all = await getAllWidgetDeployments(env);
  return [...new Set(all.map((w) => w.guildId))];
}

export async function getWidgetsForGuild(env: any, guildId: string): Promise<WidgetDeployment[]> {
  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  if (db) {
    await ensureWidgetsMigrated(db, kv);
    const res = await db
      .prepare("SELECT data_json FROM widgets WHERE guild_id = ? ORDER BY deployed_at DESC")
      .bind(guildId)
      .all<{ data_json: string }>();
    return res.results
      .map((r) => {
        try {
          return normalizeWidgetRecord(JSON.parse(r.data_json));
        } catch {
          return null;
        }
      })
      .filter((w): w is WidgetDeployment => Boolean(w));
  }
  const all = await getAllWidgetDeployments(env);
  return all.filter((w) => w.guildId === guildId);
}

export async function getWidgetDeploymentById(
  env: any,
  widgetId: string
): Promise<WidgetDeployment | null> {
  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  if (db) {
    await ensureWidgetsMigrated(db, kv);
    const row = await db
      .prepare("SELECT data_json FROM widgets WHERE id = ?")
      .bind(widgetId)
      .first<{ data_json: string }>();
    if (!row?.data_json) return null;
    try {
      return normalizeWidgetRecord(JSON.parse(row.data_json));
    } catch {
      return null;
    }
  }
  if (!kv) return null;
  const map = await readWidgetRegistryMap(kv);
  return map[widgetId] || null;
}

export async function getWidgetDeployment(
  env: any,
  guildId: string
): Promise<WidgetDeployment | null> {
  const forGuild = await getWidgetsForGuild(env, guildId);
  return forGuild[0] || null;
}

export async function setWidgetDeployment(
  env: any,
  widget: Omit<WidgetDeployment, "id"> & { id?: string }
): Promise<WidgetDeployment> {
  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  const normalized = normalizeWidgetRecord({
    ...widget,
    id: widget.id || `${widget.guildId}:${widget.channelId}`,
  })!;

  if (db) {
    await ensureWidgetsMigrated(db, kv);
    await db
      .prepare(
        `INSERT INTO widgets (id, guild_id, channel_id, message_id, deployed_at, last_synced_at, last_sync_status, last_content_hash, data_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           guild_id = excluded.guild_id,
           channel_id = excluded.channel_id,
           message_id = excluded.message_id,
           deployed_at = excluded.deployed_at,
           last_synced_at = excluded.last_synced_at,
           last_sync_status = excluded.last_sync_status,
           last_content_hash = excluded.last_content_hash,
           data_json = excluded.data_json`
      )
      .bind(
        normalized.id,
        normalized.guildId,
        normalized.channelId,
        normalized.messageId,
        normalized.deployedAt,
        normalized.lastSyncedAt ?? null,
        normalized.lastSyncStatus ?? null,
        normalized.lastContentHash ?? null,
        JSON.stringify(normalized)
      )
      .run();
    return normalized;
  }

  if (!kv) return normalized;
  const map = await readWidgetRegistryMap(kv);
  map[normalized.id] = normalized;
  await kv.put(WIDGET_REGISTRY_KEY, JSON.stringify(map));
  return normalized;
}

export async function saveWidgetDeploymentsBatch(
  env: any,
  updatedWidgets: WidgetDeployment[]
): Promise<void> {
  if (updatedWidgets.length === 0) return;
  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;

  if (db) {
    await ensureWidgetsMigrated(db, kv);
    const stmts: D1PreparedStatement[] = [];
    for (const w of updatedWidgets) {
      const normalized = normalizeWidgetRecord(w);
      if (!normalized) continue;
      stmts.push(
        db
          .prepare(
            `INSERT INTO widgets (id, guild_id, channel_id, message_id, deployed_at, last_synced_at, last_sync_status, last_content_hash, data_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               guild_id = excluded.guild_id,
               channel_id = excluded.channel_id,
               message_id = excluded.message_id,
               deployed_at = excluded.deployed_at,
               last_synced_at = excluded.last_synced_at,
               last_sync_status = excluded.last_sync_status,
               last_content_hash = excluded.last_content_hash,
               data_json = excluded.data_json`
          )
          .bind(
            normalized.id,
            normalized.guildId,
            normalized.channelId,
            normalized.messageId,
            normalized.deployedAt,
            normalized.lastSyncedAt ?? null,
            normalized.lastSyncStatus ?? null,
            normalized.lastContentHash ?? null,
            JSON.stringify(normalized)
          )
      );
    }
    await executeD1Batch(db, stmts);
    return;
  }

  if (!kv) return;
  const map = await readWidgetRegistryMap(kv);
  for (const w of updatedWidgets) {
    const normalized = normalizeWidgetRecord(w);
    if (normalized) map[normalized.id] = normalized;
  }
  await kv.put(WIDGET_REGISTRY_KEY, JSON.stringify(map));
}

export async function deleteWidgetDeploymentById(env: any, widgetId: string): Promise<void> {
  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  if (db) {
    await ensureWidgetsMigrated(db, kv);
    await db.prepare("DELETE FROM widgets WHERE id = ?").bind(widgetId).run();
    return;
  }
  if (!kv) return;
  const map = await readWidgetRegistryMap(kv);
  const existing = map[widgetId];
  delete map[widgetId];
  await kv.put(WIDGET_REGISTRY_KEY, JSON.stringify(map));
  await kv.delete(`${WIDGET_INSTANCE_PREFIX}${widgetId}`).catch(() => null);
  if (existing && !Object.values(map).some((w) => w.guildId === existing.guildId)) {
    await kv.delete(`widget:${existing.guildId}`).catch(() => null);
  }
}

export async function deleteWidgetDeployment(env: any, guildId: string): Promise<void> {
  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  if (db) {
    await ensureWidgetsMigrated(db, kv);
    await db.prepare("DELETE FROM widgets WHERE guild_id = ?").bind(guildId).run();
    return;
  }
  if (!kv) return;
  const map = await readWidgetRegistryMap(kv);
  const removedIds: string[] = [];
  for (const [id, w] of Object.entries(map)) {
    if (w.guildId === guildId) {
      removedIds.push(id);
      delete map[id];
    }
  }
  if (removedIds.length > 0) {
    await kv.put(WIDGET_REGISTRY_KEY, JSON.stringify(map));
    await Promise.all([
      ...removedIds.map((id) => kv.delete(`${WIDGET_INSTANCE_PREFIX}${id}`).catch(() => null)),
      kv.delete(`widget:${guildId}`).catch(() => null),
    ]);
  }
}

export async function createPendingWidgetConfirmation(
  env: any,
  input: Omit<PendingWidgetConfirmation, "token" | "createdAt" | "expiresAt">
): Promise<PendingWidgetConfirmation> {
  const token = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const now = Date.now();
  const record: PendingWidgetConfirmation = {
    ...input,
    token,
    createdAt: now,
    expiresAt: now + 15 * 60 * 1000,
  };
  const db = getD1Database(env);
  if (!db) throw new Error("The D1 database binding (DB) is required for widget confirmations.");
  await ensureD1Schema(db);
  await db
    .prepare("DELETE FROM pending_widget_confirmations WHERE expires_at <= ?")
    .bind(now)
    .run();
  await db
    .prepare(
      "INSERT INTO pending_widget_confirmations (token, expires_at, record_json) VALUES (?, ?, ?)"
    )
    .bind(token, record.expiresAt, JSON.stringify(record))
    .run();
  return record;
}

export async function getPendingWidgetConfirmation(
  env: any,
  token: string
): Promise<PendingWidgetConfirmation | null> {
  const db = getD1Database(env);
  if (!db || !token) return null;
  await ensureD1Schema(db);
  const row = await db
    .prepare(
      "SELECT expires_at, record_json FROM pending_widget_confirmations WHERE token = ?"
    )
    .bind(token)
    .first<{ expires_at: number; record_json: string }>();
  if (!row) return null;
  if (Number(row.expires_at) <= Date.now()) {
    await db
      .prepare("DELETE FROM pending_widget_confirmations WHERE token = ?")
      .bind(token)
      .run();
    return null;
  }
  try {
    return JSON.parse(row.record_json) as PendingWidgetConfirmation;
  } catch {
    return null;
  }
}

export async function deletePendingWidgetConfirmation(env: any, token: string): Promise<void> {
  const db = getD1Database(env);
  if (!db || !token) return;
  await ensureD1Schema(db);
  await db
    .prepare("DELETE FROM pending_widget_confirmations WHERE token = ?")
    .bind(token)
    .run();
}

// ---------- Presentation & Site Pages Config ----------

const PRESENTATION_CONFIG_KEY = "admin:presentation_config";
const LISTING_OVERRIDES_KEY = "listings:metadata_overrides";

function parsePresentationBundle(
  parsed: Partial<PresentationConfigBundle>,
  defaults: PresentationConfigBundle
): PresentationConfigBundle {
  const normalizedWidgetDefault = normalizeWidgetTemplateConfig(
    parsed.widgetDefault,
    defaults.widgetDefault
  );
  return {
    version: typeof parsed.version === "number" ? parsed.version : 1,
    updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    ...(parsed.updatedBy ? { updatedBy: String(parsed.updatedBy) } : {}),
    announcements: {
      inStock: normalizeAnnouncementTemplate(
        parsed.announcements?.inStock,
        defaults.announcements.inStock
      ),
      soldOut: normalizeAnnouncementTemplate(
        parsed.announcements?.soldOut,
        defaults.announcements.soldOut
      ),
    },
    widgetDefault: normalizedWidgetDefault,
    widgetTemplates: Array.isArray(parsed.widgetTemplates)
      ? parsed.widgetTemplates.map((tpl) =>
          normalizeWidgetTemplateConfig(tpl, normalizedWidgetDefault)
        )
      : [],
    hero: {
      ...defaults.hero,
      ...(parsed.hero || {}),
      messages:
        Array.isArray(parsed.hero?.messages) && parsed.hero.messages.length > 0
          ? parsed.hero.messages
          : defaults.hero.messages,
    },
    pages: normalizeSitePagesConfig(parsed.pages, DEFAULT_SITE_PAGES_CONFIG),
    recentEmojis: Array.isArray(parsed.recentEmojis) ? parsed.recentEmojis.slice(0, 24) : [],
  };
}

function embedConfigFromLegacy(parsed: EmbedConfig): EmbedConfig {
  return {
    color: parsed.color || DEFAULT_EMBED_CONFIG.color,
    titlePrefix:
      typeof parsed.titlePrefix === "string"
        ? parsed.titlePrefix
        : DEFAULT_EMBED_CONFIG.titlePrefix,
    footerText:
      typeof parsed.footerText === "string"
        ? parsed.footerText
        : DEFAULT_EMBED_CONFIG.footerText,
    galleryHeading: typeof parsed.galleryHeading === "string" ? parsed.galleryHeading : "",
    storeButtonLabel:
      typeof parsed.storeButtonLabel === "string" && parsed.storeButtonLabel.trim()
        ? parsed.storeButtonLabel
        : DEFAULT_EMBED_CONFIG.storeButtonLabel,
    soldOutButtonLabel:
      typeof parsed.soldOutButtonLabel === "string" && parsed.soldOutButtonLabel.trim()
        ? parsed.soldOutButtonLabel
        : DEFAULT_EMBED_CONFIG.soldOutButtonLabel,
    showDetectionTime: parsed.showDetectionTime !== false,
    showLastVerified: parsed.showLastVerified !== false,
  };
}

async function ensurePresentationMigrated(db: D1Database, kv?: KVNamespace): Promise<void> {
  await ensureDomainMigrated(db, "presentation_config", async () => {
    if (!kv) return;
    const rawPres = await kv.get(PRESENTATION_CONFIG_KEY);
    if (rawPres) {
      try {
        await setMonitorStateValue(db, PRESENTATION_CONFIG_KEY, JSON.parse(rawPres));
      } catch {
        // ignore invalid legacy presentation json
      }
    }
    const rawEmbed = await kv.get("admin:embed_config");
    if (rawEmbed) {
      try {
        await setMonitorStateValue(db, "admin:embed_config", JSON.parse(rawEmbed));
      } catch {
        // ignore invalid legacy embed json
      }
    }
  });
}

export async function getEmbedConfig(env: any): Promise<EmbedConfig> {
  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;

  if (db) {
    await ensurePresentationMigrated(db, kv);
    const pres = await getMonitorStateValue<Partial<PresentationConfigBundle>>(
      db,
      PRESENTATION_CONFIG_KEY
    );
    if (pres) {
      const inStock = normalizeAnnouncementTemplate(
        pres.announcements?.inStock,
        DEFAULT_IN_STOCK_TEMPLATE
      );
      const soldOut = normalizeAnnouncementTemplate(
        pres.announcements?.soldOut,
        DEFAULT_SOLD_OUT_TEMPLATE
      );
      return {
        color: inStock.accentColor || DEFAULT_EMBED_CONFIG.color,
        titlePrefix: inStock.titlePrefix || DEFAULT_EMBED_CONFIG.titlePrefix,
        footerText: inStock.footerText || DEFAULT_EMBED_CONFIG.footerText,
        galleryHeading: "",
        storeButtonLabel: inStock.storeButtonLabel || DEFAULT_EMBED_CONFIG.storeButtonLabel,
        soldOutButtonLabel: soldOut.storeButtonLabel || DEFAULT_EMBED_CONFIG.soldOutButtonLabel,
        showDetectionTime: inStock.showDetectionTime !== false,
        showLastVerified: inStock.showLastVerified !== false,
      };
    }
    const legacy = await getMonitorStateValue<EmbedConfig>(db, "admin:embed_config");
    return legacy ? embedConfigFromLegacy(legacy) : { ...DEFAULT_EMBED_CONFIG };
  }

  if (!kv) return { ...DEFAULT_EMBED_CONFIG };
  const presRaw = await kv.get(PRESENTATION_CONFIG_KEY);
  if (presRaw) {
    try {
      const parsed = JSON.parse(presRaw) as Partial<PresentationConfigBundle>;
      const inStock = normalizeAnnouncementTemplate(
        parsed.announcements?.inStock,
        DEFAULT_IN_STOCK_TEMPLATE
      );
      const soldOut = normalizeAnnouncementTemplate(
        parsed.announcements?.soldOut,
        DEFAULT_SOLD_OUT_TEMPLATE
      );
      return {
        color: inStock.accentColor || DEFAULT_EMBED_CONFIG.color,
        titlePrefix: inStock.titlePrefix || DEFAULT_EMBED_CONFIG.titlePrefix,
        footerText: inStock.footerText || DEFAULT_EMBED_CONFIG.footerText,
        galleryHeading: "",
        storeButtonLabel: inStock.storeButtonLabel || DEFAULT_EMBED_CONFIG.storeButtonLabel,
        soldOutButtonLabel: soldOut.storeButtonLabel || DEFAULT_EMBED_CONFIG.soldOutButtonLabel,
        showDetectionTime: inStock.showDetectionTime !== false,
        showLastVerified: inStock.showLastVerified !== false,
      };
    } catch {
      // fall through
    }
  }
  const raw = await kv.get("admin:embed_config");
  if (!raw) return { ...DEFAULT_EMBED_CONFIG };
  return embedConfigFromLegacy(JSON.parse(raw) as EmbedConfig);
}

export async function setEmbedConfig(env: any, cfg: EmbedConfig): Promise<void> {
  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  if (db) {
    await ensurePresentationMigrated(db, kv);
    await setMonitorStateValue(db, "admin:embed_config", cfg);
    return;
  }
  if (kv) await kv.put("admin:embed_config", JSON.stringify(cfg));
}

export async function getEffectiveEmbedConfig(env: any, guildId?: string): Promise<EmbedConfig> {
  const base = await getEmbedConfig(env);
  if (!guildId) return base;
  const guildCfg = await getGuildConfig(env, guildId);
  if (!guildCfg?.embedConfig) return base;
  return { ...base, ...guildCfg.embedConfig };
}

export async function getPresentationConfig(env: any): Promise<PresentationConfigBundle> {
  const defaults = createDefaultPresentationConfig();
  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;

  if (db) {
    await ensurePresentationMigrated(db, kv);
    const parsed = await getMonitorStateValue<Partial<PresentationConfigBundle>>(
      db,
      PRESENTATION_CONFIG_KEY
    );
    if (parsed) {
      return parsePresentationBundle(parsed, defaults);
    }
  } else if (kv) {
    const raw = await kv.get(PRESENTATION_CONFIG_KEY);
    if (raw) {
      try {
        return parsePresentationBundle(JSON.parse(raw), defaults);
      } catch {
        // Fall through
      }
    }
  } else {
    return defaults;
  }

  // First-read automatic migration from legacy admin:embed_config
  const legacy = await getEmbedConfig(env);
  defaults.announcements.inStock = normalizeAnnouncementTemplate(
    {
      accentColor: legacy.color || DEFAULT_IN_STOCK_TEMPLATE.accentColor,
      titlePrefix:
        typeof legacy.titlePrefix === "string"
          ? legacy.titlePrefix.replace(/<a?:[a-zA-Z0-9_]+:\d+>\s*/g, "").trim() ||
            DEFAULT_IN_STOCK_TEMPLATE.titlePrefix
          : DEFAULT_IN_STOCK_TEMPLATE.titlePrefix,
      footerText: legacy.footerText || DEFAULT_IN_STOCK_TEMPLATE.footerText,
      storeButtonLabel: legacy.storeButtonLabel || DEFAULT_IN_STOCK_TEMPLATE.storeButtonLabel,
      showDetectionTime: legacy.showDetectionTime !== false,
      showLastVerified: legacy.showLastVerified !== false,
    },
    DEFAULT_IN_STOCK_TEMPLATE
  );
  defaults.announcements.soldOut = normalizeAnnouncementTemplate(
    {
      storeButtonLabel: legacy.soldOutButtonLabel || DEFAULT_SOLD_OUT_TEMPLATE.storeButtonLabel,
      showDetectionTime: legacy.showDetectionTime !== false,
      showLastVerified: legacy.showLastVerified !== false,
    },
    DEFAULT_SOLD_OUT_TEMPLATE
  );
  defaults.widgetDefault = normalizeWidgetTemplateConfig(
    defaults.widgetDefault,
    DEFAULT_WIDGET_TEMPLATE
  );
  defaults.pages = normalizeSitePagesConfig(defaults.pages, DEFAULT_SITE_PAGES_CONFIG);
  return defaults;
}

export async function setPresentationConfig(
  env: any,
  bundle: PresentationConfigBundle
): Promise<PresentationConfigBundle> {
  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  const next: PresentationConfigBundle = {
    ...bundle,
    pages: normalizeSitePagesConfig(bundle.pages, DEFAULT_SITE_PAGES_CONFIG),
    version: (bundle.version || 1) + 1,
    updatedAt: Date.now(),
  };
  if (db) {
    await ensurePresentationMigrated(db, kv);
    await setMonitorStateValue(db, PRESENTATION_CONFIG_KEY, next, next.updatedAt);
    return next;
  }
  if (kv) {
    await kv.put(PRESENTATION_CONFIG_KEY, JSON.stringify(next));
  }
  return next;
}

// ---------- Per-Listing Metadata Overrides ----------

export async function getListingOverridesMap(
  env: any
): Promise<Record<string, VehicleMetadataOverride>> {
  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  if (db) {
    await ensureOverridesMigrated(db, kv);
    const res = await db
      .prepare("SELECT listing_id, data_json FROM listing_overrides")
      .all<{ listing_id: string; data_json: string }>();
    const map: Record<string, VehicleMetadataOverride> = {};
    for (const row of res.results) {
      try {
        map[row.listing_id] = JSON.parse(row.data_json) as VehicleMetadataOverride;
      } catch {
        // skip corrupted row
      }
    }
    return map;
  }
  if (!kv) return {};
  const raw = await kv.get(LISTING_OVERRIDES_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, VehicleMetadataOverride>)
      : {};
  } catch {
    return {};
  }
}

export async function getListingOverride(
  env: any,
  listingId: string
): Promise<VehicleMetadataOverride | null> {
  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  if (db) {
    await ensureOverridesMigrated(db, kv);
    const row = await db
      .prepare("SELECT data_json FROM listing_overrides WHERE listing_id = ?")
      .bind(listingId)
      .first<{ data_json: string }>();
    if (!row?.data_json) return null;
    try {
      return JSON.parse(row.data_json) as VehicleMetadataOverride;
    } catch {
      return null;
    }
  }
  const map = await getListingOverridesMap(env);
  return map[listingId] || null;
}

export async function setListingOverride(
  env: any,
  listingId: string,
  override: VehicleMetadataOverride
): Promise<Record<string, VehicleMetadataOverride>> {
  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  const now = Date.now();
  const nextOv: VehicleMetadataOverride = { ...override, listingId, updatedAt: now };

  if (db) {
    await ensureOverridesMigrated(db, kv);
    await db
      .prepare(
        `INSERT INTO listing_overrides (listing_id, updated_at, data_json)
         VALUES (?, ?, ?)
         ON CONFLICT(listing_id) DO UPDATE SET updated_at = excluded.updated_at, data_json = excluded.data_json`
      )
      .bind(listingId, now, JSON.stringify(nextOv))
      .run();
    return await getListingOverridesMap(env);
  }

  const map = await getListingOverridesMap(env);
  map[listingId] = nextOv;
  if (kv) await kv.put(LISTING_OVERRIDES_KEY, JSON.stringify(map));
  return map;
}

export async function deleteListingOverride(
  env: any,
  listingId: string
): Promise<Record<string, VehicleMetadataOverride>> {
  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  if (db) {
    await ensureOverridesMigrated(db, kv);
    await db.prepare("DELETE FROM listing_overrides WHERE listing_id = ?").bind(listingId).run();
    return await getListingOverridesMap(env);
  }
  const map = await getListingOverridesMap(env);
  delete map[listingId];
  if (kv) await kv.put(LISTING_OVERRIDES_KEY, JSON.stringify(map));
  return map;
}

// ---------- Delivery & Monitor Logs ----------

const DELIVERY_LOG_KEY = "dispatch:logs";
const MONITOR_LOG_KEY = "monitor:logs";
const MONITOR_LOG_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export async function appendDeliveryLog(env: any, entry: DeliveryLogEntry): Promise<void> {
  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  if (db) {
    try {
      await ensureDeliveryLogsMigrated(db, kv);
      await db.batch([
        db
          .prepare(
            `INSERT OR REPLACE INTO delivery_logs (id, listing_id, guild_id, timestamp, data_json)
             VALUES (?, ?, ?, ?, ?)`
          )
          .bind(
            entry.id || crypto.randomUUID(),
            entry.listingId || "",
            entry.guildId || "",
            entry.timestamp || Date.now(),
            JSON.stringify(entry)
          ),
        db.prepare(
          `DELETE FROM delivery_logs WHERE id NOT IN (
             SELECT id FROM delivery_logs ORDER BY timestamp DESC LIMIT 100
           )`
        ),
      ]);
    } catch (err) {
      console.error("Failed to persist delivery log to D1:", err);
    }
    return;
  }

  if (!kv) return;
  try {
    const raw = await kv.get(DELIVERY_LOG_KEY);
    const existing: DeliveryLogEntry[] = raw ? JSON.parse(raw) : [];
    const updated = [entry, ...existing].slice(0, 100);
    await kv.put(DELIVERY_LOG_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error("Failed to persist delivery log:", err);
  }
}

export async function getDeliveryLogs(env: any): Promise<DeliveryLogEntry[]> {
  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  if (db) {
    await ensureDeliveryLogsMigrated(db, kv);
    const res = await db
      .prepare("SELECT data_json FROM delivery_logs ORDER BY timestamp DESC LIMIT 100")
      .all<{ data_json: string }>();
    return res.results
      .map((r) => {
        try {
          return JSON.parse(r.data_json) as DeliveryLogEntry;
        } catch {
          return null;
        }
      })
      .filter((item): item is DeliveryLogEntry => Boolean(item));
  }
  if (!kv) return [];
  const raw = await kv.get(DELIVERY_LOG_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function appendMonitorLog(env: any, entry: MonitorLogEntry): Promise<void> {
  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  const cutoff = Date.now() - MONITOR_LOG_RETENTION_MS;

  if (db) {
    try {
      await ensureMonitorLogsMigrated(db, kv);
      await db.batch([
        db
          .prepare(
            `INSERT OR REPLACE INTO monitor_logs (id, timestamp, source, status, data_json)
             VALUES (?, ?, ?, ?, ?)`
          )
          .bind(
            entry.id || crypto.randomUUID(),
            entry.timestamp,
            entry.source || "other",
            entry.status || "error",
            JSON.stringify(entry)
          ),
        db.prepare("DELETE FROM monitor_logs WHERE timestamp < ?").bind(cutoff),
        db.prepare(
          `DELETE FROM monitor_logs WHERE id NOT IN (
             SELECT id FROM monitor_logs ORDER BY timestamp DESC LIMIT 600
           )`
        ),
      ]);
    } catch (err) {
      console.error("Failed to persist store monitor log to D1:", err);
    }
    return;
  }

  if (!kv) return;
  try {
    const raw = await kv.get(MONITOR_LOG_KEY);
    const existing: MonitorLogEntry[] = raw ? JSON.parse(raw) : [];
    const retained = Array.isArray(existing)
      ? existing.filter((item) => item && typeof item.timestamp === "number" && item.timestamp >= cutoff)
      : [];
    const updated = [entry, ...retained].slice(0, 600);
    await kv.put(MONITOR_LOG_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error("Failed to persist store monitor log:", err);
  }
}

export async function getMonitorLogs(env: any): Promise<MonitorLogEntry[]> {
  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  const cutoff = Date.now() - MONITOR_LOG_RETENTION_MS;

  if (db) {
    await ensureMonitorLogsMigrated(db, kv);
    const res = await db
      .prepare(
        "SELECT data_json FROM monitor_logs WHERE timestamp >= ? ORDER BY timestamp DESC LIMIT 600"
      )
      .bind(cutoff)
      .all<{ data_json: string }>();
    return res.results
      .map((r) => {
        try {
          return JSON.parse(r.data_json) as MonitorLogEntry;
        } catch {
          return null;
        }
      })
      .filter((item): item is MonitorLogEntry => Boolean(item));
  }

  if (!kv) return [];
  const raw = await kv.get(MONITOR_LOG_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.timestamp === "number" && item.timestamp >= cutoff)
      .sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
}

// ---------- Bot Command Sync Meta & Health Snapshot ----------

export type BotCommandSyncRecord = {
  syncedAt: number;
  syncedBy: string;
  scope: "global" | "guild";
  guildId?: string;
  ok: boolean;
  httpStatus: number;
  commandCount: number;
  commandNames: string[];
  error?: string;
};

export type BotCommandSyncMeta = BotCommandSyncRecord & {
  lastSuccess?: BotCommandSyncRecord | null;
  lastFailure?: BotCommandSyncRecord | null;
};

export type BotHealthSnapshot = {
  verified: boolean;
  online: boolean;
  checkedAt: number;
  appId?: string;
  botUsername?: string;
  error?: string;
};

const BOT_COMMANDS_SYNC_KEY = "bot:commands_sync_meta";
const BOT_HEALTH_SNAPSHOT_KEY = "bot:health_snapshot";

export async function getBotCommandSyncMeta(env: any): Promise<BotCommandSyncMeta | null> {
  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  if (db) {
    await ensureDomainMigrated(db, "bot_commands_sync", async () => {
      if (!kv) return;
      const raw = await kv.get(BOT_COMMANDS_SYNC_KEY);
      if (!raw) return;
      try {
        await setMonitorStateValue(db, BOT_COMMANDS_SYNC_KEY, JSON.parse(raw));
      } catch {
        // ignore invalid legacy sync meta
      }
    });
    return await getMonitorStateValue<BotCommandSyncMeta>(db, BOT_COMMANDS_SYNC_KEY);
  }
  if (!kv) return null;
  const raw = await kv.get(BOT_COMMANDS_SYNC_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BotCommandSyncMeta;
  } catch {
    return null;
  }
}

export async function setBotCommandSyncMeta(
  env: any,
  meta: BotCommandSyncRecord
): Promise<BotCommandSyncMeta> {
  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  const existing = await getBotCommandSyncMeta(env);
  const combined: BotCommandSyncMeta = {
    ...meta,
    lastSuccess: meta.ok ? meta : existing?.lastSuccess || (existing?.ok ? existing : null),
    lastFailure: !meta.ok ? meta : existing?.lastFailure || (existing && !existing.ok ? existing : null),
  };
  if (db) {
    await ensureD1Schema(db);
    await setMonitorStateValue(db, BOT_COMMANDS_SYNC_KEY, combined);
    await setMonitorStateValue(db, "migration:bot_commands_sync", {
      done: true,
      migratedAt: Date.now(),
    });
    return combined;
  }
  if (kv) {
    await kv.put(BOT_COMMANDS_SYNC_KEY, JSON.stringify(combined));
  }
  return combined;
}

async function ensureBotHealthSnapshotMigrated(
  db: D1Database,
  kv?: KVNamespace
): Promise<void> {
  await ensureDomainMigrated(db, "bot_health_snapshot", async () => {
    if (!kv) return;
    let raw: string | null;
    try {
      raw = await withKvMetrics("bot_health_snapshot", "get", () =>
        kv.get(BOT_HEALTH_SNAPSHOT_KEY)
      );
    } catch (error) {
      console.warn("Failed to migrate legacy bot health snapshot from KV:", error);
      return;
    }
    if (!raw) return;
    try {
      await setMonitorStateValue(db, BOT_HEALTH_SNAPSHOT_KEY, JSON.parse(raw));
    } catch (error) {
      console.warn("Failed to migrate legacy bot health snapshot to D1:", error);
    }
  });
}

export async function getBotHealthSnapshot(env: any): Promise<BotHealthSnapshot | null> {
  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  if (db) {
    await ensureBotHealthSnapshotMigrated(db, kv);
    return await getMonitorStateValue<BotHealthSnapshot>(db, BOT_HEALTH_SNAPSHOT_KEY);
  }
  return null;
}

export async function setBotHealthSnapshot(
  env: any,
  snapshot: BotHealthSnapshot
): Promise<void> {
  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  if (db) {
    await ensureBotHealthSnapshotMigrated(db, kv);
    await setMonitorStateValue(db, BOT_HEALTH_SNAPSHOT_KEY, snapshot, snapshot.checkedAt);
    return;
  }
}

// Creator profile in D1 (migrated cleanly from KV creator:profile)
export async function getCreatorProfileFromStore(env: any): Promise<Record<string, any> | null> {
  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  if (db) {
    await ensureDomainMigrated(db, "creator_profile", async () => {
      if (!kv) return;
      const raw = await kv.get("creator:profile");
      if (!raw) return;
      try {
        await setMonitorStateValue(db, "creator:profile", JSON.parse(raw));
      } catch {
        // ignore
      }
    });
    return await getMonitorStateValue<Record<string, any>>(db, "creator:profile");
  }
  if (!kv) return null;
  const raw = await kv.get("creator:profile");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setCreatorProfileInStore(
  env: any,
  profile: Record<string, any>
): Promise<void> {
  const db = getD1Database(env);
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  if (db) {
    await ensureD1Schema(db);
    await setMonitorStateValue(db, "creator:profile", profile);
    return;
  }
  if (kv) {
    await kv.put("creator:profile", JSON.stringify(profile));
  }
}
