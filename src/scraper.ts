import {
  findGuildMessageByMessageId,
  getAllGuildIds,
  getAllWidgetDeployments,
  getBotHealthSnapshot,
  getCatalogSnapshot,
  getDeliveryLogs,
  getGuildConfig,
  getGuildSentMessages,
  getListingHistory,
  getListingOverridesMap,
  getListingRecordById,
  getMonitorStatus,
  getPresentationConfig,
  getWidgetDeploymentById,
  purgePublicEdgeCaches,
  saveWidgetDeploymentsBatch,
  setListingAvailability,
  setMonitorStatus,
  setWidgetDeployment,
  upsertListingRecord,
  isListingSentToGuild,
  markListingSentToGuild,
  appendDeliveryLog,
  appendMonitorLog,
  CatalogSnapshot,
  MonitorLogAttempt,
  MonitorLogSource,
  MonitorStatus,
  WidgetDeployment,
  WidgetSyncHistoryEntry,
} from "./kv";
import { fetchDiscordChannelMessage, fetchDiscordWithRetry } from "./discord";
import { MIN_STORE_CHECK_INTERVAL_MS } from "./shared/appConfig";
import {
  AnnouncementTemplate,
  buildCarDropPayload,
  buildWidgetPayload,
  computeWidgetContentHash,
  PresentationConfigBundle,
  resolveEffectiveWidgetTemplate,
  WidgetTemplateConfig,
} from "./shared/presentation";
import { VehicleMetadataOverride } from "./shared/features";

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

const FETCH_CRON_GRACE_MS = 45 * 60 * 1000;
const STORE_URLS = [
  "https://everfall.tebex.io/category/limited-cars",
  "https://store.everfallcommunity.com/category/limited-cars",
];
const STORE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  "Sec-CH-UA": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  "Sec-CH-UA-Mobile": "?0",
  "Sec-CH-UA-Platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};
const historicalSeededKVs = new WeakSet<object>();

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
  originHint?: string,
  existingImages?: string[]
): Promise<CarListing> {
  const kv = env.DISCORD_BOT as KVNamespace;
  const r2 = env.MEDIA_BUCKET as R2Bucket | undefined;
  if ((!kv && !r2) || !car.images?.length) return car;
  const origin = resolvePublicOrigin(env, originHint);
  const canUseOriginUrl = isDiscordSafeHttpsOrigin(origin);

  // Skip re-reading media blobs when existing record already references our archived URLs (and R2 has slot 0)
  if (
    canUseOriginUrl &&
    Array.isArray(existingImages) &&
    existingImages.length === car.images.length &&
    existingImages.every((u, idx) => u.startsWith(`${origin}/media/listings/${car.id}/${idx}`))
  ) {
    if (!r2 || (await r2.head(`media:${car.id}:0`))) {
      return { ...car, images: existingImages };
    }
  }

  const archivedImages = await Promise.all(
    car.images.slice(0, 10).map(async (sourceUrl, index) => {
      const targetUrl = canUseOriginUrl ? `${origin}/media/listings/${car.id}/${index}` : sourceUrl;
      if (!sourceUrl || sourceUrl.includes(`/media/listings/${car.id}/`)) {
        return sourceUrl;
      }
      if (existingImages?.[index] && existingImages[index].startsWith(targetUrl)) {
        if (!r2 || (await r2.head(`media:${car.id}:${index}`))) {
          return existingImages[index];
        }
      }
      const key = `media:${car.id}:${index}`;
      try {
        if (r2) {
          const existingR2 = await r2.head(key);
          if (!existingR2) {
            // Migrate from KV if already archived previously before hitting origin CDN
            const existingKv = kv
              ? await kv.getWithMetadata<{ contentType?: string }>(key, "arrayBuffer")
              : null;
            if (existingKv?.value) {
              await r2.put(key, existingKv.value, {
                httpMetadata: {
                  contentType: existingKv.metadata?.contentType || "image/webp",
                },
              });
            } else {
              const response = await fetch(sourceUrl);
              if (!response.ok) return sourceUrl;
              const contentType = response.headers.get("content-type") || "image/webp";
              await r2.put(key, await response.arrayBuffer(), {
                httpMetadata: { contentType },
              });
            }
          }
        } else if (kv) {
          const existing = await kv.getWithMetadata<{ contentType?: string }>(key, "arrayBuffer");
          if (!existing.value) {
            const response = await fetch(sourceUrl);
            if (!response.ok) return sourceUrl;
            const contentType = response.headers.get("content-type") || "image/webp";
            await kv.put(key, await response.arrayBuffer(), { metadata: { contentType } });
          }
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
  index: number,
  request?: Request
): Promise<Response> {
  const key = `media:${listingId}:${index}`;
  const r2 = env.MEDIA_BUCKET as R2Bucket | undefined;
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  const edgeCache: Cache | null =
    typeof caches !== "undefined" && (caches as any)?.default ? (caches as any).default : null;
  const cacheKey = request
    ? new Request(new URL(request.url).origin + new URL(request.url).pathname, { method: "GET" })
    : null;

  if (r2) {
    const obj = await r2.get(key);
    if (obj) {
      const etag = obj.httpEtag || `"r2-${listingId}-${index}-${obj.size}"`;
      if (request && request.headers.get("If-None-Match") === etag) {
        return new Response(null, {
          status: 304,
          headers: {
            ETag: etag,
            "Cache-Control": "public, max-age=60, must-revalidate",
          },
        });
      }
      return new Response(obj.body, {
        headers: {
          "Content-Type": obj.httpMetadata?.contentType || "image/webp",
          "Cache-Control": "public, max-age=60, must-revalidate",
          ETag: etag,
        },
      });
    }
  }

  if (edgeCache && cacheKey) {
    try {
      const cached = await edgeCache.match(cacheKey);
      if (cached) return cached;
    } catch {
      // Fall back to KV read
    }
  }

  if (!kv) return new Response("Not found", { status: 404 });
  const result = await kv.getWithMetadata<{ contentType?: string }>(key, "arrayBuffer");
  if (!result.value) return new Response("Not found", { status: 404 });

  // Lazily migrate legacy KV image blob into R2 when available
  if (r2) {
    try {
      await r2.put(key, result.value, {
        httpMetadata: {
          contentType: result.metadata?.contentType || "image/webp",
        },
      });
    } catch {
      // Non-fatal
    }
  }

  const etag = `"kv-${listingId}-${index}-${result.value.byteLength}"`;
  const response = new Response(result.value, {
    headers: {
      "Content-Type": result.metadata?.contentType || "image/webp",
      "Cache-Control": "public, max-age=60, must-revalidate",
      ETag: etag,
    },
  });

  if (edgeCache && cacheKey) {
    try {
      await edgeCache.put(cacheKey, response.clone());
    } catch {
      // Non-fatal
    }
  }

  return response;
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
  if (historicalSeededKVs.has(kv as object)) return;

  // Fast 1-read check against listings:all index before touching individual listing keys
  const registryRaw = await kv.get("listings:all");
  if (registryRaw) {
    try {
      const registry = JSON.parse(registryRaw);
      if (
        Array.isArray(registry) &&
        KNOWN_LIMITED_CARS.every((car) => registry.includes(car.id))
      ) {
        historicalSeededKVs.add(kv as object);
        return;
      }
    } catch {
      // Proceed to per-record verification if registry JSON is invalid
    }
  }

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
  historicalSeededKVs.add(kv as object);
}

type StoreFetchResult = {
  listings: CarListing[];
  notice?: string;
  authoritative: boolean;
  httpStatus: number | null;
  cloudflareChallenge: boolean;
  responseLength: number | null;
  targetUrl: string;
  durationMs: number;
  confirmedSoldOutIds?: string[];
  runner?: string;
  workflowRunUrl?: string;
  attempts?: MonitorLogAttempt[];
};

async function syncListingHistory(
  env: any,
  result: StoreFetchResult,
  options: {
    acceptNonAuthoritativeListings?: boolean;
    updateMonitorStatus?: boolean;
    originHint?: string;
    skipHistoryFetchWhenBlocked?: boolean;
    forceRecordWrite?: boolean;
    source?: MonitorLogSource;
  } = {}
): Promise<{
  availableListings: CarListing[];
  newDiscoveries: number;
  soldOutIds: string[];
  totalHistoryCount: number;
  catalogChanged: boolean;
  snapshot: CatalogSnapshot;
  monitorStatus: MonitorStatus | null;
}> {
  await ensureHistoricalKnownListingsPreserved(env, options.originHint);
  const updateMonitorStatus = options.updateMonitorStatus !== false;
  const previousStatus = await getMonitorStatus(env);
  const source = options.source || "other";

  if (!result.authoritative && !options.acceptNonAuthoritativeListings) {
    const snapshot = await getCatalogSnapshot(env);
    const availableCount = snapshot.records.filter((r) => r.isAvailable).length;
    let nextStatus = previousStatus;
    if (updateMonitorStatus) {
      nextStatus = {
        checkedAt: Date.now(),
        lastSuccessAt: previousStatus?.lastSuccessAt,
        lastFetchCronSuccessAt: previousStatus?.lastFetchCronSuccessAt,
        lastSource: source,
        listingCount: result.listings.length,
        authoritative: false,
        notice: result.notice,
        catalogVersion: snapshot.version || previousStatus?.catalogVersion,
        listingSummary: {
          total: snapshot.records.length,
          available: availableCount,
          soldOut: snapshot.records.length - availableCount,
        },
      };
      await setMonitorStatus(env, nextStatus);
      await purgePublicEdgeCaches(options.originHint || env?.PUBLIC_ORIGIN);
    }
    const preserved = options.skipHistoryFetchWhenBlocked ? snapshot.records : [];
    return {
      availableListings: options.skipHistoryFetchWhenBlocked ? [] : await getAvailableHistoryListings(env),
      newDiscoveries: 0,
      soldOutIds: [],
      totalHistoryCount: preserved.length,
      catalogChanged: false,
      snapshot,
      monitorStatus: nextStatus,
    };
  }

  const currentIds = new Set(result.listings.map((listing) => listing.id));
  const enriched: CarListing[] = [];
  const initialSnapshot = await getCatalogSnapshot(env);
  const history = initialSnapshot.records;
  const historyById = new Map(history.map((record) => [record.id, record]));
  const newDiscoveries = result.listings.filter((listing) => !historyById.has(listing.id)).length;

  for (const listing of result.listings) {
    const existingRecord = historyById.get(listing.id);
    const archived = await archiveListingImages(
      env,
      listing,
      options.originHint,
      existingRecord?.payload?.images
    );
    const isAvailable = result.authoritative
      ? true
      : existingRecord?.isAvailable ?? true;
    const record = await upsertListingRecord(env, listing.id, archived, isAvailable, {
      lastHttpStatus: 200,
      markVerified: result.authoritative,
      minWriteIntervalMs: options.forceRecordWrite ? undefined : 6 * 60 * 60 * 1000,
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

  const soldOutIds: string[] = [];
  if (result.authoritative) {
    const confirmedSoldOut = new Set(result.confirmedSoldOutIds || []);
    const missingFromCategory = history.filter(
      (record) => record.isAvailable && !currentIds.has(record.id)
    );
    await Promise.all(
      missingFromCategory.map(async (record) => {
        if (confirmedSoldOut.has(record.id)) {
          await setListingAvailability(env, record.id, false, 404);
          soldOutIds.push(record.id);
          return;
        }
        // Confirm removal / HTTP 404 directly on the package endpoint before marking Sold Out
        const check = await verifyListingPackageEndpoint(record.id);
        if (check.status === "sold_out") {
          await setListingAvailability(
            env,
            record.id,
            false,
            check.httpStatus ?? 404
          );
          soldOutIds.push(record.id);
        }
      })
    );
  }

  const latestSnapshot = await getCatalogSnapshot(env);
  const availableSummary = latestSnapshot.records.filter((r) => r.isAvailable).length;
  const catalogChanged =
    newDiscoveries > 0 ||
    soldOutIds.length > 0 ||
    latestSnapshot.version !== initialSnapshot.version;

  let nextMonitorStatus: MonitorStatus | null = previousStatus;
  if (updateMonitorStatus) {
    const now = Date.now();
    nextMonitorStatus = {
      checkedAt: now,
      lastSuccessAt: result.authoritative ? now : previousStatus?.lastSuccessAt,
      lastFetchCronSuccessAt:
        result.authoritative && (source === "cron-fetch" || source === "scrapling")
          ? now
          : previousStatus?.lastFetchCronSuccessAt,
      lastSource: source,
      listingCount: enriched.length,
      authoritative: result.authoritative,
      notice: result.notice,
      catalogVersion: latestSnapshot.version || previousStatus?.catalogVersion,
      listingSummary: {
        total: latestSnapshot.records.length,
        available: availableSummary,
        soldOut: latestSnapshot.records.length - availableSummary,
      },
    };
    await setMonitorStatus(env, nextMonitorStatus);
    await purgePublicEdgeCaches(options.originHint || env?.PUBLIC_ORIGIN);
  }
  return {
    availableListings: enriched.filter((listing) => listing.isAvailable !== false),
    newDiscoveries,
    soldOutIds,
    totalHistoryCount: latestSnapshot.records.length,
    catalogChanged,
    snapshot: latestSnapshot,
    monitorStatus: nextMonitorStatus,
  };
}

async function recordMonitorAttempt(
  env: any,
  source: MonitorLogSource,
  fetched: StoreFetchResult,
  newDiscoveries: number,
  extra: {
    soldOutListingIds?: string[];
    dispatchedDrops?: number;
    preservedHistoryCount?: number;
  } = {}
): Promise<void> {
  const status: "success" | "blocked" | "error" = fetched.authoritative
    ? "success"
    : fetched.cloudflareChallenge || fetched.httpStatus === 403 || fetched.httpStatus === 429
      ? "blocked"
      : "error";

  const message = fetched.authoritative
    ? `Verified ${fetched.listings.length} active listing${fetched.listings.length === 1 ? "" : "s"}${
        newDiscoveries > 0 ? ` (${newDiscoveries} new)` : ""
      }${extra.soldOutListingIds?.length ? `, ${extra.soldOutListingIds.length} sold out` : ""}.`
    : fetched.notice ||
      (fetched.cloudflareChallenge
        ? `Cloudflare challenge (HTTP ${fetched.httpStatus ?? 403}) blocked ${source} verification.`
        : `Store check returned non-authoritative status (HTTP ${fetched.httpStatus ?? "error"}).`);

  await appendMonitorLog(env, {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    source,
    status,
    httpStatus: fetched.httpStatus,
    cloudflareChallenge: fetched.cloudflareChallenge,
    authoritative: fetched.authoritative,
    responseLength: fetched.responseLength,
    targetUrl: fetched.targetUrl,
    listingCount: fetched.authoritative ? fetched.listings.length : 0,
    newDiscoveries,
    durationMs: fetched.durationMs,
    message,
    detectedListingIds: fetched.authoritative ? fetched.listings.map((item) => item.id) : [],
    detectedListingNames: fetched.authoritative ? fetched.listings.map((item) => item.name) : [],
    soldOutListingIds: extra.soldOutListingIds || [],
    dispatchedDrops: extra.dispatchedDrops ?? 0,
    preservedHistoryCount: extra.preservedHistoryCount,
    runner: fetched.runner,
    workflowRunUrl: fetched.workflowRunUrl,
    attempts: fetched.attempts,
  });
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
  originHint?: string,
  source: MonitorLogSource = "other",
  options: { skipHistoryFetchWhenBlocked?: boolean } = {}
): Promise<{
  listings: CarListing[];
  soldOutIds?: string[];
  notice?: string;
  checkedStore: boolean;
  authoritative?: boolean;
  catalogChanged?: boolean;
  snapshot?: CatalogSnapshot;
  monitorStatus?: MonitorStatus | null;
}> {
  const status = await getMonitorStatus(env);
  // If HTTP fetch cron (/cron) succeeded recently, let scheduled runner yield cleanly
  if (
    source === "scheduled" &&
    status?.lastFetchCronSuccessAt &&
    Date.now() - status.lastFetchCronSuccessAt < FETCH_CRON_GRACE_MS
  ) {
    return {
      listings: options.skipHistoryFetchWhenBlocked ? [] : await getAvailableHistoryListings(env),
      soldOutIds: [],
      notice: "HTTP fetch cron verified storefront recently; scheduled runner deferred.",
      checkedStore: false,
      authoritative: status.authoritative,
      catalogChanged: false,
      monitorStatus: status,
    };
  }

  const cooldownMs =
    source === "cron-fetch"
      ? 60 * 1000
      : status?.authoritative
        ? MIN_STORE_CHECK_INTERVAL_MS
        : 60 * 1000;
  if (status && Date.now() - status.checkedAt < cooldownMs) {
    console.log("Everfall store verification skipped", {
      source,
      reason: "rate_limited",
      lastCheckedAt: status.checkedAt,
      minimumIntervalMs: cooldownMs,
      timestamp: new Date().toISOString(),
    });
    return {
      listings: options.skipHistoryFetchWhenBlocked ? [] : await getAvailableHistoryListings(env),
      soldOutIds: [],
      notice: "Using recorded listing history; storefront was checked recently.",
      checkedStore: false,
      authoritative: status.authoritative,
      catalogChanged: false,
      monitorStatus: status,
    };
  }
  const result = await fetchStoreListings(source);
  const synced = await syncListingHistory(env, result, {
    originHint,
    skipHistoryFetchWhenBlocked: options.skipHistoryFetchWhenBlocked,
    source,
  });
  await recordMonitorAttempt(env, source, result, synced.newDiscoveries, {
    soldOutListingIds: synced.soldOutIds,
    preservedHistoryCount: synced.totalHistoryCount,
  });
  return {
    listings: synced.availableListings,
    soldOutIds: synced.soldOutIds,
    notice: result.notice,
    checkedStore: true,
    authoritative: result.authoritative,
    catalogChanged: synced.catalogChanged,
    snapshot: synced.snapshot,
    monitorStatus: synced.monitorStatus,
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
  const existingRecord = await getListingRecordById(env, carId);
  if (existingRecord?.payload) {
    return {
      ...existingRecord.payload,
      id: carId,
      detectedAt: existingRecord.firstSeenAt,
      lastVerifiedAt: existingRecord.lastVerifiedAt,
      soldOutAt: existingRecord.soldOutAt,
      isAvailable: existingRecord.isAvailable !== false,
    };
  }
  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  if (kv) {
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

export async function deleteDiscordChannelMessage(
  token: string,
  channelId: string,
  messageId: string
): Promise<{ ok: boolean; httpStatus?: number; error?: string }> {
  if (!token || !channelId || !messageId) {
    return { ok: false, error: "Missing token, channelId, or messageId." };
  }
  try {
    const res = await fetchDiscordWithRetry(
      `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bot ${token}` },
      }
    );
    if (res.ok || res.status === 404) {
      return { ok: true, httpStatus: res.status };
    }
    const errText = await res.text().catch(() => "");
    return {
      ok: false,
      httpStatus: res.status,
      error: `Discord API ${res.status}: ${errText.slice(0, 160)}`,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Network error deleting message." };
  }
}

export async function editDiscordChannelMessage(
  token: string,
  channelId: string,
  messageId: string,
  messagePayload: any
): Promise<{ ok: boolean; messageId?: string; httpStatus?: number; error?: string }> {
  const endpoint = `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`;
  const headers = {
    Authorization: `Bot ${token}`,
    "Content-Type": "application/json",
  };

  let res = await fetchDiscordWithRetry(endpoint, {
    method: "PATCH",
    headers,
    body: JSON.stringify(messagePayload),
  });

  if (res.ok) {
    try {
      const json: any = await res.json();
      return { ok: true, messageId: json?.id || messageId, httpStatus: res.status };
    } catch {
      return { ok: true, messageId, httpStatus: res.status };
    }
  }

  let errorBody = await res.text();
  if (
    res.status === 400 &&
    messagePayload?.flags === 32768 &&
    (/embed/i.test(errorBody) || /content/i.test(errorBody) || /flag/i.test(errorBody))
  ) {
    const legacyCleanPayload = { ...messagePayload, content: null, embeds: [] };
    res = await fetchDiscordWithRetry(endpoint, {
      method: "PATCH",
      headers,
      body: JSON.stringify(legacyCleanPayload),
    });
    if (res.ok) {
      try {
        const json: any = await res.json();
        return { ok: true, messageId: json?.id || messageId, httpStatus: res.status };
      } catch {
        return { ok: true, messageId, httpStatus: res.status };
      }
    }
    errorBody = await res.text();
  }
  if (res.status === 400 && /emoji/i.test(errorBody)) {
    const fallbackPayload = stripCustomEmojisFromPayload(messagePayload);
    res = await fetchDiscordWithRetry(endpoint, {
      method: "PATCH",
      headers,
      body: JSON.stringify(fallbackPayload),
    });
    if (res.ok) {
      try {
        const json: any = await res.json();
        return { ok: true, messageId: json?.id || messageId, httpStatus: res.status };
      } catch {
        return { ok: true, messageId, httpStatus: res.status };
      }
    }
    errorBody = await res.text();
  }

  console.error(`Discord message edit error (channel ${channelId}, msg ${messageId}, status ${res.status}):`, errorBody);
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
  options: {
    isTest?: boolean;
    isUpdate?: boolean;
    template?: AnnouncementTemplate;
    override?: VehicleMetadataOverride | null;
    portalOrigin?: string;
  } = {}
) {
  const isSoldOut = car.isAvailable === false;
  const fallbackStoreEmojiId =
    typeof env?.DISCORD_STORE_EMOJI_ID === "string"
      ? env.DISCORD_STORE_EMOJI_ID.trim()
      : "1571981507973746868";

  // Allow legacy EmbedConfig objects or rich AnnouncementTemplate objects
  let resolvedTemplate = options.template;
  if (!resolvedTemplate && embedConfig && typeof embedConfig === "object") {
    if ("accentColor" in embedConfig || "descriptionMode" in embedConfig) {
      resolvedTemplate = embedConfig as AnnouncementTemplate;
    } else if (!isSoldOut) {
      resolvedTemplate = {
        ...({
          accentColor: embedConfig.color || "#F59E0B",
          titlePrefix:
            typeof embedConfig.titlePrefix === "string"
              ? embedConfig.titlePrefix.replace(/<a?:[a-zA-Z0-9_]+:\d+>\s*/g, "").trim()
              : "Limited Edition Drop:",
          titleEmoji: {
            kind: "custom",
            id: fallbackStoreEmojiId || "1571981507973746868",
            name: "everfall",
            source: "application",
          },
          availabilityHeading: "Availability",
          statusLabel: "In Stock",
          statusEmoji: { kind: "unicode", name: "🟢", source: "unicode" },
          descriptionMode: "full_description",
          customDescription: "{short_description}\n\n{features}",
          showFeatures: true,
          featureOrder: ["quantity_limited", "custom_sound", "custom_options"],
          featureStyle: "inline_badges",
          showTradingInfo: true,
          showDeliveryInfo: true,
          showDetectionTime: embedConfig.showDetectionTime !== false,
          showLastVerified: embedConfig.showLastVerified !== false,
          showSoldOutTime: false,
          galleryMode: "all_gallery",
          primaryImageSlot: 0,
          footerText:
            typeof embedConfig.footerText === "string"
              ? embedConfig.footerText.trim()
              : "Everfall Limited Watcher • Verified Drop Alert",
          footerEmoji: null,
          showStoreButton: true,
          storeButtonLabel:
            embedConfig.storeButtonLabel?.trim() || "View Package on Everfall",
          storeButtonEmoji: fallbackStoreEmojiId
            ? {
                kind: "custom",
                id: fallbackStoreEmojiId,
                name: "everfall",
                source: "application",
              }
            : null,
          storeButtonUrlMode: "listing",
        } satisfies AnnouncementTemplate),
      };
    }
  }

  return buildCarDropPayload({
    car,
    override: options.override,
    template: resolvedTemplate,
    roleIds,
    portalOrigin: options.portalOrigin || resolvePublicOrigin(env),
    isTest: options.isTest,
    isUpdate: options.isUpdate,
    fallbackStoreEmojiId,
  });
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

  const [presentationBundle, overridesMap, monitorStatus] = await Promise.all([
    getPresentationConfig(env),
    getListingOverridesMap(env),
    getMonitorStatus(env),
  ]);
  const template =
    car.isAvailable === false
      ? presentationBundle.announcements.soldOut
      : presentationBundle.announcements.inStock;

  const roles =
    options.includeRoleMentions === false
      ? []
      : options.method === "test"
        ? []
        : config?.roleIds || [];
  const messagePayload = buildCarDropPayload({
    car,
    override: overridesMap[car.id] || null,
    template,
    roleIds: roles,
    portalOrigin: resolvePublicOrigin(env),
    isTest: options.method === "test",
    isUpdate: false,
    fallbackStoreEmojiId:
      typeof env?.DISCORD_STORE_EMOJI_ID === "string"
        ? env.DISCORD_STORE_EMOJI_ID.trim()
        : "1571981507973746868",
    monitorStatus,
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
    await markListingSentToGuild(env, guildId, car.id, {
      channelId,
      messageId: result.messageId,
      isSoldOutRendered: car.isAvailable === false,
    });
  }
  return result;
}

async function resolveDeployedMessageRef(
  env: any,
  guildId: string,
  listingId: string
): Promise<{ channelId: string; messageId: string } | null> {
  const sentMap = await getGuildSentMessages(env, guildId);
  const tracked = sentMap[listingId];
  if (tracked?.channelId && tracked?.messageId) {
    return { channelId: tracked.channelId, messageId: tracked.messageId };
  }
  // Fallback to scanning deliveryLogs for the latest delivered/updated messageId
  const logs = await getDeliveryLogs(env);
  const match = logs.find(
    (log) =>
      log.guildId === guildId &&
      log.listingId === listingId &&
      log.method !== "test" &&
      (log.status === "delivered" || log.status === "updated") &&
      log.channelId &&
      log.messageId
  );
  if (match && match.channelId && match.messageId) {
    return { channelId: match.channelId, messageId: match.messageId };
  }
  return null;
}

export async function updateSentListingEmbedForGuild(
  env: any,
  car: CarListing,
  guildId: string,
  options: { overrideMessageId?: string; overrideChannelId?: string } = {}
): Promise<{ ok: boolean; messageId?: string; channelId?: string; error?: string; skippedNotSent?: boolean }> {
  const token = env.DISCORD_BOT_TOKEN;
  if (!token) return { ok: false, error: "DISCORD_BOT_TOKEN is not configured." };

  const config = await getGuildConfig(env, guildId);
  const environment = config?.environment === "test" ? "test" : "production";

  let ref: { channelId: string; messageId: string } | null = null;
  if (options.overrideChannelId && options.overrideMessageId) {
    ref = { channelId: options.overrideChannelId, messageId: options.overrideMessageId };
  } else {
    ref = await resolveDeployedMessageRef(env, guildId, car.id);
  }

  if (!ref) {
    return {
      ok: false,
      skippedNotSent: true,
      error: "No tracked Discord message ID found for this listing in this server.",
    };
  }

  const [presentationBundle, overridesMap, monitorStatus] = await Promise.all([
    getPresentationConfig(env),
    getListingOverridesMap(env),
    getMonitorStatus(env),
  ]);
  const template =
    car.isAvailable === false
      ? presentationBundle.announcements.soldOut
      : presentationBundle.announcements.inStock;

  const messagePayload = buildCarDropPayload({
    car,
    override: overridesMap[car.id] || null,
    template,
    roleIds: [],
    portalOrigin: resolvePublicOrigin(env),
    isTest: false,
    isUpdate: true,
    fallbackStoreEmojiId:
      typeof env?.DISCORD_STORE_EMOJI_ID === "string"
        ? env.DISCORD_STORE_EMOJI_ID.trim()
        : "1571981507973746868",
    monitorStatus,
  });

  const res = await editDiscordChannelMessage(token, ref.channelId, ref.messageId, messagePayload);
  await appendDeliveryLog(env, {
    id: crypto.randomUUID(),
    listingId: car.id,
    listingName: car.name,
    guildId,
    channelId: ref.channelId,
    messageId: ref.messageId,
    method: "manual",
    environment,
    status: res.ok ? "updated" : "failed",
    httpStatus: res.httpStatus,
    error: res.error,
    timestamp: Date.now(),
  });

  if (res.ok) {
    await markListingSentToGuild(env, guildId, car.id, {
      channelId: ref.channelId,
      messageId: ref.messageId,
      isUpdate: true,
      isSoldOutRendered: car.isAvailable === false,
    });
  }

  return {
    ok: res.ok,
    messageId: ref.messageId,
    channelId: ref.channelId,
    error: res.error,
  };
}

export async function updateSoldOutListingEmbeds(
  env: any,
  listingId: string
): Promise<number> {
  const history = await getListingHistory(env);
  const record = history.find((r) => r.id === listingId);
  if (!record) return 0;

  const car: CarListing = {
    ...record.payload,
    id: record.id,
    detectedAt: record.firstSeenAt,
    lastVerifiedAt: record.lastVerifiedAt,
    soldOutAt: record.soldOutAt,
    isAvailable: record.isAvailable,
  };

  const guildIds = await getAllGuildIds(env);
  let updatedCount = 0;

  for (const guildId of guildIds) {
    const sentMap = await getGuildSentMessages(env, guildId);
    const meta = sentMap[listingId];
    if (!meta?.messageId || meta.isSoldOutRendered) continue;
    const res = await updateSentListingEmbedForGuild(env, car, guildId, {
      overrideChannelId: meta.channelId,
      overrideMessageId: meta.messageId,
    });
    if (res.ok) updatedCount++;
  }

  return updatedCount;
}

export interface ParsedDiscordMessageRef {
  messageId: string;
  channelId?: string;
  guildId?: string;
  fromUrl: boolean;
}

export function parseDiscordMessageReference(input: string): ParsedDiscordMessageRef | null {
  const trimmed = String(input || "").trim();
  if (!trimmed) return null;
  if (/^\d{17,22}$/.test(trimmed)) {
    return { messageId: trimmed, fromUrl: false };
  }
  const urlMatch = trimmed.match(
    /^https?:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/channels\/(\d{17,22})\/(\d{17,22})\/(\d{17,22})(?:[/?#].*)?$/i
  );
  if (urlMatch) {
    return {
      guildId: urlMatch[1],
      channelId: urlMatch[2],
      messageId: urlMatch[3],
      fromUrl: true,
    };
  }
  return null;
}

export interface RecoverableEmbedPreview {
  messageId: string;
  channelId: string;
  guildId: string;
  jumpUrl: string;
  authorId: string;
  authorUsername: string;
  authorIsBot: boolean;
  sentAt: number;
  editedAt?: number | null;
  title: string;
  description: string;
  accentColorHex: string | null;
  imageUrl: string | null;
  embedCount: number;
  componentCount: number;
  isComponentsV2: boolean;
  isAlreadySoldOutLook: boolean;
}

export interface RecoverableEmbedConflict {
  messageAlreadyLinkedToListingId?: string;
  messageAlreadyLinkedToGuildId?: string;
  listingAlreadyHasMessageId?: string;
  listingAlreadyHasChannelId?: string;
}

function extractPreviewFromDiscordMessage(
  msg: any,
  guildId: string,
  channelId: string
): RecoverableEmbedPreview {
  const embeds = Array.isArray(msg?.embeds) ? msg.embeds : [];
  const components = Array.isArray(msg?.components) ? msg.components : [];
  const firstEmbed = embeds[0] || null;
  const isComponentsV2 = Boolean(msg?.flags && (Number(msg.flags) & (1 << 15)) === 1 << 15);

  let v2TextParts: string[] = [];
  let v2ImageUrl: string | null = null;
  let v2AccentHex: string | null = null;
  for (const top of components) {
    if (top?.type === 17) {
      if (typeof top.accent_color === "number") {
        v2AccentHex = `#${top.accent_color.toString(16).padStart(6, "0").toUpperCase()}`;
      }
      if (Array.isArray(top.components)) {
        for (const inner of top.components) {
          if (inner?.type === 10 && typeof inner.content === "string") {
            v2TextParts.push(inner.content);
          } else if (inner?.type === 12 && Array.isArray(inner.items) && !v2ImageUrl) {
            const firstUrl = inner.items[0]?.media?.url;
            if (typeof firstUrl === "string") v2ImageUrl = firstUrl;
          }
        }
      }
    } else if (top?.type === 10 && typeof top.content === "string") {
      v2TextParts.push(top.content);
    }
  }

  const combinedV2 = v2TextParts.join("\n\n").trim();
  const titleLineMatch = combinedV2.match(/^#\s+(.+)$/m);
  const title =
    String(firstEmbed?.title || titleLineMatch?.[1] || "").trim() ||
    "Untitled Bot Announcement";
  const description =
    String(
      firstEmbed?.description ||
        combinedV2.replace(/^#\s+.+\n*/m, "").trim() ||
        msg?.content ||
        ""
    )
      .trim()
      .slice(0, 600);
  const imageUrl =
    firstEmbed?.image?.url ||
    firstEmbed?.thumbnail?.url ||
    v2ImageUrl ||
    null;
  const accentColorHex =
    typeof firstEmbed?.color === "number"
      ? `#${firstEmbed.color.toString(16).padStart(6, "0").toUpperCase()}`
      : v2AccentHex;

  const sentAt = msg?.timestamp ? Date.parse(msg.timestamp) || Date.now() : Date.now();
  const editedAt = msg?.edited_timestamp ? Date.parse(msg.edited_timestamp) || null : null;
  const fullText = `${title}\n${description}`;
  const isAlreadySoldOutLook = /sold\s*out/i.test(fullText);

  return {
    messageId: String(msg.id),
    channelId: String(msg.channel_id || channelId),
    guildId,
    jumpUrl: `https://discord.com/channels/${guildId}/${String(msg.channel_id || channelId)}/${String(msg.id)}`,
    authorId: String(msg?.author?.id || ""),
    authorUsername: String(msg?.author?.username || "Unknown"),
    authorIsBot: Boolean(msg?.author?.bot),
    sentAt,
    editedAt,
    title,
    description,
    accentColorHex,
    imageUrl,
    embedCount: embeds.length,
    componentCount: components.length,
    isComponentsV2,
    isAlreadySoldOutLook,
  };
}

async function resolveExpectedBotUserId(env: any): Promise<string | null> {
  const cached = await getBotHealthSnapshot(env);
  if (cached?.appId && /^\d{17,22}$/.test(cached.appId)) {
    // Health snapshot appId may equal bot user id in Discord, still double-check /users/@me when token available
  }
  const token = env.DISCORD_BOT_TOKEN;
  if (!token) return null;
  try {
    const res = await fetchDiscordWithRetry("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bot ${token}` },
    });
    if (res.ok) {
      const user: any = await res.json();
      if (user?.id) return String(user.id);
    }
  } catch {
    // Ignore transient failure
  }
  return null;
}

export async function inspectRecoverableDiscordEmbed(
  env: any,
  params: {
    guildId: string;
    channelId: string;
    messageIdOrUrl: string;
    listingId: string;
  }
): Promise<{
  ok: boolean;
  httpStatus: number;
  error?: string;
  preview?: RecoverableEmbedPreview;
  conflicts?: RecoverableEmbedConflict;
  listingName?: string;
  listingIsAvailable?: boolean;
}> {
  const token = env.DISCORD_BOT_TOKEN;
  if (!token) {
    return { ok: false, httpStatus: 400, error: "DISCORD_BOT_TOKEN is not configured." };
  }

  const parsedRef = parseDiscordMessageReference(params.messageIdOrUrl);
  if (!parsedRef) {
    return {
      ok: false,
      httpStatus: 400,
      error: "Enter a valid Discord Message ID (17–22 digits) or full Discord message link.",
    };
  }

  if (parsedRef.guildId && parsedRef.guildId !== params.guildId) {
    return {
      ok: false,
      httpStatus: 400,
      error: `Message link belongs to server ${parsedRef.guildId}, which does not match the selected destination server (${params.guildId}).`,
    };
  }

  const effectiveChannelId = (parsedRef.channelId || params.channelId || "").trim();
  if (!/^\d{17,22}$/.test(effectiveChannelId)) {
    return {
      ok: false,
      httpStatus: 400,
      error: "Valid Discord Channel ID is required.",
    };
  }

  const listing = await getListingRecordById(env, params.listingId);
  if (!listing) {
    return {
      ok: false,
      httpStatus: 404,
      error: "Selected vehicle listing was not found in the database.",
    };
  }

  // Verify the channel belongs to the selected guild
  try {
    const chRes = await fetchDiscordWithRetry(
      `https://discord.com/api/v10/channels/${effectiveChannelId}`,
      { headers: { Authorization: `Bot ${token}` } }
    );
    if (chRes.ok) {
      const chJson: any = await chRes.json();
      if (chJson?.guild_id && String(chJson.guild_id) !== params.guildId) {
        return {
          ok: false,
          httpStatus: 400,
          error: `Channel ${effectiveChannelId} belongs to a different server (${chJson.guild_id}), not ${params.guildId}.`,
        };
      }
    } else if (chRes.status === 404 || chRes.status === 403) {
      return {
        ok: false,
        httpStatus: chRes.status,
        error:
          chRes.status === 403
            ? "Bot cannot access that Discord channel (HTTP 403). Check View Channel & Read Message History permissions."
            : "Target Discord channel not found (HTTP 404).",
      };
    }
  } catch {
    // Non-fatal fallback; message endpoint check follows immediately
  }

  const msgRes = await fetchDiscordChannelMessage(token, effectiveChannelId, parsedRef.messageId);
  if (!msgRes.ok || !msgRes.message) {
    return {
      ok: false,
      httpStatus: msgRes.httpStatus || 502,
      error: msgRes.error || "Could not retrieve message from Discord.",
    };
  }

  const msg = msgRes.message;
  const expectedAppId = String(env.DISCORD_APPLICATION_ID || env.DISCORD_CLIENT_ID || "").trim();
  const botUserId = await resolveExpectedBotUserId(env);
  const authorId = String(msg?.author?.id || "");
  const msgAppId = String(msg?.application_id || "");

  const isOwnedByOurBot =
    (botUserId && authorId === botUserId) ||
    (expectedAppId && (msgAppId === expectedAppId || authorId === expectedAppId));

  if (!isOwnedByOurBot) {
    return {
      ok: false,
      httpStatus: 403,
      error: `Cannot recover message: it was posted by ${msg?.author?.username || authorId || "another author"}, not our bot. Discord only allows a bot to edit its own messages.`,
    };
  }

  const preview = extractPreviewFromDiscordMessage(msg, params.guildId, effectiveChannelId);
  const conflicts: RecoverableEmbedConflict = {};

  const existingByMsg = await findGuildMessageByMessageId(env, preview.messageId);
  if (
    existingByMsg &&
    (existingByMsg.guildId !== params.guildId || existingByMsg.meta.listingId !== params.listingId)
  ) {
    conflicts.messageAlreadyLinkedToGuildId = existingByMsg.guildId;
    conflicts.messageAlreadyLinkedToListingId = existingByMsg.meta.listingId;
  }

  const sentMap = await getGuildSentMessages(env, params.guildId);
  const existingForListing = sentMap[params.listingId];
  if (existingForListing?.messageId && existingForListing.messageId !== preview.messageId) {
    conflicts.listingAlreadyHasMessageId = existingForListing.messageId;
    conflicts.listingAlreadyHasChannelId = existingForListing.channelId;
  }

  return {
    ok: true,
    httpStatus: 200,
    preview,
    conflicts,
    listingName: listing.payload?.name || `Limited Vehicle #${listing.id}`,
    listingIsAvailable: listing.isAvailable,
  };
}

export async function recoverDiscordEmbedTracking(
  env: any,
  params: {
    guildId: string;
    channelId: string;
    messageIdOrUrl: string;
    listingId: string;
    allowOverwrite?: boolean;
    applyTemplateNow?: boolean;
  }
): Promise<{
  ok: boolean;
  httpStatus: number;
  error?: string;
  preview?: RecoverableEmbedPreview;
  updatedInPlace?: boolean;
  recoveredMeta?: {
    guildId: string;
    channelId: string;
    messageId: string;
    listingId: string;
    sentAt: number;
  };
}> {
  const inspection = await inspectRecoverableDiscordEmbed(env, {
    guildId: params.guildId,
    channelId: params.channelId,
    messageIdOrUrl: params.messageIdOrUrl,
    listingId: params.listingId,
  });

  if (!inspection.ok || !inspection.preview) {
    return {
      ok: false,
      httpStatus: inspection.httpStatus,
      error: inspection.error || "Embed inspection failed.",
    };
  }

  const conflicts = inspection.conflicts || {};
  const hasConflict = Boolean(
    conflicts.messageAlreadyLinkedToListingId || conflicts.listingAlreadyHasMessageId
  );
  if (hasConflict && !params.allowOverwrite) {
    const reasons: string[] = [];
    if (conflicts.messageAlreadyLinkedToListingId) {
      reasons.push(
        `Message ID ${inspection.preview.messageId} is already linked to listing #${conflicts.messageAlreadyLinkedToListingId}`
      );
    }
    if (conflicts.listingAlreadyHasMessageId) {
      reasons.push(
        `Listing #${params.listingId} already tracks message ID ${conflicts.listingAlreadyHasMessageId} in this server`
      );
    }
    return {
      ok: false,
      httpStatus: 409,
      error: `${reasons.join("; ")}. Enable overwrite confirmation to relink safely.`,
      preview: inspection.preview,
    };
  }

  const preview = inspection.preview;
  const record = await getListingRecordById(env, params.listingId);
  if (!record) {
    return { ok: false, httpStatus: 404, error: "Listing not found." };
  }

  const cfg = await getGuildConfig(env, params.guildId);
  const environment = cfg?.environment === "test" ? "test" : "production";

  await markListingSentToGuild(env, params.guildId, params.listingId, {
    channelId: preview.channelId,
    messageId: preview.messageId,
    sentAtOverride: preview.sentAt,
    isSoldOutRendered: preview.isAlreadySoldOutLook,
  });

  if (params.applyTemplateNow) {
    const car: CarListing = {
      ...record.payload,
      id: record.id,
      detectedAt: record.firstSeenAt,
      lastVerifiedAt: record.lastVerifiedAt,
      soldOutAt: record.soldOutAt,
      isAvailable: record.isAvailable,
    };
    const editRes = await updateSentListingEmbedForGuild(env, car, params.guildId, {
      overrideChannelId: preview.channelId,
      overrideMessageId: preview.messageId,
    });
    if (!editRes.ok) {
      return {
        ok: false,
        httpStatus: 502,
        error: `Tracking restored for message ${preview.messageId}, but immediate in-place template edit failed: ${editRes.error || "Unknown Discord error"}`,
        preview,
        updatedInPlace: false,
        recoveredMeta: {
          guildId: params.guildId,
          channelId: preview.channelId,
          messageId: preview.messageId,
          listingId: params.listingId,
          sentAt: preview.sentAt,
        },
      };
    }
  } else {
    await appendDeliveryLog(env, {
      id: crypto.randomUUID(),
      listingId: params.listingId,
      listingName: record.payload?.name || `Limited Vehicle #${params.listingId}`,
      guildId: params.guildId,
      channelId: preview.channelId,
      messageId: preview.messageId,
      method: "recovery",
      environment,
      status: "updated",
      httpStatus: 200,
      timestamp: Date.now(),
    });
  }

  return {
    ok: true,
    httpStatus: 200,
    preview,
    updatedInPlace: Boolean(params.applyTemplateNow),
    recoveredMeta: {
      guildId: params.guildId,
      channelId: preview.channelId,
      messageId: preview.messageId,
      listingId: params.listingId,
      sentAt: preview.sentAt,
    },
  };
}


export async function buildWidgetMessagePayload(
  env: any,
  originHint?: string,
  options?: {
    guildId?: string;
    templateId?: string;
    customTemplate?: WidgetTemplateConfig | null;
  }
): Promise<any> {
  const origin = resolvePublicOrigin(env, originHint);
  const [snapshot, monitorStatus, bundle, overridesMap, guildCfg] = await Promise.all([
    getCatalogSnapshot(env),
    getMonitorStatus(env),
    getPresentationConfig(env),
    getListingOverridesMap(env),
    options?.guildId ? getGuildConfig(env, options.guildId) : Promise.resolve(null),
  ]);

  const template =
    options?.customTemplate ||
    resolveEffectiveWidgetTemplate(bundle, options?.templateId, guildCfg?.widgetTemplateId);

  return buildWidgetPayload({
    records: snapshot.records.map((rec) => ({
      id: rec.id,
      firstSeenAt: rec.firstSeenAt,
      lastVerifiedAt: rec.lastVerifiedAt,
      soldOutAt: rec.soldOutAt,
      isAvailable: rec.isAvailable,
      payload: rec.payload || {},
      override: overridesMap[rec.id] || null,
    })),
    monitorStatus,
    template,
    catalogVersion: snapshot.version || 1,
    portalOrigin: origin || "https://everfall-limited-watcher.itschase.workers.dev",
    safeOrigin: origin && isDiscordSafeHttpsOrigin(origin) ? origin : undefined,
  });
}

export async function deployStatusWidgetToChannel(
  env: any,
  guildId: string,
  channelId: string,
  originHint?: string,
  options?: {
    deployedBy?: string;
    deployedByUsername?: string;
    templateId?: string;
    customTemplate?: WidgetTemplateConfig | null;
    keepExistingMessage?: boolean;
  }
): Promise<{ ok: boolean; widget?: WidgetDeployment; messageId?: string; error?: string }> {
  const token = env.DISCORD_BOT_TOKEN;
  if (!token) return { ok: false, error: "DISCORD_BOT_TOKEN is not configured." };

  const widgetId = `${guildId}:${channelId}`;
  const origin = resolvePublicOrigin(env, originHint);
  const portalOrigin = origin || "https://everfall-limited-watcher.itschase.workers.dev";
  const safeOrigin = origin && isDiscordSafeHttpsOrigin(origin) ? origin : undefined;

  const [existingSameChannel, snapshot, monitorStatus, bundle, overridesMap, guildCfg] =
    await Promise.all([
      getWidgetDeploymentById(env, widgetId),
      getCatalogSnapshot(env),
      getMonitorStatus(env),
      getPresentationConfig(env),
      getListingOverridesMap(env),
      getGuildConfig(env, guildId),
    ]);

  const template =
    options?.customTemplate ||
    resolveEffectiveWidgetTemplate(bundle, options?.templateId, guildCfg?.widgetTemplateId);

  const recordsForWidget = snapshot.records.map((rec) => ({
    id: rec.id,
    firstSeenAt: rec.firstSeenAt,
    lastVerifiedAt: rec.lastVerifiedAt,
    soldOutAt: rec.soldOutAt,
    isAvailable: rec.isAvailable,
    payload: rec.payload || {},
    override: overridesMap[rec.id] || null,
  }));

  const now = Date.now();
  const payload = buildWidgetPayload({
    records: recordsForWidget,
    monitorStatus,
    template,
    catalogVersion: snapshot.version || 1,
    portalOrigin,
    safeOrigin,
    nowMs: now,
    widgetUpdatedAt: now,
  });

  const publicPayload = {
    ...payload,
    allowed_mentions: { parse: [], roles: [], users: [] },
  };

  const res = await sendDiscordChannelMessage(token, channelId, publicPayload);
  if (!res.ok || !res.messageId) {
    const friendlyError =
      res.httpStatus === 403
        ? "Missing Discord channel permissions (HTTP 403). Ensure bot has View Channel, Send Messages, and Embed Links in that channel."
        : res.httpStatus === 404
          ? "Target Discord channel not found or bot lacks View Channel access (HTTP 404)."
          : res.error || "Discord rejected the widget message.";
    return { ok: false, error: friendlyError };
  }

  if (
    !options?.keepExistingMessage &&
    existingSameChannel?.messageId &&
    existingSameChannel.messageId !== res.messageId
  ) {
    await deleteDiscordChannelMessage(token, channelId, existingSameChannel.messageId).catch(() => null);
  }

  const contentHash = computeWidgetContentHash({
    records: recordsForWidget,
    template,
    catalogVersion: snapshot.version || 1,
    portalOrigin,
    safeOrigin,
  });
  const entry: WidgetSyncHistoryEntry = {
    timestamp: now,
    status: "ok",
    httpStatus: res.httpStatus,
    trigger: "deploy",
    contentHash,
  };
  const widget = await setWidgetDeployment(env, {
    id: widgetId,
    guildId,
    channelId,
    messageId: res.messageId,
    deployedAt: now,
    deployedBy: options?.deployedBy,
    deployedByUsername: options?.deployedByUsername,
    lastSyncedAt: now,
    lastAttemptedSyncAt: now,
    lastSyncStatus: "ok",
    templateId: options?.templateId,
    customTemplate: options?.customTemplate ?? null,
    configVersion: bundle.version,
    lastCatalogVersion: snapshot.version,
    lastContentHash: contentHash,
    history: [entry],
  });

  return { ok: true, widget, messageId: res.messageId };
}

export async function refreshWidgetById(
  env: any,
  widgetId: string,
  originHint?: string,
  options?: { force?: boolean; trigger?: string }
): Promise<{
  ok: boolean;
  skipped?: boolean;
  widget?: WidgetDeployment | null;
  error?: string;
}> {
  const token = env.DISCORD_BOT_TOKEN;
  if (!token) return { ok: false, error: "DISCORD_BOT_TOKEN is not configured." };
  const widget = await getWidgetDeploymentById(env, widgetId);
  if (!widget?.channelId || !widget?.messageId) {
    return { ok: false, error: "Widget deployment not found." };
  }

  const origin = resolvePublicOrigin(env, originHint);
  const portalOrigin = origin || "https://everfall-limited-watcher.itschase.workers.dev";
  const safeOrigin = origin && isDiscordSafeHttpsOrigin(origin) ? origin : undefined;

  const [snapshot, monitorStatus, bundle, overridesMap, guildCfg] = await Promise.all([
    getCatalogSnapshot(env),
    getMonitorStatus(env),
    getPresentationConfig(env),
    getListingOverridesMap(env),
    getGuildConfig(env, widget.guildId),
  ]);

  const template =
    widget.customTemplate ||
    resolveEffectiveWidgetTemplate(bundle, widget.templateId, guildCfg?.widgetTemplateId);

  const recordsForWidget = snapshot.records.map((rec) => ({
    id: rec.id,
    firstSeenAt: rec.firstSeenAt,
    lastVerifiedAt: rec.lastVerifiedAt,
    soldOutAt: rec.soldOutAt,
    isAvailable: rec.isAvailable,
    payload: rec.payload || {},
    override: overridesMap[rec.id] || null,
  }));

  const contentHash = computeWidgetContentHash({
    records: recordsForWidget,
    template,
    catalogVersion: snapshot.version || 1,
    portalOrigin,
    safeOrigin,
  });
  const trigger = options?.trigger || "manual";

  if (!options?.force && widget.lastContentHash === contentHash && widget.lastSyncStatus === "ok") {
    return { ok: true, skipped: true, widget };
  }

  const now = Date.now();
  const payload = {
    ...buildWidgetPayload({
      records: recordsForWidget,
      monitorStatus,
      template,
      catalogVersion: snapshot.version || 1,
      portalOrigin,
      safeOrigin,
      nowMs: now,
      widgetUpdatedAt: now,
    }),
    allowed_mentions: { parse: [], roles: [], users: [] },
  };

  const res = await editDiscordChannelMessage(token, widget.channelId, widget.messageId, payload);
  const errorDetail = res.ok
    ? undefined
    : res.httpStatus === 404
      ? "Discord message not found (404 — message may have been deleted). Remove or redeploy this widget."
      : res.httpStatus === 403
        ? "Missing Discord permissions (403) in target channel."
        : res.error;

  const entry: WidgetSyncHistoryEntry = {
    timestamp: now,
    status: res.ok ? "ok" : "error",
    httpStatus: res.httpStatus,
    ...(errorDetail ? { error: errorDetail } : {}),
    trigger,
    contentHash,
  };

  const updated = await setWidgetDeployment(env, {
    ...widget,
    lastAttemptedSyncAt: now,
    lastSyncedAt: res.ok ? now : widget.lastSyncedAt,
    lastSyncStatus: res.ok ? "ok" : "error",
    lastSyncError: errorDetail,
    configVersion: bundle.version,
    lastCatalogVersion: snapshot.version,
    lastContentHash: res.ok ? contentHash : widget.lastContentHash,
    history: [entry, ...(widget.history || [])].slice(0, 15),
  });

  return {
    ok: res.ok,
    widget: updated,
    error: errorDetail,
  };
}

export async function refreshAllWidgets(
  env: any,
  originHint?: string,
  options?: {
    force?: boolean;
    widgetIds?: string[];
    trigger?: string;
    catalogChanged?: boolean;
    preloadedSnapshot?: CatalogSnapshot;
    preloadedMonitorStatus?: MonitorStatus | null;
    preloadedBundle?: PresentationConfigBundle;
  }
): Promise<{ refreshed: number; skipped: number; failed: number }> {
  const token = env.DISCORD_BOT_TOKEN;
  if (!token) return { refreshed: 0, skipped: 0, failed: 0 };

  const allWidgets = await getAllWidgetDeployments(env);
  const targetWidgets =
    options?.widgetIds && options.widgetIds.length > 0
      ? allWidgets.filter((w) => options.widgetIds!.includes(w.id))
      : allWidgets;
  if (targetWidgets.length === 0) return { refreshed: 0, skipped: 0, failed: 0 };

  const origin = resolvePublicOrigin(env, originHint);
  const portalOrigin = origin || "https://everfall-limited-watcher.itschase.workers.dev";
  const safeOrigin = origin && isDiscordSafeHttpsOrigin(origin) ? origin : undefined;

  const [snapshot, bundle] = await Promise.all([
    options?.preloadedSnapshot ? Promise.resolve(options.preloadedSnapshot) : getCatalogSnapshot(env),
    options?.preloadedBundle ? Promise.resolve(options.preloadedBundle) : getPresentationConfig(env),
  ]);

  // Fast-skip when catalog didn't change, config didn't change, and all widgets are already synced cleanly
  if (
    !options?.force &&
    options?.catalogChanged === false &&
    targetWidgets.every(
      (w) =>
        w.lastSyncStatus === "ok" &&
        Boolean(w.lastContentHash) &&
        w.lastCatalogVersion === snapshot.version &&
        w.configVersion === bundle.version
    )
  ) {
    return { refreshed: 0, skipped: targetWidgets.length, failed: 0 };
  }

  const [monitorStatus, overridesMap] = await Promise.all([
    options?.preloadedMonitorStatus !== undefined
      ? Promise.resolve(options.preloadedMonitorStatus)
      : getMonitorStatus(env),
    getListingOverridesMap(env),
  ]);

  const recordsForWidget = snapshot.records.map((rec) => ({
    id: rec.id,
    firstSeenAt: rec.firstSeenAt,
    lastVerifiedAt: rec.lastVerifiedAt,
    soldOutAt: rec.soldOutAt,
    isAvailable: rec.isAvailable,
    payload: rec.payload || {},
    override: overridesMap[rec.id] || null,
  }));

  const guildCfgCache = new Map<string, any>();
  const updatedWidgetsToPersist: WidgetDeployment[] = [];
  let refreshed = 0;
  let skipped = 0;
  let failed = 0;
  const trigger = options?.trigger || "store-sync";

  for (const widget of targetWidgets) {
    if (!widget?.channelId || !widget?.messageId) continue;
    if (!guildCfgCache.has(widget.guildId)) {
      guildCfgCache.set(widget.guildId, await getGuildConfig(env, widget.guildId));
    }
    const guildCfg = guildCfgCache.get(widget.guildId);
    const template =
      widget.customTemplate ||
      resolveEffectiveWidgetTemplate(bundle, widget.templateId, guildCfg?.widgetTemplateId);

    const contentHash = computeWidgetContentHash({
      records: recordsForWidget,
      template,
      catalogVersion: snapshot.version || 1,
      portalOrigin,
      safeOrigin,
    });

    if (!options?.force && widget.lastContentHash === contentHash && widget.lastSyncStatus === "ok") {
      skipped++;
      continue;
    }

    const now = Date.now();
    const payload = {
      ...buildWidgetPayload({
        records: recordsForWidget,
        monitorStatus,
        template,
        catalogVersion: snapshot.version || 1,
        portalOrigin,
        safeOrigin,
        nowMs: now,
        widgetUpdatedAt: now,
      }),
      allowed_mentions: { parse: [], roles: [], users: [] },
    };

    const res = await editDiscordChannelMessage(token, widget.channelId, widget.messageId, payload);
    const errorDetail = res.ok
      ? undefined
      : res.httpStatus === 404
        ? "Discord message not found (404 — deleted from channel)."
        : res.httpStatus === 403
          ? "Missing Discord channel permissions (403)."
          : res.error;

    const entry: WidgetSyncHistoryEntry = {
      timestamp: now,
      status: res.ok ? "ok" : "error",
      httpStatus: res.httpStatus,
      ...(errorDetail ? { error: errorDetail } : {}),
      trigger,
      contentHash,
    };

    updatedWidgetsToPersist.push({
      ...widget,
      lastAttemptedSyncAt: now,
      lastSyncedAt: res.ok ? now : widget.lastSyncedAt,
      lastSyncStatus: res.ok ? "ok" : "error",
      lastSyncError: errorDetail,
      configVersion: bundle.version,
      lastCatalogVersion: snapshot.version,
      lastContentHash: res.ok ? contentHash : widget.lastContentHash,
      history: [entry, ...(widget.history || [])].slice(0, 15),
    });

    if (res.ok) refreshed++;
    else failed++;
  }

  if (updatedWidgetsToPersist.length > 0) {
    await saveWidgetDeploymentsBatch(env, updatedWidgetsToPersist);
  }

  return { refreshed, skipped, failed };
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
  const fetched = await fetchStoreListings("manual");
  let newDiscoveries = 0;
  let soldOutIds: string[] = [];
  let preservedHistoryCount: number | undefined;

  if (fetched.authoritative) {
    const synced = await syncListingHistory(env, fetched, {
      originHint,
      forceRecordWrite: true,
      source: "manual",
    });
    newDiscoveries = synced.newDiscoveries;
    soldOutIds = synced.soldOutIds;
    preservedHistoryCount = synced.totalHistoryCount;

    await recordMonitorAttempt(env, "manual", fetched, newDiscoveries, {
      soldOutListingIds: soldOutIds,
      dispatchedDrops: 0,
      preservedHistoryCount,
    });

    if (soldOutIds.length > 0) {
      for (const soldId of soldOutIds) {
        await updateSoldOutListingEmbeds(env, soldId);
      }
    }

    await refreshAllWidgets(env, originHint, {
      trigger: "manual-scan",
      catalogChanged: synced.catalogChanged,
      preloadedSnapshot: synced.snapshot,
      preloadedMonitorStatus: synced.monitorStatus,
    });
    await purgePublicEdgeCaches(originHint || env?.PUBLIC_ORIGIN);

    const listings = synced.snapshot.records.map(
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

    return {
      listings,
      usedVerifiedStoreResponse: true,
      newDiscoveries,
      notice: fetched.notice,
    };
  } else {
    const previousStatus = await getMonitorStatus(env);
    await setMonitorStatus(env, {
      checkedAt: Date.now(),
      lastSuccessAt: previousStatus?.lastSuccessAt,
      lastFetchCronSuccessAt: previousStatus?.lastFetchCronSuccessAt,
      lastSource: "manual",
      listingCount: previousStatus?.listingCount || 0,
      authoritative: false,
      notice: fetched.notice,
      catalogVersion: previousStatus?.catalogVersion,
      listingSummary: previousStatus?.listingSummary,
    });
    await recordMonitorAttempt(env, "manual", fetched, 0, {
      soldOutListingIds: [],
      dispatchedDrops: 0,
      preservedHistoryCount: undefined,
    });
    await purgePublicEdgeCaches(originHint || env?.PUBLIC_ORIGIN);

    // Failed/blocked storefront checks never trigger widget refreshes or alter availability
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

    return {
      listings,
      usedVerifiedStoreResponse: false,
      newDiscoveries: 0,
      notice: fetched.notice,
    };
  }
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
  const [bundle, overridesMap, monitorStatus] = await Promise.all([
    getPresentationConfig(env),
    getListingOverridesMap(env),
    getMonitorStatus(env),
  ]);
  const token = env.DISCORD_BOT_TOKEN;
  if (!token) {
    return { published: 0, error: "DISCORD_BOT_TOKEN is not configured." };
  }

  let published = 0;
  let lastError: string | undefined;

  for (const car of listings) {
    const alreadySent = await isListingSentToGuild(env, guildId, car.id);
    if (!alreadySent) {
      const template =
        car.isAvailable === false ? bundle.announcements.soldOut : bundle.announcements.inStock;
      const payload = buildCarDropPayload({
        car,
        override: overridesMap[car.id] || null,
        template,
        roleIds: cfg.roleIds,
        portalOrigin: resolvePublicOrigin(env, originHint),
        isUpdate: false,
        monitorStatus,
      });
      try {
        const res = await sendDiscordChannelMessage(token, cfg.channelId, payload);
        if (res.ok) {
          await markListingSentToGuild(env, guildId, car.id, {
            channelId: cfg.channelId,
            messageId: res.messageId,
            isSoldOutRendered: car.isAvailable === false,
          });
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

export async function fetchStoreListings(
  source: MonitorLogSource = "other"
): Promise<StoreFetchResult> {
  const startedAt = Date.now();
  let lastNotice =
    "Store verification was blocked; recorded history was preserved without availability changes.";
  let lastHttpStatus: number | null = null;
  let lastChallenge = false;
  let lastLength: number | null = null;
  let lastUrl = STORE_URLS[0];
  const attempts: MonitorLogAttempt[] = [];
  const runner =
    source === "manual"
      ? "Cloudflare Worker (Manual Scan)"
      : source === "cron-fetch"
        ? "Cloudflare Worker (HTTP Cron)"
        : "Cloudflare Worker";

  for (const storeUrl of STORE_URLS) {
    const attemptStart = Date.now();
    lastUrl = storeUrl;
    try {
      const headers: Record<string, string> = storeUrl.includes("store.everfallcommunity.com")
        ? {
            ...STORE_HEADERS,
            "Sec-Fetch-Site": "same-origin",
            Referer: "https://store.everfallcommunity.com/",
          }
        : STORE_HEADERS;

      const res = await fetch(storeUrl, {
        headers,
        redirect: "follow",
        cf: { cacheTtl: 0, cacheEverything: false },
      } as RequestInit);
      const html = await res.text();
      const cloudflareChallenge =
        html.includes("challenges.cloudflare.com") ||
        html.includes("Just a moment...") ||
        html.includes("Attention Required!") ||
        res.headers.get("cf-mitigated") === "challenge";

      lastHttpStatus = res.status;
      lastChallenge = cloudflareChallenge;
      lastLength = html.length;
      lastUrl = res.url || storeUrl;

      console.log("Everfall store verification", {
        source,
        httpStatus: res.status,
        responseUrl: res.url || storeUrl,
        success: res.ok && !cloudflareChallenge,
        cloudflareChallenge,
        responseLength: html.length,
        timestamp: new Date().toISOString(),
      });

      if (!res.ok || cloudflareChallenge) {
        lastNotice = cloudflareChallenge
          ? `Cloudflare challenge (HTTP ${res.status}) blocked automated verification on ${storeUrl}; recorded history was preserved.`
          : `Store returned HTTP ${res.status}; recorded history was preserved without availability changes.`;
        attempts.push({
          url: lastUrl,
          httpStatus: res.status,
          cloudflareChallenge,
          responseLength: html.length,
          durationMs: Date.now() - attemptStart,
          note: cloudflareChallenge ? "Cloudflare challenge" : `HTTP ${res.status}`,
        });
        continue;
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
        lastNotice =
          "Store response could not be verified as the Limited Cars category; availability history was preserved.";
        attempts.push({
          url: lastUrl,
          httpStatus: res.status,
          cloudflareChallenge: false,
          responseLength: html.length,
          durationMs: Date.now() - attemptStart,
          note: "Unverified category markup",
        });
        continue;
      }

      attempts.push({
        url: lastUrl,
        httpStatus: res.status,
        cloudflareChallenge: false,
        responseLength: html.length,
        durationMs: Date.now() - attemptStart,
        note: `Verified (${foundIds.size} package link${foundIds.size === 1 ? "" : "s"})`,
      });

      if (foundIds.size === 0) {
        return {
          listings: [],
          authoritative: true,
          httpStatus: res.status,
          cloudflareChallenge: false,
          responseLength: html.length,
          targetUrl: res.url || storeUrl,
          durationMs: Date.now() - startedAt,
          runner,
          attempts,
        };
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

      return {
        listings,
        authoritative: true,
        httpStatus: res.status,
        cloudflareChallenge: false,
        responseLength: html.length,
        targetUrl: res.url || storeUrl,
        durationMs: Date.now() - startedAt,
        runner,
        attempts,
      };
    } catch (err: any) {
      console.error("Store scrape fetch error:", {
        source,
        storeUrl,
        error: err?.message || String(err),
        timestamp: new Date().toISOString(),
      });
      lastHttpStatus = null;
      lastChallenge = false;
      lastLength = null;
      lastNotice = `Store scrape failed (${err?.message || "unknown error"}); recorded history was preserved.`;
      attempts.push({
        url: storeUrl,
        httpStatus: null,
        cloudflareChallenge: false,
        responseLength: null,
        durationMs: Date.now() - attemptStart,
        note: err?.message || "Fetch error",
      });
    }
  }

  return {
    listings: [],
    notice: lastNotice,
    authoritative: false,
    httpStatus: lastHttpStatus,
    cloudflareChallenge: lastChallenge,
    responseLength: lastLength,
    targetUrl: lastUrl,
    durationMs: Date.now() - startedAt,
    runner,
    attempts,
  };
}

export async function runCron(
  env: any,
  originHint?: string,
  source: "scheduled" | "cron-fetch" = "scheduled"
): Promise<{ checked: number; newDrops: number; notice?: string; authoritative?: boolean }> {
  const {
    listings,
    soldOutIds = [],
    notice,
    checkedStore,
    authoritative,
    catalogChanged,
    snapshot,
    monitorStatus,
  } = await getRateLimitedStoreListings(env, originHint, source, {
    skipHistoryFetchWhenBlocked: true,
  });
  let newDrops = 0;

  if (authoritative) {
    for (const car of listings) {
      const sent = await broadcastListing(env, car, false);
      if (sent > 0) {
        newDrops += sent;
      }
    }

    if (soldOutIds.length > 0) {
      for (const soldId of soldOutIds) {
        await updateSoldOutListingEmbeds(env, soldId);
      }
    }

    if (checkedStore) {
      await refreshAllWidgets(env, originHint, {
        trigger: source,
        catalogChanged: Boolean(catalogChanged),
        preloadedSnapshot: snapshot,
        preloadedMonitorStatus: monitorStatus,
      });
    }
  }

  return { checked: listings.length, newDrops, notice, authoritative };
}

export interface ExternalStoreSyncPayload {
  source?: "scrapling" | "cron-fetch";
  authoritative: boolean;
  httpStatus?: number | null;
  cloudflareChallenge?: boolean;
  responseLength?: number | null;
  targetUrl?: string;
  durationMs?: number;
  notice?: string;
  runner?: string;
  workflowRunUrl?: string;
  attempts?: MonitorLogAttempt[];
  confirmedSoldOutIds?: string[];
  listings?: Array<{
    id: string;
    name?: string;
    description?: string;
    url?: string;
    images?: string[];
  }>;
}

export async function ingestVerifiedStoreScan(
  env: any,
  originHint: string | undefined,
  payload: ExternalStoreSyncPayload
): Promise<{ checked: number; newDrops: number; notice?: string; authoritative: boolean }> {
  const source: MonitorLogSource = payload.source === "scrapling" ? "scrapling" : "cron-fetch";
  const targetUrl =
    typeof payload.targetUrl === "string" && /^https:\/\//i.test(payload.targetUrl)
      ? payload.targetUrl
      : STORE_URLS[1];

  const sanitizedListings: CarListing[] = Array.isArray(payload.listings)
    ? payload.listings
        .filter((item) => item && /^\d+$/.test(String(item.id || "").trim()))
        .map((item) => {
          const id = String(item.id).trim();
          const known = KNOWN_LIMITED_CARS.find((c) => c.id === id);
          if (known) return known;
          const safeImages = Array.isArray(item.images)
            ? item.images.filter((u) => typeof u === "string" && /^https:\/\//i.test(u)).slice(0, 10)
            : [];
          const rawUrl = typeof item.url === "string" ? item.url : "";
          const safeUrl = /^https:\/\/(store\.everfallcommunity\.com|everfall\.tebex\.io)\/package\/\d+/i.test(
            rawUrl
          )
            ? rawUrl
            : `https://store.everfallcommunity.com/package/${id}`;
          return {
            id,
            name: String(item.name || `Limited Vehicle #${id}`).slice(0, 140),
            description: String(
              item.description || "A new limited edition vehicle is now available on the Everfall store!"
            ).slice(0, 2500),
            url: safeUrl,
            images: safeImages,
          };
        })
    : [];

  const confirmedSoldOutIds = Array.isArray(payload.confirmedSoldOutIds)
    ? payload.confirmedSoldOutIds.filter((id) => /^\d+$/.test(String(id || "").trim()))
    : [];

  const sanitizedAttempts: MonitorLogAttempt[] | undefined = Array.isArray(payload.attempts)
    ? payload.attempts
        .filter((a) => a && typeof a.url === "string" && /^https:\/\//i.test(a.url))
        .slice(0, 10)
        .map((a) => ({
          url: String(a.url).slice(0, 300),
          httpStatus: typeof a.httpStatus === "number" ? a.httpStatus : null,
          cloudflareChallenge: Boolean(a.cloudflareChallenge),
          responseLength: typeof a.responseLength === "number" ? a.responseLength : null,
          durationMs: typeof a.durationMs === "number" && a.durationMs >= 0 ? a.durationMs : 0,
          note: typeof a.note === "string" ? a.note.slice(0, 180) : undefined,
        }))
    : undefined;

  const workflowRunUrl =
    typeof payload.workflowRunUrl === "string" &&
    /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/\d+/i.test(
      payload.workflowRunUrl
    )
      ? payload.workflowRunUrl
      : undefined;

  const runner =
    typeof payload.runner === "string" && payload.runner.trim()
      ? payload.runner.trim().slice(0, 100)
      : source === "scrapling"
        ? "GitHub Actions (Scrapling)"
        : "External HTTP Cron";

  const result: StoreFetchResult = {
    listings: payload.authoritative ? sanitizedListings : [],
    notice: typeof payload.notice === "string" ? payload.notice.slice(0, 400) : undefined,
    authoritative: Boolean(payload.authoritative),
    httpStatus: typeof payload.httpStatus === "number" ? payload.httpStatus : null,
    cloudflareChallenge: Boolean(payload.cloudflareChallenge),
    responseLength: typeof payload.responseLength === "number" ? payload.responseLength : null,
    targetUrl,
    durationMs: typeof payload.durationMs === "number" && payload.durationMs >= 0 ? payload.durationMs : 0,
    confirmedSoldOutIds,
    runner,
    workflowRunUrl,
    attempts: sanitizedAttempts,
  };

  const synced = await syncListingHistory(env, result, {
    originHint,
    skipHistoryFetchWhenBlocked: true,
    source,
  });

  let newDrops = 0;
  if (result.authoritative) {
    for (const car of synced.availableListings) {
      const sent = await broadcastListing(env, car, false);
      if (sent > 0) {
        newDrops += sent;
      }
    }
    if (synced.soldOutIds.length > 0) {
      for (const soldId of synced.soldOutIds) {
        await updateSoldOutListingEmbeds(env, soldId);
      }
    }
  }

  await recordMonitorAttempt(env, source, result, synced.newDiscoveries, {
    soldOutListingIds: synced.soldOutIds,
    dispatchedDrops: newDrops,
    preservedHistoryCount: synced.totalHistoryCount,
  });

  if (result.authoritative) {
    await refreshAllWidgets(env, originHint, {
      trigger: source,
      catalogChanged: synced.catalogChanged,
      preloadedSnapshot: synced.snapshot,
      preloadedMonitorStatus: synced.monitorStatus,
    });
  }
  await purgePublicEdgeCaches(originHint || env?.PUBLIC_ORIGIN);

  return {
    checked: synced.availableListings.length,
    newDrops,
    notice: result.notice,
    authoritative: result.authoritative,
  };
}
