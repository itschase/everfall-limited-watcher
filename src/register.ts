import { fetchDiscordWithRetry } from "./discord";
import { BotHealthSnapshot, getBotHealthSnapshot, setBotHealthSnapshot } from "./kv";
import type { DiscordEmojiRef } from "./shared/presentation";

const BOT_HEALTH_SNAPSHOT_TTL_MS = 5 * 60 * 1000;
const botHealthMemoryCache = new Map<string, BotHealthSnapshot>();
const inFlightBotHealthChecks = new Map<string, Promise<BotHealthSnapshot>>();

export const COMMANDS = [
  {
    name: "setup",
    type: 1,
    description: "Configure the channel for Everfall limited drop alerts",
    default_member_permissions: "32", // MANAGE_GUILD
    integration_types: [0],
    contexts: [0],
    options: [
      {
        name: "channel",
        description: "Channel to post alerts in",
        type: 7, // CHANNEL
        required: true,
      },
    ],
  },
  {
    name: "add-role",
    type: 1,
    description: "Add a role to ping when a limited drop occurs",
    default_member_permissions: "32", // MANAGE_GUILD
    integration_types: [0],
    contexts: [0],
    options: [
      {
        name: "role",
        description: "Role to mention",
        type: 8, // ROLE
        required: true,
      },
    ],
  },
  {
    name: "remove-role",
    type: 1,
    description: "Remove a role from drop notifications",
    default_member_permissions: "32", // MANAGE_GUILD
    integration_types: [0],
    contexts: [0],
    options: [
      {
        name: "role",
        description: "Role to remove",
        type: 8, // ROLE
        required: true,
      },
    ],
  },
  {
    name: "check",
    type: 1,
    description: "Manually check the Everfall store for limited car stock",
    integration_types: [0],
    contexts: [0],
  },
  {
    name: "widget",
    type: 1,
    description:
      "Preview & deploy an auto-updating live Everfall stock & recent drops widget embed here",
    default_member_permissions: "32", // MANAGE_GUILD
    integration_types: [0],
    contexts: [0],
  },
  {
    name: "help",
    type: 1,
    description: "View Everfall Limited Watcher setup and commands",
    integration_types: [0],
    contexts: [0],
  },
];

export interface DiscordCommandOptionDef {
  name: string;
  description: string;
  type: number;
  required?: boolean;
}

export interface DiscordCommandDef {
  name: string;
  type?: number;
  description: string;
  default_member_permissions?: string;
  integration_types?: number[];
  contexts?: number[];
  options?: DiscordCommandOptionDef[];
}

export interface LiveDiscordCommand {
  id: string;
  application_id: string;
  version?: string;
  type?: number;
  name: string;
  description: string;
  default_member_permissions?: string | null;
  integration_types?: number[];
  contexts?: number[];
  options?: DiscordCommandOptionDef[];
}

export interface BotIdentityInfo {
  ok: boolean;
  appId: string;
  envAppId: string;
  appIdMismatch: boolean;
  botUser: {
    id: string;
    username: string;
    globalName: string | null;
    avatarUrl: string | null;
  } | null;
  application: {
    id: string;
    name: string;
    description: string;
    interactionsEndpointUrl: string | null;
    botPublic: boolean | null;
    installScopes: string[];
    guildInstallScopes: string[];
    hasGuildCommandsInstallScope: boolean | null;
  } | null;
  error?: string;
}

export interface GuildCommandAvailabilityItem {
  guildId: string;
  guildName: string;
  hasCommandsScope: boolean;
  httpStatus: number;
  guildCommandCount: number;
  widgetStatus:
    | "available_global"
    | "available_guild"
    | "duplicate_conflict"
    | "missing_scope"
    | "missing_command"
    | "error";
  detail: string;
  guildCommandNames: string[];
  hasDuplicateWidget?: boolean;
  hasStaleGuildOverrides?: boolean;
  guildWidgetOutdated?: boolean;
}

export interface BotReadinessCheck {
  id: string;
  label: string;
  category: "registration" | "execution" | "availability";
  status: "pass" | "warn" | "fail";
  summary: string;
  remediation?: string;
}

export function getDiscordApplicationId(env: any): string {
  return String(env.DISCORD_APPLICATION_ID || env.DISCORD_CLIENT_ID || "1571958001928245378").trim();
}

export async function fetchBotApplicationInfo(env: any): Promise<BotIdentityInfo> {
  const token = env.DISCORD_BOT_TOKEN;
  const envAppId = getDiscordApplicationId(env);

  if (!token) {
    return {
      ok: false,
      appId: envAppId,
      envAppId,
      appIdMismatch: false,
      botUser: null,
      application: null,
      error: "DISCORD_BOT_TOKEN secret is not configured in this environment.",
    };
  }

  try {
    const [userRes, appRes] = await Promise.all([
      fetchDiscordWithRetry("https://discord.com/api/v10/users/@me", {
        headers: { Authorization: `Bot ${token}` },
      }),
      fetchDiscordWithRetry("https://discord.com/api/v10/applications/@me", {
        headers: { Authorization: `Bot ${token}` },
      }),
    ]);

    let botUser: BotIdentityInfo["botUser"] = null;
    if (userRes.ok) {
      const userData: any = await userRes.json();
      const avatarHash = userData?.avatar;
      botUser = {
        id: String(userData?.id || envAppId),
        username: String(userData?.username || "Everfall Watcher"),
        globalName: userData?.global_name ? String(userData.global_name) : null,
        avatarUrl:
          avatarHash && userData?.id
            ? `https://cdn.discordapp.com/avatars/${userData.id}/${avatarHash}.png?size=128`
            : null,
      };
    }

    let application: BotIdentityInfo["application"] = null;
    if (appRes.ok) {
      const appData: any = await appRes.json();
      const installScopes: string[] = Array.isArray(appData?.install_params?.scopes)
        ? appData.install_params.scopes.map(String)
        : [];
      const guildInstallParams = appData?.integration_types_config?.["0"]?.oauth2_install_params;
      const guildInstallScopes: string[] = Array.isArray(guildInstallParams?.scopes)
        ? guildInstallParams.scopes.map(String)
        : installScopes;
      const hasGuildCommandsInstallScope =
        guildInstallScopes.length > 0
          ? guildInstallScopes.includes("applications.commands") && guildInstallScopes.includes("bot")
          : null;

      application = {
        id: String(appData?.id || envAppId),
        name: String(appData?.name || "Everfall Limited Watcher"),
        description: String(appData?.description || ""),
        interactionsEndpointUrl: appData?.interactions_endpoint_url
          ? String(appData.interactions_endpoint_url)
          : null,
        botPublic: typeof appData?.bot_public === "boolean" ? appData.bot_public : null,
        installScopes,
        guildInstallScopes,
        hasGuildCommandsInstallScope,
      };
    }

    const authoritativeAppId = application?.id || botUser?.id || envAppId;
    const appIdMismatch = Boolean(envAppId && authoritativeAppId && envAppId !== authoritativeAppId);

    if (!userRes.ok) {
      const errBody = await userRes.text().catch(() => "");
      return {
        ok: false,
        appId: authoritativeAppId,
        envAppId,
        appIdMismatch,
        botUser,
        application,
        error: `Discord bot authentication returned HTTP ${userRes.status}${errBody ? `: ${errBody.slice(0, 180)}` : ""}`,
      };
    }

    return {
      ok: true,
      appId: authoritativeAppId,
      envAppId,
      appIdMismatch,
      botUser,
      application,
    };
  } catch (err: any) {
    return {
      ok: false,
      appId: envAppId,
      envAppId,
      appIdMismatch: false,
      botUser: null,
      application: null,
      error: err?.message || "Failed to reach Discord API.",
    };
  }
}

export async function resolveAuthoritativeAppId(env: any): Promise<string> {
  if (!env.DISCORD_BOT_TOKEN) return getDiscordApplicationId(env);
  const info = await fetchBotApplicationInfo(env);
  return info.appId || getDiscordApplicationId(env);
}

export async function checkBotHealthSnapshot(
  env: any,
  forceRefresh = false
): Promise<BotHealthSnapshot> {
  if (!env.DISCORD_BOT_TOKEN) {
    return {
      verified: true,
      online: false,
      checkedAt: Date.now(),
      error: "DISCORD_BOT_TOKEN is not configured.",
    };
  }

  const cacheKey = `${env.PUBLIC_ORIGIN || "local"}:${getDiscordApplicationId(env)}`;
  const forcedKey = `${cacheKey}:forced`;
  if (!forceRefresh) {
    const forcedRefresh = inFlightBotHealthChecks.get(forcedKey);
    if (forcedRefresh) return forcedRefresh;
  }
  const requestKey = `${cacheKey}:${forceRefresh ? "forced" : "normal"}`;
  const pending = inFlightBotHealthChecks.get(requestKey);
  if (pending) return pending;

  const memoryCached = botHealthMemoryCache.get(cacheKey);
  if (
    !forceRefresh &&
    memoryCached &&
    Date.now() - memoryCached.checkedAt < BOT_HEALTH_SNAPSHOT_TTL_MS
  ) {
    return memoryCached;
  }

  const task = (async (): Promise<BotHealthSnapshot> => {
    if (!forceRefresh) {
      try {
        const persisted = await getBotHealthSnapshot(env);
        if (persisted) {
          botHealthMemoryCache.set(cacheKey, persisted);
          if (Date.now() - persisted.checkedAt < BOT_HEALTH_SNAPSHOT_TTL_MS) {
            return persisted;
          }
        }
      } catch (error) {
        console.warn("Failed to read bot health snapshot; refreshing Discord status:", error);
      }
    }

    const info = await fetchBotApplicationInfo(env);
    const snapshot: BotHealthSnapshot = {
      verified: true,
      online: info.ok,
      checkedAt: Date.now(),
      appId: info.appId,
      botUsername: info.botUser?.username,
      ...(info.error ? { error: info.error } : {}),
    };
    botHealthMemoryCache.set(cacheKey, snapshot);
    try {
      await setBotHealthSnapshot(env, snapshot);
    } catch (error) {
      console.warn("Failed to persist bot health snapshot; using the in-memory result:", error);
    }
    return snapshot;
  })();

  inFlightBotHealthChecks.set(requestKey, task);
  try {
    return await task;
  } catch (error) {
    const previous = botHealthMemoryCache.get(cacheKey);
    if (previous) {
      console.error("Bot health refresh failed; serving the last known snapshot:", error);
      return previous;
    }
    throw error;
  } finally {
    if (inFlightBotHealthChecks.get(requestKey) === task) {
      inFlightBotHealthChecks.delete(requestKey);
    }
  }
}

export async function fetchLiveDiscordCommands(
  env: any,
  guildId?: string,
  appIdOverride?: string
): Promise<{
  ok: boolean;
  httpStatus: number;
  appId: string;
  commands: LiveDiscordCommand[];
  error?: string;
}> {
  const token = env.DISCORD_BOT_TOKEN;
  const appId = appIdOverride || (await resolveAuthoritativeAppId(env));

  if (!token) {
    return {
      ok: false,
      httpStatus: 400,
      appId,
      commands: [],
      error: "DISCORD_BOT_TOKEN secret is not configured in Worker environment.",
    };
  }

  const endpoint = guildId
    ? `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`
    : `https://discord.com/api/v10/applications/${appId}/commands`;

  try {
    const res = await fetchDiscordWithRetry(endpoint, {
      method: "GET",
      headers: { Authorization: `Bot ${token}` },
    });

    const parsed: any = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        httpStatus: res.status,
        appId,
        commands: [],
        error: parsed?.message || `Discord API returned HTTP ${res.status}`,
      };
    }

    return {
      ok: true,
      httpStatus: res.status,
      appId,
      commands: Array.isArray(parsed) ? parsed : [],
    };
  } catch (err: any) {
    return {
      ok: false,
      httpStatus: 502,
      appId,
      commands: [],
      error: err?.message || "Failed to query live Discord commands.",
    };
  }
}

export async function syncDiscordCommands(
  env: any,
  options?: { guildId?: string; appIdOverride?: string }
): Promise<{
  ok: boolean;
  status: number;
  appId: string;
  scope: "global" | "guild";
  guildId?: string;
  commands: LiveDiscordCommand[];
  error?: string;
  rawResult?: unknown;
}> {
  const token = env.DISCORD_BOT_TOKEN;
  const appId = options?.appIdOverride || (await resolveAuthoritativeAppId(env));
  const guildId = options?.guildId ? String(options.guildId).trim() : undefined;
  const scope: "global" | "guild" = guildId ? "guild" : "global";

  if (!token) {
    return {
      ok: false,
      status: 400,
      appId,
      scope,
      ...(guildId ? { guildId } : {}),
      commands: [],
      error: "DISCORD_BOT_TOKEN secret is not set in Worker environment.",
    };
  }

  const endpoint = guildId
    ? `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`
    : `https://discord.com/api/v10/applications/${appId}/commands`;

  try {
    const res = await fetchDiscordWithRetry(endpoint, {
      method: "PUT",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(COMMANDS),
    });

    const data: any = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        appId,
        scope,
        ...(guildId ? { guildId } : {}),
        commands: [],
        error: data?.message || `Discord returned HTTP ${res.status}`,
        rawResult: data,
      };
    }

    return {
      ok: true,
      status: res.status,
      appId,
      scope,
      ...(guildId ? { guildId } : {}),
      commands: Array.isArray(data) ? data : [],
      rawResult: data,
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 502,
      appId,
      scope,
      ...(guildId ? { guildId } : {}),
      commands: [],
      error: err?.message || "Failed to contact Discord command API.",
    };
  }
}

export async function clearGuildCommands(
  env: any,
  guildId: string,
  appIdOverride?: string
): Promise<{ ok: boolean; status: number; error?: string }> {
  const token = env.DISCORD_BOT_TOKEN;
  if (!token) return { ok: false, status: 400, error: "DISCORD_BOT_TOKEN is not configured." };
  const appId = appIdOverride || (await resolveAuthoritativeAppId(env));
  const res = await fetchDiscordWithRetry(
    `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: "[]",
    }
  );
  if (!res.ok) {
    const err: any = await res.json().catch(() => null);
    return { ok: false, status: res.status, error: err?.message || `Discord HTTP ${res.status}` };
  }
  return { ok: true, status: res.status };
}

export async function clearAllGuildCommands(
  env: any,
  guildIds: string[],
  appIdOverride?: string
): Promise<{ clearedCount: number; failedCount: number; errors: string[] }> {
  const token = env.DISCORD_BOT_TOKEN;
  if (!token) {
    return {
      clearedCount: 0,
      failedCount: guildIds.length,
      errors: ["DISCORD_BOT_TOKEN is not configured."],
    };
  }
  const appId = appIdOverride || (await resolveAuthoritativeAppId(env));
  let clearedCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  await Promise.all(
    guildIds.slice(0, 25).map(async (gid) => {
      const res = await clearGuildCommands(env, gid, appId);
      if (res.ok) {
        clearedCount++;
      } else {
        failedCount++;
        if (res.error) errors.push(`${gid}: ${res.error}`);
      }
    })
  );

  return { clearedCount, failedCount, errors };
}

export async function inspectGuildCommandAvailability(
  env: any,
  guilds: Array<{ id: string; name: string }>,
  globalCommands: LiveDiscordCommand[],
  appIdOverride?: string
): Promise<GuildCommandAvailabilityItem[]> {
  const appId = appIdOverride || (await resolveAuthoritativeAppId(env));
  const hasGlobalWidget = globalCommands.some((c) => c.name === "widget");

  return Promise.all(
    guilds.slice(0, 25).map(async (g) => {
      const guildRes = await fetchLiveDiscordCommands(env, g.id, appId);
      if (!guildRes.ok) {
        const missingScope = guildRes.httpStatus === 403;
        return {
          guildId: g.id,
          guildName: g.name,
          hasCommandsScope: !missingScope,
          httpStatus: guildRes.httpStatus,
          guildCommandCount: 0,
          widgetStatus: missingScope ? "missing_scope" : "error",
          detail: missingScope
            ? "Server was invited without applications.commands scope (HTTP 403 Missing Access). Re-authorize using the invite link."
            : guildRes.error || `Discord returned HTTP ${guildRes.httpStatus}`,
          guildCommandNames: [],
        } satisfies GuildCommandAvailabilityItem;
      }

      const guildNames = guildRes.commands.map((c) => c.name);
      const hasGuildWidget = guildNames.includes("widget");
      const guildWidgetComparison = hasGuildWidget
        ? compareDiscordCommands(guildRes.commands).comparisons.find((c) => c.name === "widget")
        : null;
      const guildWidgetOutdated = Boolean(
        guildWidgetComparison && guildWidgetComparison.syncState === "outdated"
      );
      const hasDuplicateWidget = hasGuildWidget && hasGlobalWidget;
      const hasStaleGuildOverrides = guildNames.length > 0 && (!hasGuildWidget || guildWidgetOutdated);

      let widgetStatus: GuildCommandAvailabilityItem["widgetStatus"] = "missing_command";
      let detail = "/widget is not registered globally or in this server yet.";

      if (hasDuplicateWidget) {
        widgetStatus = "duplicate_conflict";
        detail = guildWidgetOutdated
          ? "Duplicate & outdated guild /widget shadows global /widget. Clear guild overrides so Discord shows the current global /widget."
          : "Duplicate /widget registered both globally and per-guild. Clear guild overrides to avoid duplicate slash entries.";
      } else if (hasGuildWidget) {
        widgetStatus = "available_guild";
        detail = guildWidgetOutdated
          ? `Active via guild override, but schema differs from code (${guildWidgetComparison?.diffReason || "outdated"}). Sync Guild or Clear Overrides.`
          : `Active via instant guild registration (${guildNames.length} guild command${guildNames.length === 1 ? "" : "s"}).`;
      } else if (hasGlobalWidget) {
        widgetStatus = "available_global";
        detail =
          guildNames.length > 0
            ? `/widget is active globally, alongside ${guildNames.length} guild-specific command override(s) (${guildNames.join(", ")}). Consider clearing overrides if unneeded.`
            : "Active globally. Use Sync Guild only if testing instant client refresh; clear afterwards to avoid duplicates.";
      }

      return {
        guildId: g.id,
        guildName: g.name,
        hasCommandsScope: true,
        httpStatus: guildRes.httpStatus,
        guildCommandCount: guildNames.length,
        widgetStatus,
        detail,
        guildCommandNames: guildNames,
        hasDuplicateWidget,
        hasStaleGuildOverrides,
        guildWidgetOutdated,
      } satisfies GuildCommandAvailabilityItem;
    })
  );
}

export async function fetchBotEmojis(
  env: any,
  guilds: Array<{ id: string; name: string }>,
  appIdOverride?: string
): Promise<{
  applicationEmojis: DiscordEmojiRef[];
  guildEmojis: DiscordEmojiRef[];
  errors: string[];
}> {
  const token = env.DISCORD_BOT_TOKEN;
  if (!token) {
    return {
      applicationEmojis: [],
      guildEmojis: [],
      errors: ["DISCORD_BOT_TOKEN is not configured."],
    };
  }
  const appId = appIdOverride || (await resolveAuthoritativeAppId(env));
  const errors: string[] = [];
  const applicationEmojis: DiscordEmojiRef[] = [];
  const guildEmojis: DiscordEmojiRef[] = [];

  try {
    const appRes = await fetchDiscordWithRetry(
      `https://discord.com/api/v10/applications/${appId}/emojis`,
      { headers: { Authorization: `Bot ${token}` } }
    );
    if (appRes.ok) {
      const payload: any = await appRes.json();
      const items = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload) ? payload : [];
      for (const e of items) {
        if (!e?.id || !e?.name || e.available === false) continue;
        const animated = Boolean(e.animated);
        applicationEmojis.push({
          kind: "custom",
          id: String(e.id),
          name: String(e.name),
          animated,
          source: "application",
          imageUrl: `https://cdn.discordapp.com/emojis/${e.id}.${animated ? "gif" : "webp"}?size=64&quality=lossless`,
        });
      }
    } else {
      errors.push(`Application emojis returned HTTP ${appRes.status}`);
    }
  } catch (err: any) {
    errors.push(`Application emojis error: ${err?.message || "unknown"}`);
  }

  await Promise.all(
    guilds.slice(0, 15).map(async (g) => {
      try {
        const res = await fetchDiscordWithRetry(
          `https://discord.com/api/v10/guilds/${g.id}/emojis`,
          { headers: { Authorization: `Bot ${token}` } }
        );
        if (!res.ok) return;
        const items: any = await res.json();
        if (!Array.isArray(items)) return;
        for (const e of items) {
          if (!e?.id || !e?.name || e.available === false) continue;
          const animated = Boolean(e.animated);
          guildEmojis.push({
            kind: "custom",
            id: String(e.id),
            name: String(e.name),
            animated,
            source: "guild",
            guildId: g.id,
            guildName: g.name,
            imageUrl: `https://cdn.discordapp.com/emojis/${e.id}.${animated ? "gif" : "webp"}?size=64&quality=lossless`,
          });
        }
      } catch {
        // Non-fatal per guild
      }
    })
  );

  return { applicationEmojis, guildEmojis, errors };
}

function normalizeIntArray(input: unknown, fallback: number[]): number[] {
  const arr = Array.isArray(input) ? input.map((v) => Number(v)).filter(Number.isFinite) : fallback;
  return [...new Set(arr)].sort((a, b) => a - b);
}

export function compareDiscordCommands(liveCommands: LiveDiscordCommand[]) {
  const liveByName = new Map(liveCommands.map((cmd) => [cmd.name, cmd]));
  const localNames = new Set(COMMANDS.map((c) => c.name));

  const comparisons = (COMMANDS as DiscordCommandDef[]).map((local) => {
    const localType = local.type ?? 1;
    const localIntegrationTypes = normalizeIntArray(local.integration_types, [0]);
    const localContexts = normalizeIntArray(local.contexts, [0]);
    const remote = liveByName.get(local.name);
    if (!remote) {
      return {
        name: local.name,
        type: localType,
        description: local.description,
        defaultMemberPermissions: local.default_member_permissions || null,
        integrationTypes: localIntegrationTypes,
        contexts: localContexts,
        options: local.options || [],
        syncState: "missing" as const,
        liveId: null as string | null,
        liveVersion: null as string | null,
        liveDescription: null as string | null,
        diffReason: "Not registered on Discord yet",
      };
    }

    const localOpts = JSON.stringify(
      (local.options || []).map((o) => ({
        name: o.name,
        description: o.description,
        type: o.type,
        required: Boolean(o.required),
      }))
    );
    const remoteOpts = JSON.stringify(
      (remote.options || []).map((o) => ({
        name: o.name,
        description: o.description,
        type: o.type,
        required: Boolean(o.required),
      }))
    );

    const localPerm = local.default_member_permissions || null;
    const remotePerm = remote.default_member_permissions || null;
    const remoteType = remote.type ?? 1;
    const remoteIntegrationTypes = Array.isArray(remote.integration_types)
      ? normalizeIntArray(remote.integration_types, [])
      : null;
    const remoteContexts = Array.isArray(remote.contexts)
      ? normalizeIntArray(remote.contexts, [])
      : null;

    const reasons: string[] = [];
    if (localType !== remoteType) reasons.push("command type updated");
    if (local.description !== remote.description) reasons.push("description updated");
    if (localPerm !== remotePerm) reasons.push("permissions updated");
    if (
      remoteIntegrationTypes &&
      JSON.stringify(localIntegrationTypes) !== JSON.stringify(remoteIntegrationTypes)
    ) {
      reasons.push("integration_types updated");
    }
    if (remoteContexts && JSON.stringify(localContexts) !== JSON.stringify(remoteContexts)) {
      reasons.push("contexts updated");
    }
    if (localOpts !== remoteOpts) reasons.push("options updated");

    return {
      name: local.name,
      type: localType,
      description: local.description,
      defaultMemberPermissions: localPerm,
      integrationTypes: localIntegrationTypes,
      contexts: localContexts,
      options: local.options || [],
      syncState: reasons.length > 0 ? ("outdated" as const) : ("synced" as const),
      liveId: remote.id,
      liveVersion: remote.version || null,
      liveDescription: remote.description,
      diffReason: reasons.length > 0 ? reasons.join(", ") : null,
    };
  });

  const extraRemoteCommands = liveCommands
    .filter((cmd) => !localNames.has(cmd.name))
    .map((cmd) => ({
      id: cmd.id,
      name: cmd.name,
      description: cmd.description,
    }));

  const syncedCount = comparisons.filter((c) => c.syncState === "synced").length;
  const missingCount = comparisons.filter((c) => c.syncState === "missing").length;
  const outdatedCount = comparisons.filter((c) => c.syncState === "outdated").length;

  return {
    comparisons,
    extraRemoteCommands,
    syncedCount,
    missingCount,
    outdatedCount,
    allInSync: missingCount === 0 && outdatedCount === 0 && extraRemoteCommands.length === 0,
  };
}

function normalizeEndpointUrl(raw?: string | null): string {
  return String(raw || "").trim().replace(/\/+$/, "");
}

export function buildBotReadinessChecks(params: {
  identity: BotIdentityInfo;
  comparisons: ReturnType<typeof compareDiscordCommands>["comparisons"];
  availability: GuildCommandAvailabilityItem[] | null;
  expectedInteractionsUrl: string;
  botTokenConfigured: boolean;
  publicKeyConfigured: boolean;
  kvBound: boolean;
}): BotReadinessCheck[] {
  const {
    identity,
    comparisons,
    availability,
    expectedInteractionsUrl,
    botTokenConfigured,
    publicKeyConfigured,
    kvBound,
  } = params;
  const checks: BotReadinessCheck[] = [];

  if (!botTokenConfigured || !identity.ok) {
    checks.push({
      id: "app_auth",
      label: "Bot Token & Application Identity",
      category: "registration",
      status: "fail",
      summary: identity.error || "DISCORD_BOT_TOKEN is not configured.",
      remediation: "Configure DISCORD_BOT_TOKEN and DISCORD_APPLICATION_ID matching the Discord Developer Portal.",
    });
  } else if (identity.appIdMismatch) {
    checks.push({
      id: "app_auth",
      label: "Bot Token & Application Identity",
      category: "registration",
      status: "fail",
      summary: `Configured DISCORD_APPLICATION_ID (${identity.envAppId}) does not match live token App ID (${identity.appId}).`,
      remediation: "Update DISCORD_APPLICATION_ID in wrangler secrets/vars to match the authenticated bot token.",
    });
  } else {
    checks.push({
      id: "app_auth",
      label: "Bot Token & Application Identity",
      category: "registration",
      status: "pass",
      summary: `Authenticated as ${identity.botUser?.username || identity.appId} (App ID ${identity.appId}).`,
    });
  }

  const widgetComparison = comparisons.find((c) => c.name === "widget");
  if (!widgetComparison || widgetComparison.syncState === "missing") {
    checks.push({
      id: "widget_registry",
      label: "/widget Global Command Registration",
      category: "registration",
      status: "fail",
      summary: "/widget is missing from Discord's live global command registry.",
      remediation: "Click Synchronize Commands to register /widget globally with Manage Server permissions & guild context.",
    });
  } else if (widgetComparison.syncState === "outdated") {
    checks.push({
      id: "widget_registry",
      label: "/widget Global Command Registration",
      category: "registration",
      status: "warn",
      summary: `/widget is registered (ID ${widgetComparison.liveId}) but differs (${widgetComparison.diffReason}).`,
      remediation: "Click Synchronize Commands to update schema, integration_types, and contexts.",
    });
  } else {
    checks.push({
      id: "widget_registry",
      label: "/widget Global Command Registration",
      category: "registration",
      status: "pass",
      summary: `/widget synced globally (ID ${widgetComparison.liveId}, Manage Guild / Admin, Guild Context).`,
    });
  }

  const actualEndpoint = normalizeEndpointUrl(identity.application?.interactionsEndpointUrl);
  const expectedEndpoint = normalizeEndpointUrl(expectedInteractionsUrl);
  if (!identity.ok) {
    checks.push({
      id: "interactions_url",
      label: "Interactions Endpoint URL",
      category: "execution",
      status: "warn",
      summary: `Cannot verify live Discord Portal Interactions URL without a valid bot token. Expected: ${expectedInteractionsUrl}`,
      remediation: `Verify Developer Portal -> General Information -> Interactions Endpoint URL equals ${expectedInteractionsUrl}`,
    });
  } else if (!actualEndpoint) {
    checks.push({
      id: "interactions_url",
      label: "Interactions Endpoint URL",
      category: "execution",
      status: "fail",
      summary: "Discord Developer Portal has no Interactions Endpoint URL saved. Slash commands cannot execute without it.",
      remediation: `Set Interactions Endpoint URL in Discord Developer Portal to: ${expectedInteractionsUrl}`,
    });
  } else if (actualEndpoint !== expectedEndpoint) {
    checks.push({
      id: "interactions_url",
      label: "Interactions Endpoint URL",
      category: "execution",
      status: "fail",
      summary: `Portal points to "${actualEndpoint}" instead of "${expectedEndpoint}".`,
      remediation: `Update Developer Portal -> General Information -> Interactions Endpoint URL to ${expectedInteractionsUrl}`,
    });
  } else {
    checks.push({
      id: "interactions_url",
      label: "Interactions Endpoint URL",
      category: "execution",
      status: "pass",
      summary: `Portal verified pointing to ${actualEndpoint}.`,
    });
  }

  checks.push({
    id: "runtime_bindings",
    label: "Signature Verification & Storage",
    category: "execution",
    status: publicKeyConfigured && kvBound ? "pass" : "fail",
    summary:
      publicKeyConfigured && kvBound
        ? "DISCORD_PUBLIC_KEY Ed25519 verification and DISCORD_BOT Workers KV are ready."
        : `${!publicKeyConfigured ? "DISCORD_PUBLIC_KEY missing. " : ""}${!kvBound ? "DISCORD_BOT KV unbound." : ""}`.trim(),
    ...(publicKeyConfigured && kvBound
      ? {}
      : { remediation: "Bind DISCORD_BOT KV and set DISCORD_PUBLIC_KEY secret matching the Developer Portal." }),
  });

  if (identity.application?.hasGuildCommandsInstallScope === false) {
    checks.push({
      id: "portal_install_scope",
      label: "Developer Portal Default Install Scopes",
      category: "availability",
      status: "warn",
      summary: `Portal Guild Install scopes (${identity.application.guildInstallScopes.join(", ") || "none"}) omit "applications.commands" or "bot".`,
      remediation: "Developer Portal -> Installation -> Guild Install must include both bot and applications.commands scopes.",
    });
  } else if (identity.application?.hasGuildCommandsInstallScope === true) {
    checks.push({
      id: "portal_install_scope",
      label: "Developer Portal Default Install Scopes",
      category: "availability",
      status: "pass",
      summary: `Guild Install includes bot + applications.commands scopes.`,
    });
  }

  if (availability && availability.length > 0) {
    const missingScopeCount = availability.filter((g) => !g.hasCommandsScope).length;
    const duplicateCount = availability.filter((g) => g.widgetStatus === "duplicate_conflict").length;
    const missingCmdCount = availability.filter((g) => g.widgetStatus === "missing_command").length;
    const outdatedGuildCount = availability.filter((g) => g.guildWidgetOutdated).length;
    if (missingScopeCount > 0 || missingCmdCount > 0) {
      checks.push({
        id: "server_availability",
        label: "Connected Server /widget Availability",
        category: "availability",
        status: "fail",
        summary: `${missingScopeCount} server(s) lack applications.commands scope; ${missingCmdCount} server(s) missing /widget.`,
        remediation: "Re-authorize flagged servers with bot+applications.commands invite link and sync commands.",
      });
    } else if (duplicateCount > 0 || outdatedGuildCount > 0) {
      checks.push({
        id: "server_availability",
        label: "Connected Server /widget Availability",
        category: "availability",
        status: "warn",
        summary: `${duplicateCount} server(s) have duplicate global+guild /widget entries${outdatedGuildCount > 0 ? ` (${outdatedGuildCount} outdated)` : ""}.`,
        remediation: "Clear redundant guild command overrides below once global sync is active.",
      });
    } else {
      checks.push({
        id: "server_availability",
        label: "Connected Server /widget Availability",
        category: "availability",
        status: "pass",
        summary: `/widget is accessible in all ${availability.length} checked server(s).`,
      });
    }
  }

  return checks;
}

export async function registerCommands(env: any): Promise<Response> {
  const result = await syncDiscordCommands(env);
  if (!env.DISCORD_BOT_TOKEN) {
    return new Response(JSON.stringify({ error: result.error }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ status: result.status, result: result.rawResult ?? result.commands }, null, 2),
    {
      status: result.status,
      headers: { "Content-Type": "application/json" },
    }
  );
}


