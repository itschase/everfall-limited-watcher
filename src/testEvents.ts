import {
  ensureD1Schema,
  getD1Database,
  getMonitorStateValue,
  setMonitorStateValue,
} from "./d1";
import { fetchDiscordWithRetry } from "./discord";
import { generateEventPreview } from "./eventImage";
import { getCatalogSnapshot, getGuildConfig } from "./kv";

const TEST_EVENT_NAME = "[TEST] Everfall Limited Watcher";
const TEST_MARKER = "Test simulation only — does not represent live stock.";
export class TestEventError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export interface TestEventOptions {
  guildId: string;
  maxListings: number;
  durationMinutes: number;
  repeatSamples?: boolean;
  requestId?: string;
}
export interface TestEventState {
  eventId?: string;
  requestId: string;
  expiresAt: number;
  createdAt: number;
  endedAt?: number;
  status?: number;
  listingNames: string[];
}

async function requireTestGuild(env: any, guildId: string) {
  if (!/^\d{17,20}$/.test(guildId))
    throw new TestEventError("Select a designated Test server.");
  const cfg = await getGuildConfig(env, guildId);
  if (cfg?.environment !== "test")
    throw new TestEventError(
      "Blocked: test events may only target servers marked Test.",
      403,
    );
  const db = getD1Database(env);
  if (!db)
    throw new TestEventError("D1 storage is required for test events.", 503);
  return db;
}

function validateOptions(options: TestEventOptions) {
  if (
    !Number.isInteger(options.maxListings) ||
    options.maxListings < 1 ||
    options.maxListings > 3
  )
    throw new TestEventError("Select a maximum of 1, 2, or 3 vehicles.");
  if (
    !Number.isInteger(options.durationMinutes) ||
    options.durationMinutes < 1 ||
    options.durationMinutes > 60
  )
    throw new TestEventError("Test duration must be between 1 and 60 minutes.");
}

export async function previewTestEvent(env: any, options: TestEventOptions) {
  await requireTestGuild(env, options.guildId);
  validateOptions(options);
  const snapshot = await getCatalogSnapshot(env);
  const records = [...snapshot.records].sort(
    (a, b) =>
      Number(b.isAvailable) - Number(a.isAvailable) ||
      b.firstSeenAt - a.firstSeenAt,
  );
  if (!records.length)
    throw new TestEventError(
      "No archived vehicles are available for event testing.",
      422,
    );
  const selected = records.slice(0, options.maxListings);
  if (options.repeatSamples === true)
    while (selected.length < options.maxListings)
      selected.push(records[selected.length % records.length]);
  const listings = selected.map((record) => ({
    id: record.id,
    name: String(record.payload?.name || record.id)
      .replace(/@/g, "@\u200b")
      .slice(0, 120),
    images: Array.isArray(record.payload?.images) ? record.payload.images : [],
  }));
  const image = await generateEventPreview(env, listings);
  if (!image)
    throw new TestEventError(
      "Could not generate an event cover. Check the selected vehicles' archived PNG/JPEG/WebP images in Image Manager.",
      422,
    );
  const description = `${TEST_MARKER}\n\nVehicles listed:\n${listings.map((listing) => `• ${listing.name}`).join("\n")}\n\nEnds automatically after ${options.durationMinutes} minute${options.durationMinutes === 1 ? "" : "s"}.`;
  return {
    name: TEST_EVENT_NAME,
    description,
    image,
    listings: listings.map(({ id, name }) => ({ id, name })),
    actualCount: listings.length,
    repeatedSamples:
      new Set(listings.map((listing) => listing.id)).size < listings.length,
    durationMinutes: options.durationMinutes,
  };
}

async function discordEvent(
  env: any,
  guildId: string,
  suffix = "",
  method = "GET",
  body?: unknown,
): Promise<any> {
  if (!env.DISCORD_BOT_TOKEN)
    throw new TestEventError("DISCORD_BOT_TOKEN is not configured.", 503);
  const response = await fetchDiscordWithRetry(
    `https://discord.com/api/v10/guilds/${guildId}/scheduled-events${suffix}`,
    {
      method,
      headers: {
        Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
  if (response.status === 404 && method === "GET") return null;
  if (!response.ok)
    throw new TestEventError(
      response.status === 403
        ? "Bot needs Create Events / Manage Events access in the selected Test server."
        : `Discord test event operation failed (HTTP ${response.status}).`,
      502,
    );
  return response.status === 204 ? {} : response.json();
}

async function withTestLease<T>(
  env: any,
  guildId: string,
  action: (db: D1Database, renewLease: () => Promise<void>) => Promise<T>,
) {
  const db = await requireTestGuild(env, guildId);
  await ensureD1Schema(db);
  const owner = crypto.randomUUID(),
    key = `test-event-lock:${guildId}`,
    now = Date.now();
  const acquired = await db
    .prepare(
      `INSERT INTO monitor_state (key, updated_at, value_json) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET updated_at = excluded.updated_at, value_json = excluded.value_json WHERE monitor_state.updated_at < ?`,
    )
    .bind(key, now, JSON.stringify(owner), now - 180_000)
    .run();
  if (!acquired.meta.changes)
    throw new TestEventError(
      "A test-event operation is already running for this server. Wait and reload its status.",
      409,
    );
  try {
    return await action(db, async () => {
      const renewed = await db
        .prepare(
          "UPDATE monitor_state SET updated_at = ? WHERE key = ? AND value_json = ?",
        )
        .bind(Date.now(), key, JSON.stringify(owner))
        .run();
      if (!renewed.meta.changes)
        throw new TestEventError(
          "The test-event operation was superseded. Reload status before retrying.",
          409,
        );
    });
  } finally {
    await db
      .prepare("DELETE FROM monitor_state WHERE key = ? AND value_json = ?")
      .bind(key, JSON.stringify(owner))
      .run();
  }
}

export async function getTestEventStatus(env: any, guildId: string) {
  const db = await requireTestGuild(env, guildId);
  const state = await getMonitorStateValue<TestEventState>(
    db,
    `test-event:${guildId}`,
  );
  return {
    event: state,
    active: Boolean(
      state?.eventId && !state.endedAt && state.expiresAt > Date.now(),
    ),
  };
}

export async function deployTestEvent(env: any, options: TestEventOptions) {
  validateOptions(options);
  if (
    typeof options.requestId !== "string" ||
    !/^[a-zA-Z0-9_-]{8,80}$/.test(options.requestId)
  )
    throw new TestEventError("A valid test deployment request ID is required.");
  return withTestLease(env, options.guildId, async (db, renewLease) => {
    const key = `test-event:${options.guildId}`;
    let previous = await getMonitorStateValue<TestEventState>(db, key);
    if (previous?.eventId && previous.requestId === options.requestId) {
      if (
        previous.status === 1 &&
        previous.expiresAt > Date.now() &&
        !previous.endedAt
      ) {
        await discordEvent(
          env,
          options.guildId,
          `/${previous.eventId}`,
          "PATCH",
          { status: 2 },
        );
        previous.status = 2;
        await setMonitorStateValue(db, key, previous);
      }
      return { event: previous, reused: true };
    }
    if (previous?.eventId && !previous.endedAt) {
      const existing = await discordEvent(
        env,
        options.guildId,
        `/${previous.eventId}`,
      );
      if (existing && [1, 2].includes(existing.status)) {
        if (previous.expiresAt > Date.now())
          throw new TestEventError(
            "A test event is already active. End it or wait for its configured expiry before deploying another.",
            409,
          );
        await discordEvent(env, options.guildId, `/${existing.id}`, "PATCH", {
          status: existing.status === 1 ? 4 : 3,
        });
      }
    }
    // Recover the application's test event after an ambiguous create response.
    const events = await discordEvent(env, options.guildId);
    const recovered = events?.find(
      (event: any) =>
        event.name === TEST_EVENT_NAME &&
        event.description?.startsWith(TEST_MARKER) &&
        event.creator_id ===
          (env.DISCORD_APPLICATION_ID || env.DISCORD_CLIENT_ID) &&
        [1, 2].includes(event.status),
    );
    if (recovered) {
      const state: TestEventState = {
        requestId: previous?.requestId || options.requestId!,
        eventId: recovered.id,
        expiresAt: Date.parse(recovered.scheduled_end_time),
        createdAt: previous?.createdAt || Date.now(),
        listingNames: previous?.listingNames || [],
        status: recovered.status,
      };
      await setMonitorStateValue(db, key, state);
      if (previous?.requestId === options.requestId) {
        if (recovered.status === 1) {
          await discordEvent(
            env,
            options.guildId,
            `/${recovered.id}`,
            "PATCH",
            { status: 2 },
          );
          state.status = 2;
          await setMonitorStateValue(db, key, state);
        }
        return { event: state, reused: true };
      }
      throw new TestEventError(
        "An existing test event was recovered. Reload status and end it before deploying another.",
        409,
      );
    }
    const preview = await previewTestEvent(env, options);
    const now = Date.now();
    const state: TestEventState = {
      requestId: options.requestId!,
      createdAt: now,
      expiresAt: now + options.durationMinutes * 60_000,
      listingNames: preview.listings.map((listing) => listing.name),
      status: 1,
    };
    // Recheck environment immediately before the external mutation.
    await requireTestGuild(env, options.guildId);
    await renewLease();
    await setMonitorStateValue(db, key, state);
    const event = await discordEvent(env, options.guildId, "", "POST", {
      name: preview.name,
      description: preview.description,
      image: preview.image,
      privacy_level: 2,
      entity_type: 3,
      channel_id: null,
      entity_metadata: {
        location: "Everfall Limited Watcher — test simulation",
      },
      scheduled_start_time: new Date(now + 10_000).toISOString(),
      scheduled_end_time: new Date(state.expiresAt).toISOString(),
    });
    if (!event?.id)
      throw new TestEventError("Discord did not return a test event ID.", 502);
    state.eventId = event.id;
    await setMonitorStateValue(db, key, state);
    await discordEvent(env, options.guildId, `/${event.id}`, "PATCH", {
      status: 2,
    });
    state.status = 2;
    await setMonitorStateValue(db, key, state);
    return { event: state, reused: false };
  });
}

export async function endTestEvent(env: any, guildId: string) {
  return withTestLease(env, guildId, async (db) => {
    const key = `test-event:${guildId}`;
    const state = await getMonitorStateValue<TestEventState>(db, key);
    if (!state?.eventId || state.endedAt) return { ok: true, event: state };
    const event = await discordEvent(env, guildId, `/${state.eventId}`);
    if (event && [1, 2].includes(event.status))
      await discordEvent(env, guildId, `/${state.eventId}`, "PATCH", {
        status: event.status === 1 ? 4 : 3,
      });
    state.endedAt = Date.now();
    state.status = event?.status === 1 ? 4 : 3;
    await setMonitorStateValue(db, key, state);
    return { ok: true, event: state };
  });
}
