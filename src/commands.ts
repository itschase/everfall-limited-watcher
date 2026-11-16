// commands.ts – Discord interaction handler with Rich Embeds and Interactive Components

import { InteractionResponseType, InteractionType, verifyKey } from "discord-interactions";
import { getGuildConfig, setGuildConfig, addGuildRole, removeGuildRole, getEmbedConfig, GuildConfig } from "./kv";
import {
  fetchStoreListings,
  getCarPackage,
  postAllListingsToGuild,
  publishActiveListingsToGuildOnSetup,
  CarListing,
} from "./scraper";

const EPHEMERAL_FLAG = 64;

function jsonResponse(data: any, type = InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE) {
  return new Response(JSON.stringify({ type, data }), {
    headers: { "Content-Type": "application/json" },
  });
}

function buildNotConfiguredEmbed() {
  return {
    title: "⚠️ Setup Required Before Running Check",
    description:
      "Everfall Limited Watcher has not been configured in this server yet.\n\n" +
      "Before running store checks, you must designate the alert channel where limited car drop embeds will be posted.",
    color: 0xf59e0b, // Amber
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

function buildMultiCarCheckResponse(cfg: GuildConfig, listings: CarListing[], embedConfig: any) {
  if (listings.length === 0) {
    return {
      flags: EPHEMERAL_FLAG,
      embeds: [
        {
          title: "🏎️ Everfall Store Live Audit",
          color: 0x10b981,
          description:
            "✅ Store scanned. **No limited vehicles are currently listed** on the Everfall store.\n\n" +
            "Automated background sweeps will continue checking every 15 minutes around the clock.",
          fields: [
            { name: "🎯 Target Channel", value: `<#${cfg.channelId}>`, inline: true },
            {
              name: "👥 Mention Roles",
              value: cfg.roleIds.length ? cfg.roleIds.map((r) => `<@&${r}>`).join(" ") : "*None*",
              inline: true,
            },
          ],
          footer: { text: "Everfall Limited Watcher • Manual Check • Only visible to you" },
          timestamp: new Date().toISOString(),
        },
      ],
      components: buildActionComponents(),
    };
  }

  const embeds: any[] = [];
  const components: any[] = [];

  for (const car of listings.slice(0, 3)) {
    const totalImages = car.images && car.images.length > 0 ? car.images.length : 1;
    const currentImage = car.images[0] || "";
    const hexStr = embedConfig?.color ? embedConfig.color.replace("#", "") : "F59E0B";
    const color = parseInt(hexStr, 16) || 0xf59e0b;
    const titlePrefix = embedConfig?.titlePrefix || "<:everfall:1571981507973746868> Limited Edition Drop:";

    embeds.push({
      title: `${titlePrefix} ${car.name}`,
      url: car.url,
      color,
      description: car.description,
      fields: [
        {
          name: "📸 Gallery",
          value: `Image **1** of **${totalImages}** *(use buttons below to view)*`,
          inline: true,
        },
        {
          name: "🎯 Destination Channel",
          value: `<#${cfg.channelId}>`,
          inline: true,
        },
      ],
      image: currentImage ? { url: currentImage } : undefined,
      footer: { text: embedConfig?.footerText || "Everfall Limited Watcher • Live Store Check" },
      timestamp: new Date().toISOString(),
    });

    if (totalImages > 1) {
      components.push({
        type: 1, // Action Row
        components: [
          {
            type: 2,
            style: 2,
            custom_id: `img_prev:${car.id}:0`,
            label: `◀ Prev (${car.name})`,
            disabled: true,
          },
          {
            type: 2,
            style: 2,
            custom_id: `img_counter:${car.id}:0`,
            label: `1 / ${totalImages}`,
            disabled: true,
          },
          {
            type: 2,
            style: 2,
            custom_id: `img_next:${car.id}:0`,
            label: `Next ▶ (${car.name})`,
            disabled: false,
          },
          {
            type: 2,
            style: 5,
            label: `View in Store`,
            url: car.url,
            emoji: { id: "1571981507973746868", name: "everfall" },
          },
        ],
      });
    } else {
      components.push({
        type: 1,
        components: [
          {
            type: 2,
            style: 5,
            label: `View in Store`,
            url: car.url,
            emoji: { id: "1571981507973746868", name: "everfall" },
          },
        ],
      });
    }
  }

  // Utility row: Re-scan & Admin Portal buttons
  components.push({
    type: 1,
    components: [
      {
        type: 2,
        style: 1,
        custom_id: "action_check",
        label: "Re-scan Store",
        emoji: { name: "🔄" },
      },
      {
        type: 2,
        style: 5,
        url: "https://everfall-limited-watcher.itschase.workers.dev/admin",
        label: "Admin Portal",
        emoji: { name: "⚙️" },
      },
    ],
  });

  return {
    flags: EPHEMERAL_FLAG,
    embeds,
    components,
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
          "`/check` — Runs an on-demand store scrape immediately and shows active drops\n" +
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
          url: "https://store.everfallcommunity.com/category/limited-cars",
          label: "Everfall Store",
          emoji: { name: "🛒" },
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
    const customId = data?.custom_id as string;

    // A. Handle Image Gallery Pagination (◀ Previous / Next ▶)
    if (customId?.startsWith("img_prev:") || customId?.startsWith("img_next:")) {
      const parts = customId.split(":");
      const action = parts[0];
      const carId = parts[1];
      const currentIdx = parseInt(parts[2], 10);
      const newIdx = action === "img_next" ? currentIdx + 1 : currentIdx - 1;

      const car = await getCarPackage(env, carId);
      if (car) {
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
          {
            embeds: messageEmbeds,
            components: messageComponents,
          },
          7 // UPDATE_MESSAGE: smoothly changes image and button state
        );
      }
    }

    // B. Handle Scan Store Button
    if (customId === "action_check") {
      const cfg = guild_id ? await getGuildConfig(env, guild_id) : null;
      if (!cfg || !cfg.channelId) {
        return jsonResponse(
          {
            flags: EPHEMERAL_FLAG,
            embeds: [buildNotConfiguredEmbed()],
            components: buildActionComponents(),
          },
          7 // UPDATE_MESSAGE
        );
      }

      const result = await postAllListingsToGuild(env, guild_id);
      return jsonResponse(
        {
          flags: EPHEMERAL_FLAG,
          embeds: [
            {
              title: "✅ Store Check Dispatched",
              description: `Scanned the Everfall store and automatically posted **${result.count}** active vehicle drop(s) to <#${cfg.channelId}> with full gallery view and role mentions!`,
              color: 0x10b981,
              footer: { text: "Everfall Limited Watcher" },
              timestamp: new Date().toISOString(),
            },
          ],
          components: buildActionComponents(),
        },
        7 // UPDATE_MESSAGE
      );
    }

    // C. Handle View Config Button
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

    // D. Handle Interactive Channel Select Menu
    if (customId === "select_channel") {
      const selectedChannel = data?.values?.[0];
      if (guild_id && selectedChannel) {
        const existing = (await getGuildConfig(env, guild_id)) ?? { channelId: "", roleIds: [] };
        await setGuildConfig(env, guild_id, { ...existing, channelId: selectedChannel });

        // Auto-publish any currently active store listings that haven't been sent to this server yet
        const publishedCount = await publishActiveListingsToGuildOnSetup(env, guild_id);

        const updatedEmbed = {
          title: "✅ Alert Channel Updated",
          color: 0x10b981,
          description:
            `Vehicle drop alerts will now be posted to <#${selectedChannel}>!\n\n` +
            (publishedCount > 0
              ? `🎉 **Auto-Published ${publishedCount} Active Listing(s)** directly to <#${selectedChannel}>!`
              : `ℹ️ All currently active store listings have already been published in this server.`),
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

      // Auto-publish any currently active store listings that haven't been sent to this server yet
      const publishedCount = await publishActiveListingsToGuildOnSetup(env, guild_id);

      return jsonResponse({
        flags: EPHEMERAL_FLAG,
        embeds: [
          {
            title: "✅ Alert Channel Configured",
            description:
              `Successfully set <#${channel}> as the vehicle alerts channel.\n\n` +
              (publishedCount > 0
                ? `🎉 **Auto-Published ${publishedCount} Active Listing(s)** directly to <#${channel}>!`
                : `ℹ️ All currently active store listings have already been published in this server.`),
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
      const cfg = await getGuildConfig(env, guild_id);
      if (!cfg || !cfg.channelId) {
        return jsonResponse({
          flags: EPHEMERAL_FLAG,
          embeds: [buildNotConfiguredEmbed()],
          components: buildActionComponents(),
        });
      }

      const result = await postAllListingsToGuild(env, guild_id);
      if (result.count === 0) {
        return jsonResponse({
          content: "🔎 **Everfall Limited Store Check**: No limited vehicles are currently listed on the store.",
        });
      }

      const isAlertChannel = body.channel_id === cfg.channelId;
      return jsonResponse({
        content: isAlertChannel
          ? `🔎 **Everfall Limited Store Check**: Scanned store and automatically posted all **${result.count}** active limited drops below!`
          : `✅ **Everfall Limited Store Check**: Scanned store and automatically posted all **${result.count}** active limited drops to <#${cfg.channelId}>!`,
      });
    }

    default:
      return jsonResponse({ flags: EPHEMERAL_FLAG, content: "Unknown command." });
  }
}
