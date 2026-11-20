import {
  CHECK_INTERVAL_LABEL,
  STORE_CATEGORY_URL,
  STORE_HOME_URL,
} from "./appConfig";

export type TemplateVariableScope = "in_stock" | "sold_out" | "widget";

export type TemplateVariableCategory =
  | "vehicle"
  | "availability"
  | "store"
  | "monitoring"
  | "widget";

export interface TemplateVariableDef {
  key: string;
  token: string;
  aliases?: string[];
  category: TemplateVariableCategory;
  label: string;
  description: string;
  supportedScopes: TemplateVariableScope[];
  example: string;
}

export const TEMPLATE_VARIABLES: TemplateVariableDef[] = [
  // Vehicle
  {
    key: "vehicle_name",
    token: "{vehicle_name}",
    aliases: ["{name}"],
    category: "vehicle",
    label: "Vehicle Name",
    description: "Effective vehicle display name (including admin metadata overrides).",
    supportedScopes: ["in_stock", "sold_out", "widget"],
    example: "Seraph GTS",
  },
  {
    key: "vehicle_id",
    token: "{vehicle_id}",
    category: "vehicle",
    label: "Vehicle ID",
    description: "Numeric Tebex package ID for the listing.",
    supportedScopes: ["in_stock", "sold_out", "widget"],
    example: "7815819",
  },
  {
    key: "description",
    token: "{description}",
    aliases: ["{full_description}"],
    category: "vehicle",
    label: "Full Description",
    description: "Effective full store description or admin override.",
    supportedScopes: ["in_stock", "sold_out", "widget"],
    example: "This vehicle is quantity-limited and comes with custom sound.",
  },
  {
    key: "short_description",
    token: "{short_description}",
    category: "vehicle",
    label: "Short Description",
    description: "Concise extracted summary of key attributes.",
    supportedScopes: ["in_stock", "sold_out", "widget"],
    example: "Over 17 cosmetic customization options, a custom sound profile, and limited availability.",
  },
  {
    key: "features",
    token: "{features}",
    category: "vehicle",
    label: "Feature Badges",
    description: "Formatted list of visible extracted or admin-edited vehicle features.",
    supportedScopes: ["in_stock", "sold_out", "widget"],
    example: "Quantity Limited • Custom Sound • 17+ Custom Options",
  },
  {
    key: "custom_options",
    token: "{custom_options}",
    category: "vehicle",
    label: "Customization Options",
    description: "Extracted customization count badge (if present on the vehicle).",
    supportedScopes: ["in_stock", "sold_out", "widget"],
    example: "17+ Custom Options",
  },
  {
    key: "custom_sound",
    token: "{custom_sound}",
    category: "vehicle",
    label: "Custom Sound",
    description: "Indicates when the vehicle includes a custom engine/sound profile.",
    supportedScopes: ["in_stock", "sold_out", "widget"],
    example: "Custom Sound",
  },
  {
    key: "trading",
    token: "{trading}",
    category: "vehicle",
    label: "Trading Rule",
    description: "Verified trading restriction extracted from the store listing (if any).",
    supportedScopes: ["in_stock", "sold_out", "widget"],
    example: "Limited-only trading",
  },
  {
    key: "delivery",
    token: "{delivery}",
    category: "vehicle",
    label: "Delivery Info",
    description: "Verified garage delivery instruction extracted from the listing (if any).",
    supportedScopes: ["in_stock", "sold_out", "widget"],
    example: "Automatically delivered to your garage.",
  },

  // Availability
  {
    key: "status",
    token: "{status}",
    category: "availability",
    label: "Stock Status Label",
    description: "Configured availability label (e.g. In Stock or Sold Out).",
    supportedScopes: ["in_stock", "sold_out", "widget"],
    example: "In Stock",
  },
  {
    key: "status_emoji",
    token: "{status_emoji}",
    category: "availability",
    label: "Status Emoji",
    description: "Configured status emoji for the template state.",
    supportedScopes: ["in_stock", "sold_out", "widget"],
    example: "🟢",
  },
  {
    key: "first_detected",
    token: "{first_detected}",
    category: "availability",
    label: "First Detected",
    description: "Discord dynamic timestamp of when the listing was first discovered.",
    supportedScopes: ["in_stock", "sold_out", "widget"],
    example: "<t:1763333160:f> (<t:1763333160:R>)",
  },
  {
    key: "last_verified",
    token: "{last_verified}",
    category: "availability",
    label: "Last Verified",
    description: "Discord timestamp of the latest authoritative verification for this listing.",
    supportedScopes: ["in_stock", "sold_out", "widget"],
    example: "<t:1763336760:f>",
  },
  {
    key: "sold_out_at",
    token: "{sold_out_at}",
    category: "availability",
    label: "Sold Out Time",
    description: "Discord timestamp when a vehicle was confirmed sold out (empty while in stock).",
    supportedScopes: ["in_stock", "sold_out", "widget"],
    example: "<t:1763340000:f> (<t:1763340000:R>)",
  },

  // Store
  {
    key: "store_url",
    token: "{store_url}",
    category: "store",
    label: "Store Category URL",
    description: "Direct link to the Everfall Limited Cars storefront category.",
    supportedScopes: ["in_stock", "sold_out", "widget"],
    example: STORE_CATEGORY_URL,
  },
  {
    key: "listing_url",
    token: "{listing_url}",
    category: "store",
    label: "Listing URL",
    description: "Direct link to the specific vehicle package page on Everfall Store.",
    supportedScopes: ["in_stock", "sold_out", "widget"],
    example: `${STORE_HOME_URL}package/7815819`,
  },
  {
    key: "website_url",
    token: "{website_url}",
    category: "store",
    label: "Archive Portal URL",
    description: "Public URL of your Everfall Limited Watcher web portal.",
    supportedScopes: ["in_stock", "sold_out", "widget"],
    example: "https://everfall-limited-watcher.itschase.workers.dev",
  },

  // Monitoring
  {
    key: "check_interval",
    token: "{check_interval}",
    category: "monitoring",
    label: "Scheduled Check Frequency",
    description: "Configured automated store check schedule.",
    supportedScopes: ["in_stock", "sold_out", "widget"],
    example: CHECK_INTERVAL_LABEL,
  },
  {
    key: "last_store_check",
    token: "{last_store_check}",
    category: "monitoring",
    label: "Last Store Check",
    description: "Discord timestamp of the latest store check run.",
    supportedScopes: ["widget", "in_stock", "sold_out"],
    example: "<t:1763340000:R>",
  },
  {
    key: "last_successful_check",
    token: "{last_successful_check}",
    category: "monitoring",
    label: "Last Verified Stock",
    description: "Discord timestamp of the most recent authoritative store verification.",
    supportedScopes: ["widget", "in_stock", "sold_out"],
    example: "<t:1763340000:R>",
  },
  {
    key: "monitor_state",
    token: "{monitor_state}",
    category: "monitoring",
    label: "Monitor State",
    description: "Current verification state (Verified, Blocked, or Pending).",
    supportedScopes: ["widget", "in_stock", "sold_out"],
    example: "Verified (Scrapling)",
  },

  // Widgets
  {
    key: "recent_releases",
    token: "{recent_releases}",
    category: "widget",
    label: "Recent Releases Summary",
    description: "Compact bullet list of the most recent tracked limited vehicles and statuses.",
    supportedScopes: ["widget"],
    example: "• **Seraph GTS** — In Stock\n• **73C** — Sold Out",
  },
  {
    key: "active_count",
    token: "{active_count}",
    category: "widget",
    label: "Active In-Stock Count",
    description: "Number of limited vehicles currently confirmed In Stock.",
    supportedScopes: ["widget", "in_stock", "sold_out"],
    example: "1",
  },
  {
    key: "last_widget_update",
    token: "{last_widget_update}",
    category: "widget",
    label: "Widget Last Updated",
    description: "Discord timestamp when this widget message was actually updated on Discord.",
    supportedScopes: ["widget"],
    example: "<t:1763340000:R>",
  },
];

export interface TemplateVariableValues {
  vehicle_name?: string;
  vehicle_id?: string;
  description?: string;
  short_description?: string;
  features?: string;
  custom_options?: string;
  custom_sound?: string;
  trading?: string;
  delivery?: string;
  status?: string;
  status_emoji?: string;
  first_detected?: string;
  last_verified?: string;
  sold_out_at?: string;
  store_url?: string;
  listing_url?: string;
  website_url?: string;
  check_interval?: string;
  last_store_check?: string;
  last_successful_check?: string;
  monitor_state?: string;
  recent_releases?: string;
  active_count?: string;
  last_widget_update?: string;
}

const KEY_BY_TOKEN_NAME: Record<string, keyof TemplateVariableValues> = {
  vehicle_name: "vehicle_name",
  name: "vehicle_name",
  vehicle_id: "vehicle_id",
  description: "description",
  full_description: "description",
  short_description: "short_description",
  features: "features",
  custom_options: "custom_options",
  custom_sound: "custom_sound",
  trading: "trading",
  delivery: "delivery",
  status: "status",
  status_emoji: "status_emoji",
  first_detected: "first_detected",
  last_verified: "last_verified",
  sold_out_at: "sold_out_at",
  store_url: "store_url",
  listing_url: "listing_url",
  website_url: "website_url",
  check_interval: "check_interval",
  last_store_check: "last_store_check",
  last_successful_check: "last_successful_check",
  monitor_state: "monitor_state",
  recent_releases: "recent_releases",
  active_count: "active_count",
  last_widget_update: "last_widget_update",
};

const SCOPE_KEY_SETS: Record<TemplateVariableScope, Set<string>> = {
  in_stock: new Set(
    TEMPLATE_VARIABLES.filter((v) => v.supportedScopes.includes("in_stock")).map((v) => v.key)
  ),
  sold_out: new Set(
    TEMPLATE_VARIABLES.filter((v) => v.supportedScopes.includes("sold_out")).map((v) => v.key)
  ),
  widget: new Set(
    TEMPLATE_VARIABLES.filter((v) => v.supportedScopes.includes("widget")).map((v) => v.key)
  ),
};

export function neutralizeDiscordMentions(text: string): string {
  return String(text || "")
    .replace(/@everyone/gi, "@\u200beveryone")
    .replace(/@here/gi, "@\u200bhere")
    .replace(/<@([!&]?\d+)>/g, "@\u200b$1");
}

export function extractTemplateTokens(text: string): string[] {
  const matches = String(text || "").match(/\{[a-zA-Z0-9_]+\}/g);
  return matches ? [...new Set(matches)] : [];
}

export function findUnsupportedVariables(
  text: string,
  scope: TemplateVariableScope
): { unknownTokens: string[]; unsupportedForScope: string[] } {
  const tokens = extractTemplateTokens(text);
  const unknownTokens: string[] = [];
  const unsupportedForScope: string[] = [];
  const allowed = SCOPE_KEY_SETS[scope];

  for (const raw of tokens) {
    const cleanKey = raw.slice(1, -1).toLowerCase();
    const mapped = KEY_BY_TOKEN_NAME[cleanKey];
    if (!mapped) {
      unknownTokens.push(raw);
    } else if (!allowed.has(mapped)) {
      unsupportedForScope.push(raw);
    }
  }

  return { unknownTokens, unsupportedForScope };
}

export function resolveTemplateVariables(
  templateText: string,
  values: TemplateVariableValues,
  options?: {
    escapeMentions?: boolean;
    stripUnknownTokens?: boolean;
    collapseEmptyTokenLines?: boolean;
  }
): string {
  const raw = String(templateText || "");
  if (!raw) return "";

  const escapeMentions = options?.escapeMentions !== false;
  const stripUnknown = options?.stripUnknownTokens !== false;
  const collapseLines = options?.collapseEmptyTokenLines !== false;

  const lines = raw.split(/\r?\n/);
  const processedLines: string[] = [];

  for (const line of lines) {
    let sawKnownToken = false;
    let nonEmptyTokenCount = 0;

    const replaced = line.replace(/\{([a-zA-Z0-9_]+)\}/g, (full, rawKey: string) => {
      const normalized = rawKey.toLowerCase();
      const targetKey = KEY_BY_TOKEN_NAME[normalized];
      if (!targetKey) {
        return stripUnknown ? "" : full;
      }
      sawKnownToken = true;
      const val = String(values[targetKey] ?? "").trim();
      if (val) {
        nonEmptyTokenCount++;
        return escapeMentions ? neutralizeDiscordMentions(val) : val;
      }
      return "";
    });

    const cleaned = escapeMentions ? neutralizeDiscordMentions(replaced) : replaced;
    const trimmed = cleaned.replace(/[ \t]{2,}/g, " ").trimEnd();

    // If a line contained a recognized variable that was empty and only punctuation/prefix remains,
    // gracefully omit the orphan line instead of rendering "Sold Out:" or blank markdown clutter.
    if (collapseLines && sawKnownToken && nonEmptyTokenCount === 0) {
      const strippedPrefix = trimmed.replace(/^[*_~`>\-•:\s]+|[*_~`:\s]+$/g, "");
      if (!trimmed || /^[A-Za-z0-9 &/()-]{1,40}:$/.test(trimmed.replace(/[*_`~]/g, "")) || !strippedPrefix) {
        continue;
      }
    }

    processedLines.push(trimmed);
  }

  return processedLines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
