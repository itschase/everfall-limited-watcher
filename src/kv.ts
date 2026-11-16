// KV helper for Everfall Limited Watcher
// Accesses env.DISCORD_BOT KV binding

export type GuildConfig = {
  channelId: string;
  roleIds: string[]; // Discord role IDs to mention
};

export type EmbedConfig = {
  color?: string;
  titlePrefix?: string;
  footerText?: string;
  galleryHeading?: string;
  storeButtonLabel?: string;
  showDetectionTime?: boolean;
};

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

  // Maintain registry of active guilds
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
  return raw ? JSON.parse(raw) : [];
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
  const kv = env.DISCORD_BOT as KVNamespace;
  if (!kv) return;
  const data = { ts: Date.now(), payload };
  await kv.put(`listing:${listingId}`, JSON.stringify(data));
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
    return {
      color: "#F59E0B",
      titlePrefix: "<:everfall:1571981507973746868> Limited Edition Drop:",
      footerText: "Everfall Limited Watcher • Verified Drop Alert",
      galleryHeading: "Vehicle Gallery",
      storeButtonLabel: "View Package on Everfall Store",
      showDetectionTime: true,
    };
  }
  const raw = await kv.get("admin:embed_config");
  if (!raw) {
    return {
      color: "#F59E0B",
      titlePrefix: "<:everfall:1571981507973746868> Limited Edition Drop:",
      footerText: "Everfall Limited Watcher • Verified Drop Alert",
      galleryHeading: "Vehicle Gallery",
      storeButtonLabel: "View Package on Everfall Store",
      showDetectionTime: true,
    };
  }
  return JSON.parse(raw);
}

export async function setEmbedConfig(env: any, cfg: EmbedConfig): Promise<void> {
  const kv = env.DISCORD_BOT as KVNamespace;
  if (!kv) return;
  await kv.put("admin:embed_config", JSON.stringify(cfg));
}
