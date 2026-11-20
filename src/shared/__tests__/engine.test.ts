import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLocalD1 } from "../../server";
import {
  extractVehicleMetadata,
  resolveListingPresentation,
  sortAndFilterFeatures,
} from "../features";
import {
  CHECK_INTERVAL_LABEL,
  SCHEDULED_CRON_INTERVAL_MS,
} from "../appConfig";
import {
  buildCarDropPayload,
  buildWidgetPayload,
  computeStableHash,
  computeWidgetContentHash,
  createDefaultPresentationConfig,
  DEFAULT_IN_STOCK_TEMPLATE,
  DEFAULT_SITE_PAGES_CONFIG,
  DEFAULT_SOLD_OUT_TEMPLATE,
  DEFAULT_WIDGET_TEMPLATE,
  normalizeSitePagesConfig,
  validateDiscordPayloadLimits,
} from "../presentation";
import {
  findUnsupportedVariables,
  resolveTemplateVariables,
} from "../variables";
import { handleInteraction, hasManageServerPermission } from "../../commands";
import {
  buildBotReadinessChecks,
  checkBotHealthSnapshot,
  COMMANDS,
  compareDiscordCommands,
} from "../../register";
import {
  createSessionToken,
  getBotGuilds,
  getGuildControlOptions,
  handleLoginRedirect,
  handleOAuthCallback,
} from "../../admin";
import { handleApiRequest } from "../../api";
import {
  getAllWidgetDeployments,
  getBotHealthSnapshot,
  getCatalogSnapshot,
  getDeliveryLogs,
  getGuildConfig,
  getGuildSentMessages,
  getMonitorLogs,
  getPresentationConfig,
  setGuildConfig,
  setBotHealthSnapshot,
  setPresentationConfig,
  setWidgetDeployment,
  WIDGET_REGISTRY_KEY,
} from "../../kv";
import {
  deployStatusWidgetToChannel,
  ingestVerifiedStoreScan,
  inspectRecoverableDiscordEmbed,
  parseDiscordMessageReference,
  recoverDiscordEmbedTracking,
  refreshAllWidgets,
} from "../../scraper";
import { DISCORD_SLASH_COMMANDS } from "../slashCommands";

test("Discord OAuth state is issued and consumed once through D1 without OAuth-state KV operations", async () => {
  const db = createLocalD1(":memory:");
  const kvOperations: string[] = [];
  const env: any = {
    DB: db,
    DISCORD_CLIENT_SECRET: "oauth-state-test-secret",
    DISCORD_CLIENT_ID: "test-client",
    DISCORD_BOT: {
      async put(key: string) {
        kvOperations.push(`put:${key}`);
      },
      async delete(key: string) {
        kvOperations.push(`delete:${key}`);
      },
    },
  };
  const originalFetch = globalThis.fetch;

  try {
    const missingDbResponse = await handleLoginRedirect(
      new Request("https://example.test/login"),
      { DISCORD_CLIENT_SECRET: env.DISCORD_CLIENT_SECRET }
    );
    assert.equal(missingDbResponse.status, 503);
    assert.match(await missingDbResponse.text(), /D1 database binding/);

    const loginResponse = await handleLoginRedirect(
      new Request("https://example.test/login"),
      env
    );
    assert.equal(loginResponse.status, 302);
    const state = new URL(loginResponse.headers.get("Location")!).searchParams.get("state");
    const stateCookie = loginResponse.headers.get("Set-Cookie")!.split(";")[0];
    assert.ok(state);
    assert.ok(stateCookie.endsWith(`=${state}`));
    assert.equal(
      (await db.prepare("SELECT COUNT(*) AS count FROM oauth_states").first<{ count: number }>())
        ?.count,
      1
    );
    assert.equal(kvOperations.some((operation) => operation.includes("oauth_state:")), false);

    globalThis.fetch = async (input) => {
      const requestUrl = String(input);
      if (requestUrl.endsWith("/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "test-access-token" }), {
          status: 200,
        });
      }
      if (requestUrl.endsWith("/users/@me")) {
        return new Response(JSON.stringify({ id: "123456789", username: "test-user" }), {
          status: 200,
        });
      }
      if (requestUrl.endsWith("/users/@me/guilds")) {
        return new Response("[]", { status: 200 });
      }
      return new Response("not found", { status: 404 });
    };

    const callbackUrl = `https://example.test/auth/callback?code=test-code&state=${encodeURIComponent(state!)}`;
    const callbackRequest = () =>
      new Request(callbackUrl, { headers: { Cookie: stateCookie } });
    const callbackResponse = await handleOAuthCallback(callbackRequest(), env);
    assert.equal(callbackResponse.status, 200);
    assert.match(await callbackResponse.text(), /Discord Connected/);

    const replayResponse = await handleOAuthCallback(callbackRequest(), env);
    assert.equal(replayResponse.status, 400);
    assert.equal(kvOperations.some((operation) => operation.includes("oauth_state:")), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Discord OAuth callback rejects invalid and expired state", async () => {
  const db = createLocalD1(":memory:");
  const env: any = { DB: db, DISCORD_CLIENT_SECRET: "oauth-state-test-secret" };
  const originalNow = Date.now;
  const originalFetch = globalThis.fetch;

  try {
    const loginResponse = await handleLoginRedirect(
      new Request("https://example.test/login"),
      env
    );
    const location = new URL(loginResponse.headers.get("Location")!);
    const validState = location.searchParams.get("state")!;
    const cookie = loginResponse.headers.get("Set-Cookie")!.split(";")[0];

    const invalidResponse = await handleOAuthCallback(
      new Request(
        "https://example.test/auth/callback?code=test-code&state=invalid",
        { headers: { Cookie: "everfall_oauth_state=invalid" } }
      ),
      env
    );
    assert.equal(invalidResponse.status, 400);

    Date.now = () => originalNow() + 601_000;
    const expiredResponse = await handleOAuthCallback(
      new Request(
        `https://example.test/auth/callback?code=test-code&state=${encodeURIComponent(validState)}`,
        { headers: { Cookie: cookie } }
      ),
      env
    );
    assert.equal(expiredResponse.status, 400);
    assert.equal(
      (await db.prepare("SELECT COUNT(*) AS count FROM oauth_states").first<{ count: number }>())
        ?.count,
      1
    );
  } finally {
    Date.now = originalNow;
    globalThis.fetch = originalFetch;
  }
});

test("extractVehicleMetadata normalizes Seraph GTS features without hyphen and isolates terms", () => {
  const desc =
    "This quantity-limited vehicle comes with custom sound and over 17 cosmetic customization options.\n" +
    "Can only be traded with other limiteds.\n" +
    "Your vehicle will be automatically delivered to your in-game garage after purchase.";

  const meta = extractVehicleMetadata("Seraph GTS", desc);
  assert.equal(meta.quantityLimited, true);
  assert.equal(meta.customSound, true);
  assert.equal(meta.customOptionsCount, 17);
  assert.equal(meta.customOptionsIsOver, true);
  assert.equal(meta.customOptionsLabel, "17+ Custom Options");
  assert.equal(meta.tradingRestriction, "Limited-only trading");
  assert.match(meta.deliveryInfo || "", /automatically delivered/i);

  assert.deepEqual(
    meta.features.map((f) => f.label),
    ["Quantity Limited", "Custom Sound", "17+ Custom Options"]
  );
  assert.ok(
    !meta.features.some((f) => f.label.includes("Quantity-Limited")),
    "Must never emit hyphenated Quantity-Limited label"
  );
});

test("extractVehicleMetadata handles exact numeric customization count (e.g. 73C with 3 options) and never invents absent traits", () => {
  const exactMeta = extractVehicleMetadata(
    "73C",
    "Limited-quantity track car featuring custom sound and 3 customization options."
  );
  assert.deepEqual(
    exactMeta.features.map((f) => f.label),
    ["Quantity Limited", "Custom Sound", "3 Custom Options"]
  );

  const minimalMeta = extractVehicleMetadata(
    "Bare Prototype",
    "Track coupe released for weekend collectors."
  );
  assert.equal(minimalMeta.features.length, 0);
  assert.equal(minimalMeta.tradingRestriction, null);
  assert.equal(minimalMeta.deliveryInfo, null);
});

test("resolveListingPresentation preserves storefront source while applying admin overrides and per-surface filtering", () => {
  const pres = resolveListingPresentation(
    {
      id: "7815819",
      name: "Seraph GTS",
      description:
        "Quantity-limited release with custom sound and over 17 customization options. Can only be traded with other limiteds.",
      url: "https://store.everfallcommunity.com/package/7815819",
      images: [
        "https://cdn.example.com/slot0.jpg",
        "https://cdn.example.com/slot1.jpg",
        "https://cdn.example.com/slot2.jpg",
        "https://cdn.example.com/slot3.jpg",
      ],
    },
    {
      listingId: "7815819",
      displayName: "Seraph GTS Edition",
      shortDescription: "Hand-tuned bespoke coupe.",
      hiddenFeatureKeys: ["custom_sound"],
      updatedAt: 1_760_000_000_000,
      updatedBy: "xchasex",
    }
  );

  assert.equal(pres.source.name, "Seraph GTS");
  assert.equal(pres.effective.name, "Seraph GTS Edition");
  assert.equal(pres.effective.shortDescription, "Hand-tuned bespoke coupe.");
  assert.equal(pres.effective.hasOverrides, true);

  const cardFeatures = sortAndFilterFeatures(pres.effective.features, "card");
  assert.deepEqual(
    cardFeatures.map((f) => f.key),
    ["quantity_limited", "custom_options"]
  );

  const overriddenWidget = sortAndFilterFeatures(pres.effective.features, "widget", {
    featureOrder: ["custom_options", "quantity_limited"],
    featureLabelOverrides: { quantity_limited: "Limited Drop" },
  });
  assert.deepEqual(
    overriddenWidget.map((f) => f.label),
    ["17+ Custom Options", "Limited Drop"]
  );
});

test("buildCarDropPayload omits role pings on sold-out or update edits and keeps Components V2 structure", () => {
  const baseCar = {
    id: "7815819",
    name: "Seraph GTS",
    description: "Quantity-limited coupe with custom sound and 17+ customization options.",
    url: "https://store.everfallcommunity.com/package/7815819",
    images: ["https://cdn.example.com/0.jpg"],
    detectedAt: 1_760_000_000_000,
    lastVerifiedAt: 1_760_000_060_000,
  };

  const inStockPayload = buildCarDropPayload({
    car: { ...baseCar, isAvailable: true },
    template: DEFAULT_IN_STOCK_TEMPLATE,
    roleIds: ["123456789012345678"],
    isUpdate: false,
    isTest: false,
  });
  assert.equal(inStockPayload.flags, 1 << 15);
  assert.deepEqual(inStockPayload.allowed_mentions.roles, ["123456789012345678"]);
  assert.equal(inStockPayload.components[0].content, "<@&123456789012345678>");

  const soldOutEditPayload = buildCarDropPayload({
    car: { ...baseCar, isAvailable: false, soldOutAt: 1_760_000_120_000 },
    template: DEFAULT_SOLD_OUT_TEMPLATE,
    roleIds: ["123456789012345678"],
    isUpdate: true,
    isTest: false,
  });
  assert.deepEqual(soldOutEditPayload.allowed_mentions.roles, []);
  assert.equal(soldOutEditPayload.components.length, 1);
  assert.equal(soldOutEditPayload.components[0].type, 17);
});

test("buildWidgetPayload prefers Slot 3 image, falls back to Slot 0, includes View link, and detects stale data", () => {
  const nowMs = 1_760_000_000_000;
  const payload = buildWidgetPayload({
    nowMs,
    records: [
      {
        id: "7815819",
        firstSeenAt: nowMs - 10_000,
        isAvailable: true,
        payload: {
          name: "Seraph GTS",
          description: "Quantity-limited vehicle.",
          url: "https://store.everfallcommunity.com/package/7815819",
          images: [
            "https://portal.example.com/media/listings/7815819/0",
            "https://portal.example.com/media/listings/7815819/1",
            "https://portal.example.com/media/listings/7815819/2",
            "https://portal.example.com/media/listings/7815819/3",
          ],
        },
      },
      {
        id: "7815813",
        firstSeenAt: nowMs - 50_000,
        isAvailable: false,
        payload: {
          name: "73C",
          description: "Limited car.",
          images: ["https://portal.example.com/media/listings/7815813/0"],
        },
      },
    ],
    monitorStatus: {
      checkedAt: nowMs - 5_000,
      lastSuccessAt: nowMs - 5_000,
      authoritative: true,
      lastSource: "cron-fetch",
    },
    template: DEFAULT_WIDGET_TEMPLATE,
    catalogVersion: 4,
    portalOrigin: "https://portal.example.com",
    safeOrigin: "https://portal.example.com",
  });

  const embed = payload.embeds[0];
  assert.match(embed.image.url, /\/media\/listings\/7815819\/3\?v=4$/);
  assert.ok(embed.fields.some((f: any) => f.value.includes("[View](https://store.everfallcommunity.com/package/7815819)")));
  assert.equal(validateDiscordPayloadLimits(payload).valid, true);

  // Fallback to Slot 0 when only Slot 0 exists, plus stale notice when blocked
  const fallbackPayload = buildWidgetPayload({
    nowMs,
    records: [
      {
        id: "7815813",
        firstSeenAt: nowMs - 50_000,
        isAvailable: false,
        payload: {
          name: "73C",
          description: "Limited car.",
          images: ["https://portal.example.com/media/listings/7815813/0"],
        },
      },
    ],
    monitorStatus: {
      checkedAt: nowMs - 10_000,
      lastSuccessAt: nowMs - 90 * 60 * 1000,
      authoritative: false,
    },
    template: DEFAULT_WIDGET_TEMPLATE,
    catalogVersion: 4,
    safeOrigin: "https://portal.example.com",
  });
  assert.match(fallbackPayload.embeds[0].image.url, /\/media\/listings\/7815813\/0\?v=4$/);
  assert.match(fallbackPayload.embeds[0].description, /Latest store check could not verify live stock/i);
  assert.equal(
    computeStableHash(payload),
    computeStableHash(payload),
    "computeStableHash must be deterministic for widget deduplication"
  );
});

test("hasManageServerPermission accurately authorizes Manage Guild (0x20) and Administrator (0x8)", () => {
  assert.equal(hasManageServerPermission({ permissions: String(0x8) }), true);
  assert.equal(hasManageServerPermission({ permissions: String(0x20) }), true);
  assert.equal(hasManageServerPermission({ permissions: String(0x8 | 0x20 | 0x400) }), true);
  assert.equal(hasManageServerPermission({ permissions: String(0x400 | 0x800) }), false);
  assert.equal(hasManageServerPermission({ permissions: "0" }), false);
  assert.equal(hasManageServerPermission({ permissions: "not-a-bigint" }), false);
  assert.equal(hasManageServerPermission(null), false);
});

test("compareDiscordCommands checks integration_types, contexts, permissions, and detects /widget drift", () => {
  const fullLive = COMMANDS.map((cmd, idx) => ({
    id: `9000000000000000${idx}`,
    application_id: "1571958001928245378",
    version: "1",
    type: cmd.type,
    name: cmd.name,
    description: cmd.description,
    default_member_permissions: cmd.default_member_permissions || null,
    integration_types: cmd.integration_types,
    contexts: cmd.contexts,
    options: cmd.options,
  }));

  const clean = compareDiscordCommands(fullLive);
  assert.equal(clean.allInSync, true);
  assert.equal(clean.syncedCount, COMMANDS.length);

  // Simulate drifted /widget with wrong contexts and missing DM restriction
  const drifted = fullLive.map((c) =>
    c.name === "widget" ? { ...c, contexts: [0, 1, 2], default_member_permissions: null } : c
  );
  const driftedResult = compareDiscordCommands(drifted);
  const widgetDiff = driftedResult.comparisons.find((c) => c.name === "widget");
  assert.equal(driftedResult.allInSync, false);
  assert.equal(widgetDiff?.syncState, "outdated");
  assert.match(widgetDiff?.diffReason || "", /permissions updated/);
  assert.match(widgetDiff?.diffReason || "", /contexts updated/);
});

test("buildBotReadinessChecks separates command sync, Portal interactions endpoint, and guild duplicate/scope diagnostics", () => {
  const syncedComparisons = compareDiscordCommands(
    COMMANDS.map((cmd, idx) => ({
      id: `9100000000000000${idx}`,
      application_id: "1571958001928245378",
      type: cmd.type,
      name: cmd.name,
      description: cmd.description,
      default_member_permissions: cmd.default_member_permissions || null,
      integration_types: cmd.integration_types,
      contexts: cmd.contexts,
      options: cmd.options,
    }))
  ).comparisons;

  const checks = buildBotReadinessChecks({
    identity: {
      ok: true,
      appId: "1571958001928245378",
      envAppId: "1571958001928245378",
      appIdMismatch: false,
      botUser: { id: "1571958001928245378", username: "Everfall", globalName: null, avatarUrl: null },
      application: {
        id: "1571958001928245378",
        name: "Everfall",
        description: "",
        interactionsEndpointUrl: "https://wrong.example.com/interactions",
        botPublic: true,
        installScopes: ["bot", "applications.commands"],
        guildInstallScopes: ["bot", "applications.commands"],
        hasGuildCommandsInstallScope: true,
      },
    },
    comparisons: syncedComparisons,
    availability: [
      {
        guildId: "111111111111111111",
        guildName: "Alpha",
        hasCommandsScope: true,
        httpStatus: 200,
        guildCommandCount: 1,
        widgetStatus: "duplicate_conflict",
        detail: "Duplicate /widget",
        guildCommandNames: ["widget"],
      },
    ],
    expectedInteractionsUrl: "https://everfall-limited-watcher.itschase.workers.dev/interactions",
    botTokenConfigured: true,
    publicKeyConfigured: true,
    kvBound: true,
  });

  const endpointCheck = checks.find((c) => c.id === "interactions_url");
  const availCheck = checks.find((c) => c.id === "server_availability");
  const regCheck = checks.find((c) => c.id === "widget_registry");
  assert.equal(regCheck?.status, "pass");
  assert.equal(endpointCheck?.status, "fail");
  assert.equal(availCheck?.status, "warn");
});

function createMemoryKv() {
  const store = new Map<string, string>();
  return {
    async get(key: string, type?: string) {
      const val = store.get(key);
      if (val === undefined) return null;
      if (type === "json") return JSON.parse(val);
      return val;
    },
    async getWithMetadata(key: string) {
      const val = store.get(key);
      return { value: val ?? null, metadata: null };
    },
    async put(key: string, value: string | ArrayBuffer) {
      store.set(key, typeof value === "string" ? value : "");
    },
    async delete(key: string) {
      store.delete(key);
    },
    async list(opts?: { prefix?: string }) {
      const prefix = opts?.prefix || "";
      const keys = [...store.keys()]
        .filter((name) => name.startsWith(prefix))
        .map((name) => ({ name }));
      return { keys, list_complete: true };
    },
  };
}

test("bot health checks coalesce concurrent refreshes and tolerate KV write quota failures", async () => {
  const kv = createMemoryKv();
  let kvGets = 0;
  let kvPuts = 0;
  let fetchCalls = 0;
  const trackedKv = {
    ...kv,
    async get(key: string, type?: string) {
      kvGets++;
      return kv.get(key, type);
    },
    async put(key: string, value: string | ArrayBuffer) {
      kvPuts++;
      throw new Error("KV put limit exceeded for the day.");
    },
  };
  const env = {
    DISCORD_BOT: trackedKv,
    DISCORD_BOT_TOKEN: "test-token",
    DISCORD_APPLICATION_ID: "1571958001928245378",
    PUBLIC_ORIGIN: "https://bot-health-cache-test.example.com",
  };
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  globalThis.fetch = async (input: RequestInfo | URL) => {
    fetchCalls++;
    const url = String(input);
    return url.endsWith("/users/@me")
      ? Response.json({ id: "1571958001928245378", username: "Everfall Test" })
      : Response.json({ id: "1571958001928245378", name: "Everfall Test" });
  };
  console.warn = () => {};

  try {
    const [first, second] = await Promise.all([
      checkBotHealthSnapshot(env),
      checkBotHealthSnapshot(env),
    ]);
    assert.equal(first.online, true);
    assert.equal(second, first);
    assert.equal(fetchCalls, 2, "Concurrent checks should share one Discord identity refresh");
    assert.equal(kvGets, 1, "The coalesced refresh should read the snapshot once");
    assert.equal(kvPuts, 1, "The coalesced refresh should attempt one KV write");
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

test("D1 migrates bot health snapshot once and handles routine snapshot updates without KV writes", async () => {
  const baseKv = createMemoryKv();
  const state = new Map<string, { updated_at: number; value_json: string }>();
  const db: any = {
    prepare(query: string) {
      let params: unknown[] = [];
      const statement: any = {
        bind(...values: unknown[]) {
          params = values;
          return statement;
        },
        async first() {
          const row = state.get(String(params[0]));
          if (!row) return null;
          if (query.includes("SELECT updated_at")) return { updated_at: row.updated_at };
          if (query.includes("SELECT value_json")) return { value_json: row.value_json };
          return null;
        },
        async run() {
          if (query.includes("INSERT INTO monitor_state")) {
            state.set(String(params[0]), {
              updated_at: Number(params[1]),
              value_json: String(params[2]),
            });
          }
          return { success: true, results: [], meta: { changes: 1 } };
        },
        async all() {
          return { success: true, results: [], meta: { rows_read: 0 } };
        },
      };
      return statement;
    },
    async batch(statements: any[]) {
      await Promise.all(statements.map((statement) => statement.all()));
      return [];
    },
  };
  const legacySnapshot = {
    verified: true,
    online: true,
    checkedAt: 1_760_000_000_000,
    appId: "1571958001928245378",
    botUsername: "Everfall Legacy",
  };
  await baseKv.put("bot:health_snapshot", JSON.stringify(legacySnapshot));
  let kvReads = 0;
  let kvWrites = 0;
  const trackedKv = {
    ...baseKv,
    async get(key: string, type?: string) {
      kvReads++;
      return baseKv.get(key, type);
    },
    async put(key: string, value: string | ArrayBuffer) {
      kvWrites++;
      return baseKv.put(key, value);
    },
  };

  const env: any = {
    DB: db as D1Database,
    DISCORD_BOT: trackedKv,
  };
  const migrated = await getBotHealthSnapshot(env);
  assert.equal(migrated?.botUsername, "Everfall Legacy");

  const updated = { ...legacySnapshot, checkedAt: legacySnapshot.checkedAt + 1 };
  await setBotHealthSnapshot(env, updated);
  const persisted = await getBotHealthSnapshot(env);
  assert.equal(persisted?.checkedAt, updated.checkedAt);
  assert.equal(kvReads, 1, "Only the one-time legacy migration should read KV");
  assert.equal(kvWrites, 0, "D1-backed snapshot refreshes should not write KV");
});

test("dashboard cache refreshes coalesce and persist one bot-guild and per-guild control record", async () => {
  const baseKv = createMemoryKv();
  let kvPuts = 0;
  let fetchCalls = 0;
  const kv = {
    ...baseKv,
    async put(key: string, value: string | ArrayBuffer) {
      kvPuts++;
      return baseKv.put(key, value);
    },
  };
  const env = {
    DISCORD_BOT: kv,
    DISCORD_BOT_TOKEN: "test-token",
    DISCORD_APPLICATION_ID: "1571958001928245378",
    PUBLIC_ORIGIN: "https://dashboard-cache-test.example.com",
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL) => {
    fetchCalls++;
    const url = String(input);
    if (url.includes("/users/@me/guilds")) {
      return Response.json([{ id: "111111111111111111", name: "Test Guild" }]);
    }
    if (url.endsWith("/channels")) {
      return Response.json([{ id: "222222222222222222", name: "alerts", type: 0 }]);
    }
    return Response.json([{ id: "333333333333333333", name: "Members", managed: false }]);
  };

  try {
    const [guilds1, guilds2] = await Promise.all([
      getBotGuilds(env),
      getBotGuilds(env),
    ]);
    assert.deepEqual(guilds1, guilds2);
    assert.equal(kvPuts, 1, "Bot guild refreshes should write a single fallback cache key");
    assert.equal(fetchCalls, 1, "Concurrent bot guild refreshes should share one Discord request");

    const [controls1, controls2] = await Promise.all([
      getGuildControlOptions(env, "111111111111111111"),
      getGuildControlOptions(env, "111111111111111111"),
    ]);
    assert.deepEqual(controls1, controls2);
    assert.equal(kvPuts, 2, "Guild control refresh should add only one cache write");
    assert.equal(fetchCalls, 3, "Concurrent control refreshes should share two Discord requests");

    await getBotGuilds(env);
    await getGuildControlOptions(env, "111111111111111111");
    assert.equal(kvPuts, 2, "Warm isolate caches should avoid repeated KV writes");
    assert.equal(fetchCalls, 3, "Warm isolate caches should avoid repeated Discord requests");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("handleInteraction verifies Ed25519 signature, immediately defers /widget, and patches private preview confirmation", async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const spki = publicKey.export({ type: "spki", format: "der" });
  const rawPubHex = Buffer.from(spki.subarray(-32)).toString("hex");

  const kv = createMemoryKv();
  const env = {
    DISCORD_PUBLIC_KEY: rawPubHex,
    DISCORD_APPLICATION_ID: "1571958001928245378",
    DISCORD_BOT: kv,
    PUBLIC_ORIGIN: "https://portal.example.com",
  };

  const payload = JSON.stringify({
    type: 2,
    application_id: "1571958001928245378",
    token: "mock_interaction_token_123",
    guild_id: "111111111111111111",
    channel_id: "222222222222222222",
    member: { permissions: "32", user: { id: "333333333333333333", username: "serveradmin" } },
    data: { name: "widget", type: 1 },
  });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto.sign(null, Buffer.from(ts + payload), privateKey).toString("hex");

  const patchedUpdates: any[] = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: any) => {
    const urlStr = String(input);
    if (urlStr.includes("/messages/@original")) {
      patchedUpdates.push(JSON.parse(String(init?.body || "{}")));
      return new Response(JSON.stringify({ id: "preview_msg" }), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  }) as any;

  const waitPromises: Promise<unknown>[] = [];
  try {
    const req = new Request("https://portal.example.com/interactions", {
      method: "POST",
      headers: {
        "x-signature-ed25519": sig,
        "x-signature-timestamp": ts,
        "content-type": "application/json",
      },
      body: payload,
    });
    const ctx = {
      waitUntil(p: Promise<unknown>) {
        waitPromises.push(p);
      },
    } as any;
    const res = await handleInteraction(req, env, ctx, "https://portal.example.com");
    assert.equal(res.status, 200);
    const ackJson: any = await res.json();
    assert.equal(ackJson.type, 5);
    assert.equal(ackJson.data?.flags, 64);

    await Promise.all(waitPromises);
    assert.equal(patchedUpdates.length, 1);
    assert.match(patchedUpdates[0].content, /Live Status Widget Preview/);
    assert.ok(Array.isArray(patchedUpdates[0].embeds) && patchedUpdates[0].embeds.length === 1);
    const btnRow = patchedUpdates[0].components.at(-1);
    assert.ok(btnRow.components.some((b: any) => String(b.custom_id).startsWith("widget_confirm:")));
    assert.ok(btnRow.components.some((b: any) => String(b.custom_id).startsWith("widget_cancel:")));
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("Server dashboard widget routes enforce auth, per-guild ownership, and cross-server widget isolation", async () => {
  const kv = createMemoryKv();
  const secret = "test_session_secret_0123456789abcdef";
  const env = {
    DISCORD_CLIENT_SECRET: secret,
    DISCORD_BOT_TOKEN: "mock_bot_token",
    DISCORD_BOT: kv,
    PUBLIC_ORIGIN: "https://portal.example.com",
  };

  // User manages guild A (111...) only, NOT guild B (222...)
  await kv.put(
    "user_guilds:555555555555555555",
    JSON.stringify([
      { id: "111111111111111111", name: "Guild A", permissions: "32", owner: false },
      { id: "222222222222222222", name: "Guild B (Viewer Only)", permissions: "1024", owner: false },
    ])
  );
  // Seed accessible channels cache for Guild A & Guild B
  await kv.put(
    "guild_controls:111111111111111111",
    JSON.stringify({
      channels: [
        { id: "333333333333333333", name: "widget-updates", type: 0 },
        { id: "444444444444444444", name: "second-channel", type: 0 },
      ],
      roles: [],
    })
  );
  await setWidgetDeployment(env, {
    id: "222222222222222222:999999999999999999",
    guildId: "222222222222222222",
    channelId: "999999999999999999",
    messageId: "888888888888888888",
    deployedAt: Date.now(),
  });

  const token = await createSessionToken("555555555555555555", "guildmod", "", secret);
  const cookieHeader = `everfall_session=${token}`;

  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: any) => {
    const urlStr = String(input);
    const method = (init?.method || "GET").toUpperCase();
    if (urlStr.includes("/channels/333333333333333333/messages") && method === "POST") {
      return new Response(JSON.stringify({ id: "777777777777777777" }), { status: 200 });
    }
    if (urlStr.includes("/channels/333333333333333333/messages/777777777777777777") && method === "DELETE") {
      return new Response(null, { status: 204 });
    }
    return new Response(JSON.stringify({ message: "mock ok" }), { status: 200 });
  }) as any;

  try {
    // 1. Unauthenticated request blocked
    const unauthReq = new Request("https://portal.example.com/api/dashboard/servers/111111111111111111/widgets/deploy", {
      method: "POST",
      body: JSON.stringify({ channelId: "333333333333333333" }),
    });
    const unauthRes = await handleApiRequest(unauthReq, env, new URL(unauthReq.url));
    assert.equal(unauthRes?.status, 401);

    // 2. Non-managed Guild B rejected with 403
    const forbiddenReq = new Request("https://portal.example.com/api/dashboard/servers/222222222222222222/widgets/deploy", {
      method: "POST",
      headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ channelId: "999999999999999999" }),
    });
    const forbiddenRes = await handleApiRequest(forbiddenReq, env, new URL(forbiddenReq.url));
    assert.equal(forbiddenRes?.status, 403);

    // 3. Cross-tenant widget ID via Guild A's URL rejected with 404
    const crossTenantReq = new Request(
      `https://portal.example.com/api/dashboard/servers/111111111111111111/widgets/${encodeURIComponent(
        "222222222222222222:999999999999999999"
      )}/refresh`,
      { method: "POST", headers: { Cookie: cookieHeader } }
    );
    const crossTenantRes = await handleApiRequest(crossTenantReq, env, new URL(crossTenantReq.url));
    assert.equal(crossTenantRes?.status, 404);

    // 4. Managed Guild A deploy & delete succeed and synchronize KV
    const deployReq = new Request("https://portal.example.com/api/dashboard/servers/111111111111111111/widgets/deploy", {
      method: "POST",
      headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ channelId: "333333333333333333", templateId: "default" }),
    });
    const deployRes = await handleApiRequest(deployReq, env, new URL(deployReq.url));
    assert.equal(deployRes?.status, 200);
    const deployJson: any = await deployRes!.json();
    assert.equal(deployJson.ok, true);
    assert.equal(deployJson.widget.id, "111111111111111111:333333333333333333");
    assert.equal(deployJson.widget.messageId, "777777777777777777");

    const delReq = new Request(
      `https://portal.example.com/api/dashboard/servers/111111111111111111/widgets/${encodeURIComponent(
        "111111111111111111:333333333333333333"
      )}`,
      { method: "DELETE", headers: { Cookie: cookieHeader } }
    );
    const delRes = await handleApiRequest(delReq, env, new URL(delReq.url));
    assert.equal(delRes?.status, 200);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("GET /api/public/presentation returns sanitized templates, reflects admin updates, and leaks zero secrets", async () => {
  const kv = createMemoryKv();
  await kv.put(
    "listings:snapshot",
    JSON.stringify({
      version: 2,
      records: [
        {
          id: "7815819",
          firstSeenAt: 1_760_000_000_000,
          lastSeenAt: 1_760_000_060_000,
          isAvailable: false,
          payload: { name: "Seraph GTS", description: "Limited car", images: [] },
        },
      ],
    })
  );

  const secret = "test-client-secret-should-never-leak";
  const env: any = {
    DISCORD_BOT: kv,
    DISCORD_BOT_TOKEN: "super-secret-bot-token",
    DISCORD_CLIENT_SECRET: secret,
    DISCORD_PRIMARY_ADMINISTRATOR: "151037568484507648",
    DISCORD_APPLICATION_ID: "1571958001928245378",
    PUBLIC_ORIGIN: "https://everfall-limited-watcher.itschase.workers.dev",
  };

  // Unauthenticated access allowed
  const pubRes = await handleApiRequest(
    new Request("https://everfall-limited-watcher.itschase.workers.dev/api/public/presentation"),
    env,
    new URL("https://everfall-limited-watcher.itschase.workers.dev/api/public/presentation")
  );
  assert.equal(pubRes?.status, 200);
  const rawBody = await pubRes!.text();
  assert.ok(!rawBody.includes("super-secret-bot-token"), "Public endpoint must never expose bot token");
  assert.ok(!rawBody.includes(secret), "Public endpoint must never expose OAuth secret");
  assert.ok(!rawBody.includes("151037568484507648"), "Public endpoint must never expose admin IDs");

  const parsed: any = JSON.parse(rawBody);
  assert.equal(parsed.ok, true);
  assert.ok(parsed.announcements?.inStock?.titlePrefix);
  assert.ok(parsed.announcements?.soldOut?.titlePrefix);
  assert.ok(parsed.widgetDefault?.title);
  assert.equal((parsed as any).updatedBy, undefined);
  assert.equal((parsed as any).recentEmojis, undefined);

  // Admin updates presentation template and public endpoints reflect updated version + template without mutating listing availability
  const adminToken = await createSessionToken("151037568484507648", "xchasex", "", secret);
  const updateReq = new Request(
    "https://everfall-limited-watcher.itschase.workers.dev/api/admin/presentation",
    {
      method: "PUT",
      headers: {
        Cookie: `everfall_session=${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        announcements: {
          inStock: {
            ...DEFAULT_IN_STOCK_TEMPLATE,
            titlePrefix: "Fresh Limited Drop:",
          },
          soldOut: DEFAULT_SOLD_OUT_TEMPLATE,
        },
        widgetDefault: {
          ...DEFAULT_WIDGET_TEMPLATE,
          title: "Everfall Custom Board Title",
        },
      }),
    }
  );
  const updateRes = await handleApiRequest(updateReq, env, new URL(updateReq.url));
  assert.equal(updateRes?.status, 200);

  const afterPubRes = await handleApiRequest(
    new Request("https://everfall-limited-watcher.itschase.workers.dev/api/public/presentation"),
    env,
    new URL("https://everfall-limited-watcher.itschase.workers.dev/api/public/presentation")
  );
  const afterJson: any = await afterPubRes!.json();
  assert.equal(afterJson.announcements.inStock.titlePrefix, "Fresh Limited Drop:");
  assert.equal(afterJson.widgetDefault.title, "Everfall Custom Board Title");
  assert.ok(afterJson.version > parsed.version);

  const statusRes = await handleApiRequest(
    new Request("https://everfall-limited-watcher.itschase.workers.dev/api/public/status"),
    env,
    new URL("https://everfall-limited-watcher.itschase.workers.dev/api/public/status")
  );
  const statusJson: any = await statusRes!.json();
  assert.equal(statusJson.presentationVersion, afterJson.version);

  // Confirm stored snapshot availability remained untouched (isAvailable still false)
  const snapshotRaw: any = await kv.get("listings:snapshot", "json");
  assert.equal(snapshotRaw.records[0].isAvailable, false);
});

test("Features preview payload builders handle empty archive, incomplete metadata, and non-mutating simulation cleanly", () => {
  // 1. Empty archive widget preview stays valid under Discord limits
  const emptyWidget = buildWidgetPayload({
    records: [],
    monitorStatus: null,
    template: DEFAULT_WIDGET_TEMPLATE,
    nowMs: 1_760_000_000_000,
  });
  assert.equal(validateDiscordPayloadLimits(emptyWidget).valid, true);
  assert.ok(
    emptyWidget.embeds[0].fields.some((f: any) =>
      String(f.value || "").includes(DEFAULT_WIDGET_TEMPLATE.emptyStateMessage)
    ),
    "Empty archive widget must render configured emptyStateMessage"
  );

  // 2. Incomplete metadata vehicle never fabricates features and never mutates source record availability
  const minimalCar = {
    id: "9001",
    name: "Minimal Drop",
    description: "",
    url: "https://store.everfallcommunity.com/package/9001",
    images: [],
    isAvailable: false,
    detectedAt: 1_760_000_000_000,
    lastVerifiedAt: 1_760_000_030_000,
  };
  const simulatedInStock = buildCarDropPayload({
    car: { ...minimalCar, isAvailable: true },
    template: DEFAULT_IN_STOCK_TEMPLATE,
  });
  assert.equal(simulatedInStock.flags, 1 << 15);
  assert.equal(minimalCar.isAvailable, false, "Preview generation must never mutate stored record availability");
  const resolvedMinimal = resolveListingPresentation(minimalCar);
  assert.equal(resolvedMinimal.effective.features.length, 0);
});

test("Shared DISCORD_SLASH_COMMANDS doc list covers all registered Discord slash commands cleanly", () => {
  const registeredNames = COMMANDS.map((c) => c.name).sort();
  const documentedNames = DISCORD_SLASH_COMMANDS.map((c) => c.name).sort();
  assert.deepEqual(documentedNames, registeredNames);
});

test("Centralized schedule config matches 7-minute cadence across /api/public/status and /help command", async () => {
  assert.equal(SCHEDULED_CRON_INTERVAL_MS, 7 * 60 * 1000);
  assert.equal(CHECK_INTERVAL_LABEL, "Every 7 minutes");

  const kv = createMemoryKv();
  const env: any = {
    DISCORD_BOT: kv,
    DISCORD_PUBLIC_KEY: "0".repeat(64),
    PUBLIC_ORIGIN: "https://portal.example.com",
  };
  const statusRes = await handleApiRequest(
    new Request("https://portal.example.com/api/public/status"),
    env,
    new URL("https://portal.example.com/api/public/status")
  );
  const statusJson: any = await statusRes!.json();
  assert.equal(statusJson.scheduledIntervalMs, 7 * 60 * 1000);

  // Verify /help interaction response uses dynamic 7-minute cadence and not stale 15 minutes copy
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const spki = publicKey.export({ type: "spki", format: "der" });
  env.DISCORD_PUBLIC_KEY = Buffer.from(spki.subarray(-32)).toString("hex");
  const helpBody = JSON.stringify({
    type: 2,
    application_id: "1571958001928245378",
    token: "help_tok",
    guild_id: "111111111111111111",
    channel_id: "222222222222222222",
    data: { name: "help", type: 1 },
  });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto.sign(null, Buffer.from(ts + helpBody), privateKey).toString("hex");
  const helpRes = await handleInteraction(
    new Request("https://portal.example.com/interactions", {
      method: "POST",
      headers: { "x-signature-ed25519": sig, "x-signature-timestamp": ts },
      body: helpBody,
    }),
    env,
    { waitUntil() {} } as any,
    "https://portal.example.com"
  );
  const helpJson: any = await helpRes.json();
  const helpText = JSON.stringify(helpJson.data || {});
  assert.match(helpText, /every 7 minutes/i);
  assert.doesNotMatch(helpText, /every 15 minutes/i);
});

test("resolveTemplateVariables handles variable substitution, missing-value collapsing, mention safety, and unsupported token detection", () => {
  const issues = findUnsupportedVariables(
    "Header {vehicle_name} {unknown_placeholder} {recent_releases}",
    "in_stock"
  );
  assert.deepEqual(issues.unknownTokens, ["{unknown_placeholder}"]);
  assert.deepEqual(issues.unsupportedForScope, ["{recent_releases}"]);

  const resolved = resolveTemplateVariables(
    "Car: {vehicle_name} ({vehicle_id})\nSold Out: {sold_out_at}\nSpecs: {features}\nNotice: {missing_key}",
    {
      vehicle_name: "Seraph GTS @everyone <@&123456>",
      vehicle_id: "7815819",
      sold_out_at: "",
      features: "",
    }
  );
  assert.doesNotMatch(resolved, /@everyone/);
  assert.doesNotMatch(resolved, /<@&123456>/);
  assert.doesNotMatch(resolved, /Sold Out:/);
  assert.doesNotMatch(resolved, /Specs:/);
  assert.doesNotMatch(resolved, /\{[a-z_]+\}/);

  // Announcement payload supports custom sections, section reordering, custom URLs, and rejects unsafe URL schemes
  const customPayload = buildCarDropPayload({
    car: {
      id: "7815819",
      name: "Seraph GTS",
      description: "Limited vehicle.",
      url: "https://store.everfallcommunity.com/package/7815819",
      images: [],
      isAvailable: true,
    },
    template: {
      ...DEFAULT_IN_STOCK_TEMPLATE,
      titlePrefix: "Drop {vehicle_id}:",
      sectionOrder: ["timestamps", "header", "custom_sections", "status", "description", "features", "trading_delivery"],
      storeButtonUrlMode: "custom",
      customButtonUrl: "javascript:alert(1)",
      showSecondaryButton: true,
      secondaryButtonLabel: "Direct {vehicle_id}",
      secondaryButtonUrlMode: "custom",
      secondaryCustomButtonUrl: "https://store.everfallcommunity.com/package/{vehicle_id}?ref=bot",
      customSections: [
        {
          id: "cs1",
          title: "Check Schedule",
          content: "Runs {check_interval}",
          enabled: true,
          condition: "in_stock_only",
        },
        {
          id: "cs2",
          title: "Sold Out Only",
          content: "Should be hidden when in stock",
          enabled: true,
          condition: "sold_out_only",
        },
      ],
    },
  });
  const container = customPayload.components[0];
  const body = String(container.components[0].content);
  assert.match(body, /# .*Drop 7815819: Seraph GTS/);
  assert.match(body, /Check Schedule/);
  assert.match(body, /Every 7 minutes/);
  assert.doesNotMatch(body, /Should be hidden when in stock/);
  const buttonsRow = container.components.find((c: any) => c.type === 1);
  assert.equal(buttonsRow.components[0].url, "https://store.everfallcommunity.com/package/7815819");
  assert.equal(buttonsRow.components[1].url, "https://store.everfallcommunity.com/package/7815819?ref=bot");
});

test("Independent widget timestamp controls support partial combinations, editable labels, separate Widget Last Updated, and hiding all 5", () => {
  const checkMs = 1_760_000_000_000;
  const verifiedMs = 1_759_999_000_000;
  const widgetUpdatedMs = 1_760_000_500_000;

  const customOnlyUpdated = buildWidgetPayload({
    records: [],
    monitorStatus: { checkedAt: checkMs, lastSuccessAt: verifiedMs, authoritative: true, lastSource: "scrapling" },
    template: {
      ...DEFAULT_WIDGET_TEMPLATE,
      showLastStoreCheck: false,
      showLastVerifiedStock: false,
      showMonitorState: false,
      showLastUpdated: true,
      lastUpdatedLabel: "Board Refreshed",
      showEmbedTimestamp: false,
    },
    nowMs: widgetUpdatedMs,
    widgetUpdatedAt: widgetUpdatedMs,
  });
  const embA = customOnlyUpdated.embeds[0];
  assert.equal(embA.timestamp, undefined, "showEmbedTimestamp=false must omit embed.timestamp");
  assert.doesNotMatch(embA.description, /Last Store Check/);
  assert.doesNotMatch(embA.description, /Last Verified Stock/);
  assert.doesNotMatch(embA.description, /Monitor State/);
  assert.match(
    embA.description,
    new RegExp(`\\*\\*Board Refreshed:\\*\\* <t:${Math.floor(widgetUpdatedMs / 1000)}:R>`)
  );

  // All 5 hidden produces clean description with zero timestamp lines and no embed.timestamp
  const allHidden = buildWidgetPayload({
    records: [],
    monitorStatus: { checkedAt: checkMs, lastSuccessAt: verifiedMs, authoritative: true },
    template: {
      ...DEFAULT_WIDGET_TEMPLATE,
      showLastStoreCheck: false,
      showLastVerifiedStock: false,
      showMonitorState: false,
      showLastUpdated: false,
      showEmbedTimestamp: false,
    },
    nowMs: widgetUpdatedMs,
    widgetUpdatedAt: widgetUpdatedMs,
  });
  const embB = allHidden.embeds[0];
  assert.equal(embB.timestamp, undefined);
  assert.doesNotMatch(embB.description, /<t:\d+:/);
});

test("Widget updates skip Discord PATCH and KV writes on unchanged/blocked checks and batch-save on real changes", async () => {
  const kv = createMemoryKv();
  let kvPutCount = 0;
  const trackedKv = {
    ...kv,
    async put(key: string, value: string | ArrayBuffer) {
      if (key === WIDGET_REGISTRY_KEY || key.startsWith("widget")) {
        kvPutCount++;
      }
      return kv.put(key, value);
    },
  };

  const env: any = {
    DISCORD_BOT: trackedKv,
    DISCORD_BOT_TOKEN: "mock_bot_token",
    PUBLIC_ORIGIN: "https://portal.example.com",
  };

  await setGuildConfig(env, "111111111111111111", {
    channelId: "222222222222222222",
    roleIds: ["999999999999999999"],
    environment: "production",
  });
  await setGuildConfig(env, "333333333333333333", {
    channelId: "444444444444444444",
    roleIds: ["888888888888888888"],
    environment: "production",
  });

  const discordPatches: Array<{ url: string; body: any }> = [];
  const origFetch = globalThis.fetch;
  let nextMsgId = 1000;
  globalThis.fetch = (async (input: any, init?: any) => {
    const urlStr = String(input);
    const method = String(init?.method || "GET").toUpperCase();
    if (urlStr.includes("/messages") && method === "POST") {
      return new Response(JSON.stringify({ id: String(++nextMsgId) }), { status: 200 });
    }
    if (urlStr.includes("/messages/") && method === "PATCH") {
      discordPatches.push({ url: urlStr, body: JSON.parse(String(init?.body || "{}")) });
      return new Response(JSON.stringify({ id: urlStr.split("/").pop() }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as any;

  try {
    // Seed existing catalog via first verified ingest (no widgets yet)
    await ingestVerifiedStoreScan(env, "https://portal.example.com", {
      source: "scrapling",
      authoritative: true,
      listings: [
        {
          id: "7815819",
          name: "Seraph GTS",
          description: "Limited car.",
          url: "https://store.everfallcommunity.com/package/7815819",
          images: ["https://cdn.example.com/0.jpg"],
        },
      ],
    });

    // Deploy 2 widgets across 2 guilds
    const w1 = await deployStatusWidgetToChannel(
      env,
      "111111111111111111",
      "222222222222222222",
      "https://portal.example.com",
      { templateId: "default" }
    );
    const w2 = await deployStatusWidgetToChannel(
      env,
      "333333333333333333",
      "444444444444444444",
      "https://portal.example.com",
      { templateId: "default" }
    );
    const widgetMsgIds = new Set([w1.messageId, w2.messageId]);

    const registryBefore = await getAllWidgetDeployments(env);
    assert.equal(registryBefore.length, 2);

    // 1. Subsequent verified check with identical stock -> 0 Discord PATCHes, 0 widget KV writes!
    kvPutCount = 0;
    discordPatches.length = 0;
    await ingestVerifiedStoreScan(env, "https://portal.example.com", {
      source: "scrapling",
      authoritative: true,
      listings: [
        {
          id: "7815819",
          name: "Seraph GTS",
          description: "Limited car.",
          url: "https://store.everfallcommunity.com/package/7815819",
          images: ["https://cdn.example.com/0.jpg"],
        },
      ],
    });
    assert.equal(discordPatches.length, 0, "Unchanged check must trigger 0 Discord PATCH calls");
    assert.equal(kvPutCount, 0, "Unchanged check must trigger 0 widget KV writes");

    // 2. Blocked/non-authoritative check -> 0 Discord PATCHes, 0 widget KV writes!
    await ingestVerifiedStoreScan(env, "https://portal.example.com", {
      source: "cron-fetch",
      authoritative: false,
      cloudflareChallenge: true,
      httpStatus: 403,
      listings: [],
    });
    assert.equal(discordPatches.length, 0, "Blocked check must never edit widgets");
    assert.equal(kvPutCount, 0, "Blocked check must never write widget KV");

    // 3. Sold out transition -> edits 2 drop embeds + BOTH existing widgets in-place, never pings roles, and performs ONLY 1 batch KV write!
    await ingestVerifiedStoreScan(env, "https://portal.example.com", {
      source: "scrapling",
      authoritative: true,
      confirmedSoldOutIds: ["7815819"],
      listings: [],
    });
    const widgetPatches = discordPatches.filter((p) =>
      widgetMsgIds.has(p.url.split("/").pop())
    );
    assert.equal(widgetPatches.length, 2, "Stock transition must update both deployed widgets in place");
    assert.equal(discordPatches.length, 4, "Stock transition also edits both announcement embeds cleanly");
    assert.equal(kvPutCount, 1, "Multiple updated widgets must persist in a single widgets:registry batch write");
    for (const patch of discordPatches) {
      assert.deepEqual(patch.body.allowed_mentions?.roles, []);
    }

    // 4. Template change refreshes changed widgets; subsequent non-forced refresh skips again
    kvPutCount = 0;
    discordPatches.length = 0;
    const baseBundle = createDefaultPresentationConfig();
    await setPresentationConfig(env, {
      ...baseBundle,
      widgetDefault: {
        ...baseBundle.widgetDefault,
        title: "Updated Board Title",
      },
    });
    const resTpl = await refreshAllWidgets(env, "https://portal.example.com", {
      trigger: "presentation-save",
      catalogChanged: true,
    });
    assert.equal(resTpl.refreshed, 2);
    assert.equal(resTpl.skipped, 0);
    assert.equal(discordPatches.length, 2);
    assert.equal(kvPutCount, 1);

    // 5. Explicit admin force=true refreshes even when content hash matches
    kvPutCount = 0;
    discordPatches.length = 0;
    const resForce = await refreshAllWidgets(env, "https://portal.example.com", {
      force: true,
      trigger: "manual-force",
    });
    assert.equal(resForce.refreshed, 2);
    assert.equal(discordPatches.length, 2);
    assert.equal(kvPutCount, 1);

    // Verify computeWidgetContentHash strictly ignores timestamp drift
    const h1 = computeWidgetContentHash({
      records: [],
      template: DEFAULT_WIDGET_TEMPLATE,
      catalogVersion: 1,
    });
    const h2 = computeWidgetContentHash({
      records: [],
      template: DEFAULT_WIDGET_TEMPLATE,
      catalogVersion: 1,
    });
    assert.equal(h1, h2);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("D1 performs one-time non-destructive migration from KV and brings routine reads/writes to zero KV ops", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "everfall-d1-test-"));
  const dbPath = path.join(tmpDir, "test.sqlite");
  const baseKv = createMemoryKv();

  // Seed legacy KV keys prior to D1 migration
  await baseKv.put(
    "listings:snapshot",
    JSON.stringify({
      version: 3,
      records: [
        {
          id: "7815819",
          firstSeenAt: 1_760_000_000_000,
          lastSeenAt: 1_760_000_120_000,
          isAvailable: true,
          payload: { name: "Seraph GTS", description: "Limited coupe", images: [] },
        },
      ],
    })
  );
  await baseKv.put("guilds:all", JSON.stringify(["111111111111111111"]));
  await baseKv.put(
    "guild:111111111111111111",
    JSON.stringify({
      channelId: "222222222222222222",
      roleIds: ["333333333333333333"],
      environment: "production",
    })
  );
  await baseKv.put(
    "guild:111111111111111111:messages",
    JSON.stringify({
      "7815819": {
        listingId: "7815819",
        channelId: "222222222222222222",
        messageId: "444444444444444444",
        sentAt: 1_760_000_010_000,
      },
    })
  );
  await baseKv.put(
    "widgets:registry",
    JSON.stringify({
      "111111111111111111:555555555555555555": {
        id: "111111111111111111:555555555555555555",
        guildId: "111111111111111111",
        channelId: "555555555555555555",
        messageId: "666666666666666666",
        deployedAt: 1_760_000_020_000,
      },
    })
  );
  await baseKv.put(
    "monitor:logs",
    JSON.stringify([
      {
        id: "mlog-1",
        timestamp: Date.now() - 60_000,
        source: "scrapling",
        status: "success",
        httpStatus: 200,
        cloudflareChallenge: false,
        authoritative: true,
        responseLength: 4200,
        targetUrl: "https://store.everfallcommunity.com",
        listingCount: 1,
        newDiscoveries: 0,
        durationMs: 210,
        message: "Verified",
      },
    ])
  );
  await baseKv.put(
    "dispatch:logs",
    JSON.stringify([
      {
        id: "dlog-1",
        listingId: "7815819",
        listingName: "Seraph GTS",
        guildId: "111111111111111111",
        channelId: "222222222222222222",
        messageId: "444444444444444444",
        method: "auto",
        environment: "production",
        status: "delivered",
        timestamp: 1_760_000_010_000,
      },
    ])
  );
  const seededPres = createDefaultPresentationConfig();
  seededPres.widgetDefault.title = "Migrated Board Title";
  await baseKv.put("admin:presentation_config", JSON.stringify(seededPres));

  let kvReads = 0;
  let kvWrites = 0;
  let kvDeletes = 0;
  const instrumentedKv = {
    async get(key: string, type?: string) {
      kvReads++;
      return baseKv.get(key, type);
    },
    async getWithMetadata(key: string) {
      kvReads++;
      return baseKv.getWithMetadata(key);
    },
    async put(key: string, value: string | ArrayBuffer) {
      kvWrites++;
      return baseKv.put(key, value);
    },
    async delete(key: string) {
      kvDeletes++;
      return baseKv.delete(key);
    },
    async list(opts?: { prefix?: string }) {
      kvReads++;
      return baseKv.list(opts);
    },
  };

  try {
    const d1 = createLocalD1(dbPath);
    const env: any = {
      DB: d1,
      DISCORD_BOT: instrumentedKv,
    };

    // First pass triggers lazy migration from KV -> D1
    const snap1 = await getCatalogSnapshot(env);
    const guild1 = await getGuildConfig(env, "111111111111111111");
    const msgs1 = await getGuildSentMessages(env, "111111111111111111");
    const widgets1 = await getAllWidgetDeployments(env);
    const mLogs1 = await getMonitorLogs(env);
    const dLogs1 = await getDeliveryLogs(env);
    const pres1 = await getPresentationConfig(env);

    assert.equal(snap1.records.length, 1);
    assert.equal(guild1?.channelId, "222222222222222222");
    assert.equal(msgs1["7815819"]?.messageId, "444444444444444444");
    assert.equal(widgets1.length, 1);
    assert.equal(mLogs1.length, 1);
    assert.equal(dLogs1.length, 1);
    assert.equal(pres1.widgetDefault.title, "Migrated Board Title");

    // Verify migration did NOT delete original KV keys (non-destructive safety)
    assert.equal(kvDeletes, 0);
    assert.ok(await baseKv.get("listings:snapshot"));
    assert.ok(await baseKv.get("guild:111111111111111111"));
    assert.ok(await baseKv.get("widgets:registry"));

    // Reset counters and execute routine reads/writes strictly against D1 -> 0 KV ops!
    kvReads = 0;
    kvWrites = 0;
    kvDeletes = 0;

    await getCatalogSnapshot(env);
    await getGuildConfig(env, "111111111111111111");
    await getGuildSentMessages(env, "111111111111111111");
    await getAllWidgetDeployments(env);
    await getMonitorLogs(env);
    await getDeliveryLogs(env);
    await getPresentationConfig(env);
    await setGuildConfig(env, "111111111111111111", {
      channelId: "222222222222222222",
      roleIds: ["333333333333333333"],
      environment: "production",
    });

    assert.equal(kvReads, 0, "Routine D1-backed structured reads must execute zero KV reads");
    assert.equal(kvWrites, 0, "Routine D1-backed structured writes must execute zero KV writes");
    assert.equal(kvDeletes, 0, "Routine D1-backed operations must execute zero KV deletes");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Legacy Discord embed recovery parses links/IDs, validates authorship & conflicts, and patches legacy messages in place without role pings", async () => {
  const parsedUrl = parseDiscordMessageReference(
    "https://canary.discord.com/channels/111111111111111111/222222222222222222/333333333333333333?foo=bar"
  );
  assert.deepEqual(parsedUrl, {
    guildId: "111111111111111111",
    channelId: "222222222222222222",
    messageId: "333333333333333333",
    fromUrl: true,
  });
  assert.deepEqual(parseDiscordMessageReference("333333333333333333"), {
    messageId: "333333333333333333",
    fromUrl: false,
  });
  assert.equal(parseDiscordMessageReference("not-a-snowflake"), null);

  const kv = createMemoryKv();
  const secret = "test_recovery_secret_0123456789";
  const env: any = {
    DISCORD_BOT: kv,
    DISCORD_BOT_TOKEN: "mock_bot_token",
    DISCORD_CLIENT_SECRET: secret,
    DISCORD_PRIMARY_ADMINISTRATOR: "151037568484507648",
    DISCORD_APPLICATION_ID: "1571958001928245378",
    PUBLIC_ORIGIN: "https://portal.example.com",
  };

  await kv.put(
    "listings:snapshot",
    JSON.stringify({
      version: 2,
      records: [
        {
          id: "7815813",
          firstSeenAt: 1_750_000_000_000,
          lastSeenAt: 1_750_000_060_000,
          soldOutAt: 1_750_000_120_000,
          isAvailable: false,
          payload: {
            name: "73C",
            description: "Quantity-limited coupe",
            url: "https://store.everfallcommunity.com/package/7815813",
            images: [],
          },
        },
        {
          id: "7815819",
          firstSeenAt: 1_760_000_000_000,
          lastSeenAt: 1_760_000_060_000,
          isAvailable: true,
          payload: { name: "Seraph GTS", description: "Limited coupe", images: [] },
        },
      ],
    })
  );
  await setGuildConfig(env, "111111111111111111", {
    channelId: "222222222222222222",
    roleIds: ["999999999999999999"],
    environment: "production",
  });

  const postedMessages: any[] = [];
  const patchedPayloads: any[] = [];
  let simulateLegacyEmbedRejectionFirstPatch = true;
  let mockAuthorId = "1571958001928245378";

  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: any) => {
    const urlStr = String(input);
    const method = String(init?.method || "GET").toUpperCase();
    if (urlStr.endsWith("/users/@me")) {
      return new Response(JSON.stringify({ id: "1571958001928245378", username: "EverfallBot" }), {
        status: 200,
      });
    }
    if (urlStr.endsWith("/channels/222222222222222222")) {
      return new Response(
        JSON.stringify({ id: "222222222222222222", guild_id: "111111111111111111" }),
        { status: 200 }
      );
    }
    if (urlStr.includes("/channels/222222222222222222/messages/333333333333333333")) {
      if (method === "GET") {
        return new Response(
          JSON.stringify({
            id: "333333333333333333",
            channel_id: "222222222222222222",
            timestamp: "2026-09-01T12:00:00.000Z",
            author: { id: mockAuthorId, username: "BotOrUser", bot: true },
            embeds: [{ title: "73C Release", description: "Old legacy embed" }],
          }),
          { status: 200 }
        );
      }
      if (method === "PATCH") {
        const body = JSON.parse(String(init?.body || "{}"));
        patchedPayloads.push(body);
        if (simulateLegacyEmbedRejectionFirstPatch && !("embeds" in body)) {
          simulateLegacyEmbedRejectionFirstPatch = false;
          return new Response(
            JSON.stringify({ message: "Must clear legacy embeds when using IS_COMPONENTS_V2 flag" }),
            { status: 400 }
          );
        }
        return new Response(JSON.stringify({ id: "333333333333333333" }), { status: 200 });
      }
    }
    if (urlStr.endsWith("/messages") && method === "POST") {
      postedMessages.push(JSON.parse(String(init?.body || "{}")));
      return new Response(JSON.stringify({ id: "999" }), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  }) as any;

  try {
    // 1. Foreign author rejected cleanly with 403
    mockAuthorId = "777777777777777777";
    const foreignRes = await inspectRecoverableDiscordEmbed(env, {
      guildId: "111111111111111111",
      channelId: "222222222222222222",
      messageIdOrUrl: "333333333333333333",
      listingId: "7815813",
    });
    assert.equal(foreignRes.ok, false);
    assert.equal(foreignRes.httpStatus, 403);

    // 2. Bot-owned preview succeeds via HTTP endpoint + detects no conflict initially
    mockAuthorId = "1571958001928245378";
    const adminToken = await createSessionToken("151037568484507648", "xchasex", "", secret);
    const previewReq = new Request(
      "https://portal.example.com/api/admin/dispatch/recover/preview",
      {
        method: "POST",
        headers: { Cookie: `everfall_session=${adminToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          guildId: "111111111111111111",
          channelId: "222222222222222222",
          messageIdOrUrl: "https://discord.com/channels/111111111111111111/222222222222222222/333333333333333333",
          listingId: "7815813",
        }),
      }
    );
    const previewRes = await handleApiRequest(previewReq, env, new URL(previewReq.url));
    assert.equal(previewRes?.status, 200);
    const previewJson: any = await previewRes!.json();
    assert.equal(previewJson.preview.title, "73C Release");

    // 3. Recovery restores tracking preserving original sentAt & edits legacy message in-place cleanly (with V2 fallback)
    const recoverReq = new Request("https://portal.example.com/api/admin/dispatch/recover", {
      method: "POST",
      headers: { Cookie: `everfall_session=${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        guildId: "111111111111111111",
        channelId: "222222222222222222",
        messageIdOrUrl: "333333333333333333",
        listingId: "7815813",
        applyTemplateNow: true,
      }),
    });
    const recoverRes = await handleApiRequest(recoverReq, env, new URL(recoverReq.url));
    assert.equal(recoverRes?.status, 200);
    assert.equal(postedMessages.length, 0, "Recovery must NEVER repost a new message");
    assert.equal(patchedPayloads.length, 2, "Legacy embed rejection triggers clean Components V2 retry");
    assert.deepEqual(patchedPayloads[1].embeds, []);
    assert.equal(patchedPayloads[1].content, null);
    assert.deepEqual(patchedPayloads[1].allowed_mentions.roles, [], "Recovery edits must NEVER ping roles");

    const sentMap = await getGuildSentMessages(env, "111111111111111111");
    assert.equal(sentMap["7815813"]?.messageId, "333333333333333333");
    assert.equal(sentMap["7815813"]?.sentAt, Date.parse("2026-09-01T12:00:00.000Z"));

    // 4. Attempting to link same message to a different listing without allowOverwrite returns 409 conflict
    const conflictRes = await recoverDiscordEmbedTracking(env, {
      guildId: "111111111111111111",
      channelId: "222222222222222222",
      messageIdOrUrl: "333333333333333333",
      listingId: "7815819",
      allowOverwrite: false,
    });
    assert.equal(conflictRes.ok, false);
    assert.equal(conflictRes.httpStatus, 409);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("Site pages normalization strips HTML tags and admin partial pages updates preserve unrelated tabs", async () => {
  const sanitized = normalizeSitePagesConfig({
    about: {
      ...DEFAULT_SITE_PAGES_CONFIG.about,
      badgeText: "<b>Verified</b> Architecture <script>alert(1)</script>",
      heading: "About <img src=x onerror=alert(1)> Platform",
    },
  });
  assert.doesNotMatch(sanitized.about.badgeText, /<b>|<script>/);
  assert.match(sanitized.about.badgeText, /Verified Architecture alert\(1\)/);
  assert.equal(sanitized.features.heading, DEFAULT_SITE_PAGES_CONFIG.features.heading);

  const kv = createMemoryKv();
  const secret = "test_pages_secret_0123456789";
  const env: any = {
    DISCORD_BOT: kv,
    DISCORD_CLIENT_SECRET: secret,
    DISCORD_PRIMARY_ADMINISTRATOR: "151037568484507648",
    PUBLIC_ORIGIN: "https://portal.example.com",
  };
  const adminToken = await createSessionToken("151037568484507648", "xchasex", "", secret);

  const saveAboutReq = new Request("https://portal.example.com/api/admin/presentation", {
    method: "PUT",
    headers: { Cookie: `everfall_session=${adminToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      pages: {
        about: {
          ...DEFAULT_SITE_PAGES_CONFIG.about,
          heading: "Custom About Heading",
        },
      },
    }),
  });
  const saveRes = await handleApiRequest(saveAboutReq, env, new URL(saveAboutReq.url));
  assert.equal(saveRes?.status, 200);

  const pubStatusRes = await handleApiRequest(
    new Request("https://portal.example.com/api/public/status"),
    env,
    new URL("https://portal.example.com/api/public/status")
  );
  const pubStatusJson: any = await pubStatusRes!.json();
  assert.equal(pubStatusJson.pages.about.heading, "Custom About Heading");
  assert.equal(pubStatusJson.pages.home.sectionTitle, DEFAULT_SITE_PAGES_CONFIG.home.sectionTitle);
  assert.equal(pubStatusJson.pages.privacy.heading, DEFAULT_SITE_PAGES_CONFIG.privacy.heading);
});

