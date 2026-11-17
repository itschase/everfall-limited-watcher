import {
  appendDeliveryLog,
  DEFAULT_EMBED_CONFIG,
  EmbedConfig,
  getAllGuildIds,
  getDeliveryLogs,
  getEmbedConfig,
  getGuildConfig,
  getListingHistory,
  getMonitorStatus,
  isListingSentToGuild,
  ListingRecord,
  MonitorStatus,
  setEmbedConfig,
  setGuildConfig,
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
  resolvePublicOrigin,
  sendDiscordChannelMessage,
} from "./scraper";

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

function getBotStatus(env: any, monitorStatus: MonitorStatus | null): "online" | "checking" | "degraded" | "offline" {
  if (!env.DISCORD_BOT_TOKEN) return "offline";
  if (monitorStatus?.isChecking) return "checking";
  if (monitorStatus && monitorStatus.authoritative === false) return "degraded";
  return "online";
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

  // 2. Public Limited Drops Showcase (strictly capped at newest 10 records)
  if (method === "GET" && url.pathname === "/api/public/listings") {
    await ensureHistoricalKnownListingsPreserved(env, origin);
    const [history, monitorStatus] = await Promise.all([
      getListingHistory(env),
      getMonitorStatus(env),
    ]);

    const sorted = [...history].sort((a, b) => b.firstSeenAt - a.firstSeenAt);
    const limited = sorted.slice(0, 10).map(serializeListing);
    const availableCount = sorted.filter((item) => item.isAvailable).length;
    const soldOutCount = sorted.filter((item) => !item.isAvailable).length;

    return json({
      listings: limited,
      totalCount: sorted.length,
      availableCount,
      soldOutCount,
      hasMoreArchive: sorted.length > 10,
      botStatus: getBotStatus(env, monitorStatus),
      monitorStatus,
      lastCheckedAt: monitorStatus?.checkedAt ?? null,
      lastSuccessAt: monitorStatus?.lastSuccessAt ?? null,
    });
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

      const [history, monitorStatus, embedConfig, deliveryLogs, botGuilds, allGuildIds] =
        await Promise.all([
          getListingHistory(env),
          getMonitorStatus(env),
          getEmbedConfig(env),
          getDeliveryLogs(env),
          getBotGuilds(env, forceRefresh),
          getAllGuildIds(env),
        ]);

      const botGuildMap = new Map(botGuilds.map((g) => [g.id, g]));
      const guildIdSet = new Set([...botGuilds.map((g) => g.id), ...allGuildIds]);

      const connectedGuilds = await Promise.all(
        [...guildIdSet].map(async (guildId) => {
          const cfg = await getGuildConfig(env, guildId);
          const botGuild = botGuildMap.get(guildId);
          const sentMap: Record<string, boolean> = {};
          await Promise.all(
            history.slice(0, 15).map(async (record) => {
              sentMap[record.id] = await isListingSentToGuild(env, guildId, record.id);
            })
          );
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
            sentListingIds: sentMap,
          };
        })
      );

      connectedGuilds.sort((a, b) => a.name.localeCompare(b.name));
      const serializedListings = [...history]
        .sort((a, b) => b.firstSeenAt - a.firstSeenAt)
        .map(serializeListing);

      return json({
        botStatus: getBotStatus(env, monitorStatus),
        monitorStatus,
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
          String(body?.titlePrefix || "").trim().slice(0, 120) || DEFAULT_EMBED_CONFIG.titlePrefix,
        footerText:
          String(body?.footerText || "").trim().slice(0, 180) || DEFAULT_EMBED_CONFIG.footerText,
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
      const monitorStatus = await getMonitorStatus(env);
      const history = await getListingHistory(env);
      return json({
        ok: true,
        usedVerifiedStoreResponse: result.usedVerifiedStoreResponse,
        newDiscoveries: result.newDiscoveries,
        notice: result.notice || null,
        monitorStatus,
        listings: [...history].sort((a, b) => b.firstSeenAt - a.firstSeenAt).map(serializeListing),
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
  }

  return json({ error: "Not found" }, 404);
}
