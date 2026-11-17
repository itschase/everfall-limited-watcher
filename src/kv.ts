// KV helper for Everfall Limited Watcher
// Accesses env.DISCORD_BOT KV binding

export type GuildConfig = {
  channelId: string;
  roleIds: string[]; // Discord role IDs to mention
  environment?: "production" | "test";
  embedConfig?: EmbedConfig;
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

export type MonitorStatus = {
  checkedAt: number;
  lastSuccessAt?: number;
  listingCount: number;
  authoritative: boolean;
  isChecking?: boolean;
  mode?: "fast" | "reduced";
  notice?: string;
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
  const fromRegistry: string[] = raw ? JSON.parse(raw) : [];
  const listedKeys = await listKeysByPrefix(kv, "guild:");
  const fromList = listedKeys
    .filter((name) => !name.includes(":sent:"))
    .map((name) => name.slice("guild:".length))
    .filter(Boolean);
  return [...new Set([...fromRegistry, ...fromList])];
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
  options: { firstSeenAtOverride?: number; lastHttpStatus?: number; markVerified?: boolean } = {}
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

  const soldOutAt = isAvailable
    ? undefined
    : existing?.soldOutAt || now;
  const lastVerifiedAt =
    options.markVerified !== false
      ? now
      : existing?.lastVerifiedAt || existing?.lastSeenAt || firstSeenAt;

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
}

export async function getListingHistory(env: any): Promise<ListingRecord[]> {
  const kv = env.DISCORD_BOT as KVNamespace;
  if (!kv) return [];
  const registryRaw = await kv.get("listings:all");
  const fromRegistry: string[] = registryRaw ? JSON.parse(registryRaw) : [];
  const listedKeys = await listKeysByPrefix(kv, "listing:");
  const fromList = listedKeys.map((name) => name.slice("listing:".length)).filter(Boolean);
  const allIds = [...new Set([...fromRegistry, ...fromList])];

  const records = await Promise.all(
    allIds.map(async (id) => {
      const raw = await kv.get(`listing:${id}`);
      if (!raw) return null;
      const value: any = JSON.parse(raw);
      return {
        id,
        firstSeenAt: value.firstSeenAt || value.ts || Date.now(),
        lastSeenAt: value.lastSeenAt || value.ts || Date.now(),
        lastVerifiedAt: value.lastVerifiedAt || value.lastSeenAt || value.ts || undefined,
        soldOutAt: value.soldOutAt || undefined,
        isAvailable: value.isAvailable !== false,
        lastHttpStatus: value.lastHttpStatus,
        payload: value.payload || {},
      } as ListingRecord;
    })
  );
  return records
    .filter((record): record is ListingRecord => Boolean(record))
    .sort((a, b) => b.firstSeenAt - a.firstSeenAt);
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

// Per-Server (Guild) Delivery Tracking
export async function isListingSentToGuild(
  env: any,
  guildId: string,
  listingId: string
): Promise<boolean> {
  const kv = env.DISCORD_BOT as KVNamespace;
  if (!kv) return false;
  const val = await kv.get(`guild:${guildId}:sent:${listingId}`);
  return !!val;
}

export async function markListingSentToGuild(
  env: any,
  guildId: string,
  listingId: string
): Promise<void> {
  const kv = env.DISCORD_BOT as KVNamespace;
  if (!kv) return;
  await kv.put(`guild:${guildId}:sent:${listingId}`, Date.now().toString());
}

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
    titlePrefix: parsed.titlePrefix?.trim() ? parsed.titlePrefix : DEFAULT_EMBED_CONFIG.titlePrefix,
    footerText: parsed.footerText?.trim() ? parsed.footerText : DEFAULT_EMBED_CONFIG.footerText,
    galleryHeading: typeof parsed.galleryHeading === "string" ? parsed.galleryHeading : "",
    storeButtonLabel: parsed.storeButtonLabel?.trim()
      ? parsed.storeButtonLabel
      : DEFAULT_EMBED_CONFIG.storeButtonLabel,
    soldOutButtonLabel: parsed.soldOutButtonLabel?.trim()
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

const DELIVERY_LOG_KEY = "dispatch:logs";

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
