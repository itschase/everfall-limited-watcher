import {
  fetchDiscordWithRetry,
  validateBotChannelPermissions,
} from "./discord";
import { getAllWidgetDeployments, getGuildConfig } from "./kv";
import type { ServerCustomizations } from "./shared/customizations";
import { getD1Database, getMonitorStateValue } from "./d1";

export async function checkAutomationReadiness(
  env: any,
  guildId: string,
  options: ServerCustomizations,
) {
  const issues: string[] = [];
  if (!env.DISCORD_BOT_TOKEN)
    return {
      ready: false,
      issues: [
        "The bot is not configured. Contact the application administrator.",
      ],
    };
  const config = await getGuildConfig(env, guildId);
  const widgets = (await getAllWidgetDeployments(env)).filter(
    (w) => w.guildId === guildId,
  );
  const channels = new Map<string, { pin: boolean; sticky: boolean }>();
  if (options.autoPinListings) {
    if (!config?.channelId)
      issues.push(
        "Choose a listing notification channel before enabling listing pins.",
      );
    else channels.set(config.channelId, { pin: true, sticky: false });
  }
  if (options.pinWidget || options.stickyWidget) {
    for (const widget of widgets) {
      const prior = channels.get(widget.channelId);
      channels.set(widget.channelId, {
        pin: Boolean(prior?.pin || options.pinWidget),
        sticky: options.stickyWidget,
      });
    }
  }
  const checks = await Promise.all(
    [...channels].map(async ([id, needs]) => {
      const result = await validateBotChannelPermissions(
        env.DISCORD_BOT_TOKEN,
        guildId,
        id,
        {
          botUserId: env.DISCORD_APPLICATION_ID || env.DISCORD_CLIENT_ID,
          requireView: true,
          requireSend: needs.sticky,
          requireEmbed: false,
          requireHistory: needs.sticky,
        },
      );
      const missing = [...result.missingPermissions];
      if (
        result.checked &&
        needs.pin &&
        !result.isAdmin &&
        !(BigInt(result.permissionsBitfield) & (1n << 51n))
      )
        missing.push("Pin Messages");
      if (!result.valid || missing.length)
        return `Channel ${result.channelName ? `#${result.channelName}` : id}: ${missing.length ? `grant ${missing.join(", ")} in channel permissions.` : result.error || "permissions could not be verified; try again."}`;
      return null;
    }),
  );
  issues.push(...checks.filter((value): value is string => Boolean(value)));
  const db = getD1Database(env);
  const tracked =
    db && options.autoEndEvent
      ? await getMonitorStateValue<{ eventId?: string }>(
          db,
          `server-automation:${guildId}`,
        )
      : null;
  if (options.autoCreateEvent || tracked?.eventId) {
    const botId = env.DISCORD_APPLICATION_ID || env.DISCORD_CLIENT_ID;
    const responses = await Promise.all(
      [`/guilds/${guildId}/roles`, `/guilds/${guildId}/members/${botId}`].map(
        (path) =>
          fetchDiscordWithRetry(`https://discord.com/api/v10${path}`, {
            headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
          }),
      ),
    );
    if (responses.some((r) => !r.ok))
      issues.push(
        "Could not verify event permissions. Check bot membership and retry the permission check.",
      );
    else {
      const roles = (await responses[0].json()) as Array<{
        id: string;
        permissions: string;
      }>;
      const member = (await responses[1].json()) as { roles?: string[] };
      const permissions = roles
        .filter(
          (role) => role.id === guildId || member.roles?.includes(role.id),
        )
        .reduce((bits, role) => bits | BigInt(role.permissions), 0n);
      if (
        !(permissions & 8n) &&
        !(permissions & (1n << 44n)) &&
        !(permissions & (1n << 33n))
      )
        issues.push(
          "Grant Create Events or Manage Events to the bot's server role to manage its own listing events.",
        );
    }
  }
  return { ready: !issues.length, issues, widgetCount: widgets.length };
}
