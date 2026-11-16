// KV helper for Everfall Limited Watcher
// The KV binding is named DISCORD_BOT (see wrangler.toml)

type GuildConfig = {
  channelId: string;
  roleIds: string[]; // Discord role IDs to mention
};

/** Get the KV namespace (Workers runtime provides it globally) */
function getKV(): KVNamespace {
  // @ts-ignore – the binding is injected by Cloudflare Workers
  return DISCORD_BOT;
}

/** Guild configuration */
export async function getGuildConfig(guildId: string): Promise<GuildConfig | null> {
  const raw = await getKV().get(`guild:${guildId}`);
  return raw ? JSON.parse(raw) : null;
}

export async function setGuildConfig(guildId: string, cfg: GuildConfig): Promise<void> {
  await getKV().put(`guild:${guildId}`, JSON.stringify(cfg));
}

export async function addGuildRole(guildId: string, roleId: string): Promise<void> {
  const cfg = (await getGuildConfig(guildId)) ?? { channelId: "", roleIds: [] };
  if (!cfg.roleIds.includes(roleId)) cfg.roleIds.push(roleId);
  await setGuildConfig(guildId, cfg);
}

export async function removeGuildRole(guildId: string, roleId: string): Promise<void> {
  const cfg = await getGuildConfig(guildId);
  if (!cfg) return;
  cfg.roleIds = cfg.roleIds.filter((r) => r !== roleId);
  await setGuildConfig(guildId, cfg);
}

/** Listing tracking – store seen listing IDs to avoid duplicates */
export async function isListingSeen(listingId: string): Promise<boolean> {
  const val = await getKV().get(`listing:${listingId}`);
  return !!val;
}

export async function markListingSeen(listingId: string, payload: any = {}): Promise<void> {
  // Store a minimal payload (timestamp) – useful for debugging
  const data = { ts: Date.now(), payload };
  await getKV().put(`listing:${listingId}`, JSON.stringify(data));
}
