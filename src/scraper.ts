import { getAllGuildIds, getGuildConfig, isListingSeen, markListingSeen } from "./kv";

export interface CarListing {
  id: string;
  name: string;
  price: string;
  url: string;
  image?: string;
  stock?: string;
}

export async function fetchStoreListings(): Promise<{ listings: CarListing[]; notice?: string }> {
  const storeUrl = "https://store.everfallcommunity.com/category/limited-cars";

  try {
    const res = await fetch(storeUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      },
    });

    const html = await res.text();

    // Check if Cloudflare Turnstile / Challenge intercepted the request
    if (html.includes("challenges.cloudflare.com") || html.includes("Just a moment...")) {
      return {
        listings: [],
        notice: "Everfall store is currently protected by Cloudflare Turnstile challenge.",
      };
    }

    // Extract packages from HTML (standard Tebex / Web store template structure)
    const listings: CarListing[] = [];
    const packageRegex = /<div[^>]*class="[^"]*package[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
    let match: RegExpExecArray | null;

    while ((match = packageRegex.exec(html)) !== null) {
      const block = match[1];
      const nameMatch = /<h3[^>]*>([^<]+)<\/h3>/i.exec(block) || /class="[^"]*title[^"]*"[^>]*>([^<]+)</i.exec(block);
      const priceMatch = /class="[^"]*price[^"]*"[^>]*>([^<]+)</i.exec(block) || /\$([0-9,.]+)/.exec(block);
      const imgMatch = /<img[^>]*src="([^"]+)"/i.exec(block);
      const linkMatch = /<a[^>]*href="([^"]+)"/i.exec(block);

      if (nameMatch) {
        const name = nameMatch[1].trim();
        const id = name.toLowerCase().replace(/[^a-z0-9]/g, "-");
        listings.push({
          id,
          name,
          price: priceMatch ? priceMatch[1].trim() : "View in Store",
          image: imgMatch ? imgMatch[1] : undefined,
          url: linkMatch ? linkMatch[1] : storeUrl,
          stock: "In Stock",
        });
      }
    }

    return { listings };
  } catch (err: any) {
    console.error("Failed to scrape Everfall store:", err);
    return { listings: [], notice: `Scrape error: ${err.message}` };
  }
}

export async function broadcastNewListing(env: any, car: CarListing): Promise<void> {
  const token = env.DISCORD_BOT_TOKEN;
  if (!token) return;

  const guildIds = await getAllGuildIds(env);

  for (const guildId of guildIds) {
    const config = await getGuildConfig(env, guildId);
    if (!config || !config.channelId) continue;

    const pings = config.roleIds.length > 0 ? config.roleIds.map((r) => `<@&${r}>`).join(" ") : "";

    const payload = {
      content: pings ? `🚨 **NEW LIMITED DROP ALERT** ${pings}` : `🚨 **NEW LIMITED DROP ALERT**`,
      embeds: [
        {
          title: `🏎️ ${car.name}`,
          url: car.url,
          color: 0xf59e0b, // Amber Gold
          description: `A new limited-stock vehicle was detected in the Everfall store!`,
          fields: [
            { name: "💵 Price", value: car.price, inline: true },
            { name: "📦 Status", value: car.stock || "Available", inline: true },
            {
              name: "🕒 Checked",
              value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
              inline: true,
            },
          ],
          image: car.image ? { url: car.image } : undefined,
          footer: { text: "Everfall Limited Watcher • Automated Store Alert" },
          timestamp: new Date().toISOString(),
        },
      ],
      components: [
        {
          type: 1, // ACTION_ROW
          components: [
            {
              type: 2, // BUTTON
              style: 5, // LINK
              label: "Open in Everfall Store",
              url: car.url,
            },
          ],
        },
      ],
    };

    try {
      await fetch(`https://discord.com/api/v10/channels/${config.channelId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bot ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error(`Failed to post alert to channel ${config.channelId}:`, err);
    }
  }
}

export async function runCron(env: any): Promise<{ checked: number; newDrops: number; notice?: string }> {
  const { listings, notice } = await fetchStoreListings();
  let newDrops = 0;

  for (const car of listings) {
    const seen = await isListingSeen(env, car.id);
    if (!seen) {
      newDrops++;
      await markListingSeen(env, car.id, car);
      await broadcastNewListing(env, car);
    }
  }

  return { checked: listings.length, newDrops, notice };
}
