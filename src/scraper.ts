import {
  getAllGuildIds,
  getGuildConfig,
  getEffectiveEmbedConfig,
  getListingHistory,
  getMonitorStatus,
  setListingAvailability,
  setMonitorStatus,
  upsertListingRecord,
  isListingSentToGuild,
  markListingSentToGuild,
  appendDeliveryLog,
  DEFAULT_EMBED_CONFIG,
} from "./kv";
import { fetchDiscordWithRetry } from "./discord";

export interface CarListing {
  id: string; // Package ID, e.g. "7815813"
  name: string; // e.g. "73C"
  description: string;
  url: string;
  images: string[]; // All available package images for pagination
  isAvailable?: boolean; // true if currently on the store, false if sold out / 404
  detectedAt?: number; // immutable first discovery time recorded by this service
  lastVerifiedAt?: number; // latest successful verification time
  soldOutAt?: number; // first confirmed sold-out timestamp
  lastHttpStatus?: number;
}

const MIN_STORE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
// const MIN_STORE_CHECK_INTERVAL_MS = 10 * 60 * 1000; --15 minutes
const STORE_HEADERS = {
  "User-Agent": "EverfallLimitedWatcher/1.0/itschase",
  Accept: "text/html",
};

export function resolvePublicOrigin(env: any, originHint?: string): string {
  const candidates = [env?.PUBLIC_ORIGIN, originHint, env?.APP_URL];
  for (const raw of candidates) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    try {
      const parsed = new URL(raw.trim());
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.origin;
      }
    } catch {
      // Ignore malformed URL candidates
    }
  }
  return "";
}

function isDiscordSafeHttpsOrigin(origin: string): boolean {
  if (!origin.startsWith("https://")) return false;
  try {
    const { hostname } = new URL(origin);
    return hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "0.0.0.0";
  } catch {
    return false;
  }
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function archiveListingImages(
  env: any,
  car: CarListing,
  originHint?: string
): Promise<CarListing> {
  const kv = env.DISCORD_BOT as KVNamespace;
  if (!kv || !car.images?.length) return car;
  const origin = resolvePublicOrigin(env, originHint);
  const canUseOriginUrl = isDiscordSafeHttpsOrigin(origin);

  const archivedImages = await Promise.all(
    car.images.slice(0, 10).map(async (sourceUrl, index) => {
      if (!sourceUrl || sourceUrl.includes(`/media/listings/${car.id}/`)) {
        return sourceUrl;
      }
      const key = `media:${car.id}:${index}`;
      try {
        const existing = await kv.getWithMetadata<{ contentType?: string }>(key, "arrayBuffer");
        if (!existing.value) {
          const response = await fetch(sourceUrl);
          if (!response.ok) return sourceUrl;
          const contentType = response.headers.get("content-type") || "image/webp";
          await kv.put(key, await response.arrayBuffer(), { metadata: { contentType } });
        }
        return canUseOriginUrl ? `${origin}/media/listings/${car.id}/${index}` : sourceUrl;
      } catch (error) {
        console.error(`Failed to archive image ${index} for listing ${car.id}:`, error);
        return sourceUrl;
      }
    })
  );
  return { ...car, images: archivedImages };
}

export async function getArchivedListingImage(
  env: any,
  listingId: string,
  index: number
): Promise<Response> {
  const kv = env.DISCORD_BOT as KVNamespace;
  if (!kv) return new Response("Not found", { status: 404 });
  const result = await kv.getWithMetadata<{ contentType?: string }>(
    `media:${listingId}:${index}`,
    "arrayBuffer"
  );
  if (!result.value) return new Response("Not found", { status: 404 });
  return new Response(result.value, {
    headers: {
      "Content-Type": result.metadata?.contentType || "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

async function verifyListingPackageEndpoint(
  id: string
): Promise<{ status: "available" | "sold_out" | "unknown"; httpStatus?: number }> {
  const url = `https://store.everfallcommunity.com/package/${id}`;
  try {
    const res = await fetch(url, { headers: STORE_HEADERS, redirect: "follow" });
    const httpStatus = res.status;
    if (httpStatus === 404 || httpStatus === 410) {
      return { status: "sold_out", httpStatus };
    }
    const html = await res.text();    
    if (
      !res.ok ||
      html.includes("challenges.cloudflare.com") ||
      html.includes("Just a moment...") ||
      html.includes("Attention Required!")
    ) {
      return { status: "unknown", httpStatus };
    }
    if (/Page Not Found|Package not found|404/i.test(html) && !/Add to Basket|package\/\d+/i.test(html)) {
      return { status: "sold_out", httpStatus: 404 };
    }
    return { status: "available", httpStatus };
  } catch {
    return { status: "unknown" };
  }
}

export async function ensureHistoricalKnownListingsPreserved(
  env: any,
  originHint?: string
): Promise<void> {
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  if (!kv) return;

  // Preserve the two known historical vehicles without marking them In Stock by default.
  // Existing KV records in production are never overwritten.
  const baseHistoricalTimes: Record<string, number> = {
    "7815813": Date.UTC(2026, 10, 15, 22, 0, 0),
    "7815819": Date.UTC(2026, 10, 16, 22, 46, 0),
  };

  for (const car of KNOWN_LIMITED_CARS) {
    const existing = await kv.get(`listing:${car.id}`);
    if (existing) continue;
    const archived = await archiveListingImages(env, car, originHint);
    await upsertListingRecord(env, car.id, archived, false, {
      firstSeenAtOverride: baseHistoricalTimes[car.id] || Date.now(),
      lastHttpStatus: 404,
      markVerified: false,
    });
  }
}

async function syncListingHistory(
  env: any,
  result: { listings: CarListing[]; notice?: string; authoritative: boolean },
  options: {
    acceptNonAuthoritativeListings?: boolean;
    updateMonitorStatus?: boolean;
    originHint?: string;
  } = {}
): Promise<CarListing[]> {
  await ensureHistoricalKnownListingsPreserved(env, options.originHint);
  const updateMonitorStatus = options.updateMonitorStatus !== false;
  const previousStatus = await getMonitorStatus(env);

  if (!result.authoritative && !options.acceptNonAuthoritativeListings) {
    if (updateMonitorStatus) {
      await setMonitorStatus(env, {
        checkedAt: Date.now(),
        lastSuccessAt: previousStatus?.lastSuccessAt,
        listingCount: result.listings.length,
        authoritative: false,
        notice: result.notice,
      });
    }
    return getAvailableHistoryListings(env);
  }

  const currentIds = new Set(result.listings.map((listing) => listing.id));
  const enriched: CarListing[] = [];
  const existingAvailability = !result.authoritative
    ? new Map((await getListingHistory(env)).map((record) => [record.id, record.isAvailable]))
    : new Map<string, boolean>();

  for (const listing of result.listings) {
    const archived = await archiveListingImages(env, listing, options.originHint);
    const isAvailable = result.authoritative
      ? true
      : existingAvailability.get(listing.id) ?? true;
    const record = await upsertListingRecord(env, listing.id, archived, isAvailable, {
      lastHttpStatus: 200,
      markVerified: result.authoritative,
    });
    enriched.push({
      ...archived,
      isAvailable,
      detectedAt: record.firstSeenAt,
      lastVerifiedAt: record.lastVerifiedAt,
      soldOutAt: record.soldOutAt,
      lastHttpStatus: record.lastHttpStatus,
    });
  }

  if (result.authoritative) {
    const history = await getListingHistory(env);
    const missingFromCategory = history.filter(
      (record) => record.isAvailable && !currentIds.has(record.id)
    );
    await Promise.all(
      missingFromCategory.map(async (record) => {
        // Confirm removal / HTTP 404 directly on the package endpoint before marking Sold Out
        const check = await verifyListingPackageEndpoint(record.id);
        if (check.status === "sold_out") { //if (check.status === "sold_out" || missingFromCategory.length > 0) { 
          // ensures vehicles are only marked Sold Out when the individual product verification reports that status, rather than simply because they're missing from the category.
          await setListingAvailability(
            env,
            record.id,
            false,
            check.httpStatus ?? 404
          );
        }
      })
    );
  }

  if (updateMonitorStatus) {
    const now = Date.now();
    await setMonitorStatus(env, {
      checkedAt: now,
      lastSuccessAt: result.authoritative ? now : previousStatus?.lastSuccessAt,
      listingCount: enriched.length,
      authoritative: result.authoritative,
      notice: result.notice,
    });
  }
  return enriched.filter((listing) => listing.isAvailable !== false);
}

async function getAvailableHistoryListings(env: any): Promise<CarListing[]> {
  await ensureHistoricalKnownListingsPreserved(env);
  const history = await getListingHistory(env);
  return history
    .filter((record) => record.isAvailable)
    .map(
      (record) =>
        ({
          ...record.payload,
          id: record.id,
          isAvailable: true,
          detectedAt: record.firstSeenAt,
          lastVerifiedAt: record.lastVerifiedAt,
          soldOutAt: record.soldOutAt,
          lastHttpStatus: record.lastHttpStatus,
        }) as CarListing
    );
}

async function getRateLimitedStoreListings(
  env: any,
  originHint?: string
): Promise<{ listings: CarListing[]; notice?: string; checkedStore: boolean }> {
  const status = await getMonitorStatus(env);
  if (status && Date.now() - status.checkedAt < MIN_STORE_CHECK_INTERVAL_MS) {
    return {
      listings: await getAvailableHistoryListings(env),
      notice: "Using recorded listing history; storefront was checked recently.",
      //notice: "Using recorded listing history; storefront was checked less than 10 minutes ago.",
      checkedStore: false,
    };
  }
  const result = await fetchStoreListings();
  return {
    listings: await syncListingHistory(env, result, { originHint }),
    notice: result.notice,
    checkedStore: true,
  };
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
  const kv = env.DISCORD_BOT as KVNamespace;
  if (kv) {
    const listingRaw = await kv.get(`listing:${carId}`);
    if (listingRaw) {
      const record = JSON.parse(listingRaw);
      if (record?.payload) {
        return {
          ...record.payload,
          id: carId,
          detectedAt: record.firstSeenAt || record.ts,
          isAvailable: record.isAvailable !== false,
        };
      }
    }
    const pkgRaw = await kv.get(`package:${carId}`);
    if (pkgRaw) return JSON.parse(pkgRaw);
  }

  return KNOWN_LIMITED_CARS.find((c) => c.id === carId) || null;
}

export async function saveCarPackage(env: any, car: CarListing): Promise<void> {
  const kv = env.DISCORD_BOT as KVNamespace;
  if (!kv) return;
  await kv.put(`package:${car.id}`, JSON.stringify(car));
}

function stripCustomEmojisFromPayload(payload: any): any {
  const cloned = JSON.parse(JSON.stringify(payload));
  if (Array.isArray(cloned.components)) {
    for (const top of cloned.components) {
      if (Array.isArray(top.components)) {
        for (const inner of top.components) {
          if (Array.isArray(inner.components)) {
            for (const btn of inner.components) {
              if (btn.emoji?.id) delete btn.emoji;
            }
          }
          if (inner.emoji?.id) delete inner.emoji;
        }
      }
    }
  }
  return cloned;
}

export async function sendDiscordChannelMessage(
  token: string,
  channelId: string,
  messagePayload: any
): Promise<{ ok: boolean; messageId?: string; httpStatus?: number; error?: string }> {
  const endpoint = `https://discord.com/api/v10/channels/${channelId}/messages`;
  const headers = {
    Authorization: `Bot ${token}`,
    "Content-Type": "application/json",
  };

  let res = await fetchDiscordWithRetry(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(messagePayload),
  });

  if (res.ok) {
    try {
      const json: any = await res.json();
      return { ok: true, messageId: json?.id, httpStatus: res.status };
    } catch {
      return { ok: true, httpStatus: res.status };
    }
  }

  let errorBody = await res.text();
  if (res.status === 400 && /emoji/i.test(errorBody)) {
    const fallbackPayload = stripCustomEmojisFromPayload(messagePayload);
    res = await fetchDiscordWithRetry(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(fallbackPayload),
    });
    if (res.ok) {
      try {
        const json: any = await res.json();
        return { ok: true, messageId: json?.id, httpStatus: res.status };
      } catch {
        return { ok: true, httpStatus: res.status };
      }
    }
    errorBody = await res.text();
  }

  console.error(`Discord message error (channel ${channelId}, status ${res.status}):`, errorBody);
  return {
    ok: false,
    httpStatus: res.status,
    error: `Discord API ${res.status}: ${errorBody.slice(0, 180)}`,
  };
}

export function buildCarDropMessage(
  car: CarListing,
  embedConfig?: any,
  roleIds?: string[],
  env?: any,
  options: { isTest?: boolean } = {}
) {
  const validImages = (car.images || []).filter(
    (img) => typeof img === "string" && /^https?:\/\//i.test(img)
  );
  const totalImages = validImages.length;
  const isSoldOut = car.isAvailable === false;

  const hexStr = isSoldOut
    ? "DC2626"
    : embedConfig?.color
      ? embedConfig.color.replace("#", "")
      : "F59E0B";
  const color = parseInt(hexStr, 16) || 0xf59e0b;

  const titlePrefix = embedConfig?.titlePrefix?.trim() || DEFAULT_EMBED_CONFIG.titlePrefix;
  const footerText = embedConfig?.footerText?.trim() || DEFAULT_EMBED_CONFIG.footerText;
  const storeButtonLabel = isSoldOut
    ? embedConfig?.soldOutButtonLabel?.trim() || DEFAULT_EMBED_CONFIG.soldOutButtonLabel
    : embedConfig?.storeButtonLabel?.trim() || DEFAULT_EMBED_CONFIG.storeButtonLabel;
  const showDetectionTime = embedConfig?.showDetectionTime !== false;
  const showLastVerified = embedConfig?.showLastVerified !== false;

  const storeEmojiId =
    typeof env?.DISCORD_STORE_EMOJI_ID === "string"
      ? env.DISCORD_STORE_EMOJI_ID.trim()
      : "1571981507973746868";

  const pings =
    !options.isTest && roleIds && roleIds.length > 0
      ? roleIds.map((r) => `<@&${r}>`).join(" ")
      : "";

  const detected = Math.floor((car.detectedAt || Date.now()) / 1000);
  const verified = Math.floor((car.lastVerifiedAt || car.detectedAt || Date.now()) / 1000);
  const safeDescription = (car.description || "Limited-edition vehicle listing on Everfall Store.")
    .slice(0, 2500);
  const testBanner = options.isTest ? `**[TEST NOTIFICATION]**\n` : "";
  const details = [
    `${testBanner}# ${titlePrefix} ${car.name}`.slice(0, 256),
    `**Availability:** ${isSoldOut ? "Sold Out" : "In Stock"}`,
    safeDescription,
  ];
  if (showDetectionTime) details.push(`**First Detected:** <t:${detected}:f> (<t:${detected}:R>)`);
  if (showLastVerified) details.push(`**Last Verified:** <t:${verified}:f>`);

  const containerComponents: any[] = [{ type: 10, content: details.join("\n\n") }];

  if (totalImages > 0) {
    containerComponents.push({
      type: 12,
      items: validImages.slice(0, 10).map((url, index) => ({
        media: { url },
        description: `${car.name} — gallery image ${index + 1} of ${totalImages}`,
      })),
    });
  }

  const storeButton: Record<string, any> = {
    type: 2,
    style: isSoldOut ? 5 : 5,
    label: storeButtonLabel.slice(0, 80),
    url: isSoldOut ? "https://store.everfallcommunity.com/" : car.url,
  };
  if (storeEmojiId && !isSoldOut) {
    storeButton.emoji = { id: storeEmojiId, name: "everfall" };
  }

  containerComponents.push(
    {
      type: 1,
      components: [storeButton],
    },
    {
      type: 10,
      content: `-# ${footerText}${options.isTest ? " • Test Dispatch" : ""}`,
    }
  );

  const components: any[] = [];
  if (pings) components.push({ type: 10, content: pings });
  components.push({ type: 17, accent_color: color, components: containerComponents });

  return {
    flags: 1 << 15,
    allowed_mentions: { parse: [], roles: options.isTest ? [] : roleIds || [] },
    components,
  };
}

export async function dispatchListingToGuild(
  env: any,
  car: CarListing,
  guildId: string,
  options: {
    method: "auto" | "manual" | "test" | "setup";
    forceResend?: boolean;
    includeRoleMentions?: boolean;
    overrideChannelId?: string;
  }
): Promise<{ ok: boolean; messageId?: string; error?: string; skippedAlreadySent?: boolean }> {
  const token = env.DISCORD_BOT_TOKEN;
  if (!token) return { ok: false, error: "DISCORD_BOT_TOKEN is not configured." };

  const config = await getGuildConfig(env, guildId);
  const channelId = options.overrideChannelId || config?.channelId || "";
  if (!channelId) {
    return { ok: false, error: "No alert channel configured for this server." };
  }

  const environment = config?.environment === "test" ? "test" : "production";
  if (options.method === "test" && environment !== "test") {
    return {
      ok: false,
      error: "Test dispatch blocked: destination server is not designated as a Test server.",
    };
  }

  if (options.method !== "test" && !options.forceResend) {
    const alreadySent = await isListingSentToGuild(env, guildId, car.id);
    if (alreadySent) {
      return { ok: false, skippedAlreadySent: true };
    }
  }

  await saveCarPackage(env, car);
  const embedConfig = await getEffectiveEmbedConfig(env, guildId);
  const roles =
    options.includeRoleMentions === false
      ? []
      : options.method === "test"
        ? []
        : config?.roleIds || [];
  const messagePayload = buildCarDropMessage(car, embedConfig, roles, env, {
    isTest: options.method === "test",
  });

  const result = await sendDiscordChannelMessage(token, channelId, messagePayload);
  await appendDeliveryLog(env, {
    id: crypto.randomUUID(),
    listingId: car.id,
    listingName: car.name,
    guildId,
    channelId,
    messageId: result.messageId,
    method: options.method,
    environment,
    status: result.ok ? "delivered" : "failed",
    httpStatus: result.httpStatus,
    error: result.error,
    timestamp: Date.now(),
  });

  if (result.ok && options.method !== "test") {
    await markListingSentToGuild(env, guildId, car.id);
  }
  return result;
}

export async function broadcastListing(
  env: any,
  car: CarListing,
  force: boolean = false
): Promise<number> {
  const guildIds = await getAllGuildIds(env);
  let sentCount = 0;

  for (const guildId of guildIds) {
    const config = await getGuildConfig(env, guildId);
    if (!config || !config.channelId) continue;
    const res = await dispatchListingToGuild(env, car, guildId, {
      method: "auto",
      forceResend: force,
    });
    if (res.ok) sentCount++;
  }

  return sentCount;
}

export async function broadcastAllListings(
  env: any,
  force: boolean = true
): Promise<{ attempted: number; deliveries: number }> {
  await ensureHistoricalKnownListingsPreserved(env);
  let history = await getListingHistory(env);
  if (history.length === 0) {
    await getRateLimitedStoreListings(env);
    history = await getListingHistory(env);
  }
  const availableHistory = history.filter((record) => record.isAvailable);
  if (availableHistory.length === 0) return { attempted: 0, deliveries: 0 };

  const newestDiscovery = availableHistory[0].firstSeenAt;
  const listings = availableHistory
    .filter((record) => newestDiscovery - record.firstSeenAt < 60_000)
    .map(
      (record) =>
        ({
          ...record.payload,
          id: record.id,
          detectedAt: record.firstSeenAt,
          lastVerifiedAt: record.lastVerifiedAt,
          soldOutAt: record.soldOutAt,
          isAvailable: record.isAvailable,
        }) as CarListing
    );

  let deliveries = 0;
  for (const car of listings) {
    deliveries += await broadcastListing(env, car, force);
  }
  return { attempted: listings.length, deliveries };
}

export async function manualScanStoreOnly(
  env: any,
  originHint?: string
): Promise<{
  listings: CarListing[];
  usedVerifiedStoreResponse: boolean;
  newDiscoveries: number;
  notice?: string;
}> {
  await ensureHistoricalKnownListingsPreserved(env, originHint);
  const beforeIds = new Set((await getListingHistory(env)).map((r) => r.id));
  const fetched = await fetchStoreListings();

  if (fetched.authoritative) {
    await syncListingHistory(env, fetched, { originHint });
  } else {
    const previousStatus = await getMonitorStatus(env);
    await setMonitorStatus(env, {
      checkedAt: Date.now(),
      lastSuccessAt: previousStatus?.lastSuccessAt,
      listingCount: previousStatus?.listingCount || 0,
      authoritative: false,
      notice: fetched.notice,
    });
  }

  // Never send Discord notifications during a manual scan
  const updatedHistory = await getListingHistory(env);
  const listings = updatedHistory.map(
    (record) =>
      ({
        ...record.payload,
        id: record.id,
        isAvailable: record.isAvailable,
        detectedAt: record.firstSeenAt,
        lastVerifiedAt: record.lastVerifiedAt,
        soldOutAt: record.soldOutAt,
        lastHttpStatus: record.lastHttpStatus,
      }) as CarListing
  );
  const newDiscoveries = updatedHistory.filter((r) => !beforeIds.has(r.id)).length;

  return {
    listings,
    usedVerifiedStoreResponse: fetched.authoritative,
    newDiscoveries,
    notice: fetched.notice,
  };
}

export async function manualPullCurrentListings(
  env: any,
  originHint?: string
): Promise<{
  listings: number;
  deliveries: number;
  usedVerifiedStoreResponse: boolean;
  notice?: string;
}> {
  // Separated from auto-publishing per Issue #6 & #8: scan & stage without broadcasting
  const scan = await manualScanStoreOnly(env, originHint);
  const availableCount = scan.listings.filter((l) => l.isAvailable).length;
  return {
    listings: availableCount,
    deliveries: 0,
    usedVerifiedStoreResponse: scan.usedVerifiedStoreResponse,
    notice: scan.notice,
  };
}

export async function publishActiveListingsToGuildOnSetup(
  env: any,
  guildId: string,
  originHint?: string
): Promise<{ published: number; error?: string }> {
  const cfg = await getGuildConfig(env, guildId);
  if (!cfg || !cfg.channelId) return { published: 0 };

  const { listings } = await getRateLimitedStoreListings(env, originHint);
  const embedConfig = await getEffectiveEmbedConfig(env, guildId);
  const token = env.DISCORD_BOT_TOKEN;
  if (!token) {
    return { published: 0, error: "DISCORD_BOT_TOKEN is not configured." };
  }

  let published = 0;
  let lastError: string | undefined;

  for (const car of listings) {
    await saveCarPackage(env, car);
    const alreadySent = await isListingSentToGuild(env, guildId, car.id);
    if (!alreadySent) {
      const payload = buildCarDropMessage(car, embedConfig, cfg.roleIds, env);
      try {
        const res = await sendDiscordChannelMessage(token, cfg.channelId, payload);
        if (res.ok) {
          await markListingSentToGuild(env, guildId, car.id);
          published++;
        } else {
          lastError = res.error;
        }
      } catch (err: any) {
        console.error(`Failed to auto-publish listing on setup to guild ${guildId}:`, err);
        lastError = err?.message || "Network error sending message to Discord";
      }
    }
  }

  return { published, error: lastError };
}

export async function postAllListingsToGuild(
  env: any,
  guildId: string,
  originHint?: string
): Promise<{ count: number; channelId?: string; error?: string; notice?: string }> {
  const cfg = await getGuildConfig(env, guildId);
  if (!cfg || !cfg.channelId) {
    return { count: 0 };
  }

  const { listings, notice } = await getRateLimitedStoreListings(env, originHint);
  if (!env.DISCORD_BOT_TOKEN) {
    return {
      count: 0,
      channelId: cfg.channelId,
      error: "DISCORD_BOT_TOKEN is not configured.",
      notice,
    };
  }

  let count = 0;
  let lastError: string | undefined;

  for (const car of listings) {
    const res = await dispatchListingToGuild(env, car, guildId, {
      method: "auto",
      forceResend: false,
    });
    if (res.ok) {
      count++;
    } else if (res.error) {
      lastError = res.error;
    }
  }

  return { count, channelId: cfg.channelId, error: lastError, notice };
}

async function fetchPackageDetails(id: string): Promise<CarListing> {
  const url = `https://store.everfallcommunity.com/package/${id}`;
  const fallback: CarListing = {
    id,
    name: `Limited Vehicle #${id}`,
    description: "A new limited edition vehicle is now available on the Everfall store!",
    url,
    images: [],
  };

  try {
    const res = await fetch(url, { headers: STORE_HEADERS });
    if (!res.ok) return fallback;
    const html = await res.text();
    if (html.includes("challenges.cloudflare.com") || html.includes("Just a moment...")) {
      return fallback;
    }

    const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1];
    const h1Title = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, "");
    const rawName = ogTitle || h1Title || fallback.name;
    const name = decodeHtmlEntities(rawName).replace(/\s*[|\-–]\s*Everfall.*$/i, "").trim() || fallback.name;

    const ogDesc = html.match(
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i
    )?.[1];
    const metaDesc = html.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i
    )?.[1];
    const description = decodeHtmlEntities(ogDesc || metaDesc || fallback.description);

    const images = new Set<string>();
    const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1];
    if (ogImage && /^https?:\/\//i.test(ogImage)) images.add(ogImage);

    const imgRegex = /https:\/\/dunb17ur4ymx4\.cloudfront\.net\/(?:packages\/images|wysiwyg)\/[^\s"'<>]+/gi;
    let imgMatch: RegExpExecArray | null;
    while ((imgMatch = imgRegex.exec(html)) !== null) {
      images.add(imgMatch[0]);
      if (images.size >= 10) break;
    }

    return {
      id,
      name,
      description,
      url,
      images: [...images],
    };
  } catch (err) {
    console.error(`Failed to fetch package details for ${id}:`, err);
    return fallback;
  }
}

export async function fetchStoreListings(): Promise<{
  listings: CarListing[];
  notice?: string;
  authoritative: boolean;
}> {
  const storeUrl = "https://store.everfallcommunity.com/category/limited-cars";

  try {
    const res = await fetch(storeUrl, { headers: STORE_HEADERS });
    const html = await res.text();
        console.log("Everfall store verification", {
      httpStatus: res.status,
      responseUrl: res.url,
      success: res.ok,
      cloudflareChallenge:
        html.includes("challenges.cloudflare.com") ||
        html.includes("Just a moment...") ||
        html.includes("Attention Required!"),
      responseLength: html.length,
      timestamp: new Date().toISOString(),
    });

    // Any failed, challenged, or unrecognizable response is non-authoritative.
    if (
      !res.ok ||
      html.includes("challenges.cloudflare.com") ||
      html.includes("Just a moment...") ||
      html.includes("Attention Required!")
    ) {
      return {
        listings: [],
        notice: "Store verification was blocked; recorded history was preserved without availability changes.",
        authoritative: false,
      };
    }

    const packageRegex = /href="\/package\/(\d+)"/g;
    let match: RegExpExecArray | null;
    const foundIds = new Set<string>();
    while ((match = packageRegex.exec(html)) !== null) {
      foundIds.add(match[1]);
    }

    const confirmedCategoryPage =
      html.length > 200 &&
      (/Limited\s+Cars/i.test(html) || foundIds.size > 0) &&
      (/Tebex/i.test(html) || /everfall/i.test(html) || foundIds.size > 0);

    if (!confirmedCategoryPage) {
      return {
        listings: [],
        notice:
          "Store response could not be verified as the Limited Cars category; availability history was preserved.",
        authoritative: false,
      };
    }

    if (foundIds.size === 0) {
      return { listings: [], authoritative: true };
    }

    const listings: CarListing[] = [];
    for (const id of foundIds) {
      const known = KNOWN_LIMITED_CARS.find((c) => c.id === id);
      if (known) {
        listings.push(known);
      } else {
        listings.push(await fetchPackageDetails(id));
      }
    }

    return { listings, authoritative: true };
  } catch (err: any) {
    console.error("Store scrape fetch error:", err);
    return {
      listings: [],
      notice: `Store scrape failed (${err?.message || "unknown error"}); recorded history was preserved.`,
      authoritative: false,
    };
  }
}

export async function runCron(
  env: any,
  originHint?: string
): Promise<{ checked: number; newDrops: number; notice?: string }> {
  const { listings, notice } = await getRateLimitedStoreListings(env, originHint);
  let newDrops = 0;

  for (const car of listings) {
    const sent = await broadcastListing(env, car, false);
    if (sent > 0) {
      newDrops += sent;
    }
  }

  return { checked: listings.length, newDrops, notice };
}
