// KV helper for Everfall Limited Watcher
// The KV binding is named DISCORD_BOT (see wrangler.toml)
/** Get the KV namespace (Workers runtime provides it globally) */
function getKV() {
    // @ts-ignore – the binding is injected by Cloudflare Workers
    return DISCORD_BOT;
}
/** Guild configuration */
export async function getGuildConfig(guildId) {
    const raw = await getKV().get(`guild:${guildId}`);
    return raw ? JSON.parse(raw) : null;
}
export async function setGuildConfig(guildId, cfg) {
    await getKV().put(`guild:${guildId}`, JSON.stringify(cfg));
}
export async function addGuildRole(guildId, roleId) {
    const cfg = (await getGuildConfig(guildId)) ?? { channelId: "", roleIds: [] };
    if (!cfg.roleIds.includes(roleId))
        cfg.roleIds.push(roleId);
    await setGuildConfig(guildId, cfg);
}
export async function removeGuildRole(guildId, roleId) {
    const cfg = await getGuildConfig(guildId);
    if (!cfg)
        return;
    cfg.roleIds = cfg.roleIds.filter((r) => r !== roleId);
    await setGuildConfig(guildId, cfg);
}
/** Listing tracking – store seen listing IDs to avoid duplicates */
export async function isListingSeen(listingId) {
    const val = await getKV().get(`listing:${listingId}`);
    return !!val;
}
export async function markListingSeen(listingId, payload = {}) {
    // Store a minimal payload (timestamp) – useful for debugging
    const data = { ts: Date.now(), payload };
    await getKV().put(`listing:${listingId}`, JSON.stringify(data));
}
