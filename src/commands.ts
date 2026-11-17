// commands.ts – Discord interaction handler with Deferred Responses, Permission Checks, and Rich Embeds

import { InteractionResponseType, InteractionType, verifyKey } from "discord-interactions";
import {
  getGuildConfig,
  setGuildConfig,
  addGuildRole,
  removeGuildRole,
  GuildConfig,
} from "./kv";
import {
  getCarPackage,
  postAllListingsToGuild,
  resolvePublicOrigin,
} from "./scraper";
import { fetchDiscordWithRetry } from "./discord";

const EPHEMERAL_FLAG = 64;

function jsonResponse(data: any, type = InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE) {
  return new Response(JSON.stringify({ type, data }), {
    headers: { "Content-Type": "application/json" },
  });
}

function deferredResponse(ephemeral = true, isComponentUpdate = false) {
  const type = isComponentUpdate
    ? InteractionResponseType.DEFERRED_UPDATE_MESSAGE || 6
    : InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE || 5;
  const payload: any = { type };
  if (!isComponentUpdate && ephemeral) {
    payload.data = { flags: EPHEMERAL_FLAG };
  }
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
  });
}

async function editOriginalInteractionResponse(
  appId: string,
  interactionToken: string,
  data: any
): Promise<void> {
  const url = `https://discord.com/api/v10/webhooks/${appId}/${interactionToken}/messages/@original`;
  try {
    const res = await fetchDiscordWithRetry(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      console.error("Failed to patch deferred Discord interaction:", res.status, await res.text());
    }
  } catch (err) {
    console.error("Network error patching deferred Discord interaction:", err);
  }
}

function hasManageServerPermission(member: any): boolean {
  if (!member?.permissions) return false;
  try {
    const perms = BigInt(member.permissions);
    return (perms & 0x8n) === 0x8n || (perms & 0x20n) === 0x20n;
  } catch {
    return false;
  }
}

function buildNotConfiguredEmbed() {
  return {
    title: "⚠️ Setup Required Before Running Check",
    description:
      "Everfall Limited Watcher has not been configured in this server yet.\n\n" +
      "Before running store checks, you must designate the alert channel where limited car drop embeds will be posted.",
    color: 0xf59e0b,
    fields: [
      {
        name: "📌 Quick Setup (Choose One)",
        value:
          "1. **Fastest:** Pick an alert channel using the dropdown menu below.\n" +
          "2. **Slash Command:** Run `/setup <#channel>` in any channel.\n" +
          "3. **Role Pings:** (Optional) Run `/add-role <@role>` to configure role mentions.",
        inline: false,
      },
    ],
    footer: { text: "Everfall Limited Watcher • Setup Required • Only visible to you" },
    timestamp: new Date().toISOString(),
  };
}

function buildHelpEmbed(guildConfig: GuildConfig | null) {
  const channelText = guildConfig?.channelId
    ? `<#${guildConfig.channelId}>`
    : "*Not set yet (select from dropdown below)*";

  const rolesText =
    guildConfig?.roleIds && guildConfig.roleIds.length > 0
      ? guildConfig.roleIds.map((r: string) => `<@&${r}>`).join(" ")
      : "*None (use `/add-role`)*";

  return {
    title: "🏎️ Everfall Limited Watcher — Control Center",
    description:
      "Welcome! This bot monitors the Everfall vehicle store for limited car drops and automatically broadcasts rich alert embeds with direct store links and role mentions.",
    color: 0x5865f2,
    fields: [
      {
        name: "⚙️ Current Server Settings",
        value: `• **Alert Channel:** ${channelText}\n• **Mention Roles:** ${rolesText}\n• **Auto-Sweep Cadence:** Every 15 minutes (Edge Cron)`,
        inline: false,
      },
      {
        name: "🛠️ Slash Commands Reference",
        value:
          "`/setup <#channel>` — Sets the channel where car drop embeds appear\n" +
          "`/add-role <@role>` — Adds a role to ping when a limited drop hits\n" +
          "`/remove-role <@role>` — Removes a role from drop alerts\n" +
          "`/check` — Runs an on-demand store scrape immediately and posts active drops\n" +
          "`/help` — Opens this private interactive dashboard",
        inline: false,
      },
    ],
    footer: { text: "Everfall Watcher • Only visible to you" },
    timestamp: new Date().toISOString(),
  };
}

function buildActionComponents(portalOrigin: string) {
  const row1: any[] = [
    {
      type: 2,
      style: 1,
      custom_id: "action_check",
      label: "Scan Store Now",
      emoji: { name: "🔎" },
    },
    {
      type: 2,
      style: 2,
      custom_id: "action_config",
      label: "View Server Config",
      emoji: { name: "⚙️" },
    },
    {
      type: 2,
      style: 5,
      url: "https://store.everfallcommunity.com/category/limited-cars",
      label: "Everfall Store",
      emoji: { name: "🛒" },
    },
  ];

  if (portalOrigin && /^https?:\/\//i.test(portalOrigin)) {
    row1.push({
      type: 2,
      style: 5,
      url: portalOrigin,
      label: "Web Portal",
      emoji: { name: "🌐" },
    });
  }

  return [
    { type: 1, components: row1 },
    {
      type: 1,
      components: [
        {
          type: 8,
          custom_id: "select_channel",
          placeholder: "📢 Choose a channel for vehicle drop alerts...",
          channel_types: [0, 5],
        },
      ],
    },
  ];
}

export async function handleInteraction(
  req: Request,
  env: any,
  ctx?: ExecutionContext,
  originHint?: string
): Promise<Response> {
  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");
  const rawBody = await req.text();

  const publicKey = env.DISCORD_PUBLIC_KEY;
  if (!signature || !timestamp || !publicKey) {
    return new Response("Missing signature or public key", { status: 401 });
  }

  const isValid = await verifyKey(rawBody, signature, timestamp, publicKey);
  if (!isValid) {
    return new Response("Bad request signature", { status: 401 });
  }

  const body = JSON.parse(rawBody);
  const { type, data, guild_id, member, token: interactionToken } = body as any;
  const appId =
    body.application_id || env.DISCORD_APPLICATION_ID || env.DISCORD_CLIENT_ID || "";
  const portalOrigin =
    resolvePublicOrigin(env, originHint) ||
    "https://everfall-limited-watcher.itschase.workers.dev";
  const actionComponents = buildActionComponents(portalOrigin);

  const runAsync = (task: Promise<void>) => {
    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(task);
    } else {
      task.catch((err) => console.error("Background interaction error:", err));
    }
  };

  // 1. Handle Ping
  if (type === InteractionType.PING) {
    return new Response(JSON.stringify({ type: InteractionResponseType.PONG }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2. Handle Interactive Component Clicks (Buttons & Select Menus)
  if (type === (InteractionType.MESSAGE_COMPONENT || 3)) {
    const customId = data?.custom_id as string;

    // A. Handle Image Gallery Pagination
    if (customId?.startsWith("img_prev:") || customId?.startsWith("img_next:")) {
      const parts = customId.split(":");
      const action = parts[0];
      const carId = parts[1];
      const currentIdx = parseInt(parts[2], 10);
      const newIdx = action === "img_next" ? currentIdx + 1 : currentIdx - 1;

      const car = await getCarPackage(env, carId);
      if (car && car.images.length > 0) {
        const messageEmbeds = body.message?.embeds || [];
        const messageComponents = body.message?.components || [];
        const safeIdx = Math.max(0, Math.min(newIdx, car.images.length - 1));

        for (const emb of messageEmbeds) {
          if (emb.title?.includes(car.name)) {
            emb.image = { url: car.images[safeIdx] };
            if (emb.fields?.[0]) {
              emb.fields[0].value = `Image **${safeIdx + 1}** of **${car.images.length}** *(use buttons below to view)*`;
            }
          }
        }

        for (const row of messageComponents) {
          const hasThisCar = row.components?.some((c: any) => c.custom_id?.includes(carId));
          if (hasThisCar) {
            for (const btn of row.components) {
              if (btn.custom_id?.startsWith("img_prev:")) {
                btn.custom_id = `img_prev:${carId}:${safeIdx}`;
                btn.disabled = safeIdx === 0;
              } else if (btn.custom_id?.startsWith("img_counter:")) {
                btn.label = `${safeIdx + 1} / ${car.images.length}`;
              } else if (btn.custom_id?.startsWith("img_next:")) {
                btn.custom_id = `img_next:${carId}:${safeIdx}`;
                btn.disabled = safeIdx === car.images.length - 1;
              }
            }
          }
        }

        return jsonResponse(
          { embeds: messageEmbeds, components: messageComponents },
          InteractionResponseType.UPDATE_MESSAGE || 7
        );
      }
    }

    // B. Handle Scan Store Button (requires Manage Server / Admin + deferred to avoid 3s timeout)
    if (customId === "action_check") {
      if (!guild_id) {
        return jsonResponse({ flags: EPHEMERAL_FLAG, content: "This action only works in a server." });
      }
      if (!hasManageServerPermission(member)) {
        return jsonResponse({
          flags: EPHEMERAL_FLAG,
          content: "You need Manage Server or Administrator permissions to run this command.",
        });
      }
      const cfg = await getGuildConfig(env, guild_id);
      if (!cfg || !cfg.channelId) {
        return jsonResponse(
          {
            flags: EPHEMERAL_FLAG,
            embeds: [buildNotConfiguredEmbed()],
            components: actionComponents,
          },
          7
        );
      }

      runAsync(
        (async () => {
          try {
            const result = await postAllListingsToGuild(env, guild_id, portalOrigin);
            const description = result.error
              ? `⚠️ Store check encountered an issue posting to <#${cfg.channelId}>: \`${result.error}\``
              : result.count > 0
                ? `Scanned the Everfall store and posted **${result.count}** active vehicle drop(s) to <#${cfg.channelId}>!`
                : `Store scanned. No new or active vehicle drops were posted to <#${cfg.channelId}>.${result.notice ? ` (${result.notice})` : ""}`;
            await editOriginalInteractionResponse(appId, interactionToken, {
              embeds: [
                {
                  title: result.error ? "⚠️ Store Check Warning" : "✅ Store Check Dispatched",
                  description,
                  color: result.error ? 0xf59e0b : 0x10b981,
                  footer: { text: "Everfall Limited Watcher" },
                  timestamp: new Date().toISOString(),
                },
              ],
              components: actionComponents,
            });
          } catch (err: any) {
            await editOriginalInteractionResponse(appId, interactionToken, {
              embeds: [
                {
                  title: "❌ Store Check Failed",
                  description: err?.message || "Unexpected error during store check.",
                  color: 0xef4444,
                },
              ],
              components: actionComponents,
            });
          }
        })()
      );
      return deferredResponse(true, true);
    }

    // C. Handle View Config Button
    if (customId === "action_config") {
      const cfg = guild_id ? await getGuildConfig(env, guild_id) : null;
      return jsonResponse(
        {
          flags: EPHEMERAL_FLAG,
          embeds: [buildHelpEmbed(cfg)],
          components: actionComponents,
        },
        7
      );
    }

    // D. Handle Interactive Channel Select Menu (requires Manage Server / Admin)
    if (customId === "select_channel") {
      if (!hasManageServerPermission(member)) {
        return jsonResponse({
          flags: EPHEMERAL_FLAG,
          content: "You need Manage Server or Administrator permissions to change the alert channel.",
        });
      }
      const selectedChannel = data?.values?.[0];
      if (guild_id && selectedChannel) {
        const existing = (await getGuildConfig(env, guild_id)) ?? { channelId: "", roleIds: [] };
        await setGuildConfig(env, guild_id, { ...existing, channelId: selectedChannel });

        const updatedEmbed = {
          title: "Alert Channel Updated",
          color: 0x10b981,
          description:
            `Vehicle drop alerts will now be posted to <#${selectedChannel}> when new limited drops are detected.\n\n` +
            `To run an immediate check for unsent active drops, use \`/check\`.`,
          fields: [
            {
              name: "Mention Roles",
              value:
                existing.roleIds.length > 0
                  ? existing.roleIds.map((r: string) => `<@&${r}>`).join(" ")
                  : "*None configured (use `/add-role`)*",
            },
          ],
          footer: { text: "Everfall Limited Watcher • Settings Saved" },
          timestamp: new Date().toISOString(),
        };

        return jsonResponse(
          {
            flags: EPHEMERAL_FLAG,
            embeds: [updatedEmbed],
            components: actionComponents,
          },
          7
        );
      }
    }

    return jsonResponse({ flags: EPHEMERAL_FLAG, content: "Action received." });
  }

  // 3. Handle Slash Commands
  if (!guild_id) {
    return jsonResponse({
      flags: EPHEMERAL_FLAG,
      embeds: [
        {
          title: "⚠️ Server Only",
          description: "Please run Everfall Watcher commands inside a Discord server.",
          color: 0xef4444,
        },
      ],
    });
  }

  switch (data?.name) {
    case "help": {
      const cfg = await getGuildConfig(env, guild_id);
      return jsonResponse({
        flags: EPHEMERAL_FLAG,
        embeds: [buildHelpEmbed(cfg)],
        components: actionComponents,
      });
    }

    case "setup": {
      if (!hasManageServerPermission(member)) {
        return jsonResponse({
          flags: EPHEMERAL_FLAG,
          content: "You need Manage Server or Administrator permissions to run `/setup`.",
        });
      }
      const channel = data?.options?.find((o: any) => o.name === "channel")?.value as string;
      if (!channel) {
        return jsonResponse({
          flags: EPHEMERAL_FLAG,
          content: "Please specify a valid channel.",
        });
      }
      const existing = (await getGuildConfig(env, guild_id)) ?? { channelId: "", roleIds: [] };
      await setGuildConfig(env, guild_id, { ...existing, channelId: channel });

      return jsonResponse({
        flags: EPHEMERAL_FLAG,
        embeds: [
          {
            title: "Alert Channel Configured",
            description:
              `Successfully set <#${channel}> as the vehicle alerts channel. New limited drops will be delivered there automatically.\n\n` +
              `Use \`/add-role\` to select mention roles or \`/check\` to check for any unsent active drops.`,
            color: 0x10b981,
            fields: [
              {
                name: "Mention Roles",
                value:
                  existing.roleIds.length > 0
                    ? existing.roleIds.map((r: string) => `<@&${r}>`).join(" ")
                    : "*None (use `/add-role`)*",
              },
            ],
            footer: { text: "Everfall Limited Watcher" },
            timestamp: new Date().toISOString(),
          },
        ],
        components: actionComponents,
      });
    }

    case "add-role": {
      if (!hasManageServerPermission(member)) {
        return jsonResponse({
          flags: EPHEMERAL_FLAG,
          content: "❌ You need **Manage Server** or **Administrator** permissions to run `/add-role`.",
        });
      }
      const roleId = data?.options?.find((o: any) => o.name === "role")?.value as string;
      if (!roleId) {
        return jsonResponse({ flags: EPHEMERAL_FLAG, content: "❌ Specify a role to add." });
      }
      await addGuildRole(env, guild_id, roleId);
      const cfg = await getGuildConfig(env, guild_id);

      return jsonResponse({
        flags: EPHEMERAL_FLAG,
        embeds: [
          {
            title: "✅ Role Mention Added",
            description: `<@&${roleId}> will now be pinged on new limited vehicle drops.`,
            color: 0x10b981,
            fields: [
              {
                name: "All Active Roles",
                value: cfg?.roleIds.map((r: string) => `<@&${r}>`).join(" ") || "None",
              },
            ],
            footer: { text: "Everfall Limited Watcher" },
            timestamp: new Date().toISOString(),
          },
        ],
      });
    }

    case "remove-role": {
      if (!hasManageServerPermission(member)) {
        return jsonResponse({
          flags: EPHEMERAL_FLAG,
          content: "❌ You need **Manage Server** or **Administrator** permissions to run `/remove-role`.",
        });
      }
      const roleId = data?.options?.find((o: any) => o.name === "role")?.value as string;
      if (!roleId) {
        return jsonResponse({ flags: EPHEMERAL_FLAG, content: "❌ Specify a role to remove." });
      }
      await removeGuildRole(env, guild_id, roleId);
      const cfg = await getGuildConfig(env, guild_id);

      return jsonResponse({
        flags: EPHEMERAL_FLAG,
        embeds: [
          {
            title: "✅ Role Mention Removed",
            description: `<@&${roleId}> has been removed from drop notifications.`,
            color: 0x10b981,
            fields: [
              {
                name: "Remaining Active Roles",
                value:
                  cfg?.roleIds && cfg.roleIds.length > 0
                    ? cfg.roleIds.map((r: string) => `<@&${r}>`).join(" ")
                    : "*None*",
              },
            ],
            footer: { text: "Everfall Limited Watcher" },
            timestamp: new Date().toISOString(),
          },
        ],
      });
    }

    case "check": {
      if (!hasManageServerPermission(member)) {
        return jsonResponse({
          flags: EPHEMERAL_FLAG,
          content: "You need Manage Server or Administrator permissions to use `/check`.",
        });
      }
      const cfg = await getGuildConfig(env, guild_id);
      if (!cfg || !cfg.channelId) {
        return jsonResponse({
          flags: EPHEMERAL_FLAG,
          embeds: [buildNotConfiguredEmbed()],
          components: actionComponents,
        });
      }

      runAsync(
        (async () => {
          try {
            const result = await postAllListingsToGuild(env, guild_id, portalOrigin);
            if (result.error) {
              await editOriginalInteractionResponse(appId, interactionToken, {
                content: `⚠️ **Everfall Limited Store Check**: Failed to post to <#${cfg.channelId}> (${result.error}).`,
              });
              return;
            }
            if (result.count === 0) {
              await editOriginalInteractionResponse(appId, interactionToken, {
                content: `🔎 **Everfall Limited Store Check**: No active limited vehicles were posted.${result.notice ? ` (${result.notice})` : ""}`,
              });
              return;
            }
            const isAlertChannel = body.channel_id === cfg.channelId;
            await editOriginalInteractionResponse(appId, interactionToken, {
              content: isAlertChannel
                ? `🔎 **Everfall Limited Store Check**: Scanned store and posted **${result.count}** active limited drop(s) below!`
                : `✅ **Everfall Limited Store Check**: Scanned store and posted **${result.count}** active limited drop(s) to <#${cfg.channelId}>!`,
            });
          } catch (err: any) {
            await editOriginalInteractionResponse(appId, interactionToken, {
              content: `❌ **Everfall Limited Store Check Failed**: ${err?.message || "Unexpected error."}`,
            });
          }
        })()
      );
      return deferredResponse(false, false);
    }

    default:
      return jsonResponse({ flags: EPHEMERAL_FLAG, content: "Unknown command." });
  }
}
