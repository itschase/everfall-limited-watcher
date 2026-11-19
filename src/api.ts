import {
  appendDeliveryLog,
  BotCommandSyncMeta,
  BotHealthSnapshot,
  DEFAULT_EMBED_CONFIG,
  deleteListingOverride,
  deleteWidgetDeployment,
  deleteWidgetDeploymentById,
  EmbedConfig,
  getAllGuildIds,
  getAllWidgetDeployments,
  getAllWidgetGuildIds,
  getBotCommandSyncMeta,
  getCatalogSnapshot,
  getDeliveryLogs,
  getEmbedConfig,
  getGuildConfig,
  getGuildSentMessages,
  getListingHistory,
  getListingOverridesMap,
  getMonitorLogs,
  getMonitorStatus,
  getPresentationConfig,
  getWidgetDeployment,
  getWidgetDeploymentById,
  ListingRecord,
  MonitorStatus,
  purgeListingMediaEdgeCaches,
  purgePublicEdgeCaches,
  setBotCommandSyncMeta,
  setEmbedConfig,
  setGuildConfig,
  setListingOverride,
  setPresentationConfig,
  setWidgetDeployment,
  updateListingImages,
} from "./kv";
import {
  BOT_PERMISSIONS,
  clearBotGuildsCache,
  getBotGuilds,
  getCreatorProfile,
  getGuildControlOptions,
  getManagedGuildsForUser,
  getRequestOrigin,
  getSessionSecret,
  SessionUser,
  verifySessionCookie,
} from "./admin";
import {
  CarListing,
  deleteDiscordChannelMessage,
  deployStatusWidgetToChannel,
  dispatchListingToGuild,
  ensureHistoricalKnownListingsPreserved,
  manualScanStoreOnly,
  refreshAllWidgets,
  refreshWidgetById,
  resolvePublicOrigin,
  sendDiscordChannelMessage,
  updateSentListingEmbedForGuild,
} from "./scraper";
import { fetchDiscordWithRetry } from "./discord";
import {
  buildBotReadinessChecks,
  checkBotHealthSnapshot,
  clearAllGuildCommands,
  clearGuildCommands,
  COMMANDS,
  compareDiscordCommands,
  fetchBotApplicationInfo,
  fetchBotEmojis,
  fetchLiveDiscordCommands,
  inspectGuildCommandAvailability,
  syncDiscordCommands,
} from "./register";
import {
  normalizeWhitespace,
  resolveListingPresentation,
  VehicleFeature,
  VehicleMetadataOverride,
} from "./shared/features";
import {
  AnnouncementTemplate,
  DEFAULT_HERO_CONFIG,
  DEFAULT_IN_STOCK_TEMPLATE,
  DEFAULT_SOLD_OUT_TEMPLATE,
  DEFAULT_WIDGET_TEMPLATE,
  DiscordEmojiRef,
  HeroConfig,
  PresentationConfigBundle,
  sanitizeHexColor,
  sanitizeHttpUrl,
  validateEmojiRef,
  WidgetTemplateConfig,
} from "./shared/presentation";

const NO_STORE_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
  Vary: "Cookie",
};

const SCHEDULED_CRON_INTERVAL_MS = 15 * 60 * 1000;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: NO_STORE_HEADERS,
  });
}

function getEdgeCache(): Cache | null {
  return typeof caches !== "undefined" && (caches as any)?.default ? (caches as any).default : null;
}

function getPublicCacheRequest(env: any, url: URL): Request {
  const baseOrigin = resolvePublicOrigin(env, url.origin) || url.origin;
  return new Request(`${baseOrigin}${url.pathname}`, { method: "GET" });
}

function publicCachedJson(data: unknown, maxAgeSeconds: number): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${maxAgeSeconds}, stale-while-revalidate=${maxAgeSeconds * 2}`,
    },
  });
}

function getBotStatus(
  env: any,
  _monitorStatus?: MonitorStatus | null,
  botHealth?: BotHealthSnapshot | null
): "online" | "offline" {
  if (!env.DISCORD_BOT_TOKEN) return "offline";
  if (botHealth) return botHealth.online ? "online" : "offline";
  return "offline";
}

function computeMonitorHealth(monitorStatus: MonitorStatus | null): {
  state: "verification_successful" | "verification_blocked" | "data_stale" | "monitoring_pending";
  label: string;
} {
  if (!monitorStatus) {
    return { state: "monitoring_pending", label: "Monitoring Pending" };
  }
  const now = Date.now();
  const lastVerified = monitorStatus.lastSuccessAt || (monitorStatus.authoritative ? monitorStatus.checkedAt : 0);
  if (monitorStatus.authoritative) {
    if (lastVerified && now - lastVerified > 45 * 60 * 1000) {
      return { state: "data_stale", label: "Data Stale" };
    }
    return { state: "verification_successful", label: "Verified" };
  }
  return { state: "verification_blocked", label: "Verification Blocked" };
}

function isSameOriginMutation(request: Request, origin: string): boolean {
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite && secFetchSite !== "same-origin" && secFetchSite !== "same-site" && secFetchSite !== "none") {
    return false;
  }
  const reqOrigin = request.headers.get("origin");
  if (reqOrigin) {
    try {
      const parsedReq = new URL(reqOrigin).origin;
      const parsedHost = new URL(origin).origin;
      const urlOrigin = new URL(request.url).origin;
      return parsedReq === parsedHost || parsedReq === urlOrigin;
    } catch {
      return false;
    }
  }
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const parsedRef = new URL(referer).origin;
      const parsedHost = new URL(origin).origin;
      const urlOrigin = new URL(request.url).origin;
      return parsedRef === parsedHost || parsedRef === urlOrigin;
    } catch {
      return false;
    }
  }
  return true;
}

function getReadinessStatus(record: ListingRecord): "ready" | "incomplete" {
  const name = String(record.payload?.name || "").trim();
  const desc = String(record.payload?.description || "").trim();
  const images = Array.isArray(record.payload?.images) ? record.payload.images : [];
  if (!name || name === `Limited Vehicle #${record.id}` || (!desc && images.length === 0)) {
    return "incomplete";
  }
  return "ready";
}

function serializeListing(record: ListingRecord, override?: VehicleMetadataOverride | null) {
  const sourceName = record.payload?.name || `Limited Vehicle #${record.id}`;
  const sourceDescription =
    record.payload?.description || "Limited-edition vehicle listing on Everfall Store.";
  const sourceUrl = record.payload?.url || `https://store.everfallcommunity.com/package/${record.id}`;
  const sourceImages = Array.isArray(record.payload?.images) ? record.payload.images : [];
  const presentation = resolveListingPresentation(
    {
      id: record.id,
      name: sourceName,
      description: sourceDescription,
      url: sourceUrl,
      images: sourceImages,
    },
    override
  );

  return {
    id: record.id,
    name: sourceName,
    description: sourceDescription,
    url: sourceUrl,
    images: sourceImages,
    isAvailable: record.isAvailable,
    detectedAt: record.firstSeenAt,
    lastVerifiedAt: record.lastVerifiedAt || record.lastSeenAt || record.firstSeenAt,
    soldOutAt: record.soldOutAt ?? null,
    lastHttpStatus: record.lastHttpStatus ?? null,
    readiness: getReadinessStatus(record),
    presentation,
  };
}

async function getCurrentSessionUser(request: Request, env: any): Promise<SessionUser | null> {
  return verifySessionCookie(
    request.headers.get("Cookie"),
    getSessionSecret(env),
    env.DISCORD_PRIMARY_ADMINISTRATOR
  );
}

async function requireManagedGuild(env: any, user: SessionUser | null, guildId: string) {
  if (!user) {
    return { error: json({ error: "Authentication required." }, 401), managedGuilds: [], guild: null };
  }
  const managedGuilds = await getManagedGuildsForUser(env, user.id);
  const guild = managedGuilds.find((g) => g.id === guildId) || null;
  if (!guild) {
    return {
      error: json(
        { error: "You do not have Manage Server permission for this Discord server." },
        403
      ),
      managedGuilds,
      guild: null,
    };
  }
  return { error: null, managedGuilds, guild };
}

export async function handleApiRequest(
  request: Request,
  env: any,
  url: URL
): Promise<Response | null> {
  if (!url.pathname.startsWith("/api/")) return null;
  if (url.pathname === "/api/auth/url" || url.pathname === "/api/auth/handoff") {
    return null;
  }

  const origin = getRequestOrigin(request, env);
  const method = request.method.toUpperCase();

  if (method !== "GET" && method !== "HEAD" && !isSameOriginMutation(request, origin)) {
    return json({ error: "Cross-origin state-changing request rejected." }, 403);
  }

  // 1. Public Session & Operational Status
  if (method === "GET" && url.pathname === "/api/session") {
    const [user, storedCreatorProfile, monitorStatus, botHealth] = await Promise.all([
      getCurrentSessionUser(request, env),
      getCreatorProfile(env),
      getMonitorStatus(env),
      checkBotHealthSnapshot(env, false),
    ]);
    let creatorProfile = storedCreatorProfile;
    if (
      user &&
      user.id === String(env.DISCORD_PRIMARY_ADMINISTRATOR || "").trim() &&
      (storedCreatorProfile.avatarUrl !== user.avatarUrl || storedCreatorProfile.username !== user.username)
    ) {
      creatorProfile = {
        ...storedCreatorProfile,
        id: user.id,
        username: user.username || storedCreatorProfile.username,
        avatarUrl: user.avatarUrl || storedCreatorProfile.avatarUrl,
        profileUrl: `https://discord.com/users/${user.id}`,
      };
      const kv = env.DISCORD_BOT as KVNamespace | undefined;
      if (kv) {
        await kv.put("creator:profile", JSON.stringify(creatorProfile));
      }
    }
    const appId = botHealth.appId || env.DISCORD_APPLICATION_ID || env.DISCORD_CLIENT_ID || "1571958001928245378";
    const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(appId)}&permissions=${BOT_PERMISSIONS}&integration_type=0&scope=bot+applications.commands`;

    return json({
      authenticated: Boolean(user),
      user,
      appId,
      inviteUrl,
      creatorProfile,
      botStatus: getBotStatus(env, monitorStatus, botHealth),
      botHealth,
      monitorStatus,
      monitorHealth: computeMonitorHealth(monitorStatus),
      scheduledIntervalMs: SCHEDULED_CRON_INTERVAL_MS,
      publicOrigin: resolvePublicOrigin(env, origin),
    });
  }

  // 1b. Lightweight Public Monitor Heartbeat & Catalog Version (edge-cached & busted on change)
  if (method === "GET" && url.pathname === "/api/public/status") {
    const edgeCache = getEdgeCache();
    const cacheKey = getPublicCacheRequest(env, url);
    if (edgeCache) {
      try {
        const hit = await edgeCache.match(cacheKey);
        if (hit) return hit;
      } catch {
        // Ignore cache lookup failure
      }
    }

    const [monitorStatus, presentationBundle, botHealth] = await Promise.all([
      getMonitorStatus(env),
      getPresentationConfig(env),
      checkBotHealthSnapshot(env, false),
    ]);
    let catalogVersion = monitorStatus?.catalogVersion ?? 0;
    let listingSummary = monitorStatus?.listingSummary;

    if (!catalogVersion || !listingSummary) {
      await ensureHistoricalKnownListingsPreserved(env, origin);
      const snapshot = await getCatalogSnapshot(env);
      catalogVersion = snapshot.version;
      const available = snapshot.records.filter((r) => r.isAvailable).length;
      listingSummary = {
        total: snapshot.records.length,
        available,
        soldOut: snapshot.records.length - available,
      };
    }

    const res = publicCachedJson(
      {
        ok: true,
        botStatus: getBotStatus(env, monitorStatus, botHealth),
        botHealth,
        monitorStatus,
        monitorHealth: computeMonitorHealth(monitorStatus),
        scheduledIntervalMs: SCHEDULED_CRON_INTERVAL_MS,
        lastCheckedAt: monitorStatus?.checkedAt ?? null,
        lastSuccessAt: monitorStatus?.lastSuccessAt ?? null,
        authoritative: monitorStatus?.authoritative ?? null,
        catalogVersion,
        presentationVersion: presentationBundle.version,
        totalCount: listingSummary.total,
        availableCount: listingSummary.available,
        soldOutCount: listingSummary.soldOut,
        hero: presentationBundle.hero,
      },
      25
    );
    if (edgeCache) {
      try {
        await edgeCache.put(cacheKey, res.clone());
      } catch {
        // Non-fatal
      }
    }
    return res;
  }

  // 1c. Sanitized Public Presentation Templates (edge-cached & busted on /api/admin/presentation save)
  if (method === "GET" && url.pathname === "/api/public/presentation") {
    const edgeCache = getEdgeCache();
    const cacheKey = getPublicCacheRequest(env, url);
    if (edgeCache) {
      try {
        const hit = await edgeCache.match(cacheKey);
        if (hit) return hit;
      } catch {
        // Ignore cache lookup failure
      }
    }

    const bundle = await getPresentationConfig(env);
    const res = publicCachedJson(
      {
        ok: true,
        version: bundle.version,
        updatedAt: bundle.updatedAt,
        publicOrigin: resolvePublicOrigin(env, origin),
        announcements: {
          inStock: bundle.announcements.inStock,
          soldOut: bundle.announcements.soldOut,
        },
        widgetDefault: bundle.widgetDefault,
      },
      45
    );
    if (edgeCache) {
      try {
        await edgeCache.put(cacheKey, res.clone());
      } catch {
        // Non-fatal
      }
    }
    return res;
  }

  // 2. Public Limited Drops Showcase (strictly capped at newest 10 records, single-key snapshot + edge-cached)
  if (method === "GET" && url.pathname === "/api/public/listings") {
    const edgeCache = getEdgeCache();
    const cacheKey = getPublicCacheRequest(env, url);
    if (edgeCache) {
      try {
        const hit = await edgeCache.match(cacheKey);
        if (hit) return hit;
      } catch {
        // Ignore cache lookup failure
      }
    }

    await ensureHistoricalKnownListingsPreserved(env, origin);
    const [snapshot, monitorStatus, presentationBundle, overridesMap, botHealth] = await Promise.all([
      getCatalogSnapshot(env),
      getMonitorStatus(env),
      getPresentationConfig(env),
      getListingOverridesMap(env),
      checkBotHealthSnapshot(env, false),
    ]);

    const sorted = [...snapshot.records].sort((a, b) => b.firstSeenAt - a.firstSeenAt);
    const limited = sorted.slice(0, 10).map((r) => serializeListing(r, overridesMap[r.id] || null));
    const availableCount = sorted.filter((item) => item.isAvailable).length;
    const soldOutCount = sorted.filter((item) => !item.isAvailable).length;

    const res = publicCachedJson(
      {
        listings: limited,
        catalogVersion: snapshot.version,
        totalCount: sorted.length,
        availableCount,
        soldOutCount,
        hasMoreArchive: sorted.length > 10,
        botStatus: getBotStatus(env, monitorStatus, botHealth),
        botHealth,
        monitorStatus,
        monitorHealth: computeMonitorHealth(monitorStatus),
        scheduledIntervalMs: SCHEDULED_CRON_INTERVAL_MS,
        lastCheckedAt: monitorStatus?.checkedAt ?? null,
        lastSuccessAt: monitorStatus?.lastSuccessAt ?? null,
        hero: presentationBundle.hero,
      },
      45
    );
    if (edgeCache) {
      try {
        await edgeCache.put(cacheKey, res.clone());
      } catch {
        // Non-fatal
      }
    }
    return res;
  }

  // Authenticated routes below
  const user = await getCurrentSessionUser(request, env);

  // 3. Complete Historical Archive (all authenticated users)
  if (method === "GET" && url.pathname === "/api/history") {
    if (!user) return json({ error: "Authentication required." }, 401);

    await ensureHistoricalKnownListingsPreserved(env, origin);
    const [history, monitorStatus, overridesMap, botHealth] = await Promise.all([
      getListingHistory(env),
      getMonitorStatus(env),
      getListingOverridesMap(env),
      checkBotHealthSnapshot(env, false),
    ]);

    const query = (url.searchParams.get("q") || "").trim().toLowerCase();
    const statusFilter = url.searchParams.get("status") || "all";
    const page = Math.max(1, Number(url.searchParams.get("page") || "1") || 1);
    const pageSize = Math.min(48, Math.max(1, Number(url.searchParams.get("pageSize") || "12") || 12));

    const allSerialized = [...history]
      .sort((a, b) => b.firstSeenAt - a.firstSeenAt)
      .map((r) => serializeListing(r, overridesMap[r.id] || null));

    const counts = {
      all: allSerialized.length,
      inStock: allSerialized.filter((item) => item.isAvailable).length,
      soldOut: allSerialized.filter((item) => !item.isAvailable).length,
    };

    const filtered = allSerialized.filter((item) => {
      if (statusFilter === "in_stock" && !item.isAvailable) return false;
      if (statusFilter === "sold_out" && item.isAvailable) return false;
      if (query) {
        const effectiveName = item.presentation?.effective?.name || item.name;
        const matchesName =
          item.name.toLowerCase().includes(query) ||
          effectiveName.toLowerCase().includes(query);
        const matchesId = item.id.toLowerCase().includes(query);
        if (!matchesName && !matchesId) return false;
      }
      return true;
    });

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;

    return json({
      items: filtered.slice(start, start + pageSize),
      total,
      page: safePage,
      pageSize,
      totalPages,
      counts,
      botStatus: getBotStatus(env, monitorStatus, botHealth),
      botHealth,
      monitorStatus,
      monitorHealth: computeMonitorHealth(monitorStatus),
    });
  }

  // 4. User Managed Servers List (includes per-server widget state & safe preview context)
  if (method === "GET" && url.pathname === "/api/dashboard/servers") {
    if (!user) return json({ error: "Authentication required." }, 401);

    const forceRefresh = url.searchParams.get("refresh") === "1";
    const appId = env.DISCORD_APPLICATION_ID || env.DISCORD_CLIENT_ID || "1571958001928245378";
    const [managedGuilds, botGuilds, allWidgets, bundle, snapshot, overridesMap, monitorStatus] =
      await Promise.all([
        getManagedGuildsForUser(env, user.id),
        getBotGuilds(env, forceRefresh),
        getAllWidgetDeployments(env),
        getPresentationConfig(env),
        getCatalogSnapshot(env),
        getListingOverridesMap(env),
        getMonitorStatus(env),
      ]);
    const botGuildIds = new Set(botGuilds.map((g) => g.id));
    const botOnline = Boolean(env.DISCORD_BOT_TOKEN);
    const widgetsByGuild = new Map<string, typeof allWidgets>();
    for (const w of allWidgets) {
      const list = widgetsByGuild.get(w.guildId) || [];
      list.push(w);
      widgetsByGuild.set(w.guildId, list);
    }

    const previewListings = [...snapshot.records]
      .sort((a, b) => b.firstSeenAt - a.firstSeenAt)
      .slice(0, 8)
      .map((rec) => serializeListing(rec, overridesMap[rec.id] || null));

    const servers = await Promise.all(
      managedGuilds.map(async (g) => {
        const isInstalled = botGuildIds.has(g.id);
        const config = await getGuildConfig(env, g.id);
        const controls = isInstalled
          ? await getGuildControlOptions(env, g.id, forceRefresh)
          : { channels: [], roles: [] };

        const configuredChannel = config?.channelId
          ? controls.channels.find((c) => c.id === config.channelId) || null
          : null;
        const channelMissing =
          Boolean(config?.channelId) && isInstalled && !controls.error && !configuredChannel;

        let status: "active" | "setup_required" | "not_installed" | "offline" = "not_installed";
        let statusReason = "Bot has not joined this server yet.";
        if (isInstalled) {
          if (!botOnline) {
            status = "offline";
            statusReason = "Bot token is not active.";
          } else if (controls.error) {
            status = "setup_required";
            statusReason = controls.error;
          } else if (!config?.channelId) {
            status = "setup_required";
            statusReason = "Select a notification channel to enable limited drop alerts.";
          } else if (channelMissing) {
            status = "setup_required";
            statusReason =
              "The previously selected notification channel is missing or the bot lacks permission to post there.";
          } else {
            status = "active";
            statusReason = `Delivering alerts to #${configuredChannel?.name || "channel"}.`;
          }
        }

        const iconUrl = g.icon
          ? `https://cdn.discordapp.com/icons/${encodeURIComponent(g.id)}/${encodeURIComponent(g.icon)}.png?size=64`
          : null;

        return {
          id: g.id,
          name: g.name || `Server ${g.id}`,
          iconUrl,
          isOwner: Boolean(g.owner),
          isInstalled,
          status,
          statusReason,
          config: {
            channelId: config?.channelId || "",
            channelName: configuredChannel?.name || null,
            channelMissing,
            roleIds: Array.isArray(config?.roleIds) ? config.roleIds : [],
            environment: config?.environment === "test" ? "test" : "production",
            widgetTemplateId: config?.widgetTemplateId || "default",
          },
          widgets: widgetsByGuild.get(g.id) || [],
          channels: controls.channels,
          roles: controls.roles,
          controlsError: controls.error || null,
          inviteUrl: `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(appId)}&guild_id=${encodeURIComponent(g.id)}&permissions=${BOT_PERMISSIONS}&integration_type=0&scope=bot+applications.commands`,
        };
      })
    );

    const priority: Record<string, number> = {
      setup_required: 0,
      active: 1,
      offline: 2,
      not_installed: 3,
    };
    servers.sort((a, b) => {
      const diff = (priority[a.status] ?? 9) - (priority[b.status] ?? 9);
      return diff !== 0 ? diff : a.name.localeCompare(b.name);
    });

    return json({
      servers,
      appId,
      publicOrigin: resolvePublicOrigin(env, origin),
      widgetDefault: bundle.widgetDefault,
      widgetTemplates: bundle.widgetTemplates,
      previewListings,
      monitorStatus,
      refreshedAt: Date.now(),
    });
  }

  // 5. Save Server Configuration (never triggers auto-publish)
  const saveServerMatch = url.pathname.match(/^\/api\/dashboard\/servers\/(\d{17,20})$/);
  if (saveServerMatch && (method === "PUT" || method === "POST")) {
    if (!user) return json({ error: "Authentication required." }, 401);

    const guildId = saveServerMatch[1];
    const managedGuilds = await getManagedGuildsForUser(env, user.id);
    if (!managedGuilds.some((g) => g.id === guildId)) {
      return json({ error: "You do not have Manage Server permission for this Discord server." }, 403);
    }

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON payload." }, 400);
    }

    const channelId = String(body?.channelId || "").trim();
    if (!/^\d{17,20}$/.test(channelId)) {
      return json({ error: "Select a valid notification channel before saving." }, 400);
    }

    let controls = await getGuildControlOptions(env, guildId);
    if (!controls.channels.some((c) => c.id === channelId)) {
      controls = await getGuildControlOptions(env, guildId, true);
    }
    const targetChannel = controls.channels.find((c) => c.id === channelId);
    if (!targetChannel) {
      return json(
        {
          error:
            "The bot cannot send messages in this channel or cannot view it. Please update channel permissions or select another channel.",
        },
        400
      );
    }

    const requestedRoles: string[] = Array.isArray(body?.roleIds)
      ? body.roleIds.map(String)
      : [];
    const allowedRoleIds = new Set(controls.roles.map((r) => r.id));
    const roleIds = [...new Set(requestedRoles.filter((id) => allowedRoleIds.has(id)))];

    const existing = (await getGuildConfig(env, guildId)) || { channelId: "", roleIds: [] };
    await setGuildConfig(env, guildId, {
      ...existing,
      channelId,
      roleIds,
      embedConfig: undefined,
    });

    return json({
      ok: true,
      guildId,
      channelId,
      channelName: targetChannel.name,
      roleIds,
      savedAt: Date.now(),
    });
  }

  // 6. Send Per-Server Test Notification (Zero role mentions + cooldown)
  const testServerMatch = url.pathname.match(/^\/api\/dashboard\/servers\/(\d{17,20})\/test$/);
  if (testServerMatch && method === "POST") {
    if (!user) return json({ error: "Authentication required." }, 401);

    const guildId = testServerMatch[1];
    const managedGuilds = await getManagedGuildsForUser(env, user.id);
    if (!managedGuilds.some((g) => g.id === guildId)) {
      return json({ error: "Forbidden for this server." }, 403);
    }

    const token = env.DISCORD_BOT_TOKEN;
    if (!token) {
      return json({ error: "DISCORD_BOT_TOKEN is not configured." }, 503);
    }

    const cfg = await getGuildConfig(env, guildId);
    if (!cfg?.channelId) {
      return json({ error: "Save a valid notification channel before sending a test notification." }, 400);
    }

    const kv = env.DISCORD_BOT as KVNamespace | undefined;
    const cooldownKey = `guild_test_cooldown:${guildId}`;
    if (kv) {
      const lastTest = await kv.get(cooldownKey);
      if (lastTest) {
        return json(
          { error: "Please wait a few seconds before sending another test notification to this server." },
          429
        );
      }
      await kv.put(cooldownKey, String(Date.now()), { expirationTtl: 15 });
    }

    const testPayload = {
      embeds: [
        {
          title: "Everfall Limited Watcher — Test Notification",
          description:
            "This test confirms Everfall Limited Watcher can deliver limited vehicle drop notifications to this channel. No roles were mentioned.",
          color: 0x5865f2,
          fields: [
            { name: "Channel", value: `<#${cfg.channelId}>`, inline: true },
            {
              name: "Configured Roles",
              value: cfg.roleIds.length > 0 ? `${cfg.roleIds.length} role(s) selected` : "None",
              inline: true,
            },
          ],
          footer: { text: `Triggered by ${user.username} • Verification Test` },
          timestamp: new Date().toISOString(),
        },
      ],
      allowed_mentions: { parse: [], roles: [], users: [] },
    };

    const result = await sendDiscordChannelMessage(token, cfg.channelId, testPayload);
    await appendDeliveryLog(env, {
      id: crypto.randomUUID(),
      listingId: "test-notification",
      listingName: "Server Verification Test",
      guildId,
      channelId: cfg.channelId,
      messageId: result.messageId,
      method: "test",
      environment: cfg.environment === "test" ? "test" : "production",
      status: result.ok ? "delivered" : "failed",
      httpStatus: result.httpStatus,
      error: result.error,
      timestamp: Date.now(),
    });

    if (!result.ok) {
      return json({ error: result.error || "Discord rejected the test message." }, 502);
    }

    return json({
      ok: true,
      messageId: result.messageId,
      channelId: cfg.channelId,
      sentAt: Date.now(),
    });
  }

  // 6b. Server Admin Live Status Widget Controls (/api/dashboard/servers/:guildId/widgets*)
  const serverWidgetDeployMatch = url.pathname.match(
    /^\/api\/dashboard\/servers\/(\d{17,20})\/widgets\/deploy$/
  );
  if (serverWidgetDeployMatch && method === "POST") {
    const guildId = serverWidgetDeployMatch[1];
    const authCheck = await requireManagedGuild(env, user, guildId);
    if (authCheck.error) return authCheck.error;

    if (!env.DISCORD_BOT_TOKEN) {
      return json({ error: "DISCORD_BOT_TOKEN is not configured." }, 503);
    }

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON payload." }, 400);
    }

    const channelId = String(body?.channelId || "").trim();
    if (!/^\d{17,20}$/.test(channelId)) {
      return json({ error: "Select a valid Discord channel before deploying a widget." }, 400);
    }

    let controls = await getGuildControlOptions(env, guildId);
    if (!controls.channels.some((c) => c.id === channelId)) {
      controls = await getGuildControlOptions(env, guildId, true);
    }
    if (!controls.channels.some((c) => c.id === channelId)) {
      return json(
        {
          error:
            "The bot cannot send embeds in this channel or cannot view it. Verify View Channel, Send Messages, and Embed Links permissions.",
        },
        400
      );
    }

    const bundle = await getPresentationConfig(env);
    const requestedTpl = typeof body?.templateId === "string" ? body.templateId.trim() : "default";
    const validTemplateIds = new Set(["default", ...bundle.widgetTemplates.map((t) => t.id)]);
    const templateId = validTemplateIds.has(requestedTpl) ? requestedTpl : "default";

    const res = await deployStatusWidgetToChannel(
      env,
      guildId,
      channelId,
      resolvePublicOrigin(env, origin),
      {
        deployedBy: user!.id,
        deployedByUsername: user!.username,
        templateId,
      }
    );
    if (!res.ok) {
      return json({ ok: false, error: res.error || "Failed to deploy widget." }, 502);
    }

    return json({
      ok: true,
      widget: res.widget,
      messageId: res.messageId,
      jumpUrl: `https://discord.com/channels/${guildId}/${channelId}/${res.messageId}`,
    });
  }

  const serverWidgetRefreshMatch = url.pathname.match(
    /^\/api\/dashboard\/servers\/(\d{17,20})\/widgets\/([^/]+)\/refresh$/
  );
  if (serverWidgetRefreshMatch && method === "POST") {
    const guildId = serverWidgetRefreshMatch[1];
    const widgetId = decodeURIComponent(serverWidgetRefreshMatch[2]);
    const authCheck = await requireManagedGuild(env, user, guildId);
    if (authCheck.error) return authCheck.error;

    const existing = await getWidgetDeploymentById(env, widgetId);
    if (!existing || existing.guildId !== guildId) {
      return json({ error: "Widget deployment not found for this server." }, 404);
    }

    const res = await refreshWidgetById(env, widgetId, resolvePublicOrigin(env, origin), {
      force: true,
      trigger: "server-dashboard",
    });
    if (!res.ok) {
      return json(
        { ok: false, error: res.error || "Failed to refresh widget.", widget: res.widget },
        502
      );
    }
    return json({ ...res, ok: true, refreshedAt: Date.now() });
  }

  const serverWidgetTemplateMatch = url.pathname.match(
    /^\/api\/dashboard\/servers\/(\d{17,20})\/widgets\/([^/]+)\/template$/
  );
  if (serverWidgetTemplateMatch && method === "PUT") {
    const guildId = serverWidgetTemplateMatch[1];
    const widgetId = decodeURIComponent(serverWidgetTemplateMatch[2]);
    const authCheck = await requireManagedGuild(env, user, guildId);
    if (authCheck.error) return authCheck.error;

    const existing = await getWidgetDeploymentById(env, widgetId);
    if (!existing || existing.guildId !== guildId) {
      return json({ error: "Widget deployment not found for this server." }, 404);
    }

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON payload." }, 400);
    }

    const bundle = await getPresentationConfig(env);
    const requestedTpl = typeof body?.templateId === "string" ? body.templateId.trim() : "default";
    const validTemplateIds = new Set(["default", ...bundle.widgetTemplates.map((t) => t.id)]);
    if (!validTemplateIds.has(requestedTpl)) {
      return json({ error: "Unknown widget template preset." }, 400);
    }

    const updated = await setWidgetDeployment(env, {
      ...existing,
      templateId: requestedTpl,
      customTemplate: null,
    });
    const refreshRes = await refreshWidgetById(env, updated.id, resolvePublicOrigin(env, origin), {
      force: true,
      trigger: "server-template",
    });
    return json({
      ok: refreshRes.ok,
      widget: refreshRes.widget || updated,
      error: refreshRes.error || null,
    });
  }

  const serverWidgetMoveMatch = url.pathname.match(
    /^\/api\/dashboard\/servers\/(\d{17,20})\/widgets\/([^/]+)\/move$/
  );
  if (serverWidgetMoveMatch && method === "POST") {
    const guildId = serverWidgetMoveMatch[1];
    const widgetId = decodeURIComponent(serverWidgetMoveMatch[2]);
    const authCheck = await requireManagedGuild(env, user, guildId);
    if (authCheck.error) return authCheck.error;

    const existing = await getWidgetDeploymentById(env, widgetId);
    if (!existing || existing.guildId !== guildId) {
      return json({ error: "Widget deployment not found for this server." }, 404);
    }

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON payload." }, 400);
    }
    const targetChannelId = String(body?.channelId || "").trim();
    if (!/^\d{17,20}$/.test(targetChannelId)) {
      return json({ error: "Valid target channel ID is required." }, 400);
    }

    let controls = await getGuildControlOptions(env, guildId);
    if (!controls.channels.some((c) => c.id === targetChannelId)) {
      controls = await getGuildControlOptions(env, guildId, true);
    }
    if (!controls.channels.some((c) => c.id === targetChannelId)) {
      return json(
        {
          error:
            "Bot lacks View Channel / Send Messages / Embed Links permission in the destination channel.",
        },
        400
      );
    }

    const deployRes = await deployStatusWidgetToChannel(
      env,
      guildId,
      targetChannelId,
      resolvePublicOrigin(env, origin),
      {
        deployedBy: user!.id,
        deployedByUsername: user!.username,
        templateId: existing.templateId,
        customTemplate: existing.customTemplate ?? null,
      }
    );
    if (!deployRes.ok) {
      return json(
        { ok: false, error: deployRes.error || "Failed to post widget in destination channel." },
        502
      );
    }

    if (existing.channelId !== targetChannelId) {
      if (existing.messageId && env.DISCORD_BOT_TOKEN) {
        await deleteDiscordChannelMessage(
          env.DISCORD_BOT_TOKEN,
          existing.channelId,
          existing.messageId
        ).catch(() => null);
      }
      await deleteWidgetDeploymentById(env, existing.id);
    }

    return json({
      ok: true,
      widget: deployRes.widget,
      jumpUrl: `https://discord.com/channels/${guildId}/${targetChannelId}/${deployRes.messageId}`,
    });
  }

  const serverWidgetDeleteMatch = url.pathname.match(
    /^\/api\/dashboard\/servers\/(\d{17,20})\/widgets\/([^/]+)$/
  );
  if (serverWidgetDeleteMatch && method === "DELETE") {
    const guildId = serverWidgetDeleteMatch[1];
    const widgetId = decodeURIComponent(serverWidgetDeleteMatch[2]);
    const authCheck = await requireManagedGuild(env, user, guildId);
    if (authCheck.error) return authCheck.error;

    const existing = await getWidgetDeploymentById(env, widgetId);
    if (!existing || existing.guildId !== guildId) {
      return json({ error: "Widget deployment not found for this server." }, 404);
    }

    if (existing.channelId && existing.messageId && env.DISCORD_BOT_TOKEN) {
      await deleteDiscordChannelMessage(
        env.DISCORD_BOT_TOKEN,
        existing.channelId,
        existing.messageId
      ).catch(() => null);
    }
    await deleteWidgetDeploymentById(env, existing.id);
    return json({ ok: true, id: existing.id, guildId });
  }

  // Administrator-only endpoints below
  if (url.pathname.startsWith("/api/admin/")) {
    if (!user) return json({ error: "Authentication required." }, 401);
    if (!user.isAdmin) return json({ error: "Master administrator access required." }, 403);

    // 7. Admin Overview & Shared Data
    if (method === "GET" && url.pathname === "/api/admin/overview") {
      await ensureHistoricalKnownListingsPreserved(env, origin);
      const forceRefresh = url.searchParams.get("refresh") === "1";

      const [
        snapshot,
        monitorStatus,
        monitorLogs,
        embedConfig,
        presentationConfig,
        overridesMap,
        deliveryLogs,
        botGuilds,
        allGuildIds,
        allWidgets,
        botHealth,
      ] = await Promise.all([
        getCatalogSnapshot(env),
        getMonitorStatus(env),
        getMonitorLogs(env),
        getEmbedConfig(env),
        getPresentationConfig(env),
        getListingOverridesMap(env),
        getDeliveryLogs(env),
        getBotGuilds(env, forceRefresh),
        getAllGuildIds(env),
        getAllWidgetDeployments(env),
        checkBotHealthSnapshot(env, forceRefresh),
      ]);
      const history = snapshot.records;

      const botGuildMap = new Map(botGuilds.map((g) => [g.id, g]));
      const guildIdSet = new Set([...botGuilds.map((g) => g.id), ...allGuildIds]);
      const widgetsByGuild = new Map<string, typeof allWidgets>();
      for (const w of allWidgets) {
        const arr = widgetsByGuild.get(w.guildId) || [];
        arr.push(w);
        widgetsByGuild.set(w.guildId, arr);
      }

      const connectedGuilds = await Promise.all(
        [...guildIdSet].map(async (guildId) => {
          const [cfg, sentMessages] = await Promise.all([
            getGuildConfig(env, guildId),
            getGuildSentMessages(env, guildId),
          ]);
          const botGuild = botGuildMap.get(guildId);
          const sentListingIds: Record<string, boolean> = {};
          for (const listingId of Object.keys(sentMessages)) {
            sentListingIds[listingId] = true;
          }
          const iconUrl = botGuild?.icon
            ? `https://cdn.discordapp.com/icons/${encodeURIComponent(guildId)}/${encodeURIComponent(botGuild.icon)}.png?size=64`
            : null;
          const guildWidgets = widgetsByGuild.get(guildId) || [];
          return {
            id: guildId,
            name: botGuild?.name || `Server ${guildId}`,
            iconUrl,
            memberCount: botGuild?.approximate_member_count ?? null,
            inBotGuilds: Boolean(botGuild),
            channelId: cfg?.channelId || "",
            roleIds: cfg?.roleIds || [],
            environment: cfg?.environment === "test" ? "test" : "production",
            configured: Boolean(cfg?.channelId),
            widgetTemplateId: cfg?.widgetTemplateId || "default",
            sentListingIds,
            sentMessages,
            widget: guildWidgets[0] || null,
            widgets: guildWidgets,
          };
        })
      );

      connectedGuilds.sort((a, b) => a.name.localeCompare(b.name));
      const serializedListings = [...history]
        .sort((a, b) => b.firstSeenAt - a.firstSeenAt)
        .map((r) => serializeListing(r, overridesMap[r.id] || null));

      return json({
        botStatus: getBotStatus(env, monitorStatus, botHealth),
        botHealth,
        catalogVersion: snapshot.version,
        monitorStatus,
        monitorHealth: computeMonitorHealth(monitorStatus),
        scheduledIntervalMs: SCHEDULED_CRON_INTERVAL_MS,
        monitorLogs,
        embedConfig,
        presentationConfig,
        deliveryLogs,
        connectedGuilds,
        widgets: allWidgets,
        listings: serializedListings,
        stats: {
          totalListings: serializedListings.length,
          availableListings: serializedListings.filter((l) => l.isAvailable).length,
          soldOutListings: serializedListings.filter((l) => !l.isAvailable).length,
          connectedServers: connectedGuilds.length,
          configuredServers: connectedGuilds.filter((g) => g.configured).length,
          testServers: connectedGuilds.filter((g) => g.environment === "test").length,
          deployedWidgets: allWidgets.length,
          recentFailures: deliveryLogs.filter((d) => d.status === "failed").length,
        },
      });
    }

    // 7b. Ultra-light Admin Monitor Delta Endpoint (1 KV read when idle)
    if (method === "GET" && url.pathname === "/api/admin/monitor/updates") {
      const sinceCheckedAt = Number(url.searchParams.get("checkedAt") || "0") || 0;
      const sinceCatalogVersion = Number(url.searchParams.get("catalogVersion") || "0") || 0;

      const [monitorStatus, botHealth] = await Promise.all([
        getMonitorStatus(env),
        checkBotHealthSnapshot(env, false),
      ]);
      const currentCheckedAt = monitorStatus?.checkedAt ?? 0;
      const currentCatalogVersion = monitorStatus?.catalogVersion ?? 0;
      const botStatus = getBotStatus(env, monitorStatus, botHealth);

      if (
        sinceCheckedAt > 0 &&
        currentCheckedAt === sinceCheckedAt &&
        currentCatalogVersion === sinceCatalogVersion
      ) {
        return json({
          changed: false,
          botStatus,
          botHealth,
          checkedAt: monitorStatus?.checkedAt ?? null,
          catalogVersion: currentCatalogVersion,
        });
      }

      const needListings = sinceCatalogVersion === 0 || currentCatalogVersion !== sinceCatalogVersion;
      const [monitorLogs, snapshot, overridesMap] = await Promise.all([
        getMonitorLogs(env),
        needListings ? getCatalogSnapshot(env) : Promise.resolve(null),
        needListings ? getListingOverridesMap(env) : Promise.resolve(null),
      ]);

      return json({
        changed: true,
        botStatus,
        botHealth,
        monitorStatus,
        monitorHealth: computeMonitorHealth(monitorStatus),
        monitorLogs,
        catalogVersion: snapshot?.version ?? currentCatalogVersion,
        ...(snapshot
          ? {
              listings: [...snapshot.records]
                .sort((a, b) => b.firstSeenAt - a.firstSeenAt)
                .map((r) => serializeListing(r, overridesMap?.[r.id] || null)),
            }
          : {}),
      });
    }

    // 8. Save Global Embed Config (Legacy compatibility -> syncs into presentationConfig.announcements.inStock)
    if ((method === "PUT" || method === "POST") && url.pathname === "/api/admin/embed-config") {
      let body: any = {};
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON payload." }, 400);
      }

      const rawColor = String(body?.color || "").trim().toUpperCase();
      if (!/^#[0-9A-F]{6}$/.test(rawColor)) {
        return json({ error: "Accent color must be a valid 6-digit hex color (e.g. #F59E0B)." }, 400);
      }

      const nextConfig: EmbedConfig = {
        color: rawColor,
        titlePrefix:
          typeof body?.titlePrefix === "string"
            ? body.titlePrefix.trim().slice(0, 120)
            : DEFAULT_EMBED_CONFIG.titlePrefix,
        footerText:
          typeof body?.footerText === "string"
            ? body.footerText.trim().slice(0, 180)
            : DEFAULT_EMBED_CONFIG.footerText,
        galleryHeading: "",
        storeButtonLabel:
          String(body?.storeButtonLabel || "").trim().slice(0, 80) ||
          DEFAULT_EMBED_CONFIG.storeButtonLabel,
        soldOutButtonLabel:
          String(body?.soldOutButtonLabel || "").trim().slice(0, 80) ||
          DEFAULT_EMBED_CONFIG.soldOutButtonLabel,
        showDetectionTime: body?.showDetectionTime !== false,
        showLastVerified: body?.showLastVerified !== false,
      };

      const existingBundle = await getPresentationConfig(env);
      const updatedBundle: PresentationConfigBundle = {
        ...existingBundle,
        updatedBy: user.username || user.id,
        announcements: {
          inStock: {
            ...existingBundle.announcements.inStock,
            accentColor: rawColor,
            titlePrefix: nextConfig.titlePrefix || DEFAULT_IN_STOCK_TEMPLATE.titlePrefix,
            footerText: nextConfig.footerText || DEFAULT_IN_STOCK_TEMPLATE.footerText,
            storeButtonLabel:
              nextConfig.storeButtonLabel || DEFAULT_IN_STOCK_TEMPLATE.storeButtonLabel,
            showDetectionTime: nextConfig.showDetectionTime !== false,
            showLastVerified: nextConfig.showLastVerified !== false,
          },
          soldOut: {
            ...existingBundle.announcements.soldOut,
            storeButtonLabel:
              nextConfig.soldOutButtonLabel || DEFAULT_SOLD_OUT_TEMPLATE.storeButtonLabel,
          },
        },
      };
      await setPresentationConfig(env, updatedBundle);
      await purgePublicEdgeCaches(resolvePublicOrigin(env, origin));
      return json({ ok: true, embedConfig: nextConfig, savedAt: Date.now() });
    }

    // 8b. Unified Presentation & Hero Configuration API
    if (method === "GET" && url.pathname === "/api/admin/presentation") {
      const bundle = await getPresentationConfig(env);
      return json({ ok: true, bundle });
    }

    if (method === "PUT" && url.pathname === "/api/admin/presentation") {
      let body: any = {};
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON payload." }, 400);
      }

      const current = await getPresentationConfig(env);

      const sanitizeAnnouncementTemplate = (
        incoming: any,
        fallback: AnnouncementTemplate
      ): AnnouncementTemplate => {
        if (!incoming || typeof incoming !== "object") return fallback;
        const descMode =
          incoming.descriptionMode === "short_summary" ||
          incoming.descriptionMode === "full_description" ||
          incoming.descriptionMode === "custom"
            ? incoming.descriptionMode
            : fallback.descriptionMode;
        const galleryMode =
          incoming.galleryMode === "all_gallery" ||
          incoming.galleryMode === "primary_only" ||
          incoming.galleryMode === "custom_slot" ||
          incoming.galleryMode === "none"
            ? incoming.galleryMode
            : fallback.galleryMode;
        const urlMode =
          incoming.storeButtonUrlMode === "listing" ||
          incoming.storeButtonUrlMode === "category" ||
          incoming.storeButtonUrlMode === "store_home" ||
          incoming.storeButtonUrlMode === "website"
            ? incoming.storeButtonUrlMode
            : fallback.storeButtonUrlMode;
        return {
          accentColor: sanitizeHexColor(incoming.accentColor, fallback.accentColor),
          titlePrefix: String(incoming.titlePrefix ?? fallback.titlePrefix).trim().slice(0, 120),
          titleEmoji:
            incoming.titleEmoji === null
              ? null
              : validateEmojiRef(incoming.titleEmoji) ?? fallback.titleEmoji ?? null,
          availabilityHeading:
            String(incoming.availabilityHeading ?? fallback.availabilityHeading).trim().slice(0, 60) ||
            "Availability",
          statusLabel:
            String(incoming.statusLabel ?? fallback.statusLabel).trim().slice(0, 60) ||
            fallback.statusLabel,
          statusEmoji:
            incoming.statusEmoji === null
              ? null
              : validateEmojiRef(incoming.statusEmoji) ?? fallback.statusEmoji ?? null,
          descriptionMode: descMode,
          customDescription: String(incoming.customDescription ?? fallback.customDescription).slice(0, 2000),
          showFeatures: incoming.showFeatures !== false,
          featureOrder: Array.isArray(incoming.featureOrder)
            ? incoming.featureOrder.map(String).slice(0, 15)
            : fallback.featureOrder,
          featureStyle: incoming.featureStyle === "bullet_list" ? "bullet_list" : "inline_badges",
          showTradingInfo: incoming.showTradingInfo !== false,
          showDeliveryInfo: incoming.showDeliveryInfo !== false,
          showDetectionTime: incoming.showDetectionTime !== false,
          showLastVerified: incoming.showLastVerified !== false,
          showSoldOutTime: Boolean(incoming.showSoldOutTime),
          galleryMode,
          primaryImageSlot: Math.max(0, Math.min(9, Math.round(Number(incoming.primaryImageSlot ?? 0) || 0))),
          footerText: String(incoming.footerText ?? fallback.footerText).trim().slice(0, 200),
          footerEmoji:
            incoming.footerEmoji === null
              ? null
              : validateEmojiRef(incoming.footerEmoji) ?? fallback.footerEmoji ?? null,
          showStoreButton: incoming.showStoreButton !== false,
          storeButtonLabel:
            String(incoming.storeButtonLabel ?? fallback.storeButtonLabel).trim().slice(0, 80) ||
            fallback.storeButtonLabel,
          storeButtonEmoji:
            incoming.storeButtonEmoji === null
              ? null
              : validateEmojiRef(incoming.storeButtonEmoji) ?? fallback.storeButtonEmoji ?? null,
          storeButtonUrlMode: urlMode,
        };
      };

      const sanitizeWidgetTemplate = (
        incoming: any,
        fallback: WidgetTemplateConfig
      ): WidgetTemplateConfig => {
        if (!incoming || typeof incoming !== "object") return fallback;
        const labelOverrides: Record<string, string> = {};
        if (incoming.featureLabelOverrides && typeof incoming.featureLabelOverrides === "object") {
          for (const [k, v] of Object.entries(incoming.featureLabelOverrides)) {
            const clean = String(v || "").trim().slice(0, 60);
            if (k && clean) labelOverrides[k] = clean;
          }
        }
        return {
          id: String(incoming.id || fallback.id || "default").trim().slice(0, 64),
          name: String(incoming.name || fallback.name).trim().slice(0, 80),
          title: String(incoming.title ?? fallback.title).trim().slice(0, 200) || DEFAULT_WIDGET_TEMPLATE.title,
          titleEmoji:
            incoming.titleEmoji === null
              ? null
              : validateEmojiRef(incoming.titleEmoji) ?? fallback.titleEmoji ?? null,
          subtitle: String(incoming.subtitle ?? fallback.subtitle).trim().slice(0, 300),
          introMessage: String(incoming.introMessage ?? fallback.introMessage).trim().slice(0, 600),
          accentColor: sanitizeHexColor(incoming.accentColor, fallback.accentColor),
          inStockColor: sanitizeHexColor(incoming.inStockColor, fallback.inStockColor),
          soldOutColor: sanitizeHexColor(incoming.soldOutColor, fallback.soldOutColor),
          useDynamicStockColor: incoming.useDynamicStockColor !== false,
          inStockLabel: String(incoming.inStockLabel ?? fallback.inStockLabel).trim().slice(0, 50) || "In Stock",
          soldOutLabel: String(incoming.soldOutLabel ?? fallback.soldOutLabel).trim().slice(0, 50) || "Sold Out",
          inStockEmoji:
            incoming.inStockEmoji === null
              ? null
              : validateEmojiRef(incoming.inStockEmoji) ?? fallback.inStockEmoji ?? null,
          soldOutEmoji:
            incoming.soldOutEmoji === null
              ? null
              : validateEmojiRef(incoming.soldOutEmoji) ?? fallback.soldOutEmoji ?? null,
          featuredImageSlot: Math.max(0, Math.min(9, Math.round(Number(incoming.featuredImageSlot ?? 3) || 0))),
          showFeaturedImage: incoming.showFeaturedImage !== false,
          vehicleCount: Math.max(1, Math.min(6, Math.round(Number(incoming.vehicleCount ?? 3) || 3))),
          vehicleOrdering: incoming.vehicleOrdering === "in_stock_first" ? "in_stock_first" : "newest_first",
          showActiveSummary: incoming.showActiveSummary !== false,
          activeSummaryHeading:
            String(incoming.activeSummaryHeading ?? fallback.activeSummaryHeading).trim().slice(0, 80) ||
            "Active Listings",
          showFeatures: incoming.showFeatures !== false,
          featureOrder: Array.isArray(incoming.featureOrder)
            ? incoming.featureOrder.map(String).slice(0, 15)
            : fallback.featureOrder,
          featureLabelOverrides: labelOverrides,
          hiddenFeatureKeys: Array.isArray(incoming.hiddenFeatureKeys)
            ? incoming.hiddenFeatureKeys.map(String).slice(0, 15)
            : fallback.hiddenFeatureKeys,
          showTimestamps: incoming.showTimestamps !== false,
          showStaleWarning: incoming.showStaleWarning !== false,
          staleWarningText:
            String(incoming.staleWarningText ?? fallback.staleWarningText).trim().slice(0, 300) ||
            DEFAULT_WIDGET_TEMPLATE.staleWarningText,
          emptyStateMessage:
            String(incoming.emptyStateMessage ?? fallback.emptyStateMessage).trim().slice(0, 300) ||
            DEFAULT_WIDGET_TEMPLATE.emptyStateMessage,
          footerText:
            String(incoming.footerText ?? fallback.footerText).trim().slice(0, 200) ||
            DEFAULT_WIDGET_TEMPLATE.footerText,
          footerEmoji:
            incoming.footerEmoji === null
              ? null
              : validateEmojiRef(incoming.footerEmoji) ?? fallback.footerEmoji ?? null,
          viewButtonLabel:
            String(incoming.viewButtonLabel ?? fallback.viewButtonLabel).trim().slice(0, 40) || "View",
          showButtonsRow: incoming.showButtonsRow !== false,
          websiteButtonLabel: String(incoming.websiteButtonLabel ?? fallback.websiteButtonLabel)
            .trim()
            .slice(0, 60),
          websiteButtonEmoji:
            incoming.websiteButtonEmoji === null
              ? null
              : validateEmojiRef(incoming.websiteButtonEmoji) ?? fallback.websiteButtonEmoji ?? null,
          storeButtonLabel: String(incoming.storeButtonLabel ?? fallback.storeButtonLabel)
            .trim()
            .slice(0, 60),
          storeButtonEmoji:
            incoming.storeButtonEmoji === null
              ? null
              : validateEmojiRef(incoming.storeButtonEmoji) ?? fallback.storeButtonEmoji ?? null,
        };
      };

      const sanitizeHeroConfig = (incoming: any, fallback: HeroConfig): HeroConfig => {
        if (!incoming || typeof incoming !== "object") return fallback;
        const validStyles = new Set([
          "soft_reveal",
          "float_down",
          "fade_slide",
          "character_reveal",
          "word_stagger",
          "decrypting_text",
        ]);
        const messages = Array.isArray(incoming.messages)
          ? incoming.messages
              .filter((m: any) => m && typeof m.text === "string" && m.text.trim())
              .slice(0, 12)
              .map((m: any, idx: number) => ({
                id: String(m.id || `hero-${idx + 1}`).slice(0, 64),
                text: String(m.text).trim().slice(0, 140),
                highlightText: typeof m.highlightText === "string" ? m.highlightText.trim().slice(0, 80) : "",
                subtext: typeof m.subtext === "string" ? m.subtext.trim().slice(0, 320) : "",
                enabled: m.enabled !== false,
                isDefault: Boolean(m.isDefault),
              }))
          : fallback.messages;
        if (messages.length > 0 && !messages.some((m: any) => m.isDefault)) {
          messages[0].isDefault = true;
        }
        return {
          version: (fallback.version || 1) + 1,
          autoRotate: incoming.autoRotate !== false,
          intervalMs: Math.max(2500, Math.min(20000, Math.round(Number(incoming.intervalMs ?? fallback.intervalMs) || 5500))),
          animationStyle: validStyles.has(incoming.animationStyle)
            ? incoming.animationStyle
            : fallback.animationStyle,
          durationMs: Math.max(200, Math.min(2500, Math.round(Number(incoming.durationMs ?? fallback.durationMs) || 650))),
          delayMs: Math.max(0, Math.min(600, Math.round(Number(incoming.delayMs ?? fallback.delayMs) || 60))),
          fontSizePreset:
            incoming.fontSizePreset === "compact" ||
            incoming.fontSizePreset === "display" ||
            incoming.fontSizePreset === "standard"
              ? incoming.fontSizePreset
              : fallback.fontSizePreset,
          secondaryDescription:
            String(incoming.secondaryDescription ?? fallback.secondaryDescription).trim().slice(0, 340) ||
            DEFAULT_HERO_CONFIG.secondaryDescription,
          messages: messages.length > 0 ? messages : DEFAULT_HERO_CONFIG.messages,
        };
      };

      const nextBundle: PresentationConfigBundle = {
        ...current,
        updatedBy: user.username || user.id,
        announcements: {
          inStock: sanitizeAnnouncementTemplate(
            body?.announcements?.inStock,
            current.announcements.inStock
          ),
          soldOut: sanitizeAnnouncementTemplate(
            body?.announcements?.soldOut,
            current.announcements.soldOut
          ),
        },
        widgetDefault: sanitizeWidgetTemplate(body?.widgetDefault, current.widgetDefault),
        widgetTemplates: Array.isArray(body?.widgetTemplates)
          ? body.widgetTemplates
              .slice(0, 12)
              .map((tpl: any, idx: number) =>
                sanitizeWidgetTemplate(tpl, {
                  ...current.widgetDefault,
                  id: `tpl-${idx + 1}`,
                  name: `Widget Template ${idx + 1}`,
                })
              )
          : current.widgetTemplates,
        hero: sanitizeHeroConfig(body?.hero, current.hero),
        recentEmojis: Array.isArray(body?.recentEmojis)
          ? (body.recentEmojis.map(validateEmojiRef).filter(Boolean) as DiscordEmojiRef[]).slice(0, 24)
          : current.recentEmojis,
      };

      const savedBundle = await setPresentationConfig(env, nextBundle);
      await purgePublicEdgeCaches(resolvePublicOrigin(env, origin));

      let widgetRefresh: { refreshed: number; skipped: number; failed: number } | null = null;
      if (body?.refreshWidgets === true) {
        widgetRefresh = await refreshAllWidgets(env, resolvePublicOrigin(env, origin), {
          force: true,
          trigger: "presentation-save",
        });
      }

      return json({
        ok: true,
        bundle: savedBundle,
        widgetRefresh,
        savedAt: savedBundle.updatedAt,
      });
    }

    // 8c. Discord Emoji Picker Source Endpoint (Application Emojis + Connected Server Emojis)
    if (method === "GET" && url.pathname === "/api/admin/emojis") {
      const [identity, botGuilds, bundle] = await Promise.all([
        fetchBotApplicationInfo(env),
        env.DISCORD_BOT_TOKEN ? getBotGuilds(env, url.searchParams.get("refresh") === "1") : Promise.resolve([]),
        getPresentationConfig(env),
      ]);
      const emojis = await fetchBotEmojis(env, botGuilds, identity.appId);
      return json({
        ok: true,
        botOnline: identity.ok,
        appId: identity.appId,
        applicationEmojis: emojis.applicationEmojis,
        guildEmojis: emojis.guildEmojis,
        recentEmojis: bundle.recentEmojis || [],
        errors: emojis.errors,
      });
    }

    // 8d. Per-Listing Metadata Overrides (/admin/metadata)
    const listingMetaMatch = url.pathname.match(/^\/api\/admin\/listings\/(\d+)\/metadata$/);
    if (listingMetaMatch && method === "GET") {
      const listingId = listingMetaMatch[1];
      const [snapshot, overridesMap] = await Promise.all([
        getCatalogSnapshot(env),
        getListingOverridesMap(env),
      ]);
      const record = snapshot.records.find((r) => r.id === listingId);
      if (!record) return json({ error: "Listing not found." }, 404);
      return json({
        ok: true,
        listing: serializeListing(record, overridesMap[listingId] || null),
      });
    }

    if (listingMetaMatch && method === "PUT") {
      const listingId = listingMetaMatch[1];
      const snapshot = await getCatalogSnapshot(env);
      const record = snapshot.records.find((r) => r.id === listingId);
      if (!record) return json({ error: "Listing not found." }, 404);

      let body: any = {};
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON payload." }, 400);
      }

      const validIcons = new Set([
        "sparkles",
        "volume",
        "wrench",
        "clock",
        "shield",
        "zap",
        "star",
        "gauge",
        "tag",
        "flame",
        "award",
        "check",
      ]);

      const featuresOverride: VehicleFeature[] | null = Array.isArray(body?.featuresOverride)
        ? body.featuresOverride
            .filter((f: any) => f && f.key && f.label)
            .slice(0, 12)
            .map((f: any, index: number) => ({
              key: String(f.key).trim().slice(0, 50),
              label: String(f.label).trim().slice(0, 80),
              value: typeof f.value === "string" ? f.value.trim().slice(0, 80) : undefined,
              icon: validIcons.has(f.icon) ? f.icon : "tag",
              emoji: validateEmojiRef(f.emoji),
              visibleOn: Array.isArray(f.visibleOn)
                ? f.visibleOn.filter((s: unknown) =>
                    ["card", "in_stock_embed", "sold_out_embed", "widget"].includes(String(s))
                  )
                : undefined,
              priority: typeof f.priority === "number" ? f.priority : (index + 1) * 10,
              source: f.source === "extracted" ? "extracted" : "admin",
            }))
        : null;

      const override: VehicleMetadataOverride = {
        listingId,
        displayName: typeof body?.displayName === "string" ? body.displayName.trim().slice(0, 140) : undefined,
        shortDescription:
          typeof body?.shortDescription === "string"
            ? normalizeWhitespace(body.shortDescription).slice(0, 400)
            : undefined,
        fullDescription:
          typeof body?.fullDescription === "string"
            ? normalizeWhitespace(body.fullDescription).slice(0, 2500)
            : undefined,
        featuresOverride,
        hiddenFeatureKeys: Array.isArray(body?.hiddenFeatureKeys)
          ? body.hiddenFeatureKeys.map(String).slice(0, 20)
          : [],
        updatedAt: Date.now(),
        updatedBy: user.username || user.id,
      };

      await setListingOverride(env, listingId, override);
      const baseOrigin = resolvePublicOrigin(env, origin);
      await purgePublicEdgeCaches(baseOrigin);
      const widgetRefresh = await refreshAllWidgets(env, baseOrigin, {
        trigger: "metadata-update",
      });

      let embedUpdateResults: any[] = [];
      if (body?.updateDeployedEmbeds === true) {
        const car: CarListing = {
          ...record.payload,
          id: record.id,
          detectedAt: record.firstSeenAt,
          lastVerifiedAt: record.lastVerifiedAt,
          soldOutAt: record.soldOutAt,
          isAvailable: record.isAvailable,
        };
        const guildIds = await getAllGuildIds(env);
        for (const gid of guildIds) {
          const sentMap = await getGuildSentMessages(env, gid);
          const meta = sentMap[listingId];
          if (!meta?.messageId) continue;
          const r = await updateSentListingEmbedForGuild(env, car, gid, {
            overrideChannelId: meta.channelId,
            overrideMessageId: meta.messageId,
          });
          embedUpdateResults.push({ guildId: gid, ...r });
        }
      }

      return json({
        ok: true,
        listing: serializeListing(record, override),
        widgetRefresh,
        embedUpdateResults,
      });
    }

    if (listingMetaMatch && method === "DELETE") {
      const listingId = listingMetaMatch[1];
      const snapshot = await getCatalogSnapshot(env);
      const record = snapshot.records.find((r) => r.id === listingId);
      if (!record) return json({ error: "Listing not found." }, 404);

      await deleteListingOverride(env, listingId);
      const baseOrigin = resolvePublicOrigin(env, origin);
      await purgePublicEdgeCaches(baseOrigin);
      const widgetRefresh = await refreshAllWidgets(env, baseOrigin, {
        trigger: "metadata-reset",
      });
      return json({
        ok: true,
        listing: serializeListing(record, null),
        widgetRefresh,
      });
    }

    // 9. Read-Only Manual Store Scan (never publishes Discord alerts)
    if (method === "POST" && url.pathname === "/api/admin/monitor/scan") {
      const result = await manualScanStoreOnly(env, origin);
      const [monitorStatus, monitorLogs, snapshot, overridesMap] = await Promise.all([
        getMonitorStatus(env),
        getMonitorLogs(env),
        getCatalogSnapshot(env),
        getListingOverridesMap(env),
      ]);
      return json({
        ok: true,
        usedVerifiedStoreResponse: result.usedVerifiedStoreResponse,
        newDiscoveries: result.newDiscoveries,
        notice: result.notice || null,
        catalogVersion: snapshot.version,
        monitorStatus,
        monitorHealth: computeMonitorHealth(monitorStatus),
        monitorLogs,
        listings: [...snapshot.records]
          .sort((a, b) => b.firstSeenAt - a.firstSeenAt)
          .map((r) => serializeListing(r, overridesMap[r.id] || null)),
        scannedAt: Date.now(),
      });
    }

    // 10. Manual Controlled Dispatch to Selected Servers
    if (method === "POST" && url.pathname === "/api/admin/dispatch") {
      let body: any = {};
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON payload." }, 400);
      }

      const listingId = String(body?.listingId || "").trim();
      const rawGuildIds: string[] = Array.isArray(body?.guildIds)
        ? body.guildIds.map((val: unknown) => String(val)).filter((id: string) => /^\d{17,20}$/.test(id))
        : [];
      const guildIds: string[] = Array.from(new Set<string>(rawGuildIds));
      const forceResend = Boolean(body?.forceResend);
      const includeRoleMentions = body?.includeRoleMentions !== false;

      if (!listingId) return json({ error: "Select a vehicle listing to publish." }, 400);
      if (guildIds.length === 0) {
        return json({ error: "Select at least one destination server." }, 400);
      }

      const history = await getListingHistory(env);
      const record = history.find((item) => item.id === listingId);
      if (!record) return json({ error: "Selected vehicle listing could not be found." }, 404);

      if (getReadinessStatus(record) !== "ready" && !body?.allowIncomplete) {
        return json(
          { error: "Listing metadata is incomplete. Verify details via store scan before publishing." },
          400
        );
      }

      const car: CarListing = {
        ...record.payload,
        id: record.id,
        detectedAt: record.firstSeenAt,
        lastVerifiedAt: record.lastVerifiedAt,
        soldOutAt: record.soldOutAt,
        isAvailable: record.isAvailable,
      };

      const results: Array<{
        guildId: string;
        ok: boolean;
        skippedAlreadySent?: boolean;
        messageId?: string;
        error?: string;
      }> = [];

      for (const guildId of guildIds) {
        const res = await dispatchListingToGuild(env, car, guildId, {
          method: "manual",
          forceResend,
          includeRoleMentions,
        });
        results.push({ guildId, ...res });
      }

      const deliveryLogs = await getDeliveryLogs(env);
      return json({
        ok: true,
        results,
        deliveredCount: results.filter((r) => r.ok).length,
        skippedCount: results.filter((r) => r.skippedAlreadySent).length,
        failedCount: results.filter((r) => !r.ok && !r.skippedAlreadySent).length,
        deliveryLogs,
      });
    }

    // 11. Toggle Server Environment (Production vs Test)
    if (method === "PUT" && url.pathname === "/api/admin/testing/server-mode") {
      let body: any = {};
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON payload." }, 400);
      }
      const guildId = String(body?.guildId || "").trim();
      const environment = body?.environment === "test" ? "test" : "production";
      if (!/^\d{17,20}$/.test(guildId)) {
        return json({ error: "Invalid server ID." }, 400);
      }
      const existing = (await getGuildConfig(env, guildId)) || { channelId: "", roleIds: [] };
      await setGuildConfig(env, guildId, { ...existing, environment });
      return json({ ok: true, guildId, environment });
    }

    // 12. Isolated Test Dispatch (Strictly requires environment === 'test' on server)
    if (method === "POST" && url.pathname === "/api/admin/testing/send") {
      let body: any = {};
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON payload." }, 400);
      }
      const listingId = String(body?.listingId || "").trim();
      const guildId = String(body?.guildId || "").trim();
      if (!listingId || !/^\d{17,20}$/.test(guildId)) {
        return json({ error: "Select both a listing and a designated Test server." }, 400);
      }

      const cfg = await getGuildConfig(env, guildId);
      if (cfg?.environment !== "test") {
        return json(
          {
            error:
              "Blocked: Testing cannot target a Production server. Switch the server to Test mode first.",
          },
          403
        );
      }

      const history = await getListingHistory(env);
      const record = history.find((item) => item.id === listingId);
      if (!record) return json({ error: "Listing not found." }, 404);

      const car: CarListing = {
        ...record.payload,
        id: record.id,
        detectedAt: record.firstSeenAt,
        lastVerifiedAt: record.lastVerifiedAt,
        soldOutAt: record.soldOutAt,
        isAvailable: record.isAvailable,
      };

      const res = await dispatchListingToGuild(env, car, guildId, {
        method: "test",
        includeRoleMentions: false,
      });

      const deliveryLogs = await getDeliveryLogs(env);
      if (!res.ok) {
        return json({ ok: false, error: res.error || "Test dispatch failed.", deliveryLogs }, 502);
      }

      return json({
        ok: true,
        messageId: res.messageId,
        guildId,
        listingId,
        deliveryLogs,
      });
    }

    // 13. Manually Edit / Update Deployed Discord Embeds In-Place (single message, listing across servers, or bulk all)
    if (method === "POST" && url.pathname === "/api/admin/dispatch/edit") {
      let body: any = {};
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON payload." }, 400);
      }

      const scope = body?.scope === "bulk" ? "bulk" : "listing";
      const history = await getListingHistory(env);
      const historyById = new Map(history.map((item) => [item.id, item]));

      const results: Array<{
        guildId: string;
        listingId: string;
        listingName?: string;
        ok: boolean;
        skippedNotSent?: boolean;
        messageId?: string;
        channelId?: string;
        error?: string;
      }> = [];

      if (scope === "bulk") {
        const filterListingId = typeof body?.listingId === "string" ? body.listingId.trim() : "";
        const filterGuildSet =
          Array.isArray(body?.guildIds) && body.guildIds.length > 0
            ? new Set<string>(body.guildIds.map((v: unknown) => String(v)))
            : null;
        const guildIds: string[] = filterGuildSet
          ? Array.from(filterGuildSet)
          : await getAllGuildIds(env);

        for (const guildId of guildIds) {
          const sentMap = await getGuildSentMessages(env, guildId);
          for (const [lid, meta] of Object.entries(sentMap)) {
            if (filterListingId && lid !== filterListingId) continue;
            if (!meta?.messageId || !meta?.channelId) continue;
            const record = historyById.get(lid);
            if (!record) continue;
            const car: CarListing = {
              ...record.payload,
              id: record.id,
              detectedAt: record.firstSeenAt,
              lastVerifiedAt: record.lastVerifiedAt,
              soldOutAt: record.soldOutAt,
              isAvailable: record.isAvailable,
            };
            const res = await updateSentListingEmbedForGuild(env, car, guildId, {
              overrideChannelId: meta.channelId,
              overrideMessageId: meta.messageId,
            });
            results.push({ guildId, listingId: lid, listingName: car.name, ...res });
          }
        }
      } else {
        const listingId = String(body?.listingId || "").trim();
        const rawGuildIds: string[] = Array.isArray(body?.guildIds)
          ? body.guildIds.map((val: unknown) => String(val)).filter((id: string) => /^\d{17,20}$/.test(id))
          : [];
        const guildIds = Array.from(new Set<string>(rawGuildIds));

        if (!listingId) return json({ error: "Select a vehicle listing to update." }, 400);
        if (guildIds.length === 0) {
          return json({ error: "Select at least one destination server." }, 400);
        }

        const record = historyById.get(listingId);
        if (!record) return json({ error: "Selected vehicle listing could not be found." }, 404);

        const car: CarListing = {
          ...record.payload,
          id: record.id,
          detectedAt: record.firstSeenAt,
          lastVerifiedAt: record.lastVerifiedAt,
          soldOutAt: record.soldOutAt,
          isAvailable: record.isAvailable,
        };

        for (const guildId of guildIds) {
          const res = await updateSentListingEmbedForGuild(env, car, guildId, {
            overrideMessageId:
              typeof body?.overrideMessageId === "string" && guildIds.length === 1
                ? body.overrideMessageId
                : undefined,
            overrideChannelId:
              typeof body?.overrideChannelId === "string" && guildIds.length === 1
                ? body.overrideChannelId
                : undefined,
          });
          results.push({ guildId, listingId, listingName: car.name, ...res });
        }
      }

      const deliveryLogs = await getDeliveryLogs(env);
      return json({
        ok: true,
        scope,
        results,
        updatedCount: results.filter((r) => r.ok).length,
        skippedCount: results.filter((r) => r.skippedNotSent).length,
        failedCount: results.filter((r) => !r.ok && !r.skippedNotSent).length,
        deliveryLogs,
      });
    }

    // 14. Admin Widget Manager (List / Deploy / Refresh / Move / Assign Template / Remove)
    if (method === "GET" && url.pathname === "/api/admin/widgets") {
      const forceRefresh = url.searchParams.get("refresh") === "1";
      const [widgets, botGuilds, allGuildIds, bundle] = await Promise.all([
        getAllWidgetDeployments(env),
        getBotGuilds(env, forceRefresh),
        getAllGuildIds(env),
        getPresentationConfig(env),
      ]);
      const botGuildMap = new Map(botGuilds.map((g) => [g.id, g]));
      const guildIdSet = new Set([
        ...botGuilds.map((g) => g.id),
        ...allGuildIds,
        ...widgets.map((w) => w.guildId),
      ]);

      const guilds = await Promise.all(
        [...guildIdSet].map(async (guildId) => {
          const botGuild = botGuildMap.get(guildId);
          const [cfg, controls] = await Promise.all([
            getGuildConfig(env, guildId),
            botGuild && env.DISCORD_BOT_TOKEN
              ? getGuildControlOptions(env, guildId, forceRefresh)
              : Promise.resolve({ channels: [], roles: [] }),
          ]);
          return {
            id: guildId,
            name: botGuild?.name || `Server ${guildId}`,
            inBotGuilds: Boolean(botGuild),
            alertChannelId: cfg?.channelId || "",
            widgetTemplateId: cfg?.widgetTemplateId || "default",
            channels: controls.channels,
          };
        })
      );
      guilds.sort((a, b) => a.name.localeCompare(b.name));

      return json({
        ok: true,
        widgets,
        guilds,
        widgetDefault: bundle.widgetDefault,
        widgetTemplates: bundle.widgetTemplates,
        configVersion: bundle.version,
      });
    }

    if (method === "POST" && url.pathname === "/api/admin/widgets/deploy") {
      let body: any = {};
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON payload." }, 400);
      }
      const guildId = String(body?.guildId || "").trim();
      const channelId = String(body?.channelId || "").trim();
      const templateId = typeof body?.templateId === "string" ? body.templateId.trim() : undefined;
      if (!/^\d{17,20}$/.test(guildId) || !/^\d{17,20}$/.test(channelId)) {
        return json({ error: "Valid Discord server ID and channel ID are required." }, 400);
      }

      const res = await deployStatusWidgetToChannel(env, guildId, channelId, resolvePublicOrigin(env, origin), {
        deployedBy: user.id,
        deployedByUsername: user.username,
        templateId,
      });
      if (!res.ok) {
        return json({ ok: false, error: res.error || "Failed to deploy widget." }, 502);
      }
      return json({
        ok: true,
        widget: res.widget,
        messageId: res.messageId,
        jumpUrl: `https://discord.com/channels/${guildId}/${channelId}/${res.messageId}`,
      });
    }

    if (method === "POST" && url.pathname === "/api/admin/widgets/refresh") {
      let body: any = {};
      try {
        body = await request.json();
      } catch {
        body = {};
      }
      const result = await refreshAllWidgets(env, resolvePublicOrigin(env, origin), {
        force: body?.force !== false,
        widgetIds: Array.isArray(body?.widgetIds) ? body.widgetIds.map(String) : undefined,
        trigger: "admin-bulk",
      });
      return json({
        ok: true,
        ...result,
        refreshedAt: Date.now(),
      });
    }

    const singleWidgetRefreshMatch = url.pathname.match(/^\/api\/admin\/widgets\/([^/]+)\/refresh$/);
    if (singleWidgetRefreshMatch && method === "POST") {
      const widgetId = decodeURIComponent(singleWidgetRefreshMatch[1]);
      const res = await refreshWidgetById(env, widgetId, resolvePublicOrigin(env, origin), {
        force: true,
        trigger: "admin-single",
      });
      if (!res.ok) {
        return json({ ok: false, error: res.error || "Failed to refresh widget.", widget: res.widget }, 502);
      }
      return json({ ...res, ok: true, refreshedAt: Date.now() });
    }

    const singleWidgetMoveMatch = url.pathname.match(/^\/api\/admin\/widgets\/([^/]+)\/move$/);
    if (singleWidgetMoveMatch && method === "POST") {
      const widgetId = decodeURIComponent(singleWidgetMoveMatch[1]);
      let body: any = {};
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON payload." }, 400);
      }
      const targetChannelId = String(body?.channelId || "").trim();
      if (!/^\d{17,20}$/.test(targetChannelId)) {
        return json({ error: "Valid target channel ID is required." }, 400);
      }
      const existing = await getWidgetDeploymentById(env, widgetId);
      if (!existing) return json({ error: "Widget deployment not found." }, 404);

      const deployRes = await deployStatusWidgetToChannel(
        env,
        existing.guildId,
        targetChannelId,
        resolvePublicOrigin(env, origin),
        {
          deployedBy: user.id,
          deployedByUsername: user.username,
          templateId: existing.templateId,
          customTemplate: existing.customTemplate ?? null,
        }
      );
      if (!deployRes.ok) {
        return json({ ok: false, error: deployRes.error || "Failed to post widget in new channel." }, 502);
      }

      if (existing.channelId !== targetChannelId && existing.messageId && env.DISCORD_BOT_TOKEN) {
        await fetchDiscordWithRetry(
          `https://discord.com/api/v10/channels/${existing.channelId}/messages/${existing.messageId}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
          }
        ).catch(() => null);
        await deleteWidgetDeploymentById(env, widgetId);
      }

      return json({
        ok: true,
        widget: deployRes.widget,
        jumpUrl: `https://discord.com/channels/${existing.guildId}/${targetChannelId}/${deployRes.messageId}`,
      });
    }

    const singleWidgetTemplateMatch = url.pathname.match(/^\/api\/admin\/widgets\/([^/]+)\/template$/);
    if (singleWidgetTemplateMatch && method === "PUT") {
      const widgetId = decodeURIComponent(singleWidgetTemplateMatch[1]);
      const existing = await getWidgetDeploymentById(env, widgetId);
      if (!existing) return json({ error: "Widget deployment not found." }, 404);

      let body: any = {};
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON payload." }, 400);
      }

      const updated = await setWidgetDeployment(env, {
        ...existing,
        templateId: typeof body?.templateId === "string" ? body.templateId.trim() : undefined,
        customTemplate: body?.customTemplate || null,
      });
      const refreshRes = await refreshWidgetById(env, updated.id, resolvePublicOrigin(env, origin), {
        force: true,
        trigger: "template-assign",
      });
      return json({
        ok: refreshRes.ok,
        widget: refreshRes.widget || updated,
        error: refreshRes.error || null,
      });
    }

    const deleteWidgetMatch = url.pathname.match(/^\/api\/admin\/widgets\/([^/]+)$/);
    if (deleteWidgetMatch && method === "DELETE") {
      const widgetKey = decodeURIComponent(deleteWidgetMatch[1]);
      const byId = await getWidgetDeploymentById(env, widgetKey);
      if (byId) {
        if (byId.channelId && byId.messageId && env.DISCORD_BOT_TOKEN) {
          await fetchDiscordWithRetry(
            `https://discord.com/api/v10/channels/${byId.channelId}/messages/${byId.messageId}`,
            {
              method: "DELETE",
              headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
            }
          ).catch(() => null);
        }
        await deleteWidgetDeploymentById(env, byId.id);
        return json({ ok: true, id: byId.id, guildId: byId.guildId });
      }
      const existingWidget = await getWidgetDeployment(env, widgetKey);
      if (existingWidget?.channelId && existingWidget?.messageId && env.DISCORD_BOT_TOKEN) {
        await fetchDiscordWithRetry(
          `https://discord.com/api/v10/channels/${existingWidget.channelId}/messages/${existingWidget.messageId}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
          }
        ).catch(() => null);
      }
      await deleteWidgetDeployment(env, widgetKey);
      return json({ ok: true, guildId: widgetKey });
    }

    // 15. R2 Media Asset Manager & Placement Modifier (/admin/images)
    const allowedMediaTypes = new Set([
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
      "image/gif",
      "image/avif",
    ]);

    const buildListingImageState = async (listingId: string) => {
      const r2 = env.MEDIA_BUCKET as R2Bucket | undefined;
      const kv = env.DISCORD_BOT as KVNamespace | undefined;
      const snapshot = await getCatalogSnapshot(env);
      const record = snapshot.records.find((r) => r.id === listingId);
      if (!record) return null;

      const baseOrigin = resolvePublicOrigin(env, origin) || origin;
      const storedUrls: string[] = Array.isArray(record.payload?.images) ? record.payload.images : [];
      const slots: Array<{
        index: number;
        exists: boolean;
        storage: "r2" | "kv" | "external" | "empty";
        size: number;
        contentType: string;
        etag: string | null;
        url: string | null;
        sourceUrl: string | null;
      }> = [];

      for (let idx = 0; idx < 10; idx++) {
        const key = `media:${listingId}:${idx}`;
        const r2Head = r2 ? await r2.head(key) : null;
        if (r2Head) {
          slots.push({
            index: idx,
            exists: true,
            storage: "r2",
            size: r2Head.size,
            contentType: r2Head.httpMetadata?.contentType || "image/webp",
            etag: r2Head.httpEtag || null,
            url: `${baseOrigin}/media/listings/${listingId}/${idx}`,
            sourceUrl: storedUrls[idx] || null,
          });
          continue;
        }
        const kvEntry = kv ? await kv.getWithMetadata<{ contentType?: string }>(key, "arrayBuffer") : null;
        if (kvEntry?.value) {
          slots.push({
            index: idx,
            exists: true,
            storage: "kv",
            size: kvEntry.value.byteLength,
            contentType: kvEntry.metadata?.contentType || "image/webp",
            etag: `kv-${listingId}-${idx}-${kvEntry.value.byteLength}`,
            url: `${baseOrigin}/media/listings/${listingId}/${idx}`,
            sourceUrl: storedUrls[idx] || null,
          });
          continue;
        }
        const rawUrl = storedUrls[idx];
        const isExternal =
          typeof rawUrl === "string" &&
          /^https?:\/\//i.test(rawUrl) &&
          !rawUrl.includes(`/media/listings/${listingId}/`);
        slots.push({
          index: idx,
          exists: isExternal,
          storage: isExternal ? "external" : "empty",
          size: 0,
          contentType: "",
          etag: null,
          url: isExternal ? rawUrl : null,
          sourceUrl: rawUrl || null,
        });
      }

      return {
        listingId,
        listingName: record.payload?.name || `Limited Vehicle #${listingId}`,
        isAvailable: record.isAvailable,
        slots,
        payloadUrls: storedUrls,
        r2Bound: Boolean(r2),
      };
    };

    const syncRecordUrlsFromStorage = async (listingId: string, deletedIndex?: number) => {
      const r2 = env.MEDIA_BUCKET as R2Bucket | undefined;
      const kv = env.DISCORD_BOT as KVNamespace | undefined;
      const baseOrigin = resolvePublicOrigin(env, origin) || origin;
      const snapshot = await getCatalogSnapshot(env);
      const record = snapshot.records.find((r) => r.id === listingId);
      const existingUrls: string[] = Array.isArray(record?.payload?.images) ? record.payload.images : [];
      const urls: string[] = [];

      for (let idx = 0; idx < 10; idx++) {
        const key = `media:${listingId}:${idx}`;
        const hasR2 = r2 ? Boolean(await r2.head(key)) : false;
        const hasKv = !hasR2 && kv ? Boolean(await kv.get(key, "arrayBuffer")) : false;
        if (hasR2 || hasKv) {
          urls.push(`${baseOrigin}/media/listings/${listingId}/${idx}`);
        } else if (
          deletedIndex !== idx &&
          typeof existingUrls[idx] === "string" &&
          /^https?:\/\//i.test(existingUrls[idx]) &&
          !existingUrls[idx].includes(`/media/listings/${listingId}/`)
        ) {
          urls.push(existingUrls[idx]);
        }
      }

      await updateListingImages(env, listingId, urls);
      await purgeListingMediaEdgeCaches(listingId, baseOrigin);
      await purgePublicEdgeCaches(baseOrigin);
      await refreshAllWidgets(env, baseOrigin);
      return urls;
    };

    const imagesListMatch = url.pathname.match(/^\/api\/admin\/listings\/(\d+)\/images$/);
    if (imagesListMatch && method === "GET") {
      const state = await buildListingImageState(imagesListMatch[1]);
      if (!state) return json({ error: "Listing not found." }, 404);
      return json({ ok: true, ...state });
    }

    const imagesReorderMatch = url.pathname.match(/^\/api\/admin\/listings\/(\d+)\/images\/reorder$/);
    if (imagesReorderMatch && method === "PUT") {
      const listingId = imagesReorderMatch[1];
      const r2 = env.MEDIA_BUCKET as R2Bucket | undefined;
      const kv = env.DISCORD_BOT as KVNamespace | undefined;
      const snapshot = await getCatalogSnapshot(env);
      const record = snapshot.records.find((r) => r.id === listingId);
      if (!record) return json({ error: "Listing not found." }, 404);

      let body: any = {};
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON payload." }, 400);
      }

      // Read all existing blobs (R2 first, fallback KV, fallback external fetch)
      const blobMap = new Map<number, { data: ArrayBuffer; contentType: string }>();
      const storedUrls: string[] = Array.isArray(record.payload?.images) ? record.payload.images : [];
      for (let idx = 0; idx < 10; idx++) {
        const key = `media:${listingId}:${idx}`;
        if (r2) {
          const obj = await r2.get(key);
          if (obj) {
            blobMap.set(idx, {
              data: await obj.arrayBuffer(),
              contentType: obj.httpMetadata?.contentType || "image/webp",
            });
            continue;
          }
        }
        if (kv) {
          const kvObj = await kv.getWithMetadata<{ contentType?: string }>(key, "arrayBuffer");
          if (kvObj?.value) {
            blobMap.set(idx, {
              data: kvObj.value,
              contentType: kvObj.metadata?.contentType || "image/webp",
            });
            continue;
          }
        }
        const candidateUrl = storedUrls[idx];
        if (
          typeof candidateUrl === "string" &&
          /^https?:\/\//i.test(candidateUrl) &&
          !candidateUrl.includes(`/media/listings/${listingId}/`)
        ) {
          try {
            const res = await fetch(candidateUrl);
            if (res.ok) {
              blobMap.set(idx, {
                data: await res.arrayBuffer(),
                contentType: res.headers.get("content-type") || "image/webp",
              });
            }
          } catch {
            // Skip unreachable external image
          }
        }
      }

      // Compute slot permutation 0..9 -> oldSlot
      const targetMapping: number[] = Array.from({ length: 10 }, (_, i) => i);
      if (Array.isArray(body?.order) && body.order.length > 0) {
        const seen = new Set<number>();
        const cleaned = body.order
          .map((n: unknown) => Number(n))
          .filter((n: number) => Number.isInteger(n) && n >= 0 && n < 10 && !seen.has(n) && (seen.add(n), true));
        for (let i = 0; i < 10; i++) {
          if (!seen.has(i)) cleaned.push(i);
        }
        for (let i = 0; i < 10; i++) targetMapping[i] = cleaned[i];
      } else if (
        Number.isInteger(Number(body?.fromIndex)) &&
        Number.isInteger(Number(body?.toIndex))
      ) {
        const from = Number(body.fromIndex);
        const to = Number(body.toIndex);
        if (from < 0 || from > 9 || to < 0 || to > 9) {
          return json({ error: "Slot indices must be between 0 and 9." }, 400);
        }
        if (body?.mode === "move") {
          const seq = Array.from({ length: 10 }, (_, i) => i);
          const [moved] = seq.splice(from, 1);
          seq.splice(to, 0, moved);
          for (let i = 0; i < 10; i++) targetMapping[i] = seq[i];
        } else {
          targetMapping[from] = to;
          targetMapping[to] = from;
        }
      } else {
        return json({ error: "Provide either { order } or { fromIndex, toIndex }." }, 400);
      }

      for (let newIdx = 0; newIdx < 10; newIdx++) {
        const oldIdx = targetMapping[newIdx];
        const key = `media:${listingId}:${newIdx}`;
        const blob = blobMap.get(oldIdx);
        if (blob) {
          if (r2) {
            await r2.put(key, blob.data, { httpMetadata: { contentType: blob.contentType } });
            if (kv) await kv.delete(key).catch(() => null);
          } else if (kv) {
            await kv.put(key, blob.data, { metadata: { contentType: blob.contentType } });
          }
        } else {
          if (r2) await r2.delete(key).catch(() => null);
          if (kv) await kv.delete(key).catch(() => null);
        }
      }

      await syncRecordUrlsFromStorage(listingId);
      const nextState = await buildListingImageState(listingId);
      return json({ ok: true, ...nextState });
    }

    const imageSlotMatch = url.pathname.match(/^\/api\/admin\/listings\/(\d+)\/images\/(\d+)$/);
    if (imageSlotMatch && method === "POST") {
      const listingId = imageSlotMatch[1];
      const slotIndex = Number(imageSlotMatch[2]);
      if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 9) {
        return json({ error: "Image slot index must be between 0 and 9." }, 400);
      }

      const r2 = env.MEDIA_BUCKET as R2Bucket | undefined;
      const kv = env.DISCORD_BOT as KVNamespace | undefined;
      const reqContentType = request.headers.get("content-type") || "";
      let fileBytes: ArrayBuffer | null = null;
      let mimeType = "image/webp";

      if (reqContentType.includes("multipart/form-data")) {
        const formData = await request.formData();
        const file = formData.get("file");
        if (!file || typeof file === "string") {
          return json({ error: "Missing uploaded file field ('file')." }, 400);
        }
        mimeType = file.type || "image/webp";
        fileBytes = await file.arrayBuffer();
      } else {
        mimeType = reqContentType.split(";")[0].trim() || "image/webp";
        fileBytes = await request.arrayBuffer();
      }

      if (!fileBytes || fileBytes.byteLength === 0) {
        return json({ error: "Uploaded image file is empty." }, 400);
      }
      if (fileBytes.byteLength > 25 * 1024 * 1024) {
        return json({ error: "Image file exceeds the 25 MB upload limit." }, 413);
      }
      if (!allowedMediaTypes.has(mimeType.toLowerCase())) {
        return json({ error: `Unsupported image content type: ${mimeType}` }, 400);
      }

      const key = `media:${listingId}:${slotIndex}`;
      if (r2) {
        await r2.put(key, fileBytes, { httpMetadata: { contentType: mimeType } });
        if (kv) await kv.delete(key).catch(() => null);
      } else if (kv) {
        await kv.put(key, fileBytes, { metadata: { contentType: mimeType } });
      } else {
        return json({ error: "Neither R2 bucket nor KV storage is bound." }, 500);
      }

      await syncRecordUrlsFromStorage(listingId);
      const nextState = await buildListingImageState(listingId);
      return json({ ok: true, ...nextState });
    }

    if (imageSlotMatch && method === "DELETE") {
      const listingId = imageSlotMatch[1];
      const slotIndex = Number(imageSlotMatch[2]);
      if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 9) {
        return json({ error: "Image slot index must be between 0 and 9." }, 400);
      }

      const r2 = env.MEDIA_BUCKET as R2Bucket | undefined;
      const kv = env.DISCORD_BOT as KVNamespace | undefined;
      const key = `media:${listingId}:${slotIndex}`;
      if (r2) await r2.delete(key).catch(() => null);
      if (kv) await kv.delete(key).catch(() => null);

      await syncRecordUrlsFromStorage(listingId, slotIndex);
      const nextState = await buildListingImageState(listingId);
      return json({ ok: true, ...nextState });
    }

    // 16. Bot Control Center (Inspect Bot, Slash Command Sync, Availability Diagnostics, Guild Cache & Widget Refresh)
    const buildBotStatePayload = async (forceRefreshGuilds = false, checkAvailability = true) => {
      const [identity, syncMeta, botGuilds, allWidgets, monitorStatus, botHealth] =
        await Promise.all([
          fetchBotApplicationInfo(env),
          getBotCommandSyncMeta(env),
          env.DISCORD_BOT_TOKEN ? getBotGuilds(env, forceRefreshGuilds) : Promise.resolve([]),
          getAllWidgetDeployments(env),
          getMonitorStatus(env),
          checkBotHealthSnapshot(env, forceRefreshGuilds),
        ]);

      const liveCommandsRes = await fetchLiveDiscordCommands(env, undefined, identity.appId);
      const comparison = compareDiscordCommands(liveCommandsRes.commands);
      const availability =
        checkAvailability && env.DISCORD_BOT_TOKEN
          ? await inspectGuildCommandAvailability(
              env,
              botGuilds.map((g) => ({ id: g.id, name: g.name })),
              liveCommandsRes.commands,
              identity.appId
            )
          : null;

      const publicOrigin = resolvePublicOrigin(env, origin);
      const interactionsUrl = `${publicOrigin}/interactions`;
      const botTokenConfigured = Boolean(env.DISCORD_BOT_TOKEN);
      const publicKeyConfigured = Boolean(env.DISCORD_PUBLIC_KEY);
      const kvBound = Boolean(env.DISCORD_BOT);

      const readinessChecks = buildBotReadinessChecks({
        identity,
        comparisons: comparison.comparisons,
        availability,
        expectedInteractionsUrl: interactionsUrl,
        botTokenConfigured,
        publicKeyConfigured,
        kvBound,
      });

      return {
        ok: true,
        botStatus: getBotStatus(env, monitorStatus, botHealth),
        botHealth,
        identity,
        liveCommandsOk: liveCommandsRes.ok,
        liveCommandsError: liveCommandsRes.error || null,
        totalLocalCommands: COMMANDS.length,
        totalRemoteCommands: liveCommandsRes.commands.length,
        ...comparison,
        syncMeta,
        availability,
        readinessChecks,
        guilds: botGuilds.map((g) => ({
          id: g.id,
          name: g.name,
          inviteUrl: `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(identity.appId)}&guild_id=${encodeURIComponent(g.id)}&permissions=${BOT_PERMISSIONS}&integration_type=0&scope=bot+applications.commands`,
        })),
        environment: {
          botTokenConfigured,
          publicKeyConfigured,
          clientSecretConfigured: Boolean(env.DISCORD_CLIENT_SECRET),
          kvBound,
          r2Bound: Boolean(env.MEDIA_BUCKET),
          publicOrigin,
          interactionsUrl,
        },
        counts: {
          connectedServers: botGuilds.length,
          deployedWidgets: allWidgets.length,
        },
      };
    };

    if (method === "GET" && url.pathname === "/api/admin/bot") {
      const checkAvailability = url.searchParams.get("checkAvailability") !== "0";
      const payload = await buildBotStatePayload(false, checkAvailability);
      return json(payload);
    }

    if (method === "POST" && url.pathname === "/api/admin/bot/verify-availability") {
      const payload = await buildBotStatePayload(true, true);
      return json(payload);
    }

    if (method === "POST" && url.pathname === "/api/admin/bot/guild-commands") {
      let body: any = {};
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON payload." }, 400);
      }
      const action =
        body?.action === "clear-all"
          ? "clear-all"
          : body?.action === "clear"
            ? "clear"
            : "sync";

      if (action === "clear-all") {
        const botGuilds = env.DISCORD_BOT_TOKEN ? await getBotGuilds(env, false) : [];
        const clearRes = await clearAllGuildCommands(
          env,
          botGuilds.map((g) => g.id)
        );
        const botState = await buildBotStatePayload(false, true);
        return json({
          ok: clearRes.failedCount === 0,
          action: "clear-all",
          clearedCount: clearRes.clearedCount,
          failedCount: clearRes.failedCount,
          errors: clearRes.errors,
          botState,
        });
      }

      const guildId = String(body?.guildId || "").trim();
      if (!/^\d{17,20}$/.test(guildId)) {
        return json({ error: "Valid Discord guildId is required." }, 400);
      }
      if (action === "clear") {
        const res = await clearGuildCommands(env, guildId);
        if (!res.ok) return json({ ok: false, error: res.error || "Failed to clear guild commands." }, 502);
        const botState = await buildBotStatePayload(false, true);
        return json({ ok: true, action: "clear", guildId, botState });
      }
      const syncRes = await syncDiscordCommands(env, { guildId });
      await setBotCommandSyncMeta(env, {
        syncedAt: Date.now(),
        syncedBy: user.username || user.id,
        scope: "guild",
        guildId,
        ok: syncRes.ok,
        httpStatus: syncRes.status,
        commandCount: syncRes.ok ? syncRes.commands.length : 0,
        commandNames: syncRes.ok ? syncRes.commands.map((c) => c.name) : [],
        ...(syncRes.error ? { error: syncRes.error } : {}),
      });
      if (!syncRes.ok) {
        return json({ ok: false, error: syncRes.error || "Guild command sync failed." }, 502);
      }
      const botState = await buildBotStatePayload(false, true);
      return json({
        ok: true,
        action: "sync",
        guildId,
        registeredCount: syncRes.commands.length,
        botState,
      });
    }

    if (method === "POST" && url.pathname === "/api/admin/bot/register-commands") {
      let body: any = {};
      try {
        body = await request.json();
      } catch {
        body = {};
      }
      const guildId =
        typeof body?.guildId === "string" && /^\d{17,20}$/.test(body.guildId.trim())
          ? body.guildId.trim()
          : undefined;

      const syncResult = await syncDiscordCommands(env, guildId ? { guildId } : undefined);
      const syncMeta = await setBotCommandSyncMeta(env, {
        syncedAt: Date.now(),
        syncedBy: user.username || user.id,
        scope: syncResult.scope,
        ...(syncResult.guildId ? { guildId: syncResult.guildId } : {}),
        ok: syncResult.ok,
        httpStatus: syncResult.status,
        commandCount: syncResult.ok ? syncResult.commands.length : 0,
        commandNames: syncResult.ok ? syncResult.commands.map((c) => c.name) : [],
        ...(syncResult.error ? { error: syncResult.error } : {}),
      });

      if (!syncResult.ok) {
        return json(
          {
            ok: false,
            error: syncResult.error || "Failed to register slash commands with Discord.",
            status: syncResult.status,
            syncMeta,
          },
          syncResult.status >= 400 && syncResult.status < 500 ? syncResult.status : 502
        );
      }

      const botState = await buildBotStatePayload(false, false);
      return json({
        ok: true,
        scope: syncResult.scope,
        registeredCount: syncResult.commands.length,
        syncMeta,
        botState,
      });
    }

    if (method === "POST" && url.pathname === "/api/admin/bot/refresh") {
      let body: any = {};
      try {
        body = await request.json();
      } catch {
        body = {};
      }

      const doCommands = body?.syncCommands !== false;
      const doGuilds = body?.refreshGuilds !== false;
      const doWidgets = body?.refreshWidgets !== false;
      const doCaches = body?.purgeCaches !== false;

      let commandStep: {
        ran: boolean;
        ok: boolean;
        count: number;
        error?: string;
      } = { ran: false, ok: true, count: 0 };

      if (doCommands) {
        const syncResult = await syncDiscordCommands(env);
        await setBotCommandSyncMeta(env, {
          syncedAt: Date.now(),
          syncedBy: user.username || user.id,
          scope: "global",
          ok: syncResult.ok,
          httpStatus: syncResult.status,
          commandCount: syncResult.ok ? syncResult.commands.length : 0,
          commandNames: syncResult.ok ? syncResult.commands.map((c) => c.name) : [],
          ...(syncResult.error ? { error: syncResult.error } : {}),
        });
        commandStep = {
          ran: true,
          ok: syncResult.ok,
          count: syncResult.commands.length,
          ...(syncResult.error ? { error: syncResult.error } : {}),
        };
      }

      let guildsRefreshedCount = 0;
      if (doGuilds && env.DISCORD_BOT_TOKEN) {
        await clearBotGuildsCache(env);
        const refreshed = await getBotGuilds(env, true);
        guildsRefreshedCount = refreshed.length;
      }

      let widgetResult = { refreshed: 0, skipped: 0, failed: 0 };
      if (doWidgets) {
        widgetResult = await refreshAllWidgets(env, resolvePublicOrigin(env, origin), {
          force: true,
          trigger: "bot-refresh",
        });
      }

      if (doCaches) {
        await purgePublicEdgeCaches(resolvePublicOrigin(env, origin));
      }

      await checkBotHealthSnapshot(env, true);
      const botState = await buildBotStatePayload(false, Boolean(body?.checkAvailability));
      const overallOk = commandStep.ok;

      return json(
        {
          ok: overallOk,
          refreshedAt: Date.now(),
          error: commandStep.error || null,
          steps: {
            commands: commandStep,
            guilds: { ran: doGuilds, count: guildsRefreshedCount },
            widgets: { ran: doWidgets, ...widgetResult },
            caches: { ran: doCaches },
          },
          botState,
        },
        overallOk ? 200 : 502
      );
    }
  }

  return json({ error: "Not found" }, 404);
}

