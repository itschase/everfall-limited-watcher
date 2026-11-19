import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  extractVehicleMetadata,
  resolveListingPresentation,
  sortAndFilterFeatures,
} from "../features";
import {
  buildCarDropPayload,
  buildWidgetPayload,
  computeStableHash,
  DEFAULT_IN_STOCK_TEMPLATE,
  DEFAULT_SOLD_OUT_TEMPLATE,
  DEFAULT_WIDGET_TEMPLATE,
  validateDiscordPayloadLimits,
} from "../presentation";
import { handleInteraction, hasManageServerPermission } from "../../commands";
import {
  buildBotReadinessChecks,
  COMMANDS,
  compareDiscordCommands,
} from "../../register";
import { createSessionToken } from "../../admin";
import { handleApiRequest } from "../../api";
import { setWidgetDeployment } from "../../kv";
import { DISCORD_SLASH_COMMANDS } from "../slashCommands";

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
