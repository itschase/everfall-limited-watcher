import {
  ensureD1Schema,
  getD1Database,
  getMonitorStateValue,
  setMonitorStateValue,
} from "./d1";
import { fetchDiscordWithRetry } from "./discord";
import { generateEventPreview } from "./eventImage";
import {
  getAllGuildIds,
  getAllWidgetDeployments,
  getGuildConfig,
  setWidgetDeployment,
  CatalogSnapshot,
} from "./kv";
import { normalizeCustomizations } from "./shared/customizations";
import { computeStableHash } from "./shared/presentation";
import { DEFAULT_PUBLIC_ORIGIN } from "./shared/appConfig";

export const STICKY_COOLDOWN_MS = 15 * 60_000;
type AutomationState = {
  eventId?: string;
  eventHash?: string;
  eventEndsAt?: number;
  error?: string;
  checkedAt?: number;
  pendingMoves?: Record<
    string,
    { messageId: string; payload: any; startedAt: number }
  >;
};

async function discord(
  env: any,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<any> {
  const response = await fetchDiscordWithRetry(
    `https://discord.com/api/v10${path}`,
    {
      method,
      headers: {
        Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
  if (response.status === 404) return null;
  if (!response.ok)
    throw new Error(
      response.status === 403
        ? "Bot needs channel access, Pin Messages, or Create/Manage Events permission for the enabled customization."
        : `Discord automation returned HTTP ${response.status}.`,
    );
  return response.status === 204 ? {} : response.json();
}

export async function pinListingMessage(
  env: any,
  channelId: string,
  messageId: string,
): Promise<void> {
  await discord(
    env,
    `/channels/${channelId}/messages/pins/${messageId}`,
    "PUT",
  );
}

// A D1 lease serializes overlapping monitoring requests across Worker isolates.
export async function runServerAutomations(
  env: any,
  snapshot: CatalogSnapshot,
): Promise<void> {
  const db = getD1Database(env);
  if (!db || !env.DISCORD_BOT_TOKEN) return;
  await ensureD1Schema(db);
  const leaseKey = "server-automation:lease";
  const owner = crypto.randomUUID();
  const now = Date.now();
  const lease = await db
    .prepare(
      `INSERT INTO monitor_state (key, updated_at, value_json) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET updated_at = excluded.updated_at, value_json = excluded.value_json
    WHERE monitor_state.updated_at < ?`,
    )
    .bind(leaseKey, now, JSON.stringify(owner), now - 300_000)
    .run();
  if (!lease.meta.changes) return;
  try {
    const guildIds = await getAllGuildIds(env);
    const widgets = await getAllWidgetDeployments(env);
    const active = snapshot.records
      .filter((record) => record.isAvailable)
      .sort((a, b) => a.id.localeCompare(b.id));
    let preview: Promise<string | undefined> | undefined;
    for (const guildId of guildIds) {
      const renewed = await db
        .prepare(
          "UPDATE monitor_state SET updated_at = ? WHERE key = ? AND value_json = ?",
        )
        .bind(Date.now(), leaseKey, JSON.stringify(owner))
        .run();
      if (!renewed.meta.changes) return;
      const cfg = await getGuildConfig(env, guildId);
      const options = normalizeCustomizations(cfg?.customizations);
      if (!Object.values(options).some(Boolean) || !cfg?.customizations)
        continue;
      const key = `server-automation:${guildId}`;
      const state =
        (await getMonitorStateValue<AutomationState>(db, key)) || {};
      const before = JSON.stringify(state);
      const errors: string[] = [];
      try {
        if (
          options.autoCreateEvent ||
          (state.eventId && options.autoEndEvent)
        ) {
          const base = `/guilds/${guildId}/scheduled-events`;
          let event = state.eventId
            ? await discord(env, `${base}/${state.eventId}`)
            : null;
          if (event && (event.status === 3 || event.status === 4)) event = null;
          if (!event && state.eventId) {
            delete state.eventId;
            delete state.eventHash;
          }
          if (!active.length && event && options.autoEndEvent) {
            await discord(env, `${base}/${event.id}`, "PATCH", {
              status: event.status === 1 ? 4 : 3,
            });
            delete state.eventId;
            delete state.eventHash;
            delete state.eventEndsAt;
          } else if (active.length && options.autoCreateEvent) {
            const hash = computeStableHash(
              active.map((record) => ({
                id: record.id,
                name: record.payload?.name,
                images: record.payload?.images,
              })),
            );
            const refreshEnd =
              !state.eventEndsAt || state.eventEndsAt - now < 12 * 3600_000;
            if (!event || state.eventHash !== hash || refreshEnd) {
              const endsAt = now + 7 * 86400_000;
              const description =
                active
                  .map(
                    (record) =>
                      `${record.payload?.name || record.id}: ${record.payload?.url || DEFAULT_PUBLIC_ORIGIN}`,
                  )
                  .join("\n")
                  .slice(0, 900) + "\nManaged by Everfall Limited Watcher.";
              const payload: Record<string, unknown> = {
                name: "Everfall Limited Watcher — Active Listings",
                description,
                scheduled_end_time: new Date(endsAt).toISOString(),
              };
              if (!event || state.eventHash !== hash) {
                preview ||= generateEventPreview(
                  env,
                  active
                    .slice(0, 3)
                    .map((record) => ({
                      id: record.id,
                      images: record.payload?.images || [],
                    })),
                );
                const image = await preview;
                if (image) payload.image = image;
              }
              if (!event) {
                // Recover an event after a lost create response before issuing another POST.
                const existing = await discord(env, base);
                event = existing?.find(
                  (candidate: any) =>
                    candidate.name === payload.name &&
                    candidate.description?.endsWith(
                      "Managed by Everfall Limited Watcher.",
                    ) &&
                    candidate.creator_id ===
                      (env.DISCORD_APPLICATION_ID || env.DISCORD_CLIENT_ID) &&
                    [1, 2].includes(candidate.status),
                );
                if (!event)
                  event = await discord(env, base, "POST", {
                    ...payload,
                    privacy_level: 2,
                    entity_type: 3,
                    channel_id: null,
                    entity_metadata: {
                      location:
                        "https://store.everfallcommunity.com/category/limited-cars",
                    },
                    scheduled_start_time: new Date(now + 60_000).toISOString(),
                  });
                if (!event?.id)
                  throw new Error("Discord did not return an event ID.");
                state.eventId = event.id;
                // Persist the ID before starting/updating it so retries reuse the event.
                await setMonitorStateValue(db, key, state);
              }
              await discord(env, `${base}/${event.id}`, "PATCH", {
                ...payload,
                ...(event.status === 1 ? { status: 2 } : {}),
              });
              state.eventHash = hash;
              state.eventEndsAt = endsAt;
            } else if (event.status === 1)
              await discord(env, `${base}/${event.id}`, "PATCH", { status: 2 });
          }
        }
      } catch (error) {
        errors.push(
          error instanceof Error
            ? error.message
            : "Event synchronization failed.",
        );
      }
      try {
        for (const widget of widgets.filter(
          (item) => item.guildId === guildId,
        )) {
          const pending = state.pendingMoves?.[widget.id];
          if (options.pinWidget && !widget.automationPinned && !pending) {
            await pinListingMessage(env, widget.channelId, widget.messageId);
            widget.automationPinned = true;
            await setWidgetDeployment(env, widget);
          } else if (
            !options.pinWidget &&
            widget.automationPinned &&
            !pending
          ) {
            await discord(
              env,
              `/channels/${widget.channelId}/messages/pins/${widget.messageId}`,
              "DELETE",
            );
            widget.automationPinned = false;
            await setWidgetDeployment(env, widget);
          }
          if (
            !pending &&
            (!options.stickyWidget ||
              now - (widget.lastStickyAt || widget.deployedAt) <
                STICKY_COOLDOWN_MS)
          )
            continue;
          const recent = await discord(
            env,
            `/channels/${widget.channelId}/messages?limit=5`,
          );
          if (!Array.isArray(recent)) continue;
          // Pin-system messages do not cause sticky loops. Another tracked widget
          // in this channel is also ignored.
          const tracked = new Set(
            widgets
              .filter((item) => item.channelId === widget.channelId)
              .map((item) => item.messageId),
          );
          const newer = recent.some(
            (message) =>
              message.type !== 6 &&
              !tracked.has(message.id) &&
              BigInt(message.id) > BigInt(widget.messageId),
          );
          if (!newer && !pending) continue;
          const message =
            pending?.payload ||
            (await discord(
              env,
              `/channels/${widget.channelId}/messages/${widget.messageId}`,
            ));
          if (!message)
            throw new Error(
              "Sticky widget was deleted. Redeploy it from Widgets.",
            );
          const oldId = pending?.messageId || widget.messageId;
          if (!pending) {
            state.pendingMoves ||= {};
            state.pendingMoves[widget.id] = {
              messageId: oldId,
              startedAt: now,
              payload: {
                content: message.content || "",
                embeds: message.embeds,
                components: message.components,
                flags: message.flags & 32768,
              },
            };
            await setMonitorStateValue(db, key, state);
          }
          // Delete first: a failed deletion must never cause duplicate widgets.
          await discord(
            env,
            `/channels/${widget.channelId}/messages/${oldId}`,
            "DELETE",
          );
          const recovered = recent.find(
            (item) =>
              String(item.nonce) === oldId &&
              item.author?.id ===
                (env.DISCORD_APPLICATION_ID || env.DISCORD_CLIENT_ID),
          );
          const replacement =
            recovered ||
            (await discord(
              env,
              `/channels/${widget.channelId}/messages`,
              "POST",
              {
                content: message.content || "",
                embeds: message.embeds,
                components: message.components,
                flags: message.flags & 32768,
                allowed_mentions: { parse: [] },
                nonce: oldId,
                enforce_nonce: true,
              },
            ));
          if (!replacement?.id)
            throw new Error("Discord did not return a replacement widget ID.");
          await setWidgetDeployment(env, {
            ...widget,
            messageId: replacement.id,
            automationPinned: false,
            lastStickyAt: now,
          });
          delete state.pendingMoves![widget.id];
          if (!Object.keys(state.pendingMoves!).length)
            delete state.pendingMoves;
          await setMonitorStateValue(db, key, state);
          if (options.pinWidget) {
            await pinListingMessage(env, widget.channelId, replacement.id);
            await setWidgetDeployment(env, {
              ...widget,
              messageId: replacement.id,
              automationPinned: true,
              lastStickyAt: now,
            });
          }
        }
      } catch (error) {
        errors.push(
          error instanceof Error
            ? error.message
            : "Widget customization failed.",
        );
      }
      if (errors.length) {
        state.error = errors.join(" ");
        state.checkedAt = now;
      } else if (state.error) delete state.error;
      if (JSON.stringify(state) !== before)
        await setMonitorStateValue(db, key, state);
    }
  } finally {
    await db
      .prepare("DELETE FROM monitor_state WHERE key = ? AND value_json = ?")
      .bind(leaseKey, JSON.stringify(owner))
      .run();
  }
}
