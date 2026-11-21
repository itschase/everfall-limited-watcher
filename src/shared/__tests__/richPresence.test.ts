import test from "node:test";
import assert from "node:assert/strict";
import { createLocalD1 } from "../../localD1";
import { createSessionToken } from "../../admin";
import { handleApiRequest } from "../../api";
import { resolvePresenceSyncUrl } from "../../presenceServiceConfig";
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

test("presence service derives its endpoint from the public origin and validates overrides", () => {
  assert.equal(
    resolvePresenceSyncUrl({}),
    "https://everfall-limited-watcher.itschase.workers.dev/api/internal/bot/presence",
  );
  assert.equal(
    resolvePresenceSyncUrl({ PUBLIC_ORIGIN: "https://staging.example.test/app" }),
    "https://staging.example.test/api/internal/bot/presence",
  );
  assert.equal(
    resolvePresenceSyncUrl({
      PRESENCE_SYNC_URL: "https://custom.example.test/api/internal/bot/presence",
    }),
    "https://custom.example.test/api/internal/bot/presence",
  );
  assert.throws(
    () => resolvePresenceSyncUrl({ PRESENCE_SYNC_URL: "https://example.test/other" }),
    /presence sync endpoint/,
  );
});

test("presence service API is authenticated and admin webhook actions are explicitly queued in D1", async () => {
  const db = createLocalD1(":memory:");
  const secret = "presence-service-test-secret";
  const env = {
    DB: db,
    DISCORD_CLIENT_SECRET: "presence-admin-test-secret",
    DISCORD_PRIMARY_ADMINISTRATOR: "151037568484507648",
    PRESENCE_SYNC_SECRET: secret,
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
      options: { token?: string; bearer?: string; body?: unknown } = {},
    ) => {
      const url = new URL(path, "https://portal.example");
      const headers = new Headers();
      if (options.token) headers.set("Cookie", `everfall_session=${options.token}`);
      if (options.bearer) headers.set("Authorization", `Bearer ${options.bearer}`);
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

    assert.equal(
      (await request("/api/internal/bot/presence", "GET"))?.status,
      401,
    );
    assert.equal(
      (await request("/api/internal/bot/presence", "GET", { bearer: "wrong" }))?.status,
      401,
    );

    const serviceUpdate = await request("/api/internal/bot/presence", "POST", {
      bearer: secret,
      body: { connected: true, activity: "Watching listings", webhookConfigured: true },
    });
    assert.equal(serviceUpdate?.status, 200);

    const savedConfig = {
      ...DEFAULT_RICH_PRESENCE_CONFIG,
      webhookCardEnabled: true,
    };
    assert.equal(
      (
        await request("/api/admin/bot/presence", "PUT", {
          token: adminToken,
          body: savedConfig,
        })
      )?.status,
      200,
    );
    const queued = await request("/api/admin/bot/presence/webhook-card", "POST", {
      token: adminToken,
      body: { action: "sync" },
    });
    assert.equal(queued?.status, 202);
    const serviceState = await request("/api/internal/bot/presence", "GET", {
      bearer: secret,
    });
    const stateBody = (await serviceState?.json()) as {
      webhookState: { action: string; requestId: string; processedRequestId: string | null };
    };
    assert.equal(stateBody.webhookState.action, "sync");
    assert.ok(stateBody.webhookState.requestId);
    assert.equal(stateBody.webhookState.processedRequestId, null);
  } finally {
    db.close();
  }
});
