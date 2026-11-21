import test from "node:test";
import assert from "node:assert/strict";
import { decode, encode } from "fast-png";
import { createLocalD1 } from "../../server";
import {
  composeEventImage,
  decodeListingImage,
  generateEventPreview,
  initWebp,
} from "../../eventImage";
import fs from "node:fs";
import { EF_LOGO_BASE64 } from "../../assets";
import { runServerAutomations } from "../../serverAutomation";
import {
  getGuildConfig,
  getPresentationConfig,
  getWidgetDeploymentById,
  savePresentationPages,
  setGuildConfig,
  setWidgetDeployment,
} from "../../kv";
import { getMonitorStateValue, setCachedUserGuilds } from "../../d1";
import { createSessionToken } from "../../admin";
import { handleApiRequest } from "../../api";
import {
  DEFAULT_SITE_PAGES_CONFIG,
  normalizeSitePagesConfig,
} from "../presentation";
import { safePageDestination } from "../pageSections";
import { DEFAULT_CUSTOMIZATIONS } from "../customizations";

const guildId = "111111111111111111";
const channelId = "222222222222222222";
function fixture() {
  const db = createLocalD1(":memory:");
  let kvOps = 0;
  const env = {
    DB: db,
    DISCORD_BOT_TOKEN: "mock-token",
    DISCORD_APPLICATION_ID: "1571958001928245378",
    DISCORD_BOT: {
      async get() {
        kvOps++;
        return null;
      },
      async put() {
        kvOps++;
      },
      async delete() {
        kvOps++;
      },
      async list() {
        kvOps++;
        return { keys: [], list_complete: true };
      },
    },
  };
  return { db, env, count: () => kvOps };
}

test("hidden hero/badge configuration, blank badge text, empty feature lists, icons, and extra sections survive normalization", () => {
  const home = {
    ...DEFAULT_SITE_PAGES_CONFIG.home,
    showHero: false,
    showHeroBadge: false,
    badgeText: "",
    heroBadgeIcon: "car-front" as const,
    heroBadgeStyle: "solid" as const,
    featureCards: [],
    showScheduledCheck: false,
    scheduledCheckMode: "custom" as const,
    scheduledCheckMinutes: 19,
    extraSections: [
      {
        id: "extra",
        title: "Custom",
        body: "Saved paragraphs",
        icon: "none" as const,
        enabled: false,
        alignment: "center" as const,
        style: "bordered" as const,
        spacing: "compact" as const,
        buttonLabel: "Read",
        buttonUrl: "/about",
      },
    ],
  };
  const result = normalizeSitePagesConfig({
    ...DEFAULT_SITE_PAGES_CONFIG,
    home,
  });
  assert.equal(result.home.showHero, false);
  assert.equal(result.home.showHeroBadge, false);
  assert.equal(result.home.badgeText, "");
  assert.equal(result.home.heroBadgeIcon, "car-front");
  assert.equal(result.home.heroBadgeStyle, "solid");
  assert.deepEqual(result.home.featureCards, []);
  assert.equal(result.home.scheduledCheckMinutes, 19);
  assert.equal(result.home.extraSections?.[0].body, "Saved paragraphs");
  assert.equal(result.home.extraSections?.[0].enabled, false);
  for (const unsafe of [
    "javascript:alert(1)",
    "//evil.example",
    "/\\evil.example",
    "https://user:password@example.com",
    "/\n/evil.example",
  ])
    assert.equal(safePageDestination(unsafe), "");
});

test("atomic concurrent page saves preserve unrelated pages and templates and avoid no-op writes/KV", async () => {
  const { db, env, count } = fixture();
  try {
    const initial = await getPresentationConfig(env);
    const home = {
      ...initial.pages!.home,
      badgeText: "Home draft",
      showHero: false,
    };
    const about = { ...initial.pages!.about, heading: "About draft" };
    const before = count();
    await Promise.all([
      savePresentationPages(env, { home }),
      savePresentationPages(env, { about }),
    ]);
    const saved = await getPresentationConfig(env);
    assert.equal(saved.pages?.home.badgeText, "Home draft");
    assert.equal(saved.pages?.about.heading, "About draft");
    assert.deepEqual(saved.announcements, initial.announcements);
    const unchanged = await savePresentationPages(env, {
      home: saved.pages!.home,
    });
    assert.equal(unchanged.version, saved.version);
    assert.equal(count(), before);
  } finally {
    db.close();
  }
});

test("event composites generate 1, 2, and 3 columns with a central crop and prefer slot 3 with fallback", async () => {
  const raster = (color: number[]) => ({
    width: 8,
    height: 8,
    data: new Uint8Array(Array.from({ length: 64 }, () => color).flat()),
  });
  const colors = [
    [255, 0, 0, 255],
    [0, 255, 0, 255],
    [0, 0, 255, 255],
  ];
  for (const n of [1, 2, 3]) {
    const png = decode(
      composeEventImage(colors.slice(0, n).map(raster), 96, 54),
    );
    assert.equal(png.width, 96);
    assert.equal(png.height, 54);
    for (let column = 0; column < n; column++) {
      const offset = (27 * 96 + Math.floor(((column + 0.5) * 96) / n)) * 4;
      assert.deepEqual(
        Array.from(png.data.slice(offset, offset + 4)),
        colors[column],
      );
    }
  }
  const crop = raster([255, 0, 0, 255]);
  for (let y = 2; y < 6; y++)
    for (let x = 2; x < 6; x++)
      crop.data.set([0, 255, 0, 255], (y * 8 + x) * 4);
  const cropped = decode(composeEventImage([crop], 8, 8));
  assert.equal(cropped.data[0], 0);
  assert.equal(cropped.data[1], 255);
  const requested: string[] = [];
  const image = encode({ ...raster(colors[0]), channels: 4, depth: 8 });
  const env = {
    MEDIA_BUCKET: {
      async get(key: string) {
        requested.push(key);
        return key.endsWith(":2")
          ? {
              async arrayBuffer() {
                return image.buffer;
              },
            }
          : null;
      },
    },
  };
  assert.match(
    (await generateEventPreview(env, [
      { id: "one", images: ["a", "b", "c"] },
    ]))!,
    /^data:image\/png;base64,/,
  );
  assert.deepEqual(requested, ["media:one:2"]);
  requested.length = 0;
  const fallback = {
    MEDIA_BUCKET: {
      async get(key: string) {
        requested.push(key);
        return key.endsWith(":0")
          ? {
              async arrayBuffer() {
                return image.buffer;
              },
            }
          : null;
      },
    },
  };
  assert.ok(
    await generateEventPreview(fallback, [
      { id: "one", images: ["a", "b", "c"] },
    ]),
  );
  assert.deepEqual(requested, ["media:one:2", "media:one:0"]);
});

test("bundled WebP decoder processes existing archived-format media in the Node runtime", async () => {
  await initWebp(
    await WebAssembly.compile(
      fs.readFileSync(
        new URL(
          "../../../node_modules/@jsquash/webp/codec/dec/webp_dec.wasm",
          import.meta.url,
        ),
      ),
    ),
  );
  const bytes = Buffer.from(EF_LOGO_BASE64.split(",")[1], "base64");
  const decoded = await decodeListingImage(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  assert.ok(decoded.width > 0 && decoded.height > 0);
  assert.equal(decoded.data.length, decoded.width * decoded.height * 4);
});

test("customizations API enforces manager authorization, preserves channel/roles, and saves without Discord sends", async () => {
  const { db, env } = fixture();
  const secret = "test-customizations-secret";
  Object.assign(env, { DISCORD_CLIENT_SECRET: secret });
  try {
    await setCachedUserGuilds(
      db,
      "555555555555555555",
      [{ id: guildId, permissions: "32", owner: false }],
      Date.now() + 60_000,
    );
    await setGuildConfig(env, guildId, {
      channelId,
      roleIds: ["333333333333333333"],
      environment: "test",
    });
    const token = await createSessionToken(
      "555555555555555555",
      "manager",
      "",
      secret,
    );
    const url = `https://portal.example/api/dashboard/servers/${guildId}/customizations`;
    const unauthorized = await handleApiRequest(
      new Request(url, { method: "PUT", body: "{}" }),
      env,
      new URL(url),
    );
    assert.equal(unauthorized?.status, 401);
    const response = await handleApiRequest(
      new Request(url, {
        method: "PUT",
        headers: { Cookie: `everfall_session=${token}` },
        body: JSON.stringify({
          autoPinListings: true,
          stickyWidget: true,
          autoCreateEvent: "bad",
          channelId: "malicious",
        }),
      }),
      env,
      new URL(url),
    );
    assert.equal(response?.status, 200);
    const cfg = await getGuildConfig(env, guildId);
    assert.equal(cfg?.channelId, channelId);
    assert.deepEqual(cfg?.roleIds, ["333333333333333333"]);
    assert.equal(cfg?.environment, "test");
    assert.equal(cfg?.customizations?.autoCreateEvent, false);
    assert.equal(cfg?.customizations?.stickyWidget, true);
    const deniedUrl = url.replace(guildId, "999999999999999999");
    const denied = await handleApiRequest(
      new Request(deniedUrl, {
        method: "PUT",
        headers: { Cookie: `everfall_session=${token}` },
        body: "{}",
      }),
      env,
      new URL(deniedUrl),
    );
    assert.equal(denied?.status, 403);
  } finally {
    db.close();
  }
});

test("event create/update/end lifecycle reuses tracked ID, reports errors, and uses zero routine KV", async () => {
  const { db, env, count } = fixture();
  const originalFetch = globalThis.fetch;
  const calls: Array<{ method: string; body: any }> = [];
  let event: any = null;
  globalThis.fetch = (async (input, init) => {
    assert.match(String(input), /^https:\/\/discord.com\/api\/v10\/guilds\//);
    const method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method, body });
    if (method === "GET")
      return Response.json(
        String(input).endsWith("/scheduled-events")
          ? event
            ? [event]
            : []
          : event,
      );
    if (method === "POST") {
      event = { id: "444444444444444444", status: 1, ...body };
      return Response.json(event);
    }
    if (method === "PATCH") {
      event = { ...event, ...body };
      return Response.json(event);
    }
    throw new Error("Unexpected method");
  }) as typeof fetch;
  try {
    await setGuildConfig(env, guildId, {
      channelId,
      roleIds: [],
      customizations: { ...DEFAULT_CUSTOMIZATIONS, autoCreateEvent: true },
    });
    const active = {
      version: 1,
      records: [
        {
          id: "7815813",
          firstSeenAt: 1,
          lastSeenAt: 2,
          isAvailable: true,
          payload: { name: "Limited One", images: [] },
        },
      ],
    };
    await runServerAutomations(env, active);
    assert.equal(event.status, 2);
    assert.equal(calls.filter((call) => call.method === "POST").length, 1);
    const kvBefore = count();
    await runServerAutomations(env, active);
    assert.equal(calls.filter((call) => call.method === "POST").length, 1);
    assert.equal(calls.filter((call) => call.method === "PATCH").length, 1);
    await runServerAutomations(env, {
      ...active,
      version: 2,
      records: active.records.map((record) => ({
        ...record,
        payload: { ...record.payload, name: "Changed name" },
      })),
    });
    assert.equal(calls.filter((call) => call.method === "PATCH").length, 2);
    await runServerAutomations(env, {
      version: 3,
      records: active.records.map((record) => ({
        ...record,
        isAvailable: false,
      })),
    });
    assert.equal(event.status, 3);
    assert.equal(
      (await getMonitorStateValue<any>(db, `server-automation:${guildId}`))
        .eventId,
      undefined,
    );
    assert.equal(count(), kvBefore);
    globalThis.fetch = (async () =>
      new Response("", { status: 403 })) as typeof fetch;
    await runServerAutomations(env, active);
    assert.match(
      (await getMonitorStateValue<any>(db, `server-automation:${guildId}`))
        .error,
      /permission/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test("sticky replacement recovers a failed send, keeps one tracked widget, respects cooldown, and avoids duplicate pins", async () => {
  const { db, env } = fixture();
  const originalFetch = globalThis.fetch;
  const oldId = "444444444444444444";
  const newId = "666666666666666666";
  let failSend = true,
    sends = 0,
    pins = 0;
  let deleted = false;
  globalThis.fetch = (async (input, init) => {
    const url = String(input),
      method = init?.method || "GET";
    if (url.endsWith("?limit=5"))
      return Response.json([{ id: "555555555555555555", type: 0 }]);
    if (method === "PUT") {
      pins++;
      return new Response(null, { status: 204 });
    }
    if (method === "DELETE") {
      deleted = true;
      return new Response(null, { status: 204 });
    }
    if (method === "GET")
      return deleted
        ? new Response(null, { status: 404 })
        : Response.json({
            content: "Live widget",
            embeds: [],
            components: [],
            flags: 0,
          });
    if (method === "POST") {
      sends++;
      if (failSend) return new Response(null, { status: 503 });
      return Response.json({ id: newId });
    }
    throw new Error("Unexpected request");
  }) as typeof fetch;
  try {
    await setGuildConfig(env, guildId, {
      channelId,
      roleIds: [],
      customizations: {
        ...DEFAULT_CUSTOMIZATIONS,
        stickyWidget: true,
        pinWidget: true,
      },
    });
    await setWidgetDeployment(env, {
      id: "widget",
      guildId,
      channelId,
      messageId: oldId,
      deployedAt: Date.now() - 3600_000,
      renderVersion: 9,
    });
    await runServerAutomations(env, { version: 1, records: [] });
    assert.ok(
      (await getMonitorStateValue<any>(db, `server-automation:${guildId}`))
        .pendingMoves.widget,
    );
    failSend = false;
    await runServerAutomations(env, { version: 1, records: [] });
    const widget = await getWidgetDeploymentById(env, "widget");
    assert.equal(widget?.messageId, newId);
    assert.equal(widget?.automationPinned, true);
    assert.equal(widget?.renderVersion, 9);
    assert.ok(widget?.lastStickyAt);
    assert.equal(
      (await getMonitorStateValue<any>(db, `server-automation:${guildId}`))
        .pendingMoves,
      undefined,
    );
    await runServerAutomations(env, { version: 1, records: [] });
    assert.equal(sends, 2);
    assert.equal(pins, 2);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});
