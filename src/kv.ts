// KV helper for Everfall Limited Watcher
// Accesses env.DISCORD_BOT KV binding

import {
  AnnouncementTemplate,
  createDefaultPresentationConfig,
  DEFAULT_IN_STOCK_TEMPLATE,
  DEFAULT_SOLD_OUT_TEMPLATE,
  PresentationConfigBundle,
  WidgetTemplateConfig,
} from "./shared/presentation";
import { VehicleMetadataOverride } from "./shared/features";

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
  method: "auto" | "manual" | "test" | "setup";
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

export async function getGuildConfig(env: any, guildId: string): Promise<GuildConfig | null> {
  const kv = env.DISCORD_BOT as KVNamespace;
  if (!kv) return null;
  const raw = await kv.get(`guild:${guildId}`);
  return raw ? JSON.parse(raw) : null;
}

export async function setGuildConfig(env: any, guildId: string, cfg: GuildConfig): Promise<void> {
  const kv = env.DISCORD_BOT as KVNamespace;
  if (!kv) return;
  await kv.put(`guild:${guildId}`, JSON.stringify(cfg));

  // Maintain registry of active guilds for fast lookup, supplemented by kv.list()
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
  const kv = env.DISCORD_BOT as KVNamespace;
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

export async function isListingSeen(env: any, listingId: string): Promise<boolean> {
  const kv = env.DISCORD_BOT as KVNamespace;
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
  const kv = env.DISCORD_BOT as KVNamespace;
  const now = Date.now();
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
  // Preserve historical discovery timestamp permanently
  const firstSeenAt = existing?.firstSeenAt || existing?.ts || options.firstSeenAtOverride || now;
  // Never overwrite complete existing metadata with an incomplete placeholder
  const mergedPayload =
    existing?.payload &&
    !isPlaceholderListingPayload(existing.payload, listingId) &&
    isPlaceholderListingPayload(payload, listingId)
      ? existing.payload
      : { ...(existing?.payload || {}), ...payload };

  // Preserve archived media URLs if existing record already points to our worker proxy and incoming payload doesn't
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

  const soldOutAt = isAvailable
    ? undefined
    : existing?.soldOutAt || now;
  const lastVerifiedAt =
    options.markVerified !== false
      ? now
      : existing?.lastVerifiedAt || existing?.lastSeenAt || firstSeenAt;

  // Skip redundant KV writes when listing state and metadata are unchanged inside minWriteIntervalMs
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
  const kv = env.DISCORD_BOT as KVNamespace;
  if (!kv) return;
  const raw = await kv.get(`listing:${listingId}`);
  if (!raw) return;
  const record = JSON.parse(raw) as ListingRecord;
  const availabilityChanged = record.isAvailable !== isAvailable;
  const now = Date.now();
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
  const kv = env.DISCORD_BOT as KVNamespace;
  if (!kv) return { version: 0, records: [] };

  const snapshot = await readSnapshotFromKv(kv);
  if (snapshot) {
    return snapshot;
  }

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

  const built: CatalogSnapshot = {
    version: Date.now(),
    records,
  };
  if (records.length > 0) {
    await kv.put(LISTING_SNAPSHOT_KEY, JSON.stringify(built));
  }
  return built;
}

export async function getCatalogSummary(env: any): Promise<{
  version: number;
  summary: { total: number; available: number; soldOut: number };
}> {
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
  const kv = env.DISCORD_BOT as KVNamespace;
  if (kv) await kv.put("monitor:last_check", JSON.stringify(status));
}

export async function getMonitorStatus(env: any): Promise<MonitorStatus | null> {
  const kv = env.DISCORD_BOT as KVNamespace;
  if (!kv) return null;
  const raw = await kv.get("monitor:last_check");
  return raw ? JSON.parse(raw) : null;
}

export async function updateListingImages(
  env: any,
  listingId: string,
  images: string[]
): Promise<ListingRecord | null> {
  const kv = env.DISCORD_BOT as KVNamespace;
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

// Per-Server (Guild) Delivery Tracking (stores messageId + channelId so embeds can be edited later)
export async function getGuildSentMessages(
  env: any,
  guildId: string
): Promise<Record<string, SentListingMessageMeta>> {
  const kv = env.DISCORD_BOT as KVNamespace;
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

  // Fallback / migration from legacy guild:${guildId}:sent:${id} keys
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
  const kv = env.DISCORD_BOT as KVNamespace;
  if (!kv) return false;
  const msgs = await getGuildSentMessages(env, guildId);
  if (msgs[listingId]) return true;
  const val = await kv.get(`guild:${guildId}:sent:${listingId}`);
  return !!val;
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
  }
): Promise<void> {
  const kv = env.DISCORD_BOT as KVNamespace;
  if (!kv) return;
  const now = Date.now();
  const currentMap = await getGuildSentMessages(env, guildId);
  const prev = currentMap[listingId];
  const nextMeta: SentListingMessageMeta = {
    listingId,
    channelId: meta?.channelId || prev?.channelId || "",
    messageId: meta?.messageId || prev?.messageId,
    sentAt: prev?.sentAt || now,
    updatedAt: meta?.isUpdate ? now : prev?.updatedAt,
    updatedSoldOutAt:
      meta?.isSoldOutRendered && !prev?.updatedSoldOutAt ? now : prev?.updatedSoldOutAt,
    isSoldOutRendered:
      meta?.isSoldOutRendered !== undefined ? meta.isSoldOutRendered : prev?.isSoldOutRendered,
  };
  currentMap[listingId] = nextMeta;
  await Promise.all([
    kv.put(`guild:${guildId}:sent:${listingId}`, JSON.stringify(nextMeta)),
    kv.put(`guild:${guildId}:messages`, JSON.stringify(currentMap)),
  ]);
}

// Per-Server & Multi-Channel Deployed Status Widget Registry (/widget)
const LEGACY_WIDGET_INDEX_KEY = "widgets:all";
const WIDGET_IDS_INDEX_KEY = "widgets:all_ids";
const WIDGET_INSTANCE_PREFIX = "widget_instance:";
const WIDGET_PENDING_PREFIX = "widget_pending:";

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

export async function getAllWidgetDeployments(env: any): Promise<WidgetDeployment[]> {
  const kv = env.DISCORD_BOT as KVNamespace;
  if (!kv) return [];

  const resultMap = new Map<string, WidgetDeployment>();
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
        if (normalized) resultMap.set(normalized.id, normalized);
      } catch {
        // skip corrupted record
      }
    })
  );

  // Backward-compatible read of legacy 1-per-guild keys (`widget:${guildId}`)
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
      if (normalized && !resultMap.has(normalized.id)) {
        resultMap.set(normalized.id, normalized);
      }
    } catch {
      // skip corrupted legacy record
    }
  }

  return [...resultMap.values()].sort((a, b) => b.deployedAt - a.deployedAt);
}

export async function getAllWidgetGuildIds(env: any): Promise<string[]> {
  const all = await getAllWidgetDeployments(env);
  return [...new Set(all.map((w) => w.guildId))];
}

export async function getWidgetsForGuild(env: any, guildId: string): Promise<WidgetDeployment[]> {
  const all = await getAllWidgetDeployments(env);
  return all.filter((w) => w.guildId === guildId);
}

export async function getWidgetDeploymentById(
  env: any,
  widgetId: string
): Promise<WidgetDeployment | null> {
  const kv = env.DISCORD_BOT as KVNamespace;
  if (!kv) return null;
  const raw = await kv.get(`${WIDGET_INSTANCE_PREFIX}${widgetId}`);
  if (raw) {
    try {
      return normalizeWidgetRecord(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  const all = await getAllWidgetDeployments(env);
  return all.find((w) => w.id === widgetId) || null;
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
  const kv = env.DISCORD_BOT as KVNamespace;
  const normalized = normalizeWidgetRecord({
    ...widget,
    id: widget.id || `${widget.guildId}:${widget.channelId}`,
  })!;
  if (!kv) return normalized;

  await kv.put(`${WIDGET_INSTANCE_PREFIX}${normalized.id}`, JSON.stringify(normalized));

  const rawIdx = await kv.get(WIDGET_IDS_INDEX_KEY);
  let ids: string[] = [];
  if (rawIdx) {
    try {
      const parsed = JSON.parse(rawIdx);
      if (Array.isArray(parsed)) ids = parsed.map(String).filter(Boolean);
    } catch {
      ids = [];
    }
  }
  if (!ids.includes(normalized.id)) {
    ids.push(normalized.id);
    await kv.put(WIDGET_IDS_INDEX_KEY, JSON.stringify([...new Set(ids)]));
  }

  // Keep legacy key updated for backward compatibility on primary guild widget
  await kv.put(`widget:${normalized.guildId}`, JSON.stringify(normalized));
  const rawLegacyIdx = await kv.get(LEGACY_WIDGET_INDEX_KEY);
  let legacyIds: string[] = [];
  if (rawLegacyIdx) {
    try {
      const parsed = JSON.parse(rawLegacyIdx);
      if (Array.isArray(parsed)) legacyIds = parsed.map(String).filter(Boolean);
    } catch {
      legacyIds = [];
    }
  }
  if (!legacyIds.includes(normalized.guildId)) {
    legacyIds.push(normalized.guildId);
    await kv.put(LEGACY_WIDGET_INDEX_KEY, JSON.stringify([...new Set(legacyIds)]));
  }
  return normalized;
}

export async function deleteWidgetDeploymentById(env: any, widgetId: string): Promise<void> {
  const kv = env.DISCORD_BOT as KVNamespace;
  if (!kv) return;
  const existing = await getWidgetDeploymentById(env, widgetId);
  await kv.delete(`${WIDGET_INSTANCE_PREFIX}${widgetId}`);

  const rawIdx = await kv.get(WIDGET_IDS_INDEX_KEY);
  if (rawIdx) {
    try {
      const parsed: string[] = JSON.parse(rawIdx);
      if (Array.isArray(parsed)) {
        await kv.put(
          WIDGET_IDS_INDEX_KEY,
          JSON.stringify(parsed.filter((id) => id !== widgetId))
        );
      }
    } catch {
      // ignore
    }
  }

  if (existing) {
    const remaining = (await getAllWidgetDeployments(env)).filter(
      (w) => w.guildId === existing.guildId
    );
    if (remaining.length === 0) {
      await kv.delete(`widget:${existing.guildId}`);
      const rawLegacy = await kv.get(LEGACY_WIDGET_INDEX_KEY);
      if (rawLegacy) {
        try {
          const parsed: string[] = JSON.parse(rawLegacy);
          if (Array.isArray(parsed)) {
            await kv.put(
              LEGACY_WIDGET_INDEX_KEY,
              JSON.stringify(parsed.filter((g) => g !== existing.guildId))
            );
          }
        } catch {
          // ignore
        }
      }
    } else {
      await kv.put(`widget:${existing.guildId}`, JSON.stringify(remaining[0]));
    }
  }
}

export async function deleteWidgetDeployment(
  env: any,
  guildId: string
): Promise<void> {
  const kv = env.DISCORD_BOT as KVNamespace;
  if (!kv) return;
  const forGuild = await getWidgetsForGuild(env, guildId);
  for (const w of forGuild) {
    await deleteWidgetDeploymentById(env, w.id);
  }
  await kv.delete(`widget:${guildId}`);
  const rawLegacy = await kv.get(LEGACY_WIDGET_INDEX_KEY);
  if (rawLegacy) {
    try {
      const parsed: string[] = JSON.parse(rawLegacy);
      if (Array.isArray(parsed)) {
        await kv.put(
          LEGACY_WIDGET_INDEX_KEY,
          JSON.stringify(parsed.filter((id) => id !== guildId))
        );
      }
    } catch {
      // ignore
    }
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
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  if (kv) {
    await kv.put(`${WIDGET_PENDING_PREFIX}${token}`, JSON.stringify(record), {
      expirationTtl: 900,
    });
  }
  return record;
}

export async function getPendingWidgetConfirmation(
  env: any,
  token: string
): Promise<PendingWidgetConfirmation | null> {
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  if (!kv || !token) return null;
  const raw = await kv.get(`${WIDGET_PENDING_PREFIX}${token}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingWidgetConfirmation;
    if (!parsed || typeof parsed.expiresAt !== "number" || Date.now() > parsed.expiresAt) {
      await kv.delete(`${WIDGET_PENDING_PREFIX}${token}`).catch(() => null);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function deletePendingWidgetConfirmation(env: any, token: string): Promise<void> {
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  if (!kv || !token) return;
  await kv.delete(`${WIDGET_PENDING_PREFIX}${token}`).catch(() => null);
}

const PRESENTATION_CONFIG_KEY = "admin:presentation_config";
const LISTING_OVERRIDES_KEY = "listings:metadata_overrides";

export async function getEmbedConfig(env: any): Promise<EmbedConfig> {
  const kv = env.DISCORD_BOT as KVNamespace;
  if (!kv) {
    return { ...DEFAULT_EMBED_CONFIG };
  }
  const raw = await kv.get("admin:embed_config");
  if (!raw) {
    return { ...DEFAULT_EMBED_CONFIG };
  }
  const parsed = JSON.parse(raw) as EmbedConfig;
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

export async function setEmbedConfig(env: any, cfg: EmbedConfig): Promise<void> {
  const kv = env.DISCORD_BOT as KVNamespace;
  if (!kv) return;
  await kv.put("admin:embed_config", JSON.stringify(cfg));
}

export async function getEffectiveEmbedConfig(env: any, guildId?: string): Promise<EmbedConfig> {
  const base = await getEmbedConfig(env);
  if (!guildId) return base;
  const guildCfg = await getGuildConfig(env, guildId);
  if (!guildCfg?.embedConfig) return base;
  return {
    ...base,
    ...guildCfg.embedConfig,
  };
}

function mergeAnnouncementTemplate(
  base: AnnouncementTemplate,
  incoming?: Partial<AnnouncementTemplate> | null
): AnnouncementTemplate {
  if (!incoming || typeof incoming !== "object") return { ...base };
  return {
    ...base,
    ...incoming,
    featureOrder:
      Array.isArray(incoming.featureOrder) && incoming.featureOrder.length > 0
        ? incoming.featureOrder
        : [...base.featureOrder],
  };
}

export async function getPresentationConfig(env: any): Promise<PresentationConfigBundle> {
  const defaults = createDefaultPresentationConfig();
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  if (!kv) return defaults;

  const raw = await kv.get(PRESENTATION_CONFIG_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<PresentationConfigBundle>;
      return {
        version: typeof parsed.version === "number" ? parsed.version : 1,
        updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
        ...(parsed.updatedBy ? { updatedBy: String(parsed.updatedBy) } : {}),
        announcements: {
          inStock: mergeAnnouncementTemplate(
            defaults.announcements.inStock,
            parsed.announcements?.inStock
          ),
          soldOut: mergeAnnouncementTemplate(
            defaults.announcements.soldOut,
            parsed.announcements?.soldOut
          ),
        },
        widgetDefault: {
          ...defaults.widgetDefault,
          ...(parsed.widgetDefault || {}),
          featureOrder:
            Array.isArray(parsed.widgetDefault?.featureOrder) &&
            parsed.widgetDefault.featureOrder.length > 0
              ? parsed.widgetDefault.featureOrder
              : [...defaults.widgetDefault.featureOrder],
          featureLabelOverrides: parsed.widgetDefault?.featureLabelOverrides || {},
          hiddenFeatureKeys: Array.isArray(parsed.widgetDefault?.hiddenFeatureKeys)
            ? parsed.widgetDefault.hiddenFeatureKeys
            : [],
        },
        widgetTemplates: Array.isArray(parsed.widgetTemplates)
          ? parsed.widgetTemplates.map((tpl) => ({
              ...defaults.widgetDefault,
              ...tpl,
              featureOrder:
                Array.isArray(tpl?.featureOrder) && tpl.featureOrder.length > 0
                  ? tpl.featureOrder
                  : [...defaults.widgetDefault.featureOrder],
              featureLabelOverrides: tpl?.featureLabelOverrides || {},
              hiddenFeatureKeys: Array.isArray(tpl?.hiddenFeatureKeys)
                ? tpl.hiddenFeatureKeys
                : [],
            }))
          : [],
        hero: {
          ...defaults.hero,
          ...(parsed.hero || {}),
          messages:
            Array.isArray(parsed.hero?.messages) && parsed.hero.messages.length > 0
              ? parsed.hero.messages
              : defaults.hero.messages,
        },
        recentEmojis: Array.isArray(parsed.recentEmojis) ? parsed.recentEmojis.slice(0, 24) : [],
      };
    } catch {
      // Fall through to legacy migration
    }
  }

  // First-read automatic migration from legacy admin:embed_config
  const legacy = await getEmbedConfig(env);
  defaults.announcements.inStock = {
    ...DEFAULT_IN_STOCK_TEMPLATE,
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
  };
  defaults.announcements.soldOut = {
    ...DEFAULT_SOLD_OUT_TEMPLATE,
    storeButtonLabel: legacy.soldOutButtonLabel || DEFAULT_SOLD_OUT_TEMPLATE.storeButtonLabel,
    showDetectionTime: legacy.showDetectionTime !== false,
    showLastVerified: legacy.showLastVerified !== false,
  };
  return defaults;
}

export async function setPresentationConfig(
  env: any,
  bundle: PresentationConfigBundle
): Promise<PresentationConfigBundle> {
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  const next: PresentationConfigBundle = {
    ...bundle,
    version: (bundle.version || 1) + 1,
    updatedAt: Date.now(),
  };
  if (kv) {
    await kv.put(PRESENTATION_CONFIG_KEY, JSON.stringify(next));
    // Keep legacy admin:embed_config synchronized for older consumers
    await setEmbedConfig(env, {
      color: next.announcements.inStock.accentColor,
      titlePrefix: next.announcements.inStock.titlePrefix,
      footerText: next.announcements.inStock.footerText,
      galleryHeading: "",
      storeButtonLabel: next.announcements.inStock.storeButtonLabel,
      soldOutButtonLabel: next.announcements.soldOut.storeButtonLabel,
      showDetectionTime: next.announcements.inStock.showDetectionTime,
      showLastVerified: next.announcements.inStock.showLastVerified,
    });
  }
  return next;
}

export async function getListingOverridesMap(
  env: any
): Promise<Record<string, VehicleMetadataOverride>> {
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
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
  const map = await getListingOverridesMap(env);
  return map[listingId] || null;
}

export async function setListingOverride(
  env: any,
  listingId: string,
  override: VehicleMetadataOverride
): Promise<Record<string, VehicleMetadataOverride>> {
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  const map = await getListingOverridesMap(env);
  map[listingId] = { ...override, listingId, updatedAt: Date.now() };
  if (kv) {
    await kv.put(LISTING_OVERRIDES_KEY, JSON.stringify(map));
  }
  return map;
}

export async function deleteListingOverride(
  env: any,
  listingId: string
): Promise<Record<string, VehicleMetadataOverride>> {
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  const map = await getListingOverridesMap(env);
  delete map[listingId];
  if (kv) {
    await kv.put(LISTING_OVERRIDES_KEY, JSON.stringify(map));
  }
  return map;
}

const DELIVERY_LOG_KEY = "dispatch:logs";
const MONITOR_LOG_KEY = "monitor:logs";
const MONITOR_LOG_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export async function appendDeliveryLog(env: any, entry: DeliveryLogEntry): Promise<void> {
  const kv = env.DISCORD_BOT as KVNamespace;
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
  const kv = env.DISCORD_BOT as KVNamespace;
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
  const kv = env.DISCORD_BOT as KVNamespace;
  if (!kv) return;
  try {
    const cutoff = Date.now() - MONITOR_LOG_RETENTION_MS;
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
  const kv = env.DISCORD_BOT as KVNamespace;
  if (!kv) return [];
  const raw = await kv.get(MONITOR_LOG_KEY);
  if (!raw) return [];
  try {
    const cutoff = Date.now() - MONITOR_LOG_RETENTION_MS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.timestamp === "number" && item.timestamp >= cutoff)
      .sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
}

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
  const kv = env.DISCORD_BOT as KVNamespace;
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
  const kv = env.DISCORD_BOT as KVNamespace;
  const existing = await getBotCommandSyncMeta(env);
  const combined: BotCommandSyncMeta = {
    ...meta,
    lastSuccess: meta.ok ? meta : existing?.lastSuccess || (existing?.ok ? existing : null),
    lastFailure: !meta.ok ? meta : existing?.lastFailure || (existing && !existing.ok ? existing : null),
  };
  if (kv) {
    await kv.put(BOT_COMMANDS_SYNC_KEY, JSON.stringify(combined));
  }
  return combined;
}

export async function getBotHealthSnapshot(env: any): Promise<BotHealthSnapshot | null> {
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  if (!kv) return null;
  const raw = await kv.get(BOT_HEALTH_SNAPSHOT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BotHealthSnapshot;
  } catch {
    return null;
  }
}

export async function setBotHealthSnapshot(
  env: any,
  snapshot: BotHealthSnapshot
): Promise<void> {
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  if (!kv) return;
  await kv.put(BOT_HEALTH_SNAPSHOT_KEY, JSON.stringify(snapshot), {
    expirationTtl: 600,
  });
}

