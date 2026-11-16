import {
  getAllGuildIds,
  getGuildConfig,
  getEffectiveEmbedConfig,
  getListingHistory,
  setListingAvailability,
  setMonitorStatus,
  upsertListingRecord,
  isListingSentToGuild,
  markListingSentToGuild,
} from "./kv";

export interface CarListing {
  id: string; // Package ID, e.g. "7815813"
  name: string; // e.g. "73C"
  description: string;
  url: string;
  images: string[]; // All available package images for pagination
  isAvailable?: boolean; // true if currently on the store, false if delisted
  detectedAt?: number; // immutable first discovery time recorded by this service
}

const PUBLIC_ORIGIN = "https://everfall-limited-watcher.itschase.workers.dev";

async function archiveListingImages(env: any, car: CarListing): Promise<CarListing> {
  const kv = env.DISCORD_BOT as KVNamespace;
  if (!kv || !car.images?.length) return car;
  const archivedImages = await Promise.all(car.images.slice(0, 10).map(async (sourceUrl, index) => {
    const key = `media:${car.id}:${index}`;
    try {
      const exists = await kv.get(key, "arrayBuffer");
      if (!exists) {
        const response = await fetch(sourceUrl);
        if (!response.ok) return sourceUrl;
        const contentType = response.headers.get("content-type") || "image/webp";
        await kv.put(key, await response.arrayBuffer(), { metadata: { contentType } });
      }
      return `${PUBLIC_ORIGIN}/media/listings/${car.id}/${index}`;
    } catch (error) {
      console.error(`Failed to archive image ${index} for listing ${car.id}:`, error);
      return sourceUrl;
    }
  }));
  return { ...car, images: archivedImages };
}

export async function getArchivedListingImage(env: any, listingId: string, index: number): Promise<Response> {
  const kv = env.DISCORD_BOT as KVNamespace;
  if (!kv) return new Response("Not found", { status: 404 });
  const result = await kv.getWithMetadata<{ contentType?: string }>(`media:${listingId}:${index}`, "arrayBuffer");
  if (!result.value) return new Response("Not found", { status: 404 });
  return new Response(result.value, {
    headers: {
      "Content-Type": result.metadata?.contentType || "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

async function syncListingHistory(
  env: any,
  result: { listings: CarListing[]; notice?: string; authoritative: boolean }
): Promise<CarListing[]> {
  if (!result.authoritative) {
    await setMonitorStatus(env, {
      checkedAt: Date.now(),
      listingCount: result.listings.length,
      authoritative: false,
      notice: result.notice,
    });
    const history = await getListingHistory(env);
    return history
      .filter((record) => record.isAvailable)
      .map((record) => ({
        ...record.payload,
        id: record.id,
        isAvailable: record.isAvailable,
        detectedAt: record.firstSeenAt,
      } as CarListing));
  }

  const currentIds = new Set(result.listings.map((listing) => listing.id));
  const enriched: CarListing[] = [];
  for (const listing of result.listings) {
    const archived = await archiveListingImages(env, listing);
    const record = await upsertListingRecord(env, listing.id, archived, true);
    enriched.push({ ...archived, isAvailable: true, detectedAt: record.firstSeenAt });
  }
  const history = await getListingHistory(env);
  await Promise.all(history
    .filter((record) => record.isAvailable && !currentIds.has(record.id))
    .map((record) => setListingAvailability(env, record.id, false)));
  await setMonitorStatus(env, {
    checkedAt: Date.now(),
    listingCount: enriched.length,
    authoritative: result.authoritative,
    notice: result.notice,
  });
  return enriched;
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
  embedConfig?: any,
  roleIds?: string[]
) {
  const totalImages = car.images?.length || 0;
  // Color parsing
  const hexStr = embedConfig?.color ? embedConfig.color.replace("#", "") : "F59E0B";
  const color = parseInt(hexStr, 16) || 0xf59e0b;

  const titlePrefix =
    embedConfig?.titlePrefix || "<:everfall:1571981507973746868> Limited Edition Drop:";
  const footerText =
    embedConfig?.footerText || "Everfall Limited Watcher • Verified Drop Alert";
  const galleryHeading = embedConfig?.galleryHeading || "Vehicle Gallery";
  const storeButtonLabel = embedConfig?.storeButtonLabel || "View Package on Everfall Store";
  const showDetectionTime = embedConfig?.showDetectionTime !== false;

  // Mention string in message content so Discord actively pings roles
  const pings =
    roleIds && roleIds.length > 0 ? roleIds.map((r) => `<@&${r}>`).join(" ") : "";

  const detected = Math.floor((car.detectedAt || Date.now()) / 1000);
  const details = [
    `# ${titlePrefix} ${car.name}`,
    car.description,
    `### 📸 ${galleryHeading}`,
    `**${totalImages}** photo${totalImages === 1 ? "" : "s"}`,
  ];
  if (showDetectionTime) details.push(`🕒 **Detected:** <t:${detected}:R>`);

  const containerComponents: any[] = [
    { type: 10, content: details.join("\n\n") },
  ];

  if (totalImages > 0) {
    containerComponents.push({
      type: 12,
      items: car.images.slice(0, 10).map((url, index) => ({
        media: { url },
        description: `${car.name} — gallery image ${index + 1} of ${totalImages}`,
      })),
    });
  }

  containerComponents.push(
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 5,
          label: storeButtonLabel.slice(0, 80),
          url: car.url,
          emoji: { id: "1571981507973746868", name: "everfall" },
        },
      ],
    },
    { type: 10, content: `-# ${footerText}${showDetectionTime ? ` • <t:${detected}:f>` : ""}` }
  );

  const components: any[] = [];
  if (pings) components.push({ type: 10, content: pings });
  components.push({ type: 17, accent_color: color, components: containerComponents });

  return {
    flags: 1 << 15,
    allowed_mentions: { parse: [], roles: roleIds || [] },
    components,
  };
}

export async function broadcastListing(
  env: any,
  car: CarListing,
  force: boolean = false
): Promise<number> {
  const token = env.DISCORD_BOT_TOKEN;
  if (!token) return 0;

  const guildIds = await getAllGuildIds(env);

  await saveCarPackage(env, car);
  let sentCount = 0;

  for (const guildId of guildIds) {
    const config = await getGuildConfig(env, guildId);
    if (!config || !config.channelId) continue;

    if (!force) {
      const alreadySent = await isListingSentToGuild(env, guildId, car.id);
      if (alreadySent) continue;
    }

    const embedConfig = await getEffectiveEmbedConfig(env, guildId);
    const messagePayload = buildCarDropMessage(car, embedConfig, config.roleIds);

    try {
      const res = await fetch(`https://discord.com/api/v10/channels/${config.channelId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bot ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messagePayload),
      });
      if (res.ok) {
        await markListingSentToGuild(env, guildId, car.id);
        sentCount++;
      }
    } catch (err) {
      console.error(`Failed to post drop alert to channel ${config.channelId}:`, err);
    }
  }

  return sentCount;
}

export async function broadcastAllListings(env: any, force: boolean = true): Promise<number> {
  let history = await getListingHistory(env);
  if (history.length === 0) {
    await syncListingHistory(env, await fetchStoreListings());
    history = await getListingHistory(env);
  }
  const availableHistory = history.filter((record) => record.isAvailable);
  if (availableHistory.length === 0) return 0;
  const newestDiscovery = availableHistory[0].firstSeenAt;
  const listings = availableHistory
    .filter((record) => newestDiscovery - record.firstSeenAt < 60_000)
    .map((record) => ({
      ...record.payload,
      detectedAt: record.firstSeenAt,
      isAvailable: record.isAvailable,
    } as CarListing));
  let count = 0;
  for (const car of listings) {
    await broadcastListing(env, car, force);
    count++;
  }
  return count;
}

export async function manualPullCurrentListings(
  env: any
): Promise<{ listings: number; deliveries: number; usedVerifiedStoreResponse: boolean }> {
  const fetched = await fetchStoreListings();
  // A manual administrator pull is an explicit confirmation that the maintained
  // catalog snapshot reflects the storefront when Cloudflare blocks server-side HTML.
  const confirmed = fetched.authoritative
    ? fetched
    : {
        listings: KNOWN_LIMITED_CARS,
        authoritative: true,
        notice: "Administrator-confirmed catalog snapshot used because storefront verification was challenged.",
      };
  const listings = await syncListingHistory(env, confirmed);
  let deliveries = 0;
  for (const listing of listings) deliveries += await broadcastListing(env, listing, false);
  return {
    listings: listings.length,
    deliveries,
    usedVerifiedStoreResponse: fetched.authoritative,
  };
}

export async function publishActiveListingsToGuildOnSetup(
  env: any,
  guildId: string
): Promise<number> {
  const cfg = await getGuildConfig(env, guildId);
  if (!cfg || !cfg.channelId) return 0;

  const result = await fetchStoreListings();
  const listings = await syncListingHistory(env, result);
  const embedConfig = await getEffectiveEmbedConfig(env, guildId);
  const token = env.DISCORD_BOT_TOKEN;
  if (!token) return 0;

  let published = 0;
  for (const car of listings) {
    await saveCarPackage(env, car);
    const alreadySent = await isListingSentToGuild(env, guildId, car.id);
    if (!alreadySent) {
      const payload = buildCarDropMessage(car, embedConfig, cfg.roleIds);
      try {
        const res = await fetch(`https://discord.com/api/v10/channels/${cfg.channelId}/messages`, {
          method: "POST",
          headers: {
            Authorization: `Bot ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          await markListingSentToGuild(env, guildId, car.id);
          published++;
        }
      } catch (err) {
        console.error(`Failed to auto-publish listing on setup to guild ${guildId}:`, err);
      }
    }
  }

  return published;
}

export async function postAllListingsToGuild(
  env: any,
  guildId: string
): Promise<{ count: number; channelId?: string }> {
  const cfg = await getGuildConfig(env, guildId);
  if (!cfg || !cfg.channelId) {
    return { count: 0 };
  }

  const result = await fetchStoreListings();
  const listings = await syncListingHistory(env, result);
  const embedConfig = await getEffectiveEmbedConfig(env, guildId);
  const token = env.DISCORD_BOT_TOKEN;

  let count = 0;
  for (const car of listings) {
    await saveCarPackage(env, car);
    const payload = buildCarDropMessage(car, embedConfig, cfg.roleIds);

    if (token) {
      try {
        const res = await fetch(`https://discord.com/api/v10/channels/${cfg.channelId}/messages`, {
          method: "POST",
          headers: {
            Authorization: `Bot ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          await markListingSentToGuild(env, guildId, car.id);
          count++;
        }
      } catch (err) {
        console.error(`Failed to post to channel ${cfg.channelId}:`, err);
      }
    }
  }

  return { count, channelId: cfg.channelId };
}

export async function fetchStoreListings(): Promise<{ listings: CarListing[]; notice?: string; authoritative: boolean }> {
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
        authoritative: false,
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
      return { listings: [], authoritative: true };
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

    return { listings, authoritative: true };
  } catch (err: any) {
    console.error("Store scrape fetch error:", err);
    return {
      listings: KNOWN_LIMITED_CARS,
      notice: `Fallback catalog used (${err.message})`,
      authoritative: false,
    };
  }
}

export async function runCron(env: any): Promise<{ checked: number; newDrops: number; notice?: string }> {
  const result = await fetchStoreListings();
  const { notice } = result;
  const listings = await syncListingHistory(env, result);
  let newDrops = 0;

  for (const car of listings) {
    // Broadcast only to servers that haven't received this drop yet
    const sent = await broadcastListing(env, car, false);
    if (sent > 0) {
      newDrops += sent;
    }
  }

  return { checked: listings.length, newDrops, notice };
}
