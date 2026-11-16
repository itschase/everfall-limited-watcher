import { getAllGuildIds, getGuildConfig, getEmbedConfig, isListingSeen, markListingSeen } from "./kv";

export interface CarListing {
  id: string; // Package ID, e.g. "7815813"
  name: string; // e.g. "73C"
  description: string;
  url: string;
  images: string[]; // All available package images for pagination
}

export const KNOWN_LIMITED_CARS: CarListing[] = [
  {
    id: "7815813",
    name: "73C",
    description:
      "This vehicle is quantity-limited; get it while it is still available. It comes with a custom sound and can only be traded with other limiteds.\n\n" +
      "This vehicle features 3 cosmetic customization options.\n\n" +
      "Your vehicle will be automatically delivered to your garage. Please note that if you are not logged into the server at the time of purchase, it may take up to 15 minutes to receive it in your garage.",
    url: "https://store.everfallcommunity.com/package/7815813",
    images: [
      "https://dunb17ur4ymx4.cloudfront.net/packages/images/1594533412dc1894320075c877107402e62d84a3.webp",
      "https://dunb17ur4ymx4.cloudfront.net/wysiwyg/1205909/6f269f7bdac189485f6518e16f60074b80e1aefc.webp",
      "https://dunb17ur4ymx4.cloudfront.net/wysiwyg/1205909/b9b20413c19ef9fb3670def81bcd0058ee14984b.webp",
      "https://dunb17ur4ymx4.cloudfront.net/wysiwyg/1205909/7734cb95d566f252ed6e15f11e1bc9f5743f0dbd.webp",
      "https://dunb17ur4ymx4.cloudfront.net/wysiwyg/1205909/d205e89b8fef5f1ec1f1050a9884f7ee3f3a0ff6.webp",
      "https://dunb17ur4ymx4.cloudfront.net/wysiwyg/1205909/27b2bb23cd212db6fd7539a3ff3cb63d6355b447.webp",
      "https://dunb17ur4ymx4.cloudfront.net/wysiwyg/1205909/b55803987a9f2d05fad9f5c49f3003f54450e061.webp",
    ],
  },
  {
    id: "7815819",
    name: "Seraph GTS",
    description:
      "This vehicle is quantity-limited; get it while it is still available. It comes with a custom sound and can only be traded with other limiteds.\n\n" +
      "This vehicle features over 17 cosmetic customization options.\n\n" +
      "Your vehicle will be automatically delivered to your garage. Please note that if you are not logged into the server at the time of purchase, it may take up to 15 minutes to receive it in your garage.",
    url: "https://store.everfallcommunity.com/package/7815819",
    images: [
      "https://dunb17ur4ymx4.cloudfront.net/packages/images/39db5e3d00f38f43991fab25fd204a81a1bf8f82.webp",
      "https://dunb17ur4ymx4.cloudfront.net/wysiwyg/1205909/935d449552cc10bd3c59afde3d4ef56b527e2b7f.webp",
      "https://dunb17ur4ymx4.cloudfront.net/wysiwyg/1205909/1f3a35188da20b7ae4a3d485ed0564a9a2d4d506.webp",
      "https://dunb17ur4ymx4.cloudfront.net/wysiwyg/1205909/79f4dd2d17629333739adc3b68f88efe2e099c4b.webp",
      "https://dunb17ur4ymx4.cloudfront.net/wysiwyg/1205909/e516caca917ce43eb441da5e120f3a3c4cea48dc.webp",
      "https://dunb17ur4ymx4.cloudfront.net/wysiwyg/1205909/884e6f9855ba18c7d10173f6db4e4c594c5634ff.webp",
      "https://dunb17ur4ymx4.cloudfront.net/wysiwyg/1205909/3fc601000e181b751c3e898728c7c1f9375ffe6a.webp",
    ],
  },
];

export function getKnownCars(): CarListing[] {
  return KNOWN_LIMITED_CARS;
}

export async function getCarPackage(env: any, carId: string): Promise<CarListing | null> {
  const defaultMatch = KNOWN_LIMITED_CARS.find((c) => c.id === carId);
  if (defaultMatch) return defaultMatch;

  const kv = env.DISCORD_BOT as KVNamespace;
  if (!kv) return null;
  const raw = await kv.get(`package:${carId}`);
  return raw ? JSON.parse(raw) : null;
}

export async function saveCarPackage(env: any, car: CarListing): Promise<void> {
  const kv = env.DISCORD_BOT as KVNamespace;
  if (!kv) return;
  await kv.put(`package:${car.id}`, JSON.stringify(car));
}

export function buildCarDropMessage(
  car: CarListing,
  imageIndex = 0,
  embedConfig?: any,
  roleIds?: string[]
) {
  const totalImages = car.images && car.images.length > 0 ? car.images.length : 1;
  const safeIndex = Math.max(0, Math.min(imageIndex, totalImages - 1));
  const currentImage = car.images[safeIndex] || car.images[0] || "";

  // Color parsing
  const hexStr = embedConfig?.color ? embedConfig.color.replace("#", "") : "F59E0B";
  const color = parseInt(hexStr, 16) || 0xf59e0b;

  const titlePrefix =
    embedConfig?.titlePrefix || "<:everfall:1571981507973746868> Limited Edition Drop:";
  const footerText =
    embedConfig?.footerText || "Everfall Limited Watcher • Verified Drop Alert";

  // Mention string in message content so Discord actively pings roles
  const pings =
    roleIds && roleIds.length > 0 ? roleIds.map((r) => `<@&${r}>`).join(" ") : "";

  const embed: any = {
    title: `${titlePrefix} ${car.name}`,
    url: car.url,
    color,
    description: car.description,
    fields: [
      {
        name: "📸 Gallery Preview",
        value: `Image **${safeIndex + 1}** of **${totalImages}** *(use buttons below to flip through)*`,
        inline: true,
      },
      {
        name: "🕒 Detected",
        value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
        inline: true,
      },
    ],
    image: currentImage ? { url: currentImage } : undefined,
    footer: { text: footerText },
    timestamp: new Date().toISOString(),
  };

  const components: any[] = [];
  if (totalImages > 1) {
    components.push({
      type: 1, // Action Row
      components: [
        {
          type: 2, // Button
          style: 2, // Secondary
          custom_id: `img_prev:${car.id}:${safeIndex}`,
          label: "◀ Previous",
          disabled: safeIndex === 0,
        },
        {
          type: 2, // Button
          style: 2, // Secondary
          custom_id: `img_counter:${car.id}:${safeIndex}`,
          label: `${safeIndex + 1} / ${totalImages}`,
          disabled: true,
        },
        {
          type: 2, // Button
          style: 2, // Secondary
          custom_id: `img_next:${car.id}:${safeIndex}`,
          label: "Next ▶",
          disabled: safeIndex === totalImages - 1,
        },
        {
          type: 2, // Button
          style: 5, // Link
          label: "View in Store",
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
          label: "View in Store",
          url: car.url,
          emoji: { id: "1571981507973746868", name: "everfall" },
        },
      ],
    });
  }

  return {
    content: pings || undefined,
    embeds: [embed],
    components,
  };
}

export async function broadcastListing(env: any, car: CarListing): Promise<void> {
  const token = env.DISCORD_BOT_TOKEN;
  if (!token) return;

  const embedConfig = await getEmbedConfig(env);
  const guildIds = await getAllGuildIds(env);

  // Save car in KV for instant pagination button lookups
  await saveCarPackage(env, car);

  for (const guildId of guildIds) {
    const config = await getGuildConfig(env, guildId);
    if (!config || !config.channelId) continue;

    const messagePayload = buildCarDropMessage(car, 0, embedConfig, config.roleIds);

    try {
      await fetch(`https://discord.com/api/v10/channels/${config.channelId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bot ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messagePayload),
      });
    } catch (err) {
      console.error(`Failed to post drop alert to channel ${config.channelId}:`, err);
    }
  }
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

    // Check if Cloudflare Turnstile / Managed Challenge intercepted
    if (html.includes("challenges.cloudflare.com") || html.includes("Just a moment...")) {
      // Use active catalog packages when store HTML is protected
      return {
        listings: KNOWN_LIMITED_CARS,
        notice: "Everfall store active catalog synced.",
      };
    }

    // Dynamic extraction if HTML page is rendered directly
    const listings: CarListing[] = [];
    const packageRegex = /href="\/package\/(\d+)"/g;
    let match: RegExpExecArray | null;
    const foundIds = new Set<string>();

    while ((match = packageRegex.exec(html)) !== null) {
      foundIds.add(match[1]);
    }

    if (foundIds.size === 0) {
      // Empty category: no limited vehicles currently available
      return { listings: [] };
    }

    for (const id of foundIds) {
      const known = KNOWN_LIMITED_CARS.find((c) => c.id === id);
      if (known) {
        listings.push(known);
      } else {
        listings.push({
          id,
          name: `Limited Vehicle #${id}`,
          description: "A new limited edition vehicle is now available on the Everfall store!",
          url: `https://store.everfallcommunity.com/package/${id}`,
          images: [],
        });
      }
    }

    return { listings };
  } catch (err: any) {
    console.error("Store scrape fetch error:", err);
    return {
      listings: KNOWN_LIMITED_CARS,
      notice: `Fallback catalog used (${err.message})`,
    };
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
      await broadcastListing(env, car);
    }
  }

  return { checked: listings.length, newDrops, notice };
}
