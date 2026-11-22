import test from "node:test";
import assert from "node:assert/strict";
import { encode } from "fast-png";
import { createLocalD1 } from "../../localD1";
import {
  getMonitorStateValue,
  setMonitorStateValue,
  setCachedUserGuilds,
} from "../../d1";
import { createSessionToken } from "../../admin";
import { handleApiRequest } from "../../api";
import {
  setGuildConfig,
  setWidgetDeployment,
  getWidgetDeploymentById,
  upsertListingRecord,
} from "../../kv";
import { runServerAutomations } from "../../serverAutomation";
import {
  getTestEventStatus,
  previewTestEvent,
  deployTestEvent,
} from "../../testEvents";
import { checkAutomationReadiness } from "../../automationReadiness";
import { generateEventPreview } from "../../eventImage";
import { DEFAULT_CUSTOMIZATIONS } from "../customizations";
import { DEFAULT_RELEASE_NOTES } from "../releaseNotes";
import {
  saveReleaseNote,
  getReleaseNotes,
  ReleaseConflictError,
} from "../../releaseNotes";
import {
  loadTestPreview,
  TEST_PREVIEW_LIFETIME_MS,
} from "../../testPreviewStore";

const guildId = "111111111111111111",
  channelId = "222222222222222222";
function fixture() {
  const db = createLocalD1(":memory:");
  const env: any = {
    DB: db,
    DISCORD_BOT_TOKEN: "mock",
    DISCORD_APPLICATION_ID: "1571958001928245378",
    DISCORD_BOT: {
      get: async () => null,
      put: async () => {},
      list: async () => ({ keys: [], list_complete: true }),
    },
  };
  return { db, env };
}
const png = () =>
  encode({
    width: 2,
    height: 2,
    channels: 4,
    depth: 8,
    data: new Uint8Array([
      180, 90, 40, 255, 180, 90, 40, 255, 180, 90, 40, 255, 180, 90, 40, 255,
    ]),
  });

test("404 pins stay failed, later widgets proceed, and targeted recovery only touches its failed widget", async () => {
  const { db, env } = fixture(),
    originalFetch = globalThis.fetch;
  let failing = true;
  const calls: string[] = [];
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    calls.push(url);
    assert.equal(init?.method, "PUT");
    return new Response(null, {
      status: failing && url.endsWith("440") ? 404 : 204,
    });
  }) as typeof fetch;
  try {
    await setGuildConfig(env, guildId, {
      channelId,
      roleIds: [],
      customizations: { ...DEFAULT_CUSTOMIZATIONS, pinWidget: true },
    });
    for (let i = 0; i < 2; i++)
      await setWidgetDeployment(env, {
        id: `w${i}`,
        guildId,
        channelId,
        messageId: String(444444444444444440n + BigInt(i)),
        deployedAt: Date.now(),
      });
    await runServerAutomations(env, { version: 1, records: [] });
    assert.equal(
      (await getWidgetDeploymentById(env, "w0"))?.automationPinned,
      undefined,
    );
    assert.equal(
      (await getWidgetDeploymentById(env, "w1"))?.automationPinned,
      true,
    );
    const failed = await getMonitorStateValue<any>(
      db,
      `server-automation:${guildId}`,
    );
    assert.match(failed.failures["widget:w0"], /404/);
    assert.ok(failed.checkedAt);
    failing = false;
    calls.length = 0;
    await runServerAutomations(
      env,
      { version: 1, records: [] },
      { guildId, task: "widget", widgetId: "w0" },
    );
    assert.equal(calls.length, 1);
    assert.ok(calls[0].endsWith("440"));
    const recovered = await getMonitorStateValue<any>(
      db,
      `server-automation:${guildId}`,
    );
    assert.equal(recovered.error, undefined);
    assert.ok(recovered.lastSuccessAt);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test("reloading test status reconciles events ended or deleted in Discord without modifying real events", async () => {
  const { db, env } = fixture(),
    originalFetch = globalThis.fetch;
  try {
    await setGuildConfig(env, guildId, {
      channelId,
      roleIds: [],
      environment: "test",
    });
    await setMonitorStateValue(db, `server-automation:${guildId}`, {
      eventId: "real",
    });
    for (const remoteStatus of [3, 404]) {
      await setMonitorStateValue(db, `test-event:${guildId}`, {
        eventId: "test",
        status: 2,
        expiresAt: Date.now() + 60_000,
      });
      globalThis.fetch = (async (_, init) => {
        assert.equal(init?.method, "GET");
        return remoteStatus === 404
          ? new Response(null, { status: 404 })
          : Response.json({ status: remoteStatus });
      }) as typeof fetch;
      const status = await getTestEventStatus(env, guildId);
      assert.equal(status.active, false);
      assert.ok(status.event?.endedAt);
    }
    assert.equal(
      (await getMonitorStateValue<any>(db, `server-automation:${guildId}`))
        .eventId,
      "real",
    );
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test("event deployment uses the saved preview after catalog changes; wrong settings, servers, and expiry are rejected", async () => {
  const { db, env } = fixture(),
    originalFetch = globalThis.fetch;
  try {
    await setGuildConfig(env, guildId, {
      channelId,
      roleIds: [],
      environment: "test",
    });
    env.MEDIA_BUCKET = {
      get: async () => ({ arrayBuffer: async () => png().buffer }),
    };
    await upsertListingRecord(
      env,
      "7815813",
      { name: "Original vehicle", images: ["a"] },
      true,
    );
    const options = { guildId, maxListings: 1, durationMinutes: 5 };
    const preview = await previewTestEvent(env, options);
    await upsertListingRecord(
      env,
      "7815813",
      { name: "Changed vehicle", images: ["changed"] },
      true,
    );
    env.MEDIA_BUCKET.get = async () => {
      throw Error("Deployment must not generate another cover");
    };
    let posted: any;
    globalThis.fetch = (async (_, init) => {
      if (init?.method === "POST") {
        posted = JSON.parse(String(init.body));
        return Response.json({ id: "555555555555555555", status: 1 });
      }
      return init?.method === "PATCH"
        ? Response.json({ status: 2 })
        : Response.json([]);
    }) as typeof fetch;
    const deployed = await deployTestEvent(env, {
      ...options,
      requestId: "exact-preview-001",
      previewId: preview.previewId,
    });
    assert.equal(posted.image, preview.image);
    assert.equal(posted.description, preview.description);
    assert.deepEqual(deployed.event.listingNames, ["Original vehicle"]);
    await assert.rejects(() =>
      loadTestPreview(db, guildId, preview.previewId, {
        maxListings: 2,
        durationMinutes: 5,
        repeatSamples: false,
      }),
    );
    await assert.rejects(() =>
      loadTestPreview(db, "999999999999999999", preview.previewId, {}),
    );
    const manifestKey = `test-preview:${guildId}:${preview.previewId}`;
    const manifest = await getMonitorStateValue<any>(db, manifestKey);
    await setMonitorStateValue(db, manifestKey, {
      ...manifest,
      expiresAt: Date.now() - TEST_PREVIEW_LIFETIME_MS,
    });
    await assert.rejects(
      () =>
        loadTestPreview(db, guildId, preview.previewId, {
          maxListings: 1,
          durationMinutes: 5,
          repeatSamples: false,
        }),
      /expired/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test("cover cache reuses archived images and invalidates after archive replacement", async () => {
  let reads = 0,
    etag = "one";
  const env = {
    MEDIA_BUCKET: {
      head: async () => ({ etag }),
      get: async () => {
        reads++;
        return { arrayBuffer: async () => png().buffer };
      },
    },
  };
  const listings = [{ id: "7815813", images: ["a"] }];
  const image = await generateEventPreview(env, listings);
  assert.equal(await generateEventPreview(env, listings), image);
  assert.equal(reads, 1);
  etag = "two";
  await generateEventPreview(env, listings);
  assert.equal(reads, 2);
});

test("automation permission checks report missing pins and events and never send messages", async () => {
  const { db, env } = fixture(),
    originalFetch = globalThis.fetch;
  let permissions = (1n << 10n).toString();
  globalThis.fetch = (async (input, init) => {
    assert.equal(init?.method || "GET", "GET");
    const url = String(input);
    if (url.endsWith("/roles"))
      return Response.json([{ id: guildId, permissions }]);
    if (url.includes("/members/")) return Response.json({ roles: [] });
    if (url.includes("/channels/"))
      return Response.json({
        id: channelId,
        guild_id: guildId,
        name: "listings",
        type: 0,
        permission_overwrites: [],
      });
    return Response.json({ id: guildId });
  }) as typeof fetch;
  try {
    await setGuildConfig(env, guildId, { channelId, roleIds: [] });
    const options = {
      ...DEFAULT_CUSTOMIZATIONS,
      autoPinListings: true,
      autoCreateEvent: true,
    };
    const denied = await checkAutomationReadiness(env, guildId, options);
    assert.equal(denied.ready, false);
    assert.match(denied.issues.join(" "), /Pin Messages/);
    assert.match(denied.issues.join(" "), /Create Events/);
    permissions = ((1n << 10n) | (1n << 51n) | (1n << 44n)).toString();
    assert.equal(
      (await checkAutomationReadiness(env, guildId, options)).ready,
      true,
    );
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test("simultaneous release creation cannot overwrite a winner", async () => {
  const { db, env } = fixture();
  try {
    const note = { ...DEFAULT_RELEASE_NOTES[0], version: "atomic-release" };
    const results = await Promise.allSettled([
      saveReleaseNote(env, { ...note, title: "First writer" }, true),
      saveReleaseNote(env, { ...note, title: "Second writer" }, true),
    ]);
    assert.equal(
      results.filter((result) => result.status === "fulfilled").length,
      1,
    );
    const rejected = results.find(
      (result) => result.status === "rejected",
    ) as PromiseRejectedResult;
    assert.ok(rejected.reason instanceof ReleaseConflictError);
    const winner = results.find(
      (result) => result.status === "fulfilled",
    ) as PromiseFulfilledResult<typeof note>;
    assert.equal(
      (await getReleaseNotes(env)).find(
        (entry) => entry.version === note.version,
      )?.title,
      winner.value.title,
    );
  } finally {
    db.close();
  }
});

test("manager recovery and permission APIs reject unauthorized targets and block invalid enablement without mutations", async () => {
  const { db, env } = fixture(),
    originalFetch = globalThis.fetch;
  const userId = "555555555555555555",
    secret = "local-permission-api-test";
  Object.assign(env, { DISCORD_CLIENT_SECRET: secret });
  const calls: string[] = [];
  globalThis.fetch = (async (input, init) => {
    assert.equal(
      init?.method || "GET",
      "GET",
      "permission failures do not mutate Discord",
    );
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/roles"))
      return Response.json([{ id: guildId, permissions: String(1n << 10n) }]);
    if (url.includes("/members/")) return Response.json({ roles: [] });
    if (url.includes("/channels/"))
      return Response.json({
        id: channelId,
        guild_id: guildId,
        type: 0,
        permission_overwrites: [],
      });
    return Response.json({ id: guildId });
  }) as typeof fetch;
  try {
    await setCachedUserGuilds(
      db,
      userId,
      [{ id: guildId, permissions: "32", owner: false }],
      Date.now() + 60_000,
    );
    await setGuildConfig(env, guildId, { channelId, roleIds: [] });
    const token = await createSessionToken(userId, "manager", "", secret);
    const request = (
      path: string,
      body: unknown,
      auth = true,
      method = "POST",
    ) => {
      const url = new URL(`https://portal.example${path}`);
      return handleApiRequest(
        new Request(url, {
          method,
          headers: auth ? { Cookie: `everfall_session=${token}` } : {},
          body: JSON.stringify(body),
        }),
        env,
        url,
      );
    };
    const base = `/api/dashboard/servers/${guildId}`;
    assert.equal(
      (await request(`${base}/automations/check`, {}, false))?.status,
      401,
    );
    assert.equal(
      (
        await request(
          `/api/dashboard/servers/999999999999999999/automations/retry`,
          { task: "event" },
        )
      )?.status,
      403,
    );
    assert.equal(calls.length, 0);
    assert.equal(
      (
        await request(
          `${base}/customizations`,
          { ...DEFAULT_CUSTOMIZATIONS, autoPinListings: true },
          true,
          "PUT",
        )
      )?.status,
      400,
    );
    const readiness = await request(`${base}/automations/check`, {
      ...DEFAULT_CUSTOMIZATIONS,
      autoPinListings: true,
    });
    assert.equal(readiness?.status, 200);
    assert.equal(((await readiness!.json()) as any).ready, false);
    assert.equal(
      (
        await request(`${base}/automations/retry`, {
          task: "widget",
          widgetId: "foreign",
        })
      )?.status,
      404,
    );
    assert.equal(
      (await request(`${base}/automations/retry`, { task: "event" }))?.status,
      409,
    );
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});
