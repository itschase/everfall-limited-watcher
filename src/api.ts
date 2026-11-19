import {
  appendDeliveryLog,
  BotCommandSyncMeta,
  DEFAULT_EMBED_CONFIG,
  deleteWidgetDeployment,
  EmbedConfig,
  getAllGuildIds,
  getAllWidgetGuildIds,
  getBotCommandSyncMeta,
  getCatalogSnapshot,
  getDeliveryLogs,
  getEmbedConfig,
  getGuildConfig,
  getGuildSentMessages,
  getListingHistory,
  getMonitorLogs,
  getMonitorStatus,
  getWidgetDeployment,
  ListingRecord,
  MonitorStatus,
  purgeListingMediaEdgeCaches,
  purgePublicEdgeCaches,
  setBotCommandSyncMeta,
  setEmbedConfig,
  setGuildConfig,
  updateListingImages,
} from "./kv";
import {
  BOT_PERMISSIONS,
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
  dispatchListingToGuild,
  ensureHistoricalKnownListingsPreserved,
  manualScanStoreOnly,
  refreshAllWidgets,
  resolvePublicOrigin,
  sendDiscordChannelMessage,
  updateSentListingEmbedForGuild,
} from "./scraper";
import { fetchDiscordWithRetry } from "./discord";
import {
  COMMANDS,
  compareDiscordCommands,
  fetchBotApplicationInfo,
  fetchLiveDiscordCommands,
  syncDiscordCommands,
} from "./register";

const NO_STORE_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
  Vary: "Cookie",
};

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

function getBotStatus(env: any, _monitorStatus?: MonitorStatus | null): "online" | "offline" {
  return env.DISCORD_BOT_TOKEN ? "online" : "offline";
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

function serializeListing(record: ListingRecord) {
  return {
    id: record.id,
    name: record.payload?.name || `Limited Vehicle #${record.id}`,
    description: record.payload?.description || "Limited-edition vehicle listing on Everfall Store.",
    url: record.payload?.url || `https://store.everfallcommunity.com/package/${record.id}`,
    images: Array.isArray(record.payload?.images) ? record.payload.images : [],
    isAvailable: record.isAvailable,
    detectedAt: record.firstSeenAt,
    lastVerifiedAt: record.lastVerifiedAt || record.lastSeenAt || record.firstSeenAt,
    soldOutAt: record.soldOutAt ?? null,
    lastHttpStatus: record.lastHttpStatus ?? null,
    readiness: getReadinessStatus(record),
  };
}

async function getCurrentSessionUser(request: Request, env: any): Promise<SessionUser | null> {
  return verifySessionCookie(
    request.headers.get("Cookie"),
    getSessionSecret(env),
    env.DISCORD_PRIMARY_ADMINISTRATOR
  );
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
    const [user, storedCreatorProfile, monitorStatus] = await Promise.all([
      getCurrentSessionUser(request, env),
      getCreatorProfile(env),
      getMonitorStatus(env),
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
    const appId = env.DISCORD_APPLICATION_ID || env.DISCORD_CLIENT_ID || "1571958001928245378";
    const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(appId)}&permissions=${BOT_PERMISSIONS}&integration_type=0&scope=bot+applications.commands`;

    return json({
      authenticated: Boolean(user),
      user,
      appId,
      inviteUrl,
      creatorProfile,
      botStatus: getBotStatus(env, monitorStatus),
      monitorStatus,
      publicOrigin: resolvePublicOrigin(env, origin),
    });
  }

  // 1b. Lightweight Public Monitor Heartbeat & Catalog Version (1 KV read, edge-cached & busted on cron)
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

    let monitorStatus = await getMonitorStatus(env);
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
        botStatus: getBotStatus(env, monitorStatus),
        monitorStatus,
        lastCheckedAt: monitorStatus?.checkedAt ?? null,
        lastSuccessAt: monitorStatus?.lastSuccessAt ?? null,
        authoritative: monitorStatus?.authoritative ?? null,
        catalogVersion,
        totalCount: listingSummary.total,
        availableCount: listingSummary.available,
        soldOutCount: listingSummary.soldOut,
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
    const [snapshot, monitorStatus] = await Promise.all([
      getCatalogSnapshot(env),
      getMonitorStatus(env),
    ]);

    const sorted = [...snapshot.records].sort((a, b) => b.firstSeenAt - a.firstSeenAt);
    const limited = sorted.slice(0, 10).map(serializeListing);
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
        botStatus: getBotStatus(env, monitorStatus),
        monitorStatus,
        lastCheckedAt: monitorStatus?.checkedAt ?? null,
        lastSuccessAt: monitorStatus?.lastSuccessAt ?? null,
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
    const [history, monitorStatus] = await Promise.all([
      getListingHistory(env),
      getMonitorStatus(env),
    ]);

    const query = (url.searchParams.get("q") || "").trim().toLowerCase();
    const statusFilter = url.searchParams.get("status") || "all";
    const page = Math.max(1, Number(url.searchParams.get("page") || "1") || 1);
    const pageSize = Math.min(48, Math.max(1, Number(url.searchParams.get("pageSize") || "12") || 12));

    const allSerialized = [...history]
      .sort((a, b) => b.firstSeenAt - a.firstSeenAt)
      .map(serializeListing);

    const counts = {
      all: allSerialized.length,
      inStock: allSerialized.filter((item) => item.isAvailable).length,
      soldOut: allSerialized.filter((item) => !item.isAvailable).length,
    };

    const filtered = allSerialized.filter((item) => {
      if (statusFilter === "in_stock" && !item.isAvailable) return false;
      if (statusFilter === "sold_out" && item.isAvailable) return false;
      if (query) {
        const matchesName = item.name.toLowerCase().includes(query);
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
      botStatus: getBotStatus(env, monitorStatus),
      monitorStatus,
    });
  }

  // 4. User Managed Servers List
  if (method === "GET" && url.pathname === "/api/dashboard/servers") {
    if (!user) return json({ error: "Authentication required." }, 401);

    const forceRefresh = url.searchParams.get("refresh") === "1";
    const appId = env.DISCORD_APPLICATION_ID || env.DISCORD_CLIENT_ID || "1571958001928245378";
    const [managedGuilds, botGuilds] = await Promise.all([
      getManagedGuildsForUser(env, user.id),
      getBotGuilds(env, forceRefresh),
    ]);
    const botGuildIds = new Set(botGuilds.map((g) => g.id));
    const botOnline = Boolean(env.DISCORD_BOT_TOKEN);

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
        const channelMissing = Boolean(config?.channelId) && isInstalled && !controls.error && !configuredChannel;

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
          },
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

  // Administrator-only endpoints below
  if (url.pathname.startsWith("/api/admin/")) {
    if (!user) return json({ error: "Authentication required." }, 401);
    if (!user.isAdmin) return json({ error: "Master administrator access required." }, 403);

    // 7. Admin Overview & Shared Data
    if (method === "GET" && url.pathname === "/api/admin/overview") {
      await ensureHistoricalKnownListingsPreserved(env, origin);
      const forceRefresh = url.searchParams.get("refresh") === "1";

      const [snapshot, monitorStatus, monitorLogs, embedConfig, deliveryLogs, botGuilds, allGuildIds] =
        await Promise.all([
          getCatalogSnapshot(env),
          getMonitorStatus(env),
          getMonitorLogs(env),
          getEmbedConfig(env),
          getDeliveryLogs(env),
          getBotGuilds(env, forceRefresh),
          getAllGuildIds(env),
        ]);
      const history = snapshot.records;

      const botGuildMap = new Map(botGuilds.map((g) => [g.id, g]));
      const guildIdSet = new Set([...botGuilds.map((g) => g.id), ...allGuildIds]);

      const connectedGuilds = await Promise.all(
        [...guildIdSet].map(async (guildId) => {
          const [cfg, sentMessages, widget] = await Promise.all([
            getGuildConfig(env, guildId),
            getGuildSentMessages(env, guildId),
            getWidgetDeployment(env, guildId),
          ]);
          const botGuild = botGuildMap.get(guildId);
          const sentListingIds: Record<string, boolean> = {};
          for (const listingId of Object.keys(sentMessages)) {
            sentListingIds[listingId] = true;
          }
          const iconUrl = botGuild?.icon
            ? `https://cdn.discordapp.com/icons/${encodeURIComponent(guildId)}/${encodeURIComponent(botGuild.icon)}.png?size=64`
            : null;
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
            sentListingIds,
            sentMessages,
            widget,
          };
        })
      );

      connectedGuilds.sort((a, b) => a.name.localeCompare(b.name));
      const serializedListings = [...history]
        .sort((a, b) => b.firstSeenAt - a.firstSeenAt)
        .map(serializeListing);

      return json({
        botStatus: getBotStatus(env, monitorStatus),
        catalogVersion: snapshot.version,
        monitorStatus,
        monitorLogs,
        embedConfig,
        deliveryLogs,
        connectedGuilds,
        listings: serializedListings,
        stats: {
          totalListings: serializedListings.length,
          availableListings: serializedListings.filter((l) => l.isAvailable).length,
          soldOutListings: serializedListings.filter((l) => !l.isAvailable).length,
          connectedServers: connectedGuilds.length,
          configuredServers: connectedGuilds.filter((g) => g.configured).length,
          testServers: connectedGuilds.filter((g) => g.environment === "test").length,
          recentFailures: deliveryLogs.filter((d) => d.status === "failed").length,
        },
      });
    }

    // 7b. Ultra-light Admin Monitor Delta Endpoint (1 KV read when idle)
    if (method === "GET" && url.pathname === "/api/admin/monitor/updates") {
      const sinceCheckedAt = Number(url.searchParams.get("checkedAt") || "0") || 0;
      const sinceCatalogVersion = Number(url.searchParams.get("catalogVersion") || "0") || 0;

      const monitorStatus = await getMonitorStatus(env);
      const currentCheckedAt = monitorStatus?.checkedAt ?? 0;
      const currentCatalogVersion = monitorStatus?.catalogVersion ?? 0;
      const botStatus = getBotStatus(env, monitorStatus);

      if (
        sinceCheckedAt > 0 &&
        currentCheckedAt === sinceCheckedAt &&
        currentCatalogVersion === sinceCatalogVersion
      ) {
        return json({
          changed: false,
          botStatus,
          checkedAt: monitorStatus?.checkedAt ?? null,
          catalogVersion: currentCatalogVersion,
        });
      }

      const needListings = sinceCatalogVersion === 0 || currentCatalogVersion !== sinceCatalogVersion;
      const [monitorLogs, snapshot] = await Promise.all([
        getMonitorLogs(env),
        needListings ? getCatalogSnapshot(env) : Promise.resolve(null),
      ]);

      return json({
        changed: true,
        botStatus,
        monitorStatus,
        monitorLogs,
        catalogVersion: snapshot?.version ?? currentCatalogVersion,
        ...(snapshot
          ? {
              listings: [...snapshot.records]
                .sort((a, b) => b.firstSeenAt - a.firstSeenAt)
                .map(serializeListing),
            }
          : {}),
      });
    }

    // 8. Save Global Embed Config
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

      await setEmbedConfig(env, nextConfig);
      return json({ ok: true, embedConfig: nextConfig, savedAt: Date.now() });
    }

    // 9. Read-Only Manual Store Scan (never publishes Discord alerts)
    if (method === "POST" && url.pathname === "/api/admin/monitor/scan") {
      const result = await manualScanStoreOnly(env, origin);
      const [monitorStatus, monitorLogs, snapshot] = await Promise.all([
        getMonitorStatus(env),
        getMonitorLogs(env),
        getCatalogSnapshot(env),
      ]);
      return json({
        ok: true,
        usedVerifiedStoreResponse: result.usedVerifiedStoreResponse,
        newDiscoveries: result.newDiscoveries,
        notice: result.notice || null,
        catalogVersion: snapshot.version,
        monitorStatus,
        monitorLogs,
        listings: [...snapshot.records].sort((a, b) => b.firstSeenAt - a.firstSeenAt).map(serializeListing),
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

    // 13. Manually Edit / Update Deployed Discord Embeds In-Place
    if (method === "POST" && url.pathname === "/api/admin/dispatch/edit") {
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
      const guildIds = Array.from(new Set<string>(rawGuildIds));

      if (!listingId) return json({ error: "Select a vehicle listing to update." }, 400);
      if (guildIds.length === 0) {
        return json({ error: "Select at least one destination server." }, 400);
      }

      const history = await getListingHistory(env);
      const record = history.find((item) => item.id === listingId);
      if (!record) return json({ error: "Selected vehicle listing could not be found." }, 404);

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
        skippedNotSent?: boolean;
        messageId?: string;
        channelId?: string;
        error?: string;
      }> = [];

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
        results.push({ guildId, ...res });
      }

      const deliveryLogs = await getDeliveryLogs(env);
      return json({
        ok: true,
        results,
        updatedCount: results.filter((r) => r.ok).length,
        skippedCount: results.filter((r) => r.skippedNotSent).length,
        failedCount: results.filter((r) => !r.ok && !r.skippedNotSent).length,
        deliveryLogs,
      });
    }

    // 14. Admin Widget Controls (Refresh All / Remove Guild Widget)
    if (method === "POST" && url.pathname === "/api/admin/widgets/refresh") {
      const result = await refreshAllWidgets(env, origin);
      return json({
        ok: true,
        ...result,
        refreshedAt: Date.now(),
      });
    }

    const deleteWidgetMatch = url.pathname.match(/^\/api\/admin\/widgets\/(\d{17,20})$/);
    if (deleteWidgetMatch && method === "DELETE") {
      const guildId = deleteWidgetMatch[1];
      const existingWidget = await getWidgetDeployment(env, guildId);
      if (existingWidget?.channelId && existingWidget?.messageId && env.DISCORD_BOT_TOKEN) {
        await fetchDiscordWithRetry(
          `https://discord.com/api/v10/channels/${existingWidget.channelId}/messages/${existingWidget.messageId}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
          }
        ).catch(() => null);
      }
      await deleteWidgetDeployment(env, guildId);
      return json({ ok: true, guildId });
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

    // 16. Bot Control Center (Inspect Bot, Slash Command Sync, Guild Cache & Widget Refresh)
    const buildBotStatePayload = async (forceRefreshGuilds = false) => {
      const [identity, liveCommandsRes, syncMeta, botGuilds, widgetGuildIds, monitorStatus] =
        await Promise.all([
          fetchBotApplicationInfo(env),
          fetchLiveDiscordCommands(env),
          getBotCommandSyncMeta(env),
          env.DISCORD_BOT_TOKEN ? getBotGuilds(env, forceRefreshGuilds) : Promise.resolve([]),
          getAllWidgetGuildIds(env),
          getMonitorStatus(env),
        ]);

      const comparison = compareDiscordCommands(liveCommandsRes.commands);

      return {
        ok: true,
        botStatus: getBotStatus(env, monitorStatus),
        identity,
        liveCommandsOk: liveCommandsRes.ok,
        liveCommandsError: liveCommandsRes.error || null,
        totalLocalCommands: COMMANDS.length,
        totalRemoteCommands: liveCommandsRes.commands.length,
        ...comparison,
        syncMeta,
        environment: {
          botTokenConfigured: Boolean(env.DISCORD_BOT_TOKEN),
          publicKeyConfigured: Boolean(env.DISCORD_PUBLIC_KEY),
          clientSecretConfigured: Boolean(env.DISCORD_CLIENT_SECRET),
          kvBound: Boolean(env.DISCORD_BOT),
          r2Bound: Boolean(env.MEDIA_BUCKET),
          publicOrigin: resolvePublicOrigin(env, origin),
          interactionsUrl: `${resolvePublicOrigin(env, origin)}/interactions`,
        },
        counts: {
          connectedServers: botGuilds.length,
          deployedWidgets: widgetGuildIds.length,
        },
      };
    };

    if (method === "GET" && url.pathname === "/api/admin/bot") {
      const payload = await buildBotStatePayload(false);
      return json(payload);
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
      const syncMeta: BotCommandSyncMeta = {
        syncedAt: Date.now(),
        syncedBy: user.username || user.id,
        scope: syncResult.scope,
        ...(syncResult.guildId ? { guildId: syncResult.guildId } : {}),
        ok: syncResult.ok,
        httpStatus: syncResult.status,
        commandCount: syncResult.ok ? syncResult.commands.length : 0,
        commandNames: syncResult.ok ? syncResult.commands.map((c) => c.name) : [],
        ...(syncResult.error ? { error: syncResult.error } : {}),
      };
      await setBotCommandSyncMeta(env, syncMeta);

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

      const botState = await buildBotStatePayload(false);
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
        const syncMeta: BotCommandSyncMeta = {
          syncedAt: Date.now(),
          syncedBy: user.username || user.id,
          scope: "global",
          ok: syncResult.ok,
          httpStatus: syncResult.status,
          commandCount: syncResult.ok ? syncResult.commands.length : 0,
          commandNames: syncResult.ok ? syncResult.commands.map((c) => c.name) : [],
          ...(syncResult.error ? { error: syncResult.error } : {}),
        };
        await setBotCommandSyncMeta(env, syncMeta);
        commandStep = {
          ran: true,
          ok: syncResult.ok,
          count: syncResult.commands.length,
          ...(syncResult.error ? { error: syncResult.error } : {}),
        };
      }

      let guildsRefreshedCount = 0;
      if (doGuilds && env.DISCORD_BOT_TOKEN) {
        const kv = env.DISCORD_BOT as KVNamespace | undefined;
        if (kv) await kv.delete("discord:bot_guilds").catch(() => null);
        const refreshed = await getBotGuilds(env, true);
        guildsRefreshedCount = refreshed.length;
      }

      let widgetResult = { refreshed: 0, failed: 0 };
      if (doWidgets) {
        widgetResult = await refreshAllWidgets(env, resolvePublicOrigin(env, origin));
      }

      if (doCaches) {
        await purgePublicEdgeCaches(resolvePublicOrigin(env, origin));
      }

      const botState = await buildBotStatePayload(false);
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

