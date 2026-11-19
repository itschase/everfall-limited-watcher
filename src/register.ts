import { fetchDiscordWithRetry } from "./discord";

export const COMMANDS = [
  {
    name: "setup",
    description: "Configure the channel for Everfall limited drop alerts",
    default_member_permissions: "32", // MANAGE_GUILD
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
    description: "Add a role to ping when a limited drop occurs",
    default_member_permissions: "32", // MANAGE_GUILD
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
    description: "Remove a role from drop notifications",
    default_member_permissions: "32", // MANAGE_GUILD
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
    description: "Manually check the Everfall store for limited car stock",
  },
  {
    name: "widget",
    description:
      "Preview & deploy an auto-updating live Everfall stock & recent drops widget embed here",
    default_member_permissions: "32", // MANAGE_GUILD
  },
  {
    name: "help",
    description: "View Everfall Limited Watcher setup and commands",
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
  description: string;
  default_member_permissions?: string;
  options?: DiscordCommandOptionDef[];
}

export interface LiveDiscordCommand {
  id: string;
  application_id: string;
  version?: string;
  name: string;
  description: string;
  default_member_permissions?: string | null;
  options?: DiscordCommandOptionDef[];
}

export interface BotIdentityInfo {
  ok: boolean;
  appId: string;
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
  } | null;
  error?: string;
}

export function getDiscordApplicationId(env: any): string {
  return env.DISCORD_APPLICATION_ID || env.DISCORD_CLIENT_ID || "1571958001928245378";
}

export async function fetchBotApplicationInfo(env: any): Promise<BotIdentityInfo> {
  const token = env.DISCORD_BOT_TOKEN;
  const appId = getDiscordApplicationId(env);

  if (!token) {
    return {
      ok: false,
      appId,
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
        id: String(userData?.id || appId),
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
      application = {
        id: String(appData?.id || appId),
        name: String(appData?.name || "Everfall Limited Watcher"),
        description: String(appData?.description || ""),
        interactionsEndpointUrl: appData?.interactions_endpoint_url
          ? String(appData.interactions_endpoint_url)
          : null,
      };
    }

    if (!userRes.ok) {
      const errBody = await userRes.text().catch(() => "");
      return {
        ok: false,
        appId: application?.id || appId,
        botUser,
        application,
        error: `Discord bot authentication returned HTTP ${userRes.status}${errBody ? `: ${errBody.slice(0, 180)}` : ""}`,
      };
    }

    return {
      ok: true,
      appId: application?.id || botUser?.id || appId,
      botUser,
      application,
    };
  } catch (err: any) {
    return {
      ok: false,
      appId,
      botUser: null,
      application: null,
      error: err?.message || "Failed to reach Discord API.",
    };
  }
}

export async function fetchLiveDiscordCommands(
  env: any,
  guildId?: string
): Promise<{
  ok: boolean;
  httpStatus: number;
  commands: LiveDiscordCommand[];
  error?: string;
}> {
  const token = env.DISCORD_BOT_TOKEN;
  const appId = getDiscordApplicationId(env);

  if (!token) {
    return {
      ok: false,
      httpStatus: 400,
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
        commands: [],
        error: parsed?.message || `Discord API returned HTTP ${res.status}`,
      };
    }

    return {
      ok: true,
      httpStatus: res.status,
      commands: Array.isArray(parsed) ? parsed : [],
    };
  } catch (err: any) {
    return {
      ok: false,
      httpStatus: 502,
      commands: [],
      error: err?.message || "Failed to query live Discord commands.",
    };
  }
}

export async function syncDiscordCommands(
  env: any,
  options?: { guildId?: string }
): Promise<{
  ok: boolean;
  status: number;
  scope: "global" | "guild";
  guildId?: string;
  commands: LiveDiscordCommand[];
  error?: string;
  rawResult?: unknown;
}> {
  const token = env.DISCORD_BOT_TOKEN;
  const appId = getDiscordApplicationId(env);
  const guildId = options?.guildId ? String(options.guildId).trim() : undefined;
  const scope: "global" | "guild" = guildId ? "guild" : "global";

  if (!token) {
    return {
      ok: false,
      status: 400,
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
      scope,
      ...(guildId ? { guildId } : {}),
      commands: Array.isArray(data) ? data : [],
      rawResult: data,
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 502,
      scope,
      ...(guildId ? { guildId } : {}),
      commands: [],
      error: err?.message || "Failed to contact Discord command API.",
    };
  }
}

export function compareDiscordCommands(liveCommands: LiveDiscordCommand[]) {
  const liveByName = new Map(liveCommands.map((cmd) => [cmd.name, cmd]));
  const localNames = new Set(COMMANDS.map((c) => c.name));

  const comparisons = (COMMANDS as DiscordCommandDef[]).map((local) => {
    const remote = liveByName.get(local.name);
    if (!remote) {
      return {
        name: local.name,
        description: local.description,
        defaultMemberPermissions: local.default_member_permissions || null,
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

    const reasons: string[] = [];
    if (local.description !== remote.description) reasons.push("description updated");
    if (localPerm !== remotePerm) reasons.push("permissions updated");
    if (localOpts !== remoteOpts) reasons.push("options updated");

    return {
      name: local.name,
      description: local.description,
      defaultMemberPermissions: localPerm,
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

