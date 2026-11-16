// commands.ts – Discord interaction handler with Rich Embeds and Interactive Components

import { InteractionResponseType, InteractionType, verifyKey } from "discord-interactions";
import { getGuildConfig, setGuildConfig, addGuildRole, removeGuildRole } from "./kv";
import { runCron, fetchStoreListings } from "./scraper";

const EPHEMERAL_FLAG = 64;

function jsonResponse(data: any, type = InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE) {
  return new Response(JSON.stringify({ type, data }), {
    headers: { "Content-Type": "application/json" },
  });
}

function buildHelpEmbed(guildConfig: any) {
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
    color: 0x5865f2, // Discord Blurple
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
          "`/check` — Runs an on-demand store scrape immediately\n" +
          "`/help` — Opens this private interactive dashboard",
        inline: false,
      },
    ],
    footer: { text: "Everfall Watcher • Only visible to you" },
    timestamp: new Date().toISOString(),
  };
}

function buildActionComponents() {
  return [
    {
      type: 1, // ACTION_ROW
      components: [
        {
          type: 2, // BUTTON
          style: 1, // PRIMARY
          custom_id: "action_check",
          label: "Scan Store Now",
          emoji: { name: "🔎" },
        },
        {
          type: 2, // BUTTON
          style: 2, // SECONDARY
          custom_id: "action_config",
          label: "View Server Config",
          emoji: { name: "⚙️" },
        },
        {
          type: 2, // BUTTON
          style: 5, // LINK
          url: "https://everfall-limited-watcher.itschase.workers.dev",
          label: "Web Portal",
          emoji: { name: "🌐" },
        },
      ],
    },
    {
      type: 1, // ACTION_ROW
      components: [
        {
          type: 8, // CHANNEL_SELECT
          custom_id: "select_channel",
          placeholder: "📢 Choose a channel for vehicle drop alerts...",
          channel_types: [0], // GUILD_TEXT
        },
      ],
    },
  ];
}

export async function handleInteraction(req: Request, env: any): Promise<Response> {
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
  const { type, data, guild_id } = body as any;

  // 1. Handle Ping
  if (type === InteractionType.PING) {
    return new Response(JSON.stringify({ type: InteractionResponseType.PONG }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2. Handle Interactive Component Clicks (Buttons & Select Menus)
  if (type === 3) {
    // MESSAGE_COMPONENT
    const customId = data?.custom_id;

    if (customId === "action_check") {
      const result = await runCron(env);
      const embed = {
        title: "🔎 Manual Store Sweep Completed",
        color: 0x10b981, // Emerald green
        description: result.notice
          ? `**Store Status:** ${result.notice}\n\nAutomated background cron will re-check every 15 minutes.`
          : `Scan completed successfully. Found **${result.checked}** listings on the store.`,
        fields: [
          { name: "Listings Scanned", value: `${result.checked}`, inline: true },
          { name: "New Drops Detected", value: `${result.newDrops}`, inline: true },
        ],
        footer: { text: "Everfall Limited Watcher • Manual Check" },
        timestamp: new Date().toISOString(),
      };
      return jsonResponse(
        {
          flags: EPHEMERAL_FLAG,
          embeds: [embed],
          components: buildActionComponents(),
        },
        7 // UPDATE_MESSAGE
      );
    }

    if (customId === "action_config") {
      const cfg = guild_id ? await getGuildConfig(env, guild_id) : null;
      return jsonResponse(
        {
          flags: EPHEMERAL_FLAG,
          embeds: [buildHelpEmbed(cfg)],
          components: buildActionComponents(),
        },
        7 // UPDATE_MESSAGE
      );
    }

    if (customId === "select_channel") {
      const selectedChannel = data?.values?.[0];
      if (guild_id && selectedChannel) {
        const existing = (await getGuildConfig(env, guild_id)) ?? { channelId: "", roleIds: [] };
        await setGuildConfig(env, guild_id, { ...existing, channelId: selectedChannel });

        const updatedEmbed = {
          title: "✅ Alert Channel Updated",
          color: 0x10b981,
          description: `Vehicle drop alerts will now be posted to <#${selectedChannel}>!`,
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
            components: buildActionComponents(),
          },
          7 // UPDATE_MESSAGE
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
        components: buildActionComponents(),
      });
    }

    case "setup": {
      const channel = data?.options?.find((o: any) => o.name === "channel")?.value as string;
      if (!channel) {
        return jsonResponse({
          flags: EPHEMERAL_FLAG,
          content: "❌ Please specify a valid channel.",
        });
      }
      const existing = (await getGuildConfig(env, guild_id)) ?? { channelId: "", roleIds: [] };
      await setGuildConfig(env, guild_id, { ...existing, channelId: channel });

      return jsonResponse({
        flags: EPHEMERAL_FLAG,
        embeds: [
          {
            title: "✅ Alert Channel Configured",
            description: `Successfully set <#${channel}> as the vehicle alerts channel.`,
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
        components: buildActionComponents(),
      });
    }

    case "add-role": {
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
      const result = await runCron(env);
      return jsonResponse({
        flags: EPHEMERAL_FLAG,
        embeds: [
          {
            title: "🔎 Store Check Executed",
            color: 0x5865f2,
            description: result.notice
              ? `**Notice:** ${result.notice}\n\nAutomated cron sweeps will continue checking in the background.`
              : `Scraped Everfall store successfully. Found **${result.checked}** active listing(s).`,
            fields: [
              { name: "Items Checked", value: `${result.checked}`, inline: true },
              { name: "New Drops Broadcasted", value: `${result.newDrops}`, inline: true },
            ],
            footer: { text: "Everfall Limited Watcher" },
            timestamp: new Date().toISOString(),
          },
        ],
        components: buildActionComponents(),
      });
    }

    default:
      return jsonResponse({ flags: EPHEMERAL_FLAG, content: "Unknown command." });
  }
}
