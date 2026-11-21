import { getD1Database, getMonitorStateValue, setMonitorStateValue } from "./d1";
import {
  buildRichPresenceActivity,
  buildRichPresenceWebhookPayload,
  DEFAULT_RICH_PRESENCE_CONFIG,
  normalizeRichPresenceConfig,
  type RichPresenceActivityType,
  type RichPresenceConfig,
  type RichPresenceSnapshot,
} from "./shared/richPresence";

const CONFIG_KEY = "bot_rich_presence_config";
const WEBHOOK_KEY = "bot_rich_presence_webhook";
const STATUS_STORAGE_KEY = "rich_presence_status";
const SESSION_STORAGE_KEY = "rich_presence_gateway_session";
const DEFAULT_PUBLIC_ORIGIN = "https://everfall-limited-watcher.itschase.workers.dev";
const GATEWAY_URL = "wss://gateway.discord.gg/?v=10&encoding=json";
const SYNC_INTERVAL_MS = 60_000;
const MAX_SOCKET_LIFETIME_MS = 10 * 60_000;

const ACTIVITY_TYPES: Record<RichPresenceActivityType, number> = {
  playing: 0,
  streaming: 1,
  listening: 2,
  watching: 3,
  custom: 4,
  competing: 5,
};

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

interface GatewayStatus {
  connected: boolean;
  lastHeartbeatAt: number | null;
  activity: string | null;
  error: string | null;
  webhookConfigured: boolean;
}

interface GatewaySession {
  sessionId: string | null;
  resumeGatewayUrl: string | null;
  sequence: number | null;
}

interface WebhookState {
  messageId: string | null;
  requestId: string | null;
  action: "sync" | "delete" | null;
  requestedAt: number | null;
  processedRequestId: string | null;
  error: string | null;
}

interface GatewayPayload {
  op: number;
  d?: unknown;
  s?: number | null;
  t?: string | null;
}

interface DurableStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  setAlarm(scheduledTime: number | Date): Promise<void>;
  deleteAlarm(): Promise<void>;
}

interface DurableState {
  storage: DurableStorage;
}

interface PresenceEnvironment {
  DB?: D1Database;
  DISCORD_BOT_TOKEN?: string;
  DISCORD_STATUS_WEBHOOK_URL?: string;
  PUBLIC_ORIGIN?: string;
}

const EMPTY_STATUS: GatewayStatus = {
  connected: false,
  lastHeartbeatAt: null,
  activity: null,
  error: null,
  webhookConfigured: false,
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function safeError(error: unknown): string {
  if (!(error instanceof Error)) return "Unknown error.";
  return `${error.name}: ${error.message
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[URL]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")}`.slice(0, 200);
}

function getPublicOrigin(env: PresenceEnvironment): string {
  const raw = env.PUBLIC_ORIGIN?.trim() || DEFAULT_PUBLIC_ORIGIN;
  try {
    return new URL(raw).origin;
  } catch {
    throw new Error("PUBLIC_ORIGIN must be a valid URL.");
  }
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

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
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

function normalizeWebhookState(value: unknown): WebhookState {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    messageId: typeof raw.messageId === "string" ? raw.messageId : null,
    requestId: typeof raw.requestId === "string" ? raw.requestId : null,
    action: raw.action === "sync" || raw.action === "delete" ? raw.action : null,
    requestedAt:
      typeof raw.requestedAt === "number" && Number.isFinite(raw.requestedAt)
        ? raw.requestedAt
        : null,
    processedRequestId:
      typeof raw.processedRequestId === "string" ? raw.processedRequestId : null,
    error: typeof raw.error === "string" ? raw.error.slice(0, 200) : null,
  };
}

export class RichPresenceGateway {
  private readonly storage: DurableStorage;
  private readonly env: PresenceEnvironment;
  private initialized: Promise<void>;
  private status: GatewayStatus = { ...EMPTY_STATUS };
  private session: GatewaySession = {
    sessionId: null,
    resumeGatewayUrl: null,
    sequence: null,
  };
  private socket: WebSocket | null = null;
  private gatewayReady = false;
  private enabled = false;
  private awaitingHeartbeatAck = false;
  private heartbeatIntervalMs = 0;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private lastGatewayConnectAt = 0;
  private activitySignature = "";
  private webhookSignature = "";
  private messageQueue: Promise<void> = Promise.resolve();
  private reconnectAttempts = 0;
  private syncInFlight: Promise<void> | null = null;

  constructor(state: DurableState, env: PresenceEnvironment) {
    this.storage = state.storage;
    this.env = env;
    this.initialized = this.restoreState();
  }

  private async restoreState(): Promise<void> {
    const [status, session] = await Promise.all([
      this.storage.get<GatewayStatus>(STATUS_STORAGE_KEY),
      this.storage.get<GatewaySession>(SESSION_STORAGE_KEY),
    ]);
    this.status = status ? { ...EMPTY_STATUS, ...status } : { ...EMPTY_STATUS };
    this.session = {
      sessionId: session?.sessionId ?? null,
      resumeGatewayUrl: session?.resumeGatewayUrl ?? null,
      sequence: session?.sequence ?? null,
    };
  }

  private async saveStatus(patch: Partial<GatewayStatus>): Promise<void> {
    this.status = { ...this.status, ...patch };
    await this.storage.put(STATUS_STORAGE_KEY, this.status);
  }

  private async saveSession(): Promise<void> {
    await this.storage.put(SESSION_STORAGE_KEY, this.session);
  }

  private async loadConfig(): Promise<RichPresenceConfig> {
    const db = getD1Database(this.env);
    if (!db) throw new Error("The D1 database binding (DB) is not configured.");
    const stored = await getMonitorStateValue<unknown>(db, CONFIG_KEY);
    return normalizeRichPresenceConfig(stored ?? DEFAULT_RICH_PRESENCE_CONFIG);
  }

  private getWebhookUrl(): string {
    const raw = this.env.DISCORD_STATUS_WEBHOOK_URL?.trim();
    return raw ? validateWebhookUrl(raw) : "";
  }

  private async scheduleNextSync(): Promise<void> {
    await this.storage.setAlarm(Date.now() + SYNC_INTERVAL_MS);
  }

  private clearHeartbeatTimer(): void {
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private closeSocket(code = 1000, reason = "Presence disabled"): void {
    const socket = this.socket;
    this.socket = null;
    this.gatewayReady = false;
    this.awaitingHeartbeatAck = false;
    this.clearHeartbeatTimer();
    if (socket && socket.readyState < WebSocket.CLOSING) {
      try {
        socket.close(code, reason);
      } catch {
        // The socket may have closed between the readyState check and close().
      }
    }
  }

  private async reconcile(config: RichPresenceConfig): Promise<void> {
    this.enabled = config.enabled || config.webhookCardEnabled;
    let webhookConfigured = false;
    let webhookError: string | null = null;
    try {
      webhookConfigured = Boolean(this.getWebhookUrl());
    } catch (error) {
      webhookError = safeError(error);
    }
    await this.saveStatus({
      webhookConfigured,
      ...(config.webhookCardEnabled && webhookError ? { error: webhookError } : {}),
    });

    if (!this.enabled) {
      this.closeSocket();
      await this.storage.deleteAlarm();
      await this.saveStatus({
        connected: false,
        lastHeartbeatAt: null,
        activity: null,
        error: null,
      });
      return;
    }

    if (!this.env.DISCORD_BOT_TOKEN?.trim()) {
      await this.saveStatus({
        connected: false,
        error: "DISCORD_BOT_TOKEN is not configured as a Worker secret.",
      });
      await this.scheduleNextSync();
      return;
    }

    await this.scheduleNextSync();
    if (!this.socket || this.socket.readyState >= WebSocket.CLOSING) {
      this.connect();
    }
  }

  private connect(forceIdentify = false): void {
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.CONNECTING ||
        this.socket.readyState === WebSocket.OPEN)
    ) {
      return;
    }
    this.gatewayReady = false;
    this.awaitingHeartbeatAck = false;
    this.clearHeartbeatTimer();

    const resumeUrl = !forceIdentify ? this.session.resumeGatewayUrl : null;
    let socket: WebSocket;
    try {
      socket = new WebSocket(resumeUrl || GATEWAY_URL);
    } catch (error) {
      void this.saveStatus({ connected: false, error: safeError(error) });
      void this.storage.setAlarm(Date.now() + this.nextReconnectDelay());
      return;
    }

    this.socket = socket;
    socket.addEventListener("open", () => {
      if (this.socket !== socket) return;
      this.lastGatewayConnectAt = Date.now();
      this.reconnectAttempts = 0;
      void this.saveStatus({ connected: false, error: null });
    });
    socket.addEventListener("message", (event) => {
      this.messageQueue = this.messageQueue
        .then(() => this.handleGatewayMessage(socket, event.data))
        .catch((error) => this.recordGatewayError(error));
    });
    socket.addEventListener("close", (event) => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.gatewayReady = false;
      this.awaitingHeartbeatAck = false;
      this.clearHeartbeatTimer();
      void this.saveStatus({
        connected: false,
        error: `Discord Gateway closed the connection (${event.code}).`,
      });
      if (this.enabled) {
        void this.storage.setAlarm(Date.now() + this.nextReconnectDelay());
      }
    });
    socket.addEventListener("error", () => {
      if (this.socket === socket) {
        void this.saveStatus({ error: "Discord Gateway WebSocket error." });
      }
    });
  }

  private nextReconnectDelay(): number {
    this.reconnectAttempts = Math.min(this.reconnectAttempts + 1, 8);
    return Math.min(5 * 60_000, 1_000 * 2 ** (this.reconnectAttempts - 1));
  }

  private sendGateway(op: number, data: unknown): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ op, d: data }));
  }

  private sendHeartbeat(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    if (this.awaitingHeartbeatAck) {
      this.rotateSocket();
      return;
    }
    this.awaitingHeartbeatAck = true;
    this.sendGateway(1, this.session.sequence);
    this.heartbeatTimer = setTimeout(
      () => this.sendHeartbeat(),
      this.heartbeatIntervalMs
    );
  }

  private startHeartbeats(intervalMs: number): void {
    this.clearHeartbeatTimer();
    this.heartbeatIntervalMs = intervalMs;
    const jitter = Math.floor(Math.random() * intervalMs);
    this.heartbeatTimer = setTimeout(() => this.sendHeartbeat(), jitter);
  }

  private rotateSocket(): void {
    const previous = this.socket;
    this.socket = null;
    this.gatewayReady = false;
    this.awaitingHeartbeatAck = false;
    this.clearHeartbeatTimer();
    if (previous && previous.readyState < WebSocket.CLOSING) {
      try {
        previous.close(4000, "Scheduled Gateway reconnect");
      } catch {
        // The Gateway may have already closed the socket.
      }
    }
    if (this.enabled) this.connect();
  }

  private async handleGatewayMessage(socket: WebSocket, data: unknown): Promise<void> {
    if (this.socket !== socket) return;
    let text: string;
    if (typeof data === "string") {
      text = data;
    } else if (data instanceof ArrayBuffer) {
      text = new TextDecoder().decode(data);
    } else if (data instanceof Blob) {
      text = await data.text();
    } else {
      throw new Error("Discord Gateway sent an unsupported message.");
    }

    const payload = JSON.parse(text) as GatewayPayload;
    if (typeof payload.s === "number") {
      this.session.sequence = payload.s;
      await this.saveSession();
    }

    if (payload.op === 10) {
      const interval = (payload.d as { heartbeat_interval?: unknown } | null)
        ?.heartbeat_interval;
      if (typeof interval !== "number" || interval < 1_000) {
        throw new Error("Discord Gateway returned an invalid heartbeat interval.");
      }
      this.startHeartbeats(interval);
      if (
        this.session.sessionId &&
        this.session.sequence !== null &&
        this.session.resumeGatewayUrl
      ) {
        this.sendGateway(6, {
          token: this.env.DISCORD_BOT_TOKEN,
          session_id: this.session.sessionId,
          seq: this.session.sequence,
        });
      } else {
        this.sendGateway(2, {
          token: this.env.DISCORD_BOT_TOKEN,
          intents: 0,
          properties: {
            os: "cloudflare-workers",
            browser: "everfall-limited-watcher",
            device: "everfall-limited-watcher",
          },
        });
      }
      return;
    }

    if (payload.op === 11) {
      this.awaitingHeartbeatAck = false;
      await this.saveStatus({ lastHeartbeatAt: Date.now(), error: null });
      return;
    }

    if (payload.op === 1) {
      this.awaitingHeartbeatAck = true;
      this.sendGateway(1, this.session.sequence);
      return;
    }

    if (payload.op === 7) {
      this.rotateSocket();
      return;
    }

    if (payload.op === 9) {
      const resumable = payload.d === true;
      if (!resumable) {
        this.session = { sessionId: null, resumeGatewayUrl: null, sequence: null };
        await this.saveSession();
      }
      this.closeSocket(4000, "Discord requested a new Gateway session");
      if (this.enabled) {
        this.heartbeatTimer = setTimeout(
          () => this.connect(!resumable),
          1_000 + Math.floor(Math.random() * 4_000)
        );
      }
      return;
    }

    if (payload.op !== 0 || !payload.t) return;
    const eventData =
      payload.d && typeof payload.d === "object"
        ? (payload.d as Record<string, unknown>)
        : {};
    if (payload.t === "READY") {
      this.session.sessionId =
        typeof eventData.session_id === "string" ? eventData.session_id : null;
      this.session.resumeGatewayUrl =
        typeof eventData.resume_gateway_url === "string"
          ? eventData.resume_gateway_url
          : null;
      await this.saveSession();
    }
    if (payload.t === "READY" || payload.t === "RESUMED") {
      this.gatewayReady = true;
      this.activitySignature = "";
      await this.saveStatus({
        connected: true,
        lastHeartbeatAt: Date.now(),
        error: null,
      });
      await this.syncNow();
    }
  }

  private async recordGatewayError(error: unknown): Promise<void> {
    await this.saveStatus({ connected: false, error: safeError(error) });
    this.closeSocket(4000, "Gateway protocol error");
    if (this.enabled) {
      await this.storage.setAlarm(Date.now() + this.nextReconnectDelay());
    }
  }

  private async syncPresence(
    config: RichPresenceConfig,
    snapshot: RichPresenceSnapshot
  ): Promise<void> {
    if (!this.gatewayReady || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
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
      status: config.status,
      activities,
      since: null,
      afk: false,
    };
    const signature = JSON.stringify(presence);
    if (signature !== this.activitySignature) {
      this.sendGateway(3, presence);
      this.activitySignature = signature;
    }
    const activityLabel = activity
      ? `${activity.type}: ${activity.name}${activity.state ? ` — ${activity.state}` : ""}`
      : null;
    await this.saveStatus({
      connected: true,
      activity: activityLabel,
      lastHeartbeatAt: Date.now(),
      error: null,
    });
  }

  private async syncWebhook(
    config: RichPresenceConfig,
    snapshot: RichPresenceSnapshot,
    webhookUrl: string
  ): Promise<string | null> {
    const db = getD1Database(this.env);
    if (!db) return "The D1 database binding (DB) is not configured.";

    const state = normalizeWebhookState(
      await getMonitorStateValue<unknown>(db, WEBHOOK_KEY)
    );
    const pending = Boolean(
      state.requestId && state.requestId !== state.processedRequestId
    );
    if (pending && state.requestId && state.action) {
      try {
        if (state.action === "delete") {
          if (state.messageId && !webhookUrl) {
            throw new Error("Configure the optional status webhook before deleting its card.");
          }
          if (state.messageId) {
            await callWebhook(webhookUrl, "DELETE", state.messageId);
          }
          await setMonitorStateValue(
            db,
            WEBHOOK_KEY,
            {
              ...state,
              messageId: null,
              processedRequestId: state.requestId,
              error: null,
            },
            Date.now()
          );
          this.webhookSignature = "";
          return null;
        }

        if (!config.webhookCardEnabled || !webhookUrl) {
          throw new Error("Enable the card and configure its optional Discord webhook.");
        }
        const payload = buildRichPresenceWebhookPayload(config, snapshot);
        if (!payload) throw new Error("The webhook status card is disabled.");
        const message = await callWebhook(
          webhookUrl,
          state.messageId ? "PATCH" : "POST",
          state.messageId || undefined,
          payload
        );
        const messageId = state.messageId || message.id;
        if (!messageId) throw new Error("Discord did not return a webhook message ID.");
        await setMonitorStateValue(
          db,
          WEBHOOK_KEY,
          {
            ...state,
            messageId,
            processedRequestId: state.requestId,
            error: null,
          },
          Date.now()
        );
        this.webhookSignature = JSON.stringify(payload);
        return null;
      } catch (error) {
        const message = safeError(error);
        await setMonitorStateValue(
          db,
          WEBHOOK_KEY,
          {
            ...state,
            processedRequestId: state.requestId,
            error: message,
          },
          Date.now()
        );
        return message;
      }
    }

    if (!config.webhookCardEnabled || !webhookUrl || !state.messageId) return null;
    const payload = buildRichPresenceWebhookPayload(config, snapshot);
    const signature = JSON.stringify(payload);
    if (payload && signature !== this.webhookSignature) {
      try {
        await callWebhook(webhookUrl, "PATCH", state.messageId, payload);
        this.webhookSignature = signature;
      } catch (error) {
        const message = safeError(error);
        await setMonitorStateValue(
          db,
          WEBHOOK_KEY,
          { ...state, error: message },
          Date.now()
        );
        return message;
      }
    }
    return null;
  }

  private async syncNow(): Promise<void> {
    if (this.syncInFlight) return this.syncInFlight;
    this.syncInFlight = this.performSync();
    try {
      await this.syncInFlight;
    } finally {
      this.syncInFlight = null;
    }
  }

  private async performSync(): Promise<void> {
    await this.initialized;
    try {
      const config = await this.loadConfig();
      await this.reconcile(config);
      if (!this.enabled || !this.gatewayReady) return;

      const publicOrigin = getPublicOrigin(this.env);
      const [status, listings] = await Promise.all([
        fetchJson<PublicStatusResponse>(`${publicOrigin}/api/public/status`),
        fetchJson<PublicListingsResponse>(`${publicOrigin}/api/public/listings`),
      ]);
      const snapshot = buildSnapshot(status, listings, publicOrigin, Date.now());
      await this.syncPresence(config, snapshot);
      let webhookUrl = "";
      try {
        webhookUrl = this.getWebhookUrl();
      } catch (error) {
        if (config.webhookCardEnabled) {
          await this.saveStatus({ error: safeError(error) });
          return;
        }
      }
      const webhookError = await this.syncWebhook(config, snapshot, webhookUrl);
      if (webhookError) await this.saveStatus({ error: webhookError });
    } catch (error) {
      await this.saveStatus({ error: safeError(error) });
    }
  }

  private async ensureService(): Promise<void> {
    await this.initialized;
    try {
      const config = await this.loadConfig();
      await this.reconcile(config);
    } catch (error) {
      await this.saveStatus({ connected: false, error: safeError(error) });
    }
  }

  async fetch(request: Request): Promise<Response> {
    await this.initialized;
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/status") {
      await this.ensureService();
      return jsonResponse(this.status);
    }
    if (
      request.method === "POST" &&
      (url.pathname === "/ensure" || url.pathname === "/sync")
    ) {
      if (url.pathname === "/sync") await this.syncNow();
      else await this.ensureService();
      return jsonResponse(this.status);
    }
    return jsonResponse({ error: "Not found." }, 404);
  }

  async alarm(): Promise<void> {
    await this.initialized;
    const connectedFor = Date.now() - this.lastGatewayConnectAt;
    if (
      this.socket &&
      this.socket.readyState === WebSocket.OPEN &&
      connectedFor >= MAX_SOCKET_LIFETIME_MS
    ) {
      this.rotateSocket();
    }
    await this.syncNow();
    if (this.enabled) await this.scheduleNextSync();
  }
}
