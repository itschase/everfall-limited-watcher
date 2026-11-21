import test from "node:test";
import assert from "node:assert/strict";
import { createLocalD1 } from "../../localD1";
import { getMonitorStateValue, setMonitorStateValue } from "../../d1";
import { createSessionToken } from "../../admin";
import { handleApiRequest } from "../../api";
import { RichPresenceGateway } from "../../richPresenceGateway";
import {
  buildRichPresenceActivity,
  buildRichPresenceWebhookPayload,
  DEFAULT_RICH_PRESENCE_CONFIG,
  normalizeRichPresenceConfig,
  validateRichPresenceConfig,
} from "../richPresence";

test("Rich Presence is disabled by default and rejects unsafe or unknown configuration", () => {
  assert.equal(buildRichPresenceActivity(DEFAULT_RICH_PRESENCE_CONFIG, {}), null);
  const normalized = normalizeRichPresenceConfig({ enabled: true, status: "invalid" });
  assert.equal(normalized.enabled, true);
  assert.equal(normalized.status, DEFAULT_RICH_PRESENCE_CONFIG.status);

  const errors = validateRichPresenceConfig({
    ...DEFAULT_RICH_PRESENCE_CONFIG,
    enabled: true,
    activityName: "Watching {untrusted_token}",
    activityType: "streaming",
    streamUrl: "http://example.com/live",
    webhookButtonLabel: "Visit",
    webhookButtonUrl: "",
  });
  assert.match(errors.join(" "), /Twitch or YouTube HTTPS URL/);
  assert.match(errors.join(" "), /Unknown template variable/);
  assert.match(errors.join(" "), /Set both a webhook button label/);
});

test("activity templates render current listing and check timing without allowing mentions", () => {
  const now = 1_800_000_000_000;
  const activity = buildRichPresenceActivity(
    {
      ...DEFAULT_RICH_PRESENCE_CONFIG,
      enabled: true,
      activityName: "Watching {latest_listing}",
      activityState: "{available_count} in stock; checked {time_since_check} ago",
    },
    {
      now,
      lastCheckedAt: now - 125_000,
      scheduledIntervalMs: 7 * 60_000,
      availableCount: 7,
      latestListing: { name: "@everyone Seraph GTS", isAvailable: true },
    },
  );

  assert.deepEqual(activity, {
    name: "Watching @\u200beveryone Seraph GTS",
    type: "watching",
    state: "7 in stock; checked 2m 5s ago",
  });
});

test("webhook cards include relative timing and an optional link button", () => {
  const lastCheckedAt = 1_800_000_000_000;
  const payload = buildRichPresenceWebhookPayload(
    {
      ...DEFAULT_RICH_PRESENCE_CONFIG,
      webhookCardEnabled: true,
      webhookTimestampMode: "next-check",
      webhookButtonLabel: "Open status",
      webhookButtonUrl: "https://example.com/status",
    },
    {
      now: lastCheckedAt,
      lastCheckedAt,
      scheduledIntervalMs: 7 * 60_000,
      latestListing: { name: "Seraph GTS" },
    },
  ) as {
    embeds: Array<{ fields: Array<{ value: string }> }>;
    components: Array<{ components: Array<{ label: string; url: string }> }>;
  };

  assert.equal(payload.embeds[0].fields[0].value, `<t:${lastCheckedAt / 1000 + 420}:R>`);
  assert.deepEqual(payload.components[0].components[0], {
    type: 2,
    style: 5,
    label: "Open status",
    url: "https://example.com/status",
  });
});

test("Durable Object stays disabled without opening a Gateway connection", async () => {
  const db = createLocalD1(":memory:");
  const values = new Map<string, unknown>();
  let alarmCount = 0;
  try {
    const gateway = new RichPresenceGateway(
      {
        storage: {
          async get<T>(key: string) {
            return values.get(key) as T | undefined;
          },
          async put<T>(key: string, value: T) {
            values.set(key, value);
          },
          async setAlarm() {
            alarmCount++;
          },
          async deleteAlarm() {
            alarmCount = 0;
          },
        },
      },
      { DB: db },
    );
    const response = await gateway.fetch(
      new Request("https://presence.internal/ensure", { method: "POST" }),
    );
    const status = (await response.json()) as {
      connected: boolean;
      lastHeartbeatAt: number | null;
      error: string | null;
    };
    assert.equal(response.status, 200);
    assert.equal(status.connected, false);
    assert.equal(status.lastHeartbeatAt, null);
    assert.equal(status.error, null);
    assert.equal(alarmCount, 0);
  } finally {
    db.close();
  }
});

test("Durable Object identifies, heartbeats, and updates the bot's activity", async () => {
  const db = createLocalD1(":memory:");
  const values = new Map<string, unknown>();
  const sockets: Array<{
    readyState: number;
    sent: Array<{ op: number; d: unknown }>;
    open(): void;
    receive(payload: unknown): void;
    close(code?: number, reason?: string): void;
  }> = [];
  const originalWebSocket = globalThis.WebSocket;
  const originalFetch = globalThis.fetch;
  class MockGatewaySocket extends EventTarget {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    readyState = MockGatewaySocket.CONNECTING;
    sent: Array<{ op: number; d: unknown }> = [];

    constructor(_url: string) {
      super();
      sockets.push(this);
    }

    open() {
      this.readyState = MockGatewaySocket.OPEN;
      this.dispatchEvent(new Event("open"));
    }

    receive(payload: unknown) {
      const event = new Event("message");
      Object.defineProperty(event, "data", { value: JSON.stringify(payload) });
      this.dispatchEvent(event);
    }

    send(value: string) {
      this.sent.push(JSON.parse(value) as { op: number; d: unknown });
    }

    close(code = 1000, reason = "") {
      this.readyState = MockGatewaySocket.CLOSED;
      const event = new Event("close");
      Object.defineProperties(event, {
        code: { value: code },
        reason: { value: reason },
      });
      this.dispatchEvent(event);
    }
  }

  globalThis.WebSocket = MockGatewaySocket as unknown as typeof WebSocket;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(init?.cache, undefined);
    const path = new URL(input.toString()).pathname;
    const data =
      path === "/api/public/status"
        ? {
            lastCheckedAt: Date.now() - 60_000,
            scheduledIntervalMs: 7 * 60_000,
            availableCount: 2,
          }
        : {
            listings: [{ id: "7815819", name: "Seraph GTS", isAvailable: true }],
          };
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await setMonitorStateValue(db, "bot_rich_presence_config", {
      ...DEFAULT_RICH_PRESENCE_CONFIG,
      enabled: true,
      activityName: "Watching {latest_listing}",
      activityState: "Checked {time_since_check} ago",
      activityType: "watching",
    });
    const gateway = new RichPresenceGateway(
      {
        storage: {
          async get<T>(key: string) {
            return values.get(key) as T | undefined;
          },
          async put<T>(key: string, value: T) {
            values.set(key, value);
          },
          async setAlarm() {},
          async deleteAlarm() {},
        },
      },
      {
        DB: db,
        DISCORD_BOT_TOKEN: "test-bot-token",
        DISCORD_STATUS_WEBHOOK_URL: "invalid-optional-webhook",
        PUBLIC_ORIGIN: "https://portal.example",
      },
    );
    await gateway.fetch(
      new Request("https://presence.internal/ensure", { method: "POST" }),
    );
    assert.equal(sockets.length, 1);
    const socket = sockets[0];
    socket.open();
    socket.receive({ op: 10, d: { heartbeat_interval: 60_000 } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(socket.sent.some((payload) => payload.op === 2));
    socket.receive({
      op: 0,
      t: "READY",
      s: 7,
      d: { session_id: "test-session", resume_gateway_url: "wss://gateway.example" },
    });
    for (let attempt = 0; attempt < 20; attempt++) {
      if (socket.sent.some((payload) => payload.op === 3)) break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const presence = socket.sent.find((payload) => payload.op === 3)?.d as {
      activities: Array<{ name: string; type: number }>;
    };
    assert.deepEqual(presence.activities, [
      { name: "Watching Seraph GTS", type: 3, state: "Checked 1m 0s ago" },
    ]);
    socket.receive({ op: 1, d: null, s: 8 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(socket.sent.some((payload) => payload.op === 1));

    await setMonitorStateValue(db, "bot_rich_presence_config", {
      ...DEFAULT_RICH_PRESENCE_CONFIG,
      enabled: false,
    });
    await gateway.fetch(
      new Request("https://presence.internal/ensure", { method: "POST" }),
    );
  } finally {
    globalThis.WebSocket = originalWebSocket;
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test("admin presence API delegates to the Durable Object and queues webhook actions in D1", async () => {
  const db = createLocalD1(":memory:");
  const gatewayCalls: string[] = [];
  const serviceStatus = {
    connected: true,
    lastHeartbeatAt: Date.now(),
    activity: "Watching listings",
    error: null,
    webhookConfigured: true,
  };
  const env = {
    DB: db,
    DISCORD_CLIENT_SECRET: "presence-admin-test-secret",
    DISCORD_PRIMARY_ADMINISTRATOR: "151037568484507648",
    RICH_PRESENCE_GATEWAY: {
      idFromName: () => "singleton",
      get: () => ({
        fetch: async (input: string) => {
          const action = new URL(input).pathname;
          gatewayCalls.push(action);
          return new Response(JSON.stringify(serviceStatus), {
            headers: { "Content-Type": "application/json" },
          });
        },
      }),
    },
  };
  try {
    const adminToken = await createSessionToken(
      "151037568484507648",
      "admin",
      "",
      env.DISCORD_CLIENT_SECRET,
    );
    const request = async (
      path: string,
      method: string,
      options: { token?: string; body?: unknown } = {},
    ) => {
      const url = new URL(path, "https://portal.example");
      const headers = new Headers();
      if (options.token) headers.set("Cookie", `everfall_session=${options.token}`);
      if (options.body !== undefined) {
        headers.set("Content-Type", "application/json");
        headers.set("Origin", url.origin);
      }
      return handleApiRequest(
        new Request(url, {
          method,
          headers,
          ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
        }),
        env,
        url,
      );
    };

    assert.equal((await request("/api/internal/bot/presence", "GET"))?.status, 404);
    const savedConfig = {
      ...DEFAULT_RICH_PRESENCE_CONFIG,
      webhookCardEnabled: true,
    };
    const callsBeforeSave = gatewayCalls.length;
    const saveResponse = await request("/api/admin/bot/presence", "PUT", {
      token: adminToken,
      body: savedConfig,
    });
    assert.equal(saveResponse?.status, 200);
    assert.equal(gatewayCalls[callsBeforeSave], "/sync");
    const queued = await request("/api/admin/bot/presence/webhook-card", "POST", {
      token: adminToken,
      body: { action: "sync" },
    });
    assert.equal(queued?.status, 202);
    const webhookState = await getMonitorStateValue<{
      action: string;
      requestId: string;
      processedRequestId: string | null;
    }>(db, "bot_rich_presence_webhook");
    assert.equal(webhookState?.action, "sync");
    assert.ok(webhookState?.requestId);
    assert.equal(webhookState?.processedRequestId, null);
    assert.ok(gatewayCalls.includes("/status"));
    assert.ok(gatewayCalls.includes("/sync"));
  } finally {
    db.close();
  }
});
