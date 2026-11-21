import { neutralizeDiscordMentions } from "./variables";

export type RichPresenceActivityType =
  | "playing"
  | "streaming"
  | "listening"
  | "watching"
  | "competing"
  | "custom";

export type RichPresenceStatus = "online" | "idle" | "dnd" | "invisible";
export type RichPresenceTimestampMode = "none" | "last-check" | "next-check";

export interface RichPresenceConfig {
  enabled: boolean;
  status: RichPresenceStatus;
  activityType: RichPresenceActivityType;
  activityName: string;
  activityState: string;
  streamUrl: string;
  webhookCardEnabled: boolean;
  webhookTitle: string;
  webhookDescription: string;
  webhookTimestampMode: RichPresenceTimestampMode;
  webhookButtonLabel: string;
  webhookButtonUrl: string;
}

export interface RichPresenceSnapshot {
  now?: number;
  lastCheckedAt?: number | null;
  lastSuccessAt?: number | null;
  scheduledIntervalMs?: number | null;
  totalCount?: number;
  availableCount?: number;
  soldOutCount?: number;
  monitorStatus?: string | null;
  latestListing?: {
    id?: string;
    name?: string;
    isAvailable?: boolean;
    detectedAt?: number | null;
  } | null;
  siteUrl?: string;
}

export interface RichPresenceActivity {
  name: string;
  type: RichPresenceActivityType;
  state?: string;
  url?: string;
}

export const DEFAULT_RICH_PRESENCE_CONFIG: RichPresenceConfig = {
  enabled: false,
  status: "online",
  activityType: "watching",
  activityName: "Everfall Limited Watcher",
  activityState: "Monitoring {available_count} in-stock listings",
  streamUrl: "",
  webhookCardEnabled: false,
  webhookTitle: "Everfall Limited Watcher",
  webhookDescription: "Latest listing: {latest_listing} ({latest_listing_status})",
  webhookTimestampMode: "last-check",
  webhookButtonLabel: "Visit Everfall Limited Watcher",
  webhookButtonUrl: "https://everfall-limited-watcher.itschase.workers.dev/",
};

export const RICH_PRESENCE_VARIABLES = [
  { token: "{latest_listing}", description: "Name of the newest listing." },
  { token: "{latest_listing_id}", description: "ID of the newest listing." },
  { token: "{latest_listing_status}", description: "In Stock or Sold Out for the newest listing." },
  { token: "{last_checked_at}", description: "UTC time of the latest store check." },
  { token: "{last_checked_relative}", description: "Discord relative timestamp for the latest check." },
  { token: "{time_since_check}", description: "Elapsed time since the latest store check." },
  { token: "{next_check_in}", description: "Time until the next expected store check." },
  { token: "{last_success_at}", description: "UTC time of the latest successful store check." },
  { token: "{available_count}", description: "Current in-stock listing count." },
  { token: "{sold_out_count}", description: "Current sold-out listing count." },
  { token: "{total_count}", description: "Total listing count." },
  { token: "{monitor_status}", description: "Current monitor health." },
  { token: "{activity_name}", description: "The rendered activity name." },
  { token: "{activity_state}", description: "The rendered activity state." },
  { token: "{site_url}", description: "The public site URL." },
] as const;

const VALID_ACTIVITY_TYPES = new Set<RichPresenceActivityType>([
  "playing",
  "streaming",
  "listening",
  "watching",
  "competing",
  "custom",
]);
const VALID_STATUSES = new Set<RichPresenceStatus>(["online", "idle", "dnd", "invisible"]);
const VALID_TIMESTAMP_MODES = new Set<RichPresenceTimestampMode>([
  "none",
  "last-check",
  "next-check",
]);
const KNOWN_TOKENS = new Set(
  RICH_PRESENCE_VARIABLES.map(({ token }) => token.slice(1, -1))
);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeText(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : fallback;
}

function getHttpsUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function isSupportedStreamUrl(value: string): boolean {
  if (!value) return false;
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    return (
      host === "twitch.tv" ||
      host.endsWith(".twitch.tv") ||
      host === "youtube.com" ||
      host.endsWith(".youtube.com") ||
      host === "youtu.be"
    );
  } catch {
    return false;
  }
}

export function normalizeRichPresenceConfig(value: unknown): RichPresenceConfig {
  const raw = asRecord(value);
  const activityType = raw.activityType as RichPresenceActivityType;
  const status = raw.status as RichPresenceStatus;
  const timestampMode = raw.webhookTimestampMode as RichPresenceTimestampMode;

  return {
    enabled: raw.enabled === true,
    status: VALID_STATUSES.has(status) ? status : DEFAULT_RICH_PRESENCE_CONFIG.status,
    activityType: VALID_ACTIVITY_TYPES.has(activityType)
      ? activityType
      : DEFAULT_RICH_PRESENCE_CONFIG.activityType,
    activityName: normalizeText(
      raw.activityName,
      DEFAULT_RICH_PRESENCE_CONFIG.activityName,
      128
    ),
    activityState: normalizeText(raw.activityState, DEFAULT_RICH_PRESENCE_CONFIG.activityState, 128),
    streamUrl: getHttpsUrl(raw.streamUrl),
    webhookCardEnabled: raw.webhookCardEnabled === true,
    webhookTitle: normalizeText(raw.webhookTitle, DEFAULT_RICH_PRESENCE_CONFIG.webhookTitle, 256),
    webhookDescription: normalizeText(
      raw.webhookDescription,
      DEFAULT_RICH_PRESENCE_CONFIG.webhookDescription,
      4096
    ),
    webhookTimestampMode: VALID_TIMESTAMP_MODES.has(timestampMode)
      ? timestampMode
      : DEFAULT_RICH_PRESENCE_CONFIG.webhookTimestampMode,
    webhookButtonLabel: normalizeText(
      raw.webhookButtonLabel,
      DEFAULT_RICH_PRESENCE_CONFIG.webhookButtonLabel,
      80
    ),
    webhookButtonUrl: getHttpsUrl(raw.webhookButtonUrl),
  };
}

export function validateRichPresenceConfig(value: unknown): string[] {
  const raw = asRecord(value);
  const config = normalizeRichPresenceConfig(raw);
  const errors: string[] = [];

  if (typeof raw.enabled !== "boolean") errors.push("Enabled must be a boolean.");
  if (!VALID_STATUSES.has(raw.status as RichPresenceStatus)) errors.push("Choose a valid bot status.");
  if (!VALID_ACTIVITY_TYPES.has(raw.activityType as RichPresenceActivityType)) {
    errors.push("Choose a valid activity type.");
  }
  if (typeof raw.activityName !== "string" || !raw.activityName.trim()) {
    errors.push("Activity name is required.");
  } else if (raw.activityName.trim().length > 128) {
    errors.push("Activity name must be 128 characters or fewer.");
  }
  if (typeof raw.activityState !== "string" || raw.activityState.length > 128) {
    errors.push("Activity state must be 128 characters or fewer.");
  }
  if (config.activityType === "streaming" && !isSupportedStreamUrl(config.streamUrl)) {
    errors.push("Streaming requires a valid Twitch or YouTube HTTPS URL.");
  } else if (raw.streamUrl && !config.streamUrl) {
    errors.push("Stream URL must be a valid HTTPS URL.");
  }
  if (typeof raw.webhookCardEnabled !== "boolean") {
    errors.push("Webhook card enabled must be a boolean.");
  }
  if (typeof raw.webhookTitle !== "string" || raw.webhookTitle.length > 256) {
    errors.push("Webhook title must be 256 characters or fewer.");
  }
  if (typeof raw.webhookDescription !== "string" || raw.webhookDescription.length > 4096) {
    errors.push("Webhook description must be 4,096 characters or fewer.");
  }
  if (!VALID_TIMESTAMP_MODES.has(raw.webhookTimestampMode as RichPresenceTimestampMode)) {
    errors.push("Choose a valid webhook timestamp mode.");
  }
  if (typeof raw.webhookButtonLabel !== "string" || raw.webhookButtonLabel.length > 80) {
    errors.push("Webhook button label must be 80 characters or fewer.");
  }
  if (raw.webhookButtonUrl && !config.webhookButtonUrl) {
    errors.push("Webhook button URL must be a valid HTTPS URL.");
  }
  const hasButtonLabel =
    typeof raw.webhookButtonLabel === "string" && Boolean(raw.webhookButtonLabel.trim());
  const hasButtonUrl = typeof raw.webhookButtonUrl === "string" && Boolean(raw.webhookButtonUrl.trim());
  if (hasButtonLabel !== hasButtonUrl) {
    errors.push("Set both a webhook button label and HTTPS URL, or clear both.");
  }

  const templates = [
    config.activityName,
    config.activityState,
    config.webhookTitle,
    config.webhookDescription,
  ];
  const unknownTokens = [...new Set(
    templates.flatMap((template) =>
      [...template.matchAll(/\{([a-zA-Z0-9_]+)\}/g)]
        .map((match) => match[1].toLowerCase())
        .filter((token) => !KNOWN_TOKENS.has(token))
    )
  )];
  if (unknownTokens.length) {
    errors.push(`Unknown template variable${unknownTokens.length === 1 ? "" : "s"}: ${unknownTokens.join(", ")}.`);
  }

  return [...new Set(errors)];
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${remainder}s`;
  return `${remainder}s`;
}

function formatUtcTime(timestamp: number | null | undefined): string {
  if (!timestamp || !Number.isFinite(timestamp)) return "Not checked";
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(timestamp));
  return `${time} UTC`;
}

function templateValues(snapshot: RichPresenceSnapshot): Record<string, string> {
  const now = snapshot.now ?? Date.now();
  const checkedAt = snapshot.lastCheckedAt ?? null;
  const nextCheckAt =
    checkedAt && snapshot.scheduledIntervalMs
      ? checkedAt + snapshot.scheduledIntervalMs
      : null;
  const latest = snapshot.latestListing;
  const values: Record<string, string> = {
    latest_listing: latest?.name?.trim() || "No recent listing",
    latest_listing_id: latest?.id || "",
    latest_listing_status: latest
      ? latest.isAvailable
        ? "In Stock"
        : "Sold Out"
      : "Unknown",
    last_checked_at: formatUtcTime(checkedAt),
    last_checked_relative: checkedAt
      ? `<t:${Math.floor(checkedAt / 1000)}:R>`
      : "Not checked",
    time_since_check: checkedAt ? formatDuration(now - checkedAt) : "Not checked",
    next_check_in: nextCheckAt
      ? nextCheckAt > now
        ? formatDuration(nextCheckAt - now)
        : "Due now"
      : "Unknown",
    last_success_at: formatUtcTime(snapshot.lastSuccessAt),
    available_count: String(Math.max(0, snapshot.availableCount ?? 0)),
    sold_out_count: String(Math.max(0, snapshot.soldOutCount ?? 0)),
    total_count: String(Math.max(0, snapshot.totalCount ?? 0)),
    monitor_status: snapshot.monitorStatus?.trim() || "Unknown",
    site_url: snapshot.siteUrl || "",
    activity_name: "",
    activity_state: "",
  };
  return values;
}

export function resolveRichPresenceTemplate(
  template: string,
  values: Record<string, string>
): string {
  const rendered = template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, rawKey: string) => {
    return values[rawKey.toLowerCase()] ?? "";
  });
  return neutralizeDiscordMentions(rendered).replace(/[ \t]{2,}/g, " ").trim();
}

export function buildRichPresenceActivity(
  configValue: unknown,
  snapshot: RichPresenceSnapshot
): RichPresenceActivity | null {
  const config = normalizeRichPresenceConfig(configValue);
  if (!config.enabled) return null;

  const values = templateValues(snapshot);
  const name = resolveRichPresenceTemplate(config.activityName, values).slice(0, 128);
  const state = resolveRichPresenceTemplate(config.activityState, values).slice(0, 128);
  if (!name) return null;

  return {
    name,
    type: config.activityType,
    ...(state ? { state } : {}),
    ...(config.activityType === "streaming" ? { url: config.streamUrl } : {}),
  };
}

export function buildRichPresenceWebhookPayload(
  configValue: unknown,
  snapshot: RichPresenceSnapshot
): Record<string, unknown> | null {
  const config = normalizeRichPresenceConfig(configValue);
  if (!config.webhookCardEnabled) return null;

  const values = templateValues(snapshot);
  const activity = buildRichPresenceActivity({ ...config, enabled: true }, snapshot);
  values.activity_name = activity?.name || config.activityName;
  values.activity_state = activity?.state || config.activityState;

  const description =
    resolveRichPresenceTemplate(config.webhookDescription, values).slice(0, 4096) ||
    "Store monitoring status is available on the website.";
  const fields: Array<{ name: string; value: string; inline: boolean }> = [];
  if (config.webhookTimestampMode === "last-check" && snapshot.lastCheckedAt) {
    fields.push({
      name: "Last store check",
      value: `<t:${Math.floor(snapshot.lastCheckedAt / 1000)}:R>`,
      inline: true,
    });
  } else if (
    config.webhookTimestampMode === "next-check" &&
    snapshot.lastCheckedAt &&
    snapshot.scheduledIntervalMs
  ) {
    fields.push({
      name: "Next expected check",
      value: `<t:${Math.floor((snapshot.lastCheckedAt + snapshot.scheduledIntervalMs) / 1000)}:R>`,
      inline: true,
    });
  }

  const components =
    config.webhookButtonLabel && config.webhookButtonUrl
      ? [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                label: config.webhookButtonLabel,
                url: config.webhookButtonUrl,
              },
            ],
          },
        ]
      : [];

  return {
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: resolveRichPresenceTemplate(config.webhookTitle, values).slice(0, 256),
        description,
        color: 0x27272a,
        fields,
        footer: { text: "Everfall Limited Watcher" },
      },
    ],
    components,
  };
}
