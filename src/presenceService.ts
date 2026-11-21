import { ActivityType, Client, Events, GatewayIntentBits, type PresenceStatusData } from "discord.js";
import {
  buildRichPresenceActivity,
  buildRichPresenceWebhookPayload,
  normalizeRichPresenceConfig,
  type RichPresenceActivityType,
  type RichPresenceConfig,
  type RichPresenceSnapshot,
} from "./shared/richPresence";

const SYNC_INTERVAL_MS = 60_000;

interface PublicStatusResponse {
  lastCheckedAt?: number | null;
  lastSuccessAt?: number | null;
  scheduledIntervalMs?: number;
  totalCount?: number;
  availableCount?: number;
  soldOutCount?: number;
  monitorHealth?: string | { status?: string; label?: string };
  botStatus?: string;
}

interface PublicListingsResponse {
  listings?: Array<{
    id?: string;
    name?: string;
    isAvailable?: boolean;
    detectedAt?: number;
  }>;
  totalCount?: number;
  availableCount?: number;
  soldOutCount?: number;
}

interface WebhookState {
  messageId: string | null;
  requestId: string | null;
  action: "sync" | "delete" | null;
  requestedAt: number | null;
  processedRequestId: string | null;
  error: string | null;
}

interface ServiceConfigResponse {
  config: RichPresenceConfig;
  publicOrigin: string;
  webhookState: WebhookState;
}

interface WebhookResult {
  requestId: string;
  outcome: "synced" | "deleted" | "error";
  messageId?: string;
  error?: string;
}

const ACTIVITY_TYPES: Record<RichPresenceActivityType, ActivityType> = {
  playing: ActivityType.Playing,
  streaming: ActivityType.Streaming,
  listening: ActivityType.Listening,
  watching: ActivityType.Watching,
  competing: ActivityType.Competing,
  custom: ActivityType.Custom,
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required to run the Rich Presence service.`);
  return value;
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.name.slice(0, 100) : "UnknownError";
}

function validateSyncUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("PRESENCE_SYNC_URL must be a valid URL.");
  }
  const isLocalHttp =
    url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !isLocalHttp) ||
    url.pathname !== "/api/internal/bot/presence" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "PRESENCE_SYNC_URL must be an HTTPS URL for /api/internal/bot/presence (HTTP is allowed only on localhost)."
    );
  }
  return url.toString();
}

function buildSnapshot(
  status: PublicStatusResponse,
  listings: PublicListingsResponse,
  publicOrigin: string,
  now: number
): RichPresenceSnapshot {
  const latestListing = [...(listings.listings || [])].sort(
    (a, b) => (b.detectedAt || 0) - (a.detectedAt || 0)
  )[0];
  const health = status.monitorHealth;
  const monitorStatus =
    typeof health === "string"
      ? health
      : health?.label || health?.status || status.botStatus || "Unknown";

  return {
    now,
    lastCheckedAt: status.lastCheckedAt ?? null,
    lastSuccessAt: status.lastSuccessAt ?? null,
    scheduledIntervalMs: status.scheduledIntervalMs,
    totalCount: listings.totalCount ?? status.totalCount,
    availableCount: listings.availableCount ?? status.availableCount,
    soldOutCount: listings.soldOutCount ?? status.soldOutCount,
    monitorStatus,
    latestListing: latestListing
      ? {
          id: latestListing.id,
          name: latestListing.name,
          isAvailable: latestListing.isAvailable,
          detectedAt: latestListing.detectedAt,
        }
      : null,
    siteUrl: publicOrigin,
  };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Request failed (${response.status}).`);
  return (await response.json()) as T;
}

function validateWebhookUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Status webhook URL is invalid.");
  }
  if (
    url.protocol !== "https:" ||
    !["discord.com", "discordapp.com"].includes(url.hostname.toLowerCase()) ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/api\/webhooks\/\d+\/[A-Za-z0-9._-]+\/?$/.test(url.pathname)
  ) {
    throw new Error("Status webhook URL must be a Discord HTTPS webhook URL.");
  }
  return `${url.origin}${url.pathname.replace(/\/$/, "")}`;
}

async function callWebhook(
  webhookUrl: string,
  method: "POST" | "PATCH" | "DELETE",
  messageId?: string,
  payload?: Record<string, unknown>
): Promise<{ id?: string }> {
  const endpoint = messageId
    ? `${webhookUrl}/messages/${encodeURIComponent(messageId)}`
    : `${webhookUrl}?wait=true`;
  const response = await fetch(endpoint, {
    method,
    headers: payload ? { "Content-Type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  if (!response.ok) throw new Error(`Status webhook request failed (${response.status}).`);
  if (method === "DELETE") return {};
  return (await response.json()) as { id?: string };
}

async function main() {
  const botToken = requiredEnv("DISCORD_BOT_TOKEN");
  const syncUrl = validateSyncUrl(requiredEnv("PRESENCE_SYNC_URL"));
  const syncSecret = requiredEnv("PRESENCE_SYNC_SECRET");
  const webhookUrl = process.env.DISCORD_STATUS_WEBHOOK_URL?.trim()
    ? validateWebhookUrl(process.env.DISCORD_STATUS_WEBHOOK_URL.trim())
    : "";
  const syncHeaders = { Authorization: `Bearer ${syncSecret}` };
  const client = new Client({ intents: [] });

  let inFlight = false;
  let lastPresenceSignature = "";
  let lastWebhookSignature = "";
  let interval: ReturnType<typeof setInterval> | null = null;

  const postServiceStatus = async (
    connected: boolean,
    activity: string | null,
    error: string | null,
    webhookResult?: WebhookResult
  ) => {
    await fetchJson(`${syncUrl}`, {
      method: "POST",
      headers: { ...syncHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        connected,
        activity,
        error,
        webhookConfigured: Boolean(webhookUrl),
        ...(webhookResult ? { webhookResult } : {}),
      }),
    });
  };

  const syncOnce = async () => {
    if (inFlight) return;
    inFlight = true;
    let activeName: string | null = null;
    let webhookResult: WebhookResult | undefined;
    try {
      const state = await fetchJson<ServiceConfigResponse>(syncUrl, { headers: syncHeaders });
      const config = normalizeRichPresenceConfig(state.config);
      const publicOrigin = new URL(state.publicOrigin).origin;
      const [status, listings] = await Promise.all([
        fetchJson<PublicStatusResponse>(`${publicOrigin}/api/public/status`),
        fetchJson<PublicListingsResponse>(`${publicOrigin}/api/public/listings`),
      ]);
      const snapshot = buildSnapshot(status, listings, publicOrigin, Date.now());
      const activity = buildRichPresenceActivity(config, snapshot);
      const activities = activity
        ? [
            {
              name: activity.name,
              type: ACTIVITY_TYPES[activity.type],
              ...(activity.state ? { state: activity.state } : {}),
              ...(activity.url ? { url: activity.url } : {}),
            },
          ]
        : [];
      const presence = {
        status: config.status as PresenceStatusData,
        activities,
      };
      const signature = JSON.stringify(presence);
      if (client.isReady() && signature !== lastPresenceSignature) {
        client.user.setPresence(presence);
        lastPresenceSignature = signature;
      }
      activeName = activity
        ? `${activity.type}: ${activity.name}${activity.state ? ` — ${activity.state}` : ""}`
        : null;

      const currentWebhookState = state.webhookState;
      const requestPending = Boolean(
        currentWebhookState.requestId &&
          currentWebhookState.requestId !== currentWebhookState.processedRequestId
      );
      if (requestPending && currentWebhookState.requestId && currentWebhookState.action) {
        try {
          if (currentWebhookState.action === "delete") {
            if (currentWebhookState.messageId && !webhookUrl) {
              throw new Error("Configure the status webhook before deleting its published card.");
            }
            if (currentWebhookState.messageId) {
              await callWebhook(webhookUrl, "DELETE", currentWebhookState.messageId);
            }
            webhookResult = {
              requestId: currentWebhookState.requestId,
              outcome: "deleted",
            };
            lastWebhookSignature = "";
          } else if (config.webhookCardEnabled && webhookUrl) {
            const payload = buildRichPresenceWebhookPayload(config, snapshot);
            if (!payload) throw new Error("Webhook status card is disabled.");
            const message = await callWebhook(
              webhookUrl,
              currentWebhookState.messageId ? "PATCH" : "POST",
              currentWebhookState.messageId || undefined,
              payload
            );
            const messageId = currentWebhookState.messageId || message.id;
            if (!messageId) throw new Error("Discord did not return a webhook message ID.");
            webhookResult = {
              requestId: currentWebhookState.requestId,
              outcome: "synced",
              messageId,
            };
            lastWebhookSignature = JSON.stringify(payload);
          } else {
            throw new Error("Enable the status card and configure its Discord webhook.");
          }
        } catch (error) {
          webhookResult = {
            requestId: currentWebhookState.requestId,
            outcome: "error",
            error: safeError(error),
          };
        }
      } else if (
        config.webhookCardEnabled &&
        webhookUrl &&
        currentWebhookState.messageId
      ) {
        const payload = buildRichPresenceWebhookPayload(config, snapshot);
        const webhookSignature = JSON.stringify(payload);
        if (payload && webhookSignature !== lastWebhookSignature) {
          try {
            await callWebhook(webhookUrl, "PATCH", currentWebhookState.messageId, payload);
            lastWebhookSignature = webhookSignature;
          } catch (error) {
            console.error("Rich Presence status card update failed:", safeError(error));
          }
        }
      }

      if (client.isReady()) {
        await postServiceStatus(true, activeName, null, webhookResult);
      }
    } catch (error) {
      console.error("Rich Presence synchronization failed:", safeError(error));
      try {
        await postServiceStatus(client.isReady(), activeName, safeError(error), webhookResult);
      } catch (heartbeatError) {
        console.error("Rich Presence heartbeat failed:", safeError(heartbeatError));
      }
    } finally {
      inFlight = false;
    }
  };

  client.once(Events.ClientReady, () => {
    console.log(`Rich Presence Gateway connected as ${client.user?.tag || "Discord bot"}.`);
    void syncOnce();
    interval = setInterval(() => void syncOnce(), SYNC_INTERVAL_MS);
  });
  client.on(Events.Error, (error) => {
    console.error("Discord Gateway client error:", safeError(error));
  });

  process.once("SIGINT", () => {
    if (interval) clearInterval(interval);
    client.destroy();
    process.exit(0);
  });
  process.once("SIGTERM", () => {
    if (interval) clearInterval(interval);
    client.destroy();
    process.exit(0);
  });

  await client.login(botToken);
}

main().catch((error) => {
  console.error("Rich Presence service failed to start:", safeError(error));
  process.exitCode = 1;
});
