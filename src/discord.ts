// Shared Web-Standard Discord REST helper with 429 rate-limit retry & backoff

export interface DiscordFetchOptions {
  maxRetries?: number;
  maxRetryDelayMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getRetryDelayMs(res: Response, maxRetryDelayMs: number): Promise<number> {
  let retrySeconds = 0;

  try {
    const cloned = res.clone();
    const contentType = cloned.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body: any = await cloned.json();
      if (typeof body?.retry_after === "number" && Number.isFinite(body.retry_after)) {
        retrySeconds = body.retry_after;
      }
    }
  } catch {
    // Ignore non-JSON bodies
  }

  if (retrySeconds <= 0) {
    const headerVal =
      res.headers.get("retry-after") || res.headers.get("x-ratelimit-reset-after");
    const parsed = headerVal ? Number(headerVal) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
      retrySeconds = parsed;
    }
  }

  const delayMs = retrySeconds > 0 ? Math.ceil(retrySeconds * 1000) + 100 : 500;
  return Math.min(Math.max(delayMs, 100), maxRetryDelayMs);
}

export async function fetchDiscordWithRetry(
  url: string,
  init: RequestInit = {},
  options: DiscordFetchOptions = {}
): Promise<Response> {
  const maxRetries = options.maxRetries ?? 3;
  const maxRetryDelayMs = options.maxRetryDelayMs ?? 5000;

  let attempt = 0;
  for (;;) {
    const res = await fetch(url, init);
    if (res.status !== 429 || attempt >= maxRetries) {
      return res;
    }

    const delayMs = await getRetryDelayMs(res, maxRetryDelayMs);
    attempt++;
    await sleep(delayMs);
  }
}

export async function fetchDiscordChannelMessage(
  token: string,
  channelId: string,
  messageId: string
): Promise<{ ok: boolean; httpStatus: number; message?: any; error?: string }> {
  if (!token || !channelId || !messageId) {
    return {
      ok: false,
      httpStatus: 400,
      error: "Bot token, channelId, and messageId are required.",
    };
  }
  try {
    const res = await fetchDiscordWithRetry(
      `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`,
      {
        method: "GET",
        headers: { Authorization: `Bot ${token}` },
      }
    );
    if (res.ok) {
      const message = await res.json();
      return { ok: true, httpStatus: res.status, message };
    }
    const errText = await res.text().catch(() => "");
    let friendly = `Discord API returned HTTP ${res.status}.`;
    if (res.status === 404) {
      friendly =
        "Discord message not found (HTTP 404). Verify the message ID and channel ID are correct and the message was not deleted.";
    } else if (res.status === 403) {
      friendly =
        "Bot lacks Read Message History / View Channel permission (HTTP 403) in that channel.";
    } else if (res.status === 400) {
      friendly = "Invalid Discord Channel ID or Message ID format (HTTP 400).";
    } else if (errText) {
      friendly = `Discord API ${res.status}: ${errText.slice(0, 180)}`;
    }
    return { ok: false, httpStatus: res.status, error: friendly };
  } catch (err: any) {
    return {
      ok: false,
      httpStatus: 502,
      error: err?.message || "Network error querying Discord message API.",
    };
  }
}

export const DISCORD_PERM = {
  ADMINISTRATOR: 0x8n,
  VIEW_CHANNEL: 0x400n,
  SEND_MESSAGES: 0x800n,
  EMBED_LINKS: 0x4000n,
  READ_MESSAGE_HISTORY: 0x10000n,
  SEND_MESSAGES_IN_THREADS: 0x4000000000n,
} as const;

export interface DiscordPermissionOverwrite {
  id: string;
  type: number; // 0 = role, 1 = member
  allow: string;
  deny: string;
}

export interface DiscordRoleLike {
  id: string;
  permissions: string;
}

export interface DiscordGuildLike {
  id: string;
  owner_id?: string;
}

export interface DiscordMemberLike {
  user?: { id?: string };
  roles?: string[];
}

export interface DiscordChannelLike {
  id: string;
  guild_id?: string;
  name?: string;
  type: number;
  parent_id?: string | null;
  permission_overwrites?: DiscordPermissionOverwrite[];
}

export interface ChannelPermissionCheckRequirements {
  requireView?: boolean;
  requireSend?: boolean;
  requireEmbed?: boolean;
  requireHistory?: boolean;
}

export interface ChannelPermissionSummary {
  permissionsBitfield: string;
  isThread: boolean;
  isAdmin: boolean;
  canView: boolean;
  canSend: boolean;
  canEmbed: boolean;
  canReadHistory: boolean;
  writable: boolean;
  missingPermissions: string[];
  remediation?: string;
}

export interface BotChannelValidationResult extends ChannelPermissionSummary {
  ok: boolean;
  valid: boolean;
  checked: boolean;
  channelId: string;
  channelName?: string;
  channelType?: number;
  httpStatus?: number;
  error?: string;
}

function toPermBigInt(value: unknown): bigint {
  try {
    if (typeof value === "bigint") return value;
    if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
    const str = String(value || "0").trim();
    if (!/^-?\d+$/.test(str)) return 0n;
    return BigInt(str);
  } catch {
    return 0n;
  }
}

export function isDiscordThreadType(channelType: number): boolean {
  return channelType === 10 || channelType === 11 || channelType === 12;
}

export function formatMissingPermissionRemediation(
  missingPermissions: string[],
  channelName?: string
): string {
  if (missingPermissions.length === 0) return "";
  const channelLabel = channelName ? `#${channelName}` : "that channel";
  return (
    `Bot lacks ${missingPermissions.join(", ")} in ${channelLabel}. ` +
    `In Discord, open Channel Settings -> Permissions for ${channelLabel} (or Server Settings -> Roles) ` +
    `and grant ${missingPermissions.join(", ")} to the Everfall Limited Watcher role.`
  );
}

/**
 * Pure Discord channel permission overwrite evaluator implementing Discord's bitmask resolution:
 * Guild Owner / ADMINISTRATOR -> @everyone base + member roles ->
 * (@everyone overwrite) -> (sum of member role overwrites) -> (member-specific overwrite).
 */
export function computeBotChannelPermissions(params: {
  guild: DiscordGuildLike;
  roles: DiscordRoleLike[];
  member: DiscordMemberLike;
  channel: DiscordChannelLike;
  parentChannel?: DiscordChannelLike | null;
  botUserId: string;
  requirements?: ChannelPermissionCheckRequirements;
}): ChannelPermissionSummary {
  const { guild, roles, member, channel, parentChannel, botUserId } = params;
  const req = {
    requireView: params.requirements?.requireView !== false,
    requireSend: params.requirements?.requireSend !== false,
    requireEmbed: params.requirements?.requireEmbed !== false,
    requireHistory: Boolean(params.requirements?.requireHistory),
  };

  const isThread = isDiscordThreadType(channel.type);
  const memberRoleIds = new Set<string>(Array.isArray(member.roles) ? member.roles : []);
  const roleMap = new Map<string, bigint>();
  for (const r of roles) {
    if (r?.id) roleMap.set(r.id, toPermBigInt(r.permissions));
  }

  let basePermissions = roleMap.get(guild.id) ?? 0n;
  for (const roleId of memberRoleIds) {
    basePermissions |= roleMap.get(roleId) ?? 0n;
  }

  const isOwner = Boolean(guild.owner_id && botUserId && guild.owner_id === botUserId);
  const isAdmin = isOwner || (basePermissions & DISCORD_PERM.ADMINISTRATOR) === DISCORD_PERM.ADMINISTRATOR;

  if (isAdmin) {
    return {
      permissionsBitfield: "8",
      isThread,
      isAdmin: true,
      canView: true,
      canSend: true,
      canEmbed: true,
      canReadHistory: true,
      writable: true,
      missingPermissions: [],
    };
  }

  const effectiveChannel = isThread && parentChannel ? parentChannel : channel;
  const overwrites = Array.isArray(effectiveChannel.permission_overwrites)
    ? effectiveChannel.permission_overwrites
    : [];

  let permissions = basePermissions;

  // 1. Apply @everyone channel overwrite
  const everyoneOverwrite = overwrites.find((ow) => ow.id === guild.id);
  if (everyoneOverwrite) {
    permissions &= ~toPermBigInt(everyoneOverwrite.deny);
    permissions |= toPermBigInt(everyoneOverwrite.allow);
  }

  // 2. Apply role overwrites (combined across all roles first, then deny then allow)
  let roleAllow = 0n;
  let roleDeny = 0n;
  for (const ow of overwrites) {
    if (ow.id !== guild.id && ow.type === 0 && memberRoleIds.has(ow.id)) {
      roleAllow |= toPermBigInt(ow.allow);
      roleDeny |= toPermBigInt(ow.deny);
    }
  }
  permissions &= ~roleDeny;
  permissions |= roleAllow;

  // 3. Apply member-specific overwrite
  if (botUserId) {
    const memberOverwrite = overwrites.find(
      (ow) => ow.id === botUserId && (ow.type === 1 || ow.type === undefined)
    );
    if (memberOverwrite) {
      permissions &= ~toPermBigInt(memberOverwrite.deny);
      permissions |= toPermBigInt(memberOverwrite.allow);
    }
  }

  const canView = (permissions & DISCORD_PERM.VIEW_CHANNEL) === DISCORD_PERM.VIEW_CHANNEL;
  const sendBit = isThread ? DISCORD_PERM.SEND_MESSAGES_IN_THREADS : DISCORD_PERM.SEND_MESSAGES;
  const canSendRaw = (permissions & sendBit) === sendBit;
  const canEmbedRaw = (permissions & DISCORD_PERM.EMBED_LINKS) === DISCORD_PERM.EMBED_LINKS;
  const canReadHistoryRaw =
    (permissions & DISCORD_PERM.READ_MESSAGE_HISTORY) === DISCORD_PERM.READ_MESSAGE_HISTORY;

  const canSend = canView && canSendRaw;
  const canEmbed = canView && canEmbedRaw;
  const canReadHistory = canView && canReadHistoryRaw;

  const missingPermissions: string[] = [];
  if (req.requireView && !canView) {
    missingPermissions.push("View Channel");
  }
  if (req.requireSend && !canSendRaw) {
    missingPermissions.push(isThread ? "Send Messages in Threads" : "Send Messages");
  } else if (req.requireSend && !canView && !missingPermissions.includes("View Channel")) {
    missingPermissions.push("View Channel");
  }
  if (req.requireEmbed && !canEmbedRaw) {
    missingPermissions.push("Embed Links");
  }
  if (req.requireHistory && !canReadHistoryRaw) {
    missingPermissions.push("Read Message History");
  }

  const writable = canView && canSendRaw && canEmbedRaw;
  const remediation =
    missingPermissions.length > 0
      ? formatMissingPermissionRemediation(missingPermissions, channel.name)
      : undefined;

  return {
    permissionsBitfield: permissions.toString(),
    isThread,
    isAdmin: false,
    canView,
    canSend,
    canEmbed,
    canReadHistory,
    writable,
    missingPermissions,
    ...(remediation ? { remediation } : {}),
  };
}

/**
 * Resolves the bot's Discord user ID using explicit env config or `/users/@me`.
 */
async function resolveBotUserId(token: string, botUserIdHint?: string): Promise<string> {
  const trimmed = String(botUserIdHint || "").trim();
  if (/^\d{17,22}$/.test(trimmed)) return trimmed;
  try {
    const res = await fetchDiscordWithRetry("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bot ${token}` },
    });
    if (res.ok) {
      const me: any = await res.json();
      if (typeof me?.id === "string" && /^\d{17,22}$/.test(me.id)) return me.id;
    }
  } catch {
    // ignore network failure here; callers handle empty botUserId gracefully
  }
  return "";
}

/**
 * Validates bot permissions in a specific Discord channel via Discord REST metadata
 * without ever sending a message to the channel.
 */
export async function validateBotChannelPermissions(
  token: string,
  guildId: string,
  channelId: string,
  options: ChannelPermissionCheckRequirements & { botUserId?: string } = {}
): Promise<BotChannelValidationResult> {
  if (!token || !guildId || !channelId) {
    return {
      ok: false,
      valid: false,
      checked: false,
      channelId,
      permissionsBitfield: "0",
      isThread: false,
      isAdmin: false,
      canView: false,
      canSend: false,
      canEmbed: false,
      canReadHistory: false,
      writable: false,
      missingPermissions: [],
      httpStatus: 400,
      error: "Bot token, server ID, and channel ID are required.",
    };
  }

  const headers = { Authorization: `Bot ${token}` };

  try {
    const resolvedBotId = await resolveBotUserId(token, options.botUserId);
    const [channelRes, guildRes, rolesRes, memberRes] = await Promise.all([
      fetchDiscordWithRetry(`https://discord.com/api/v10/channels/${channelId}`, { headers }),
      fetchDiscordWithRetry(`https://discord.com/api/v10/guilds/${guildId}`, { headers }),
      fetchDiscordWithRetry(`https://discord.com/api/v10/guilds/${guildId}/roles`, { headers }),
      resolvedBotId
        ? fetchDiscordWithRetry(
            `https://discord.com/api/v10/guilds/${guildId}/members/${resolvedBotId}`,
            { headers }
          )
        : Promise.resolve(null),
    ]);

    if (!channelRes.ok) {
      const missing = channelRes.status === 403 ? ["View Channel"] : [];
      const error =
        channelRes.status === 404
          ? "Selected Discord channel was not found or has been deleted."
          : channelRes.status === 403
            ? "Bot lacks View Channel access to inspect the selected channel (HTTP 403 Missing Access). Grant View Channel in Discord Channel Settings -> Permissions."
            : `Discord API returned HTTP ${channelRes.status} while inspecting channel ${channelId}.`;
      return {
        ok: false,
        valid: false,
        checked: true,
        channelId,
        permissionsBitfield: "0",
        isThread: false,
        isAdmin: false,
        canView: false,
        canSend: false,
        canEmbed: false,
        canReadHistory: false,
        writable: false,
        missingPermissions: missing,
        remediation:
          missing.length > 0 ? formatMissingPermissionRemediation(missing) : error,
        httpStatus: channelRes.status,
        error,
      };
    }

    const channel = (await channelRes.json()) as DiscordChannelLike;
    if (channel.guild_id && channel.guild_id !== guildId) {
      return {
        ok: false,
        valid: false,
        checked: true,
        channelId,
        channelName: channel.name,
        channelType: channel.type,
        permissionsBitfield: "0",
        isThread: isDiscordThreadType(channel.type),
        isAdmin: false,
        canView: false,
        canSend: false,
        canEmbed: false,
        canReadHistory: false,
        writable: false,
        missingPermissions: [],
        httpStatus: 400,
        error: "The selected channel belongs to a different Discord server.",
      };
    }

    if (memberRes && memberRes.status === 404) {
      return {
        ok: false,
        valid: false,
        checked: true,
        channelId,
        channelName: channel.name,
        channelType: channel.type,
        permissionsBitfield: "0",
        isThread: isDiscordThreadType(channel.type),
        isAdmin: false,
        canView: false,
        canSend: false,
        canEmbed: false,
        canReadHistory: false,
        writable: false,
        missingPermissions: ["Bot Membership"],
        remediation:
          "Everfall Limited Watcher is not present in this Discord server. Re-invite the bot and try again.",
        httpStatus: 404,
        error: "Everfall Limited Watcher is no longer in this Discord server.",
      };
    }

    if (!guildRes.ok || !rolesRes.ok || (memberRes && !memberRes.ok)) {
      const status = !guildRes.ok
        ? guildRes.status
        : !rolesRes.ok
          ? rolesRes.status
          : memberRes?.status || 502;
      return {
        ok: false,
        valid: false,
        checked: false,
        channelId,
        channelName: channel.name,
        channelType: channel.type,
        permissionsBitfield: "0",
        isThread: isDiscordThreadType(channel.type),
        isAdmin: false,
        canView: false,
        canSend: false,
        canEmbed: false,
        canReadHistory: false,
        writable: false,
        missingPermissions: [],
        httpStatus: status,
        error: `Unable to verify Discord channel permissions (HTTP ${status}). Try again shortly.`,
      };
    }

    const guild = (await guildRes.json()) as DiscordGuildLike;
    const roles = (await rolesRes.json()) as DiscordRoleLike[];
    const member: DiscordMemberLike = memberRes
      ? ((await memberRes.json()) as DiscordMemberLike)
      : { user: { id: resolvedBotId }, roles: [] };

    let parentChannel: DiscordChannelLike | null = null;
    if (isDiscordThreadType(channel.type) && channel.parent_id) {
      const parentRes = await fetchDiscordWithRetry(
        `https://discord.com/api/v10/channels/${channel.parent_id}`,
        { headers }
      );
      if (parentRes.ok) {
        parentChannel = (await parentRes.json()) as DiscordChannelLike;
      }
    }

    const summary = computeBotChannelPermissions({
      guild,
      roles,
      member,
      channel,
      parentChannel,
      botUserId: resolvedBotId || member.user?.id || "",
      requirements: options,
    });

    const valid = summary.missingPermissions.length === 0;
    return {
      ok: true,
      valid,
      checked: true,
      channelId,
      channelName: channel.name,
      channelType: channel.type,
      httpStatus: 200,
      ...summary,
      ...(valid ? {} : { error: summary.remediation }),
    };
  } catch (err: any) {
    return {
      ok: false,
      valid: false,
      checked: false,
      channelId,
      permissionsBitfield: "0",
      isThread: false,
      isAdmin: false,
      canView: false,
      canSend: false,
      canEmbed: false,
      canReadHistory: false,
      writable: false,
      missingPermissions: [],
      httpStatus: 502,
      error: err?.message || "Network error validating Discord channel permissions.",
    };
  }
}


