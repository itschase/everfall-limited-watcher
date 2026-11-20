import {
  CHECK_INTERVAL_LABEL,
  STORE_CATEGORY_URL as SHARED_STORE_CATEGORY_URL,
  STORE_HOME_URL as SHARED_STORE_HOME_URL,
} from "./appConfig";
import {
  DEFAULT_FEATURE_ORDER,
  EmojiReference,
  ListingSourceInput,
  resolveListingPresentation,
  sortAndFilterFeatures,
  VehicleFeature,
  VehicleMetadataOverride,
} from "./features";
import {
  neutralizeDiscordMentions,
  resolveTemplateVariables,
  TemplateVariableValues,
} from "./variables";

export type DiscordEmojiRef = EmojiReference;

export type TemplateSectionCondition =
  | "always"
  | "in_stock_only"
  | "sold_out_only"
  | "when_features_present"
  | "when_trading_present"
  | "when_delivery_present"
  | "when_in_stock_any"
  | "when_all_sold_out";

export interface TemplateCustomSection {
  id: string;
  title: string;
  content: string;
  enabled: boolean;
  condition: TemplateSectionCondition;
  inline?: boolean;
}

export type AnnouncementSectionKey =
  | "header"
  | "status"
  | "features"
  | "description"
  | "trading_delivery"
  | "timestamps"
  | "custom_sections";

export const DEFAULT_ANNOUNCEMENT_SECTION_ORDER: AnnouncementSectionKey[] = [
  "header",
  "status",
  "features",
  "description",
  "trading_delivery",
  "timestamps",
  "custom_sections",
];

export type WidgetSectionKey =
  | "subtitle"
  | "intro"
  | "timestamps"
  | "stale_warning"
  | "custom_sections";

export const DEFAULT_WIDGET_SECTION_ORDER: WidgetSectionKey[] = [
  "subtitle",
  "intro",
  "timestamps",
  "stale_warning",
  "custom_sections",
];

export interface AnnouncementTemplate {
  accentColor: string;
  titlePrefix: string;
  titleEmoji?: DiscordEmojiRef | null;
  availabilityHeading: string;
  statusLabel: string;
  statusEmoji?: DiscordEmojiRef | null;
  descriptionMode: "short_summary" | "full_description" | "custom";
  customDescription: string;
  showFeatures: boolean;
  featureOrder: string[];
  featureStyle: "inline_badges" | "bullet_list";
  showTradingInfo: boolean;
  tradingLabel?: string;
  showDeliveryInfo: boolean;
  deliveryLabel?: string;
  showDetectionTime: boolean;
  firstDetectedLabel?: string;
  showLastVerified: boolean;
  lastVerifiedLabel?: string;
  showSoldOutTime: boolean;
  soldOutLabel?: string;
  sectionOrder?: AnnouncementSectionKey[];
  customSections?: TemplateCustomSection[];
  galleryMode: "all_gallery" | "primary_only" | "custom_slot" | "none";
  primaryImageSlot: number;
  footerText: string;
  footerEmoji?: DiscordEmojiRef | null;
  showStoreButton: boolean;
  storeButtonLabel: string;
  storeButtonEmoji?: DiscordEmojiRef | null;
  storeButtonUrlMode: "listing" | "category" | "store_home" | "website" | "custom";
  customButtonUrl?: string;
  showSecondaryButton?: boolean;
  secondaryButtonLabel?: string;
  secondaryButtonUrlMode?: "listing" | "category" | "store_home" | "website" | "custom";
  secondaryCustomButtonUrl?: string;
}

export interface WidgetTemplateConfig {
  id: string;
  name: string;
  title: string;
  titleEmoji?: DiscordEmojiRef | null;
  subtitle: string;
  introMessage: string;
  accentColor: string;
  inStockColor: string;
  soldOutColor: string;
  useDynamicStockColor: boolean;
  inStockLabel: string;
  soldOutLabel: string;
  inStockEmoji?: DiscordEmojiRef | null;
  soldOutEmoji?: DiscordEmojiRef | null;
  featuredImageSlot: number;
  showFeaturedImage: boolean;
  vehicleCount: number;
  vehicleOrdering: "newest_first" | "in_stock_first";
  showActiveSummary: boolean;
  activeSummaryHeading: string;
  showFeatures: boolean;
  featureOrder: string[];
  featureLabelOverrides: Record<string, string>;
  hiddenFeatureKeys: string[];
  // Independent timestamp & monitoring toggles + editable labels
  showLastStoreCheck?: boolean;
  lastStoreCheckLabel?: string;
  showLastVerifiedStock?: boolean;
  lastVerifiedStockLabel?: string;
  showMonitorState?: boolean;
  monitorStateLabel?: string;
  showLastUpdated?: boolean;
  lastUpdatedLabel?: string;
  showEmbedTimestamp?: boolean;
  // Backward-compatible summary flag (derived automatically when independent toggles are present)
  showTimestamps: boolean;
  showStaleWarning: boolean;
  staleWarningText: string;
  sectionOrder?: WidgetSectionKey[];
  customSections?: TemplateCustomSection[];
  emptyStateMessage: string;
  footerText: string;
  footerEmoji?: DiscordEmojiRef | null;
  viewButtonLabel: string;
  showButtonsRow: boolean;
  websiteButtonLabel: string;
  websiteButtonEmoji?: DiscordEmojiRef | null;
  storeButtonLabel: string;
  storeButtonEmoji?: DiscordEmojiRef | null;
  customStoreButtonUrl?: string;
}

export type HeroAnimationStyle =
  | "soft_reveal"
  | "float_down"
  | "fade_slide"
  | "character_reveal"
  | "word_stagger"
  | "decrypting_text";

export interface HeroMessageItem {
  id: string;
  text: string;
  highlightText?: string;
  subtext?: string;
  enabled: boolean;
  isDefault?: boolean;
}

export interface HeroConfig {
  version: number;
  autoRotate: boolean;
  intervalMs: number;
  animationStyle: HeroAnimationStyle;
  durationMs: number;
  delayMs: number;
  fontSizePreset: "compact" | "standard" | "display";
  secondaryDescription: string;
  messages: HeroMessageItem[];
}

export interface PresentationConfigBundle {
  version: number;
  updatedAt: number;
  updatedBy?: string;
  announcements: {
    inStock: AnnouncementTemplate;
    soldOut: AnnouncementTemplate;
  };
  widgetDefault: WidgetTemplateConfig;
  widgetTemplates: WidgetTemplateConfig[];
  hero: HeroConfig;
  recentEmojis: DiscordEmojiRef[];
}

export const STORE_CATEGORY_URL = SHARED_STORE_CATEGORY_URL;
export const STORE_HOME_URL = SHARED_STORE_HOME_URL;

export const DEFAULT_IN_STOCK_TEMPLATE: AnnouncementTemplate = {
  accentColor: "#F59E0B",
  titlePrefix: "Limited Edition Drop:",
  titleEmoji: {
    kind: "custom",
    id: "1571981507973746868",
    name: "everfall",
    source: "application",
  },
  availabilityHeading: "Availability",
  statusLabel: "In Stock",
  statusEmoji: { kind: "unicode", name: "🟢", source: "unicode" },
  descriptionMode: "full_description",
  customDescription: "{short_description}\n\n{features}",
  showFeatures: true,
  featureOrder: [...DEFAULT_FEATURE_ORDER],
  featureStyle: "inline_badges",
  showTradingInfo: true,
  tradingLabel: "Trading",
  showDeliveryInfo: true,
  deliveryLabel: "Delivery",
  showDetectionTime: true,
  firstDetectedLabel: "First Detected",
  showLastVerified: true,
  lastVerifiedLabel: "Last Verified",
  showSoldOutTime: false,
  soldOutLabel: "Confirmed Sold Out",
  sectionOrder: [...DEFAULT_ANNOUNCEMENT_SECTION_ORDER],
  customSections: [],
  galleryMode: "all_gallery",
  primaryImageSlot: 0,
  footerText: "Everfall Limited Watcher • Verified Drop Alert",
  footerEmoji: null,
  showStoreButton: true,
  storeButtonLabel: "View Package on Everfall",
  storeButtonEmoji: {
    kind: "custom",
    id: "1571981507973746868",
    name: "everfall",
    source: "application",
  },
  storeButtonUrlMode: "listing",
  customButtonUrl: "",
  showSecondaryButton: false,
  secondaryButtonLabel: "View Archive Portal",
  secondaryButtonUrlMode: "website",
  secondaryCustomButtonUrl: "",
};

export const DEFAULT_SOLD_OUT_TEMPLATE: AnnouncementTemplate = {
  accentColor: "#DC2626",
  titlePrefix: "Sold Out:",
  titleEmoji: { kind: "unicode", name: "🔴", source: "unicode" },
  availabilityHeading: "Status",
  statusLabel: "Sold Out",
  statusEmoji: { kind: "unicode", name: "⛔", source: "unicode" },
  descriptionMode: "short_summary",
  customDescription: "{short_description}",
  showFeatures: true,
  featureOrder: [...DEFAULT_FEATURE_ORDER],
  featureStyle: "inline_badges",
  showTradingInfo: true,
  tradingLabel: "Trading",
  showDeliveryInfo: false,
  deliveryLabel: "Delivery",
  showDetectionTime: true,
  firstDetectedLabel: "First Detected",
  showLastVerified: true,
  lastVerifiedLabel: "Last Verified",
  showSoldOutTime: true,
  soldOutLabel: "Confirmed Sold Out",
  sectionOrder: [...DEFAULT_ANNOUNCEMENT_SECTION_ORDER],
  customSections: [],
  galleryMode: "all_gallery",
  primaryImageSlot: 0,
  footerText: "Everfall Limited Watcher • Archived Sold Out Listing",
  footerEmoji: null,
  showStoreButton: true,
  storeButtonLabel: "Open Everfall Store",
  storeButtonEmoji: null,
  storeButtonUrlMode: "store_home",
  customButtonUrl: "",
  showSecondaryButton: false,
  secondaryButtonLabel: "View Archive Portal",
  secondaryButtonUrlMode: "website",
  secondaryCustomButtonUrl: "",
};

export const DEFAULT_WIDGET_TEMPLATE: WidgetTemplateConfig = {
  id: "default",
  name: "Default Store Status Widget",
  title: "Everfall Limited Watcher — Live Store Status",
  titleEmoji: {
    kind: "custom",
    id: "1571981507973746868",
    name: "everfall",
    source: "application",
  },
  subtitle: "Automated storefront availability & recent limited drops",
  introMessage: "",
  accentColor: "#10B981",
  inStockColor: "#10B981",
  soldOutColor: "#52525B",
  useDynamicStockColor: true,
  inStockLabel: "In Stock",
  soldOutLabel: "Sold Out",
  inStockEmoji: { kind: "unicode", name: "🟢", source: "unicode" },
  soldOutEmoji: { kind: "unicode", name: "🔴", source: "unicode" },
  featuredImageSlot: 3,
  showFeaturedImage: true,
  vehicleCount: 3,
  vehicleOrdering: "newest_first",
  showActiveSummary: true,
  activeSummaryHeading: "Active Listings",
  showFeatures: true,
  featureOrder: [...DEFAULT_FEATURE_ORDER],
  featureLabelOverrides: {},
  hiddenFeatureKeys: [],
  showLastStoreCheck: true,
  lastStoreCheckLabel: "Last Store Check",
  showLastVerifiedStock: true,
  lastVerifiedStockLabel: "Last Verified Stock",
  showMonitorState: true,
  monitorStateLabel: "Monitor State",
  showLastUpdated: true,
  lastUpdatedLabel: "Widget Last Updated",
  showEmbedTimestamp: true,
  showTimestamps: true,
  showStaleWarning: true,
  staleWarningText: "Latest store check could not verify live stock; showing last verified history.",
  sectionOrder: [...DEFAULT_WIDGET_SECTION_ORDER],
  customSections: [],
  emptyStateMessage: "No limited vehicles have been recorded in the store catalog yet.",
  footerText: "Everfall Limited Watcher • Live Status Widget",
  footerEmoji: null,
  viewButtonLabel: "View",
  showButtonsRow: true,
  websiteButtonLabel: "Live Archive",
  websiteButtonEmoji: null,
  storeButtonLabel: "Everfall Store",
  storeButtonEmoji: null,
  customStoreButtonUrl: "",
};

export const DEFAULT_HERO_CONFIG: HeroConfig = {
  version: 1,
  autoRotate: true,
  intervalMs: 5500,
  animationStyle: "soft_reveal",
  durationMs: 650,
  delayMs: 60,
  fontSizePreset: "standard",
  secondaryDescription:
    "Track Everfall's limited vehicle releases, inspect verified stock availability, and receive structured Discord alerts with archived multi-image galleries.",
  messages: [
    {
      id: "hero-default",
      text: "Never Miss an Everfall",
      highlightText: "Limited Drop",
      subtext:
        "Track Everfall's limited vehicle releases, inspect verified stock availability, and receive structured Discord alerts with archived multi-image galleries.",
      enabled: true,
      isDefault: true,
    },
    {
      id: "hero-verified",
      text: "Verified Stock Tracking &",
      highlightText: "Instant Discord Updates",
      subtext:
        "Monitor authoritative availability changes, archived high-res vehicle angles, and automatic Sold Out embed synchronization.",
      enabled: true,
      isDefault: false,
    },
    {
      id: "hero-archive",
      text: "Complete Limited Vehicle",
      highlightText: "Drop Archive",
      subtext:
        "Browse permanent release history, normalized customization features, and verified store status across every Everfall limited car.",
      enabled: true,
      isDefault: false,
    },
  ],
};

function normalizeSectionOrder<T extends string>(
  incoming: unknown,
  defaults: readonly T[]
): T[] {
  const validSet = new Set<string>(defaults);
  const seen = new Set<T>();
  const out: T[] = [];
  if (Array.isArray(incoming)) {
    for (const item of incoming) {
      const s = String(item || "") as T;
      if (validSet.has(s) && !seen.has(s)) {
        seen.add(s);
        out.push(s);
      }
    }
  }
  for (const def of defaults) {
    if (!seen.has(def)) out.push(def);
  }
  return out;
}

const VALID_SECTION_CONDITIONS = new Set<TemplateSectionCondition>([
  "always",
  "in_stock_only",
  "sold_out_only",
  "when_features_present",
  "when_trading_present",
  "when_delivery_present",
  "when_in_stock_any",
  "when_all_sold_out",
]);

export function normalizeCustomSections(raw: unknown): TemplateCustomSection[] {
  if (!Array.isArray(raw)) return [];
  const out: TemplateCustomSection[] = [];
  for (let i = 0; i < Math.min(raw.length, 8); i++) {
    const item = raw[i];
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const title = String(obj.title || "").trim().slice(0, 80);
    const content = String(obj.content || "").trim().slice(0, 1000);
    if (!title && !content) continue;
    const conditionRaw = String(obj.condition || "always") as TemplateSectionCondition;
    out.push({
      id: String(obj.id || `section-${i + 1}`).trim().slice(0, 48),
      title,
      content,
      enabled: obj.enabled !== false,
      condition: VALID_SECTION_CONDITIONS.has(conditionRaw) ? conditionRaw : "always",
      inline: Boolean(obj.inline),
    });
  }
  return out;
}

export function normalizeAnnouncementTemplate(
  incoming?: Partial<AnnouncementTemplate> | null,
  fallback: AnnouncementTemplate = DEFAULT_IN_STOCK_TEMPLATE
): AnnouncementTemplate {
  const base = fallback;
  const merged = incoming && typeof incoming === "object" ? { ...base, ...incoming } : { ...base };
  return {
    ...merged,
    tradingLabel: String(merged.tradingLabel || base.tradingLabel || "Trading").trim().slice(0, 50) || "Trading",
    deliveryLabel: String(merged.deliveryLabel || base.deliveryLabel || "Delivery").trim().slice(0, 50) || "Delivery",
    firstDetectedLabel:
      String(merged.firstDetectedLabel || base.firstDetectedLabel || "First Detected").trim().slice(0, 50) ||
      "First Detected",
    lastVerifiedLabel:
      String(merged.lastVerifiedLabel || base.lastVerifiedLabel || "Last Verified").trim().slice(0, 50) ||
      "Last Verified",
    soldOutLabel:
      String(merged.soldOutLabel || base.soldOutLabel || "Confirmed Sold Out").trim().slice(0, 50) ||
      "Confirmed Sold Out",
    featureOrder:
      Array.isArray(merged.featureOrder) && merged.featureOrder.length > 0
        ? merged.featureOrder
        : [...base.featureOrder],
    sectionOrder: normalizeSectionOrder(merged.sectionOrder, DEFAULT_ANNOUNCEMENT_SECTION_ORDER),
    customSections: normalizeCustomSections(merged.customSections),
    customButtonUrl: typeof merged.customButtonUrl === "string" ? merged.customButtonUrl.trim().slice(0, 300) : "",
    showSecondaryButton: Boolean(merged.showSecondaryButton),
    secondaryButtonLabel:
      typeof merged.secondaryButtonLabel === "string"
        ? merged.secondaryButtonLabel.trim().slice(0, 80)
        : base.secondaryButtonLabel || "View Archive Portal",
    secondaryButtonUrlMode:
      merged.secondaryButtonUrlMode === "listing" ||
      merged.secondaryButtonUrlMode === "category" ||
      merged.secondaryButtonUrlMode === "store_home" ||
      merged.secondaryButtonUrlMode === "website" ||
      merged.secondaryButtonUrlMode === "custom"
        ? merged.secondaryButtonUrlMode
        : base.secondaryButtonUrlMode || "website",
    secondaryCustomButtonUrl:
      typeof merged.secondaryCustomButtonUrl === "string"
        ? merged.secondaryCustomButtonUrl.trim().slice(0, 300)
        : "",
  };
}

export function normalizeWidgetTemplateConfig(
  incoming?: Partial<WidgetTemplateConfig> | null,
  fallback: WidgetTemplateConfig = DEFAULT_WIDGET_TEMPLATE
): WidgetTemplateConfig {
  const base = fallback;
  const raw = incoming && typeof incoming === "object" ? incoming : {};
  const hasExplicitIndependent =
    typeof raw.showLastStoreCheck === "boolean" ||
    typeof raw.showLastVerifiedStock === "boolean" ||
    typeof raw.showMonitorState === "boolean" ||
    typeof raw.showLastUpdated === "boolean";

  const legacyAllOn = raw.showTimestamps !== undefined ? raw.showTimestamps !== false : base.showTimestamps !== false;

  const showLastStoreCheck =
    typeof raw.showLastStoreCheck === "boolean"
      ? raw.showLastStoreCheck
      : hasExplicitIndependent
        ? base.showLastStoreCheck !== false
        : legacyAllOn;
  const showLastVerifiedStock =
    typeof raw.showLastVerifiedStock === "boolean"
      ? raw.showLastVerifiedStock
      : hasExplicitIndependent
        ? base.showLastVerifiedStock !== false
        : legacyAllOn;
  const showMonitorState =
    typeof raw.showMonitorState === "boolean"
      ? raw.showMonitorState
      : hasExplicitIndependent
        ? base.showMonitorState !== false
        : legacyAllOn;
  const showLastUpdated =
    typeof raw.showLastUpdated === "boolean"
      ? raw.showLastUpdated
      : hasExplicitIndependent
        ? base.showLastUpdated !== false
        : legacyAllOn;
  const showEmbedTimestamp =
    typeof raw.showEmbedTimestamp === "boolean"
      ? raw.showEmbedTimestamp
      : base.showEmbedTimestamp !== false;

  const showTimestamps = Boolean(
    showLastStoreCheck || showLastVerifiedStock || showMonitorState || showLastUpdated
  );

  return {
    ...base,
    ...raw,
    featureOrder:
      Array.isArray(raw.featureOrder) && raw.featureOrder.length > 0
        ? raw.featureOrder
        : [...base.featureOrder],
    featureLabelOverrides: raw.featureLabelOverrides || base.featureLabelOverrides || {},
    hiddenFeatureKeys: Array.isArray(raw.hiddenFeatureKeys)
      ? raw.hiddenFeatureKeys
      : [...(base.hiddenFeatureKeys || [])],
    showLastStoreCheck,
    lastStoreCheckLabel:
      String(raw.lastStoreCheckLabel ?? base.lastStoreCheckLabel ?? "Last Store Check").trim().slice(0, 60) ||
      "Last Store Check",
    showLastVerifiedStock,
    lastVerifiedStockLabel:
      String(raw.lastVerifiedStockLabel ?? base.lastVerifiedStockLabel ?? "Last Verified Stock")
        .trim()
        .slice(0, 60) || "Last Verified Stock",
    showMonitorState,
    monitorStateLabel:
      String(raw.monitorStateLabel ?? base.monitorStateLabel ?? "Monitor State").trim().slice(0, 60) ||
      "Monitor State",
    showLastUpdated,
    lastUpdatedLabel:
      String(raw.lastUpdatedLabel ?? base.lastUpdatedLabel ?? "Widget Last Updated").trim().slice(0, 60) ||
      "Widget Last Updated",
    showEmbedTimestamp,
    showTimestamps,
    sectionOrder: normalizeSectionOrder(raw.sectionOrder, DEFAULT_WIDGET_SECTION_ORDER),
    customSections: normalizeCustomSections(raw.customSections),
    customStoreButtonUrl:
      typeof raw.customStoreButtonUrl === "string" ? raw.customStoreButtonUrl.trim().slice(0, 300) : "",
  };
}

export function createDefaultPresentationConfig(): PresentationConfigBundle {
  return {
    version: 1,
    updatedAt: Date.now(),
    announcements: {
      inStock: normalizeAnnouncementTemplate(DEFAULT_IN_STOCK_TEMPLATE, DEFAULT_IN_STOCK_TEMPLATE),
      soldOut: normalizeAnnouncementTemplate(DEFAULT_SOLD_OUT_TEMPLATE, DEFAULT_SOLD_OUT_TEMPLATE),
    },
    widgetDefault: normalizeWidgetTemplateConfig(DEFAULT_WIDGET_TEMPLATE, DEFAULT_WIDGET_TEMPLATE),
    widgetTemplates: [],
    hero: {
      ...DEFAULT_HERO_CONFIG,
      messages: DEFAULT_HERO_CONFIG.messages.map((m) => ({ ...m })),
    },
    recentEmojis: [],
  };
}

export function sanitizeHexColor(input: unknown, fallback: string): string {
  const str = String(input || "").trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(str) ? str : fallback;
}

export function hexToDiscordInt(hex: string, fallback = 0xf59e0b): number {
  const cleaned = sanitizeHexColor(hex, "").replace("#", "");
  if (!cleaned) return fallback;
  const parsed = parseInt(cleaned, 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function validateEmojiRef(raw: unknown): DiscordEmojiRef | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const kind = obj.kind === "custom" ? "custom" : obj.kind === "unicode" ? "unicode" : null;
  if (!kind) return null;

  if (kind === "custom") {
    const id = String(obj.id || "").trim();
    const rawName = String(obj.name || "").trim().replace(/[^a-zA-Z0-9_]/g, "");
    if (!/^\d{17,22}$/.test(id) || !rawName) return null;
    const animated = Boolean(obj.animated);
    return {
      kind: "custom",
      id,
      name: rawName.slice(0, 32),
      animated,
      source: obj.source === "guild" ? "guild" : "application",
      ...(typeof obj.guildId === "string" && /^\d{17,22}$/.test(obj.guildId)
        ? { guildId: obj.guildId }
        : {}),
      ...(typeof obj.guildName === "string" && obj.guildName.trim()
        ? { guildName: obj.guildName.trim().slice(0, 80) }
        : {}),
      imageUrl: `https://cdn.discordapp.com/emojis/${id}.${animated ? "gif" : "webp"}?size=64&quality=lossless`,
    };
  }

  const name = String(obj.name || "").trim();
  if (!name || name.length > 24 || /<|>|javascript:/i.test(name)) return null;
  return {
    kind: "unicode",
    name,
    source: "unicode",
  };
}

export function formatEmojiForDiscordText(
  emoji?: DiscordEmojiRef | null,
  options?: { allowCustom?: boolean }
): string {
  const valid = validateEmojiRef(emoji);
  if (!valid) return "";
  if (valid.kind === "custom") {
    if (options?.allowCustom === false) return "";
    return `<${valid.animated ? "a" : ""}:${valid.name}:${valid.id}>`;
  }
  return valid.name;
}

export function formatEmojiForDiscordComponent(
  emoji?: DiscordEmojiRef | null
): { id?: string; name: string; animated?: boolean } | undefined {
  const valid = validateEmojiRef(emoji);
  if (!valid) return undefined;
  if (valid.kind === "custom" && valid.id) {
    return {
      id: valid.id,
      name: valid.name,
      ...(valid.animated ? { animated: true } : {}),
    };
  }
  return { name: valid.name };
}

export function sanitizeHttpUrl(url: unknown, fallback = STORE_HOME_URL): string {
  const raw = String(url || "").trim();
  if (!raw) return fallback;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.toString();
    }
  } catch {
    // ignore invalid URL
  }
  return fallback;
}

export function pickValidListingImage(
  images: string[] | undefined,
  preferredSlot: number,
  options?: {
    listingId?: string;
    cacheBustVersion?: number | string;
    safeOrigin?: string;
  }
): string | undefined {
  const list = Array.isArray(images) ? images : [];
  const validWithIndices = list
    .map((url, index) => ({ url, index }))
    .filter(
      (item) => typeof item.url === "string" && /^https?:\/\//i.test(item.url.trim())
    );
  if (validWithIndices.length === 0) return undefined;

  const findBySlot = (slotIdx: number) => {
    if (options?.listingId) {
      const explicitSlotUrl = validWithIndices.find((item) =>
        new RegExp(`/media/listings/${options.listingId}/${slotIdx}(?:\\?|$)`).test(item.url)
      );
      if (explicitSlotUrl) return explicitSlotUrl.url;
    }
    return list[slotIdx] && /^https?:\/\//i.test(list[slotIdx]) ? list[slotIdx] : undefined;
  };

  let chosen = findBySlot(preferredSlot);
  if (!chosen && preferredSlot !== 0) {
    chosen = findBySlot(0);
  }
  if (!chosen) {
    chosen = validWithIndices[0].url;
  }

  if (
    chosen &&
    options?.listingId &&
    options?.cacheBustVersion &&
    options?.safeOrigin &&
    chosen.includes(`/media/listings/${options.listingId}/`)
  ) {
    return `${chosen.split("?")[0]}?v=${options.cacheBustVersion}`;
  }
  return chosen;
}

export function formatFeaturesText(
  features: VehicleFeature[],
  style: "inline_badges" | "bullet_list" = "inline_badges",
  allowCustomEmoji = true
): string {
  if (!features.length) return "";
  if (style === "bullet_list") {
    return features
      .map((f) => {
        const emojiStr = formatEmojiForDiscordText(f.emoji, { allowCustom: allowCustomEmoji });
        return `${emojiStr ? `${emojiStr} ` : "• "}**${f.label}**`;
      })
      .join("\n");
  }
  return features
    .map((f) => {
      const emojiStr = formatEmojiForDiscordText(f.emoji, { allowCustom: allowCustomEmoji });
      return `${emojiStr ? `${emojiStr} ` : ""}\`${f.label}\``;
    })
    .join("  •  ");
}

function matchesSectionCondition(
  condition: TemplateSectionCondition,
  ctx: {
    isSoldOut: boolean;
    hasFeatures: boolean;
    hasTrading: boolean;
    hasDelivery: boolean;
    activeCount: number;
  }
): boolean {
  switch (condition) {
    case "in_stock_only":
      return !ctx.isSoldOut;
    case "sold_out_only":
      return ctx.isSoldOut;
    case "when_features_present":
      return ctx.hasFeatures;
    case "when_trading_present":
      return ctx.hasTrading;
    case "when_delivery_present":
      return ctx.hasDelivery;
    case "when_in_stock_any":
      return ctx.activeCount > 0;
    case "when_all_sold_out":
      return ctx.activeCount === 0;
    case "always":
    default:
      return true;
  }
}

export interface BuildCarDropPayloadParams {
  car: ListingSourceInput & {
    isAvailable?: boolean;
    detectedAt?: number;
    lastVerifiedAt?: number;
    soldOutAt?: number;
  };
  override?: VehicleMetadataOverride | null;
  template?: AnnouncementTemplate;
  roleIds?: string[];
  portalOrigin?: string;
  isTest?: boolean;
  isUpdate?: boolean;
  fallbackStoreEmojiId?: string;
  monitorStatus?: {
    checkedAt?: number;
    lastSuccessAt?: number;
    lastSource?: string;
    authoritative?: boolean;
  } | null;
}

export function buildCarDropPayload(params: BuildCarDropPayloadParams) {
  const { car, override, isTest = false, isUpdate = false } = params;
  const isSoldOut = car.isAvailable === false;
  const defaultTpl = isSoldOut ? DEFAULT_SOLD_OUT_TEMPLATE : DEFAULT_IN_STOCK_TEMPLATE;
  const tpl = normalizeAnnouncementTemplate(params.template, defaultTpl);
  const surface = isSoldOut ? "sold_out_embed" : "in_stock_embed";

  const presentation = resolveListingPresentation(car, override);
  const visibleFeatures = tpl.showFeatures
    ? sortAndFilterFeatures(presentation.effective.features, surface, {
        featureOrder: tpl.featureOrder,
      })
    : [];

  const color = hexToDiscordInt(tpl.accentColor, isSoldOut ? 0xdc2626 : 0xf59e0b);
  const titleEmoji = formatEmojiForDiscordText(
    tpl.titleEmoji !== undefined ? tpl.titleEmoji : defaultTpl.titleEmoji
  );
  const statusEmoji = formatEmojiForDiscordText(tpl.statusEmoji);
  const featureBlock =
    visibleFeatures.length > 0 ? formatFeaturesText(visibleFeatures, tpl.featureStyle) : "";

  const detectedSec = Math.floor((car.detectedAt || Date.now()) / 1000);
  const verifiedSec = car.lastVerifiedAt
    ? Math.floor(car.lastVerifiedAt / 1000)
    : car.detectedAt
      ? detectedSec
      : null;
  const soldOutSec = isSoldOut && car.soldOutAt ? Math.floor(car.soldOutAt / 1000) : null;

  const listingUrl = sanitizeHttpUrl(car.url, `${STORE_HOME_URL}package/${car.id}`);
  const websiteUrl =
    params.portalOrigin && /^https?:\/\//i.test(params.portalOrigin)
      ? sanitizeHttpUrl(params.portalOrigin, STORE_HOME_URL)
      : "";

  const monitor = params.monitorStatus;
  const monitorCheckedSec = monitor?.checkedAt ? Math.floor(monitor.checkedAt / 1000) : null;
  const monitorVerifiedSec = monitor?.lastSuccessAt
    ? Math.floor(monitor.lastSuccessAt / 1000)
    : monitor?.authoritative && monitorCheckedSec
      ? monitorCheckedSec
      : null;
  const monitorState = monitor
    ? monitor.authoritative === false
      ? "Verification Blocked (Using Verified History)"
      : monitor.authoritative
        ? "Verified"
        : "Pending Store Check"
    : "Verified";

  const customSoundFeat = visibleFeatures.find((f) => f.key === "custom_sound");
  const customOptionsFeat = visibleFeatures.find((f) => f.key === "custom_options");

  const varValues: TemplateVariableValues = {
    vehicle_name: presentation.effective.name,
    vehicle_id: String(car.id || ""),
    description: presentation.effective.fullDescription,
    short_description: presentation.effective.shortDescription,
    features: featureBlock,
    custom_options:
      customOptionsFeat?.label ||
      presentation.source.extracted.customOptionsLabel ||
      "",
    custom_sound:
      customSoundFeat?.label ||
      (presentation.source.extracted.customSound ? "Custom Sound" : ""),
    trading: presentation.effective.tradingRestriction || "",
    delivery: presentation.effective.deliveryInfo || "",
    status: "", // populated immediately below to allow statusLabel itself to contain variables safely
    status_emoji: statusEmoji,
    first_detected: `<t:${detectedSec}:f> (<t:${detectedSec}:R>)`,
    last_verified: verifiedSec ? `<t:${verifiedSec}:f>` : "",
    sold_out_at: soldOutSec ? `<t:${soldOutSec}:f> (<t:${soldOutSec}:R>)` : "",
    store_url: STORE_CATEGORY_URL,
    listing_url: listingUrl,
    website_url: websiteUrl,
    check_interval: CHECK_INTERVAL_LABEL,
    last_store_check: monitorCheckedSec ? `<t:${monitorCheckedSec}:R>` : "",
    last_successful_check: monitorVerifiedSec ? `<t:${monitorVerifiedSec}:R>` : "",
    monitor_state: monitorState,
    active_count: isSoldOut ? "0" : "1",
  };

  const resolvedStatusLabel =
    resolveTemplateVariables(tpl.statusLabel || (isSoldOut ? "Sold Out" : "In Stock"), varValues) ||
    (isSoldOut ? "Sold Out" : "In Stock");
  varValues.status = resolvedStatusLabel;

  const resolvedTitlePrefix = resolveTemplateVariables(tpl.titlePrefix || "", varValues);
  const headerIncludesVehicleName = /\{(?:vehicle_)?name\}/i.test(tpl.titlePrefix || "");
  const titleParts = [
    titleEmoji,
    resolvedTitlePrefix,
    headerIncludesVehicleName ? "" : neutralizeDiscordMentions(presentation.effective.name),
  ].filter(Boolean);
  const testBanner = isTest ? "**[TEST NOTIFICATION]**\n" : "";

  const statusHeading =
    resolveTemplateVariables(tpl.availabilityHeading || "Availability", varValues) || "Availability";

  let mainBodyText = presentation.effective.fullDescription;
  if (tpl.descriptionMode === "short_summary") {
    mainBodyText = presentation.effective.shortDescription;
  } else if (tpl.descriptionMode === "custom" && tpl.customDescription.trim()) {
    mainBodyText = resolveTemplateVariables(tpl.customDescription, varValues);
  }
  mainBodyText = neutralizeDiscordMentions(mainBodyText);

  const customIncludesFeatures =
    tpl.descriptionMode === "custom" && /\{features\}/i.test(tpl.customDescription || "");

  const extraInfoLines: string[] = [];
  if (tpl.showTradingInfo && presentation.effective.tradingRestriction) {
    const tLabel = resolveTemplateVariables(tpl.tradingLabel || "Trading", varValues) || "Trading";
    extraInfoLines.push(
      `**${tLabel}:** ${neutralizeDiscordMentions(presentation.effective.tradingRestriction)}`
    );
  }
  if (tpl.showDeliveryInfo && presentation.effective.deliveryInfo) {
    const dLabel = resolveTemplateVariables(tpl.deliveryLabel || "Delivery", varValues) || "Delivery";
    extraInfoLines.push(
      `**${dLabel}:** ${neutralizeDiscordMentions(presentation.effective.deliveryInfo)}`
    );
  }

  const timeLines: string[] = [];
  if (tpl.showDetectionTime) {
    const fLabel =
      resolveTemplateVariables(tpl.firstDetectedLabel || "First Detected", varValues) ||
      "First Detected";
    timeLines.push(`**${fLabel}:** <t:${detectedSec}:f> (<t:${detectedSec}:R>)`);
  }
  if (tpl.showLastVerified && verifiedSec) {
    const lLabel =
      resolveTemplateVariables(tpl.lastVerifiedLabel || "Last Verified", varValues) ||
      "Last Verified";
    timeLines.push(`**${lLabel}:** <t:${verifiedSec}:f>`);
  }
  if (isSoldOut && tpl.showSoldOutTime && soldOutSec) {
    const sLabel =
      resolveTemplateVariables(tpl.soldOutLabel || "Confirmed Sold Out", varValues) ||
      "Confirmed Sold Out";
    timeLines.push(`**${sLabel}:** <t:${soldOutSec}:f> (<t:${soldOutSec}:R>)`);
  }

  const customSectionBlocks: string[] = [];
  const condCtx = {
    isSoldOut,
    hasFeatures: visibleFeatures.length > 0,
    hasTrading: Boolean(presentation.effective.tradingRestriction),
    hasDelivery: Boolean(presentation.effective.deliveryInfo),
    activeCount: isSoldOut ? 0 : 1,
  };
  for (const cs of tpl.customSections || []) {
    if (!cs.enabled) continue;
    if (!matchesSectionCondition(cs.condition, condCtx)) continue;
    const resolvedTitle = resolveTemplateVariables(cs.title, varValues);
    const resolvedBody = resolveTemplateVariables(cs.content, varValues);
    if (!resolvedBody && !resolvedTitle) continue;
    if (resolvedTitle && resolvedBody) {
      customSectionBlocks.push(`**${resolvedTitle}**\n${resolvedBody}`);
    } else if (resolvedBody) {
      customSectionBlocks.push(resolvedBody);
    }
  }

  const lines: string[] = [];
  const order = tpl.sectionOrder || DEFAULT_ANNOUNCEMENT_SECTION_ORDER;
  for (const sec of order) {
    if (sec === "header") {
      lines.push(`${testBanner}# ${titleParts.join(" ")}`.slice(0, 256));
    } else if (sec === "status") {
      lines.push(
        `**${statusHeading}:** ${statusEmoji ? `${statusEmoji} ` : ""}${resolvedStatusLabel}`
      );
    } else if (sec === "features") {
      if (!customIncludesFeatures && featureBlock) {
        lines.push(featureBlock);
      }
    } else if (sec === "description") {
      if (mainBodyText.trim()) {
        lines.push(mainBodyText.trim().slice(0, 2200));
      }
    } else if (sec === "trading_delivery") {
      if (extraInfoLines.length > 0) {
        lines.push(extraInfoLines.join("\n"));
      }
    } else if (sec === "timestamps") {
      if (timeLines.length > 0) {
        lines.push(timeLines.join("\n"));
      }
    } else if (sec === "custom_sections") {
      if (customSectionBlocks.length > 0) {
        lines.push(customSectionBlocks.join("\n\n"));
      }
    }
  }

  const containerComponents: any[] = [{ type: 10, content: lines.join("\n\n").slice(0, 3900) }];

  const validImages = (car.images || []).filter(
    (img) => typeof img === "string" && /^https?:\/\//i.test(img)
  );
  if (validImages.length > 0 && tpl.galleryMode !== "none") {
    let selectedImages = validImages.slice(0, 10);
    if (tpl.galleryMode === "primary_only") {
      const picked = pickValidListingImage(validImages, 0);
      selectedImages = picked ? [picked] : [];
    } else if (tpl.galleryMode === "custom_slot") {
      const picked = pickValidListingImage(validImages, tpl.primaryImageSlot || 0);
      selectedImages = picked ? [picked] : [];
    }
    if (selectedImages.length > 0) {
      containerComponents.push({
        type: 12,
        items: selectedImages.map((url, index) => ({
          media: { url },
          description: `${presentation.effective.name} — gallery image ${index + 1} of ${selectedImages.length}`,
        })),
      });
    }
  }

  const resolveActionButtonUrl = (
    mode: "listing" | "category" | "store_home" | "website" | "custom",
    customPattern?: string
  ): string => {
    if (mode === "store_home") return STORE_HOME_URL;
    if (mode === "category") return STORE_CATEGORY_URL;
    if (mode === "website") return websiteUrl || STORE_HOME_URL;
    if (mode === "custom" && customPattern?.trim()) {
      const resolvedUrl = resolveTemplateVariables(customPattern, varValues, {
        escapeMentions: false,
        stripUnknownTokens: true,
        collapseEmptyTokenLines: false,
      });
      return sanitizeHttpUrl(resolvedUrl, listingUrl);
    }
    return listingUrl;
  };

  const buttonComponents: any[] = [];
  if (tpl.showStoreButton) {
    const buttonUrl = resolveActionButtonUrl(tpl.storeButtonUrlMode, tpl.customButtonUrl);
    const resolvedBtnLabel =
      resolveTemplateVariables(tpl.storeButtonLabel || "View Store", varValues) || "View Store";
    const storeButton: Record<string, any> = {
      type: 2,
      style: 5,
      label: resolvedBtnLabel.trim().slice(0, 80),
      url: buttonUrl,
    };
    const btnEmoji =
      formatEmojiForDiscordComponent(tpl.storeButtonEmoji) ||
      (!isSoldOut && params.fallbackStoreEmojiId
        ? { id: params.fallbackStoreEmojiId, name: "everfall" }
        : undefined);
    if (btnEmoji) {
      storeButton.emoji = btnEmoji;
    }
    buttonComponents.push(storeButton);
  }

  if (tpl.showSecondaryButton && tpl.secondaryButtonLabel?.trim()) {
    const secUrl = resolveActionButtonUrl(
      tpl.secondaryButtonUrlMode || "website",
      tpl.secondaryCustomButtonUrl
    );
    const secLabel =
      resolveTemplateVariables(tpl.secondaryButtonLabel, varValues) || tpl.secondaryButtonLabel.trim();
    if (secLabel.trim()) {
      buttonComponents.push({
        type: 2,
        style: 5,
        label: secLabel.trim().slice(0, 80),
        url: secUrl,
      });
    }
  }

  if (buttonComponents.length > 0) {
    containerComponents.push({
      type: 1,
      components: buttonComponents.slice(0, 5),
    });
  }

  const footerEmoji = formatEmojiForDiscordText(tpl.footerEmoji);
  const resolvedFooterText = resolveTemplateVariables(tpl.footerText || "", varValues);
  const footerParts = [
    [footerEmoji, resolvedFooterText?.trim()].filter(Boolean).join(" "),
    isTest ? "Test Dispatch" : "",
    isUpdate ? (isSoldOut ? "Updated: Sold Out" : "Embed Refreshed") : "",
  ].filter(Boolean);

  if (footerParts.length > 0) {
    containerComponents.push({
      type: 10,
      content: `-# ${footerParts.join(" • ")}`.slice(0, 200),
    });
  }

  const roleIds = Array.isArray(params.roleIds) ? params.roleIds : [];
  const pings =
    !isTest && !isUpdate && roleIds.length > 0
      ? roleIds.map((r) => `<@&${r}>`).join(" ")
      : "";

  const components: any[] = [];
  if (pings) components.push({ type: 10, content: pings });
  components.push({ type: 17, accent_color: color, components: containerComponents });

  return {
    flags: 1 << 15,
    allowed_mentions: {
      parse: [],
      roles: isTest || isUpdate ? [] : roleIds,
    },
    components,
  };
}

export interface WidgetBuildInputListing {
  id: string;
  firstSeenAt: number;
  lastVerifiedAt?: number;
  soldOutAt?: number;
  isAvailable: boolean;
  payload: {
    name?: string;
    description?: string;
    url?: string;
    images?: string[];
  };
  override?: VehicleMetadataOverride | null;
}

export interface BuildWidgetPayloadParams {
  records: WidgetBuildInputListing[];
  monitorStatus?: {
    checkedAt?: number;
    lastSuccessAt?: number;
    lastSource?: string;
    authoritative?: boolean;
  } | null;
  template?: WidgetTemplateConfig;
  catalogVersion?: number;
  portalOrigin?: string;
  safeOrigin?: string;
  staleThresholdMs?: number;
  nowMs?: number;
  widgetUpdatedAt?: number;
}

function selectOrderedWidgetRecords(
  records: WidgetBuildInputListing[],
  tpl: WidgetTemplateConfig
) {
  const sortedByRecent = [...records].sort((a, b) => b.firstSeenAt - a.firstSeenAt);
  const orderedRecords =
    tpl.vehicleOrdering === "in_stock_first"
      ? [...sortedByRecent].sort((a, b) => {
          if (a.isAvailable !== b.isAvailable) return a.isAvailable ? -1 : 1;
          return b.firstSeenAt - a.firstSeenAt;
        })
      : sortedByRecent;

  const vehicleLimit = Math.max(1, Math.min(6, Math.round(tpl.vehicleCount || 3)));
  const selectedRecords = orderedRecords.slice(0, vehicleLimit);
  const activeRecords = sortedByRecent.filter((r) => r.isAvailable);
  return { sortedByRecent, selectedRecords, activeRecords };
}

export function buildWidgetPayload(params: BuildWidgetPayloadParams) {
  const tpl = normalizeWidgetTemplateConfig(params.template, DEFAULT_WIDGET_TEMPLATE);
  const now = params.nowMs || Date.now();
  const widgetUpdatedAt = params.widgetUpdatedAt || now;
  const widgetUpdatedSec = Math.floor(widgetUpdatedAt / 1000);
  const staleThreshold = params.staleThresholdMs ?? 30 * 60 * 1000;

  const { selectedRecords, activeRecords } = selectOrderedWidgetRecords(params.records, tpl);

  const monitor = params.monitorStatus;
  const checkedAt = monitor?.checkedAt || now;
  const checkedSec = Math.floor(checkedAt / 1000);
  const lastVerifiedAt = monitor?.lastSuccessAt || (monitor?.authoritative ? checkedAt : undefined);
  const verifiedSec = lastVerifiedAt ? Math.floor(lastVerifiedAt / 1000) : null;

  const isBlocked = Boolean(monitor && monitor.authoritative === false);
  const isStale = Boolean(
    !lastVerifiedAt || now - lastVerifiedAt > staleThreshold || isBlocked
  );

  const sourceLabel =
    monitor?.lastSource === "scrapling"
      ? "Scrapling"
      : monitor?.lastSource === "cron-fetch"
        ? "HTTP Cron"
        : monitor?.lastSource === "manual"
          ? "Manual Scan"
          : "Store Monitor";

  const statusText = isBlocked
    ? "Verification Blocked (Using Verified History)"
    : monitor?.authoritative
      ? `Verified (${sourceLabel})`
      : "Pending Store Check";

  const resolvedPresentations = selectedRecords.map((rec) => ({
    rec,
    pres: resolveListingPresentation(
      {
        id: rec.id,
        name: rec.payload?.name || `Limited #${rec.id}`,
        description: rec.payload?.description || "",
        url: rec.payload?.url,
        images: rec.payload?.images,
      },
      rec.override
    ),
  }));

  const inStockEmoji = formatEmojiForDiscordText(tpl.inStockEmoji);
  const soldOutEmoji = formatEmojiForDiscordText(tpl.soldOutEmoji);

  const heroCandidateEntry =
    resolvedPresentations.find((entry) => entry.rec.isAvailable) || resolvedPresentations[0];
  const heroRec = heroCandidateEntry?.rec;
  const heroPres = heroCandidateEntry?.pres;
  const heroFeatures = heroPres
    ? sortAndFilterFeatures(heroPres.effective.features, "widget", {
        featureOrder: tpl.featureOrder,
        featureLabelOverrides: tpl.featureLabelOverrides,
        hiddenFeatureKeys: tpl.hiddenFeatureKeys,
        maxCount: 4,
      })
    : [];

  const recentReleasesSummary = resolvedPresentations
    .map(({ rec, pres }) => {
      const stateLabel = rec.isAvailable ? tpl.inStockLabel || "In Stock" : tpl.soldOutLabel || "Sold Out";
      return `• **${pres.effective.name}** — ${stateLabel}`;
    })
    .join("\n");

  const websiteUrl =
    params.portalOrigin && /^https?:\/\//i.test(params.portalOrigin)
      ? sanitizeHttpUrl(params.portalOrigin, STORE_HOME_URL)
      : "";

  const varValues: TemplateVariableValues = {
    vehicle_name: heroPres?.effective.name || "",
    vehicle_id: heroRec?.id || "",
    description: heroPres?.effective.fullDescription || "",
    short_description: heroPres?.effective.shortDescription || "",
    features: heroFeatures.length > 0 ? formatFeaturesText(heroFeatures, "inline_badges") : "",
    custom_options: heroPres?.source.extracted.customOptionsLabel || "",
    custom_sound: heroPres?.source.extracted.customSound ? "Custom Sound" : "",
    trading: heroPres?.effective.tradingRestriction || "",
    delivery: heroPres?.effective.deliveryInfo || "",
    status: activeRecords.length > 0 ? tpl.inStockLabel || "In Stock" : tpl.soldOutLabel || "Sold Out",
    status_emoji: activeRecords.length > 0 ? inStockEmoji : soldOutEmoji,
    first_detected: heroRec?.firstSeenAt
      ? `<t:${Math.floor(heroRec.firstSeenAt / 1000)}:f> (<t:${Math.floor(heroRec.firstSeenAt / 1000)}:R>)`
      : "",
    last_verified: heroRec?.lastVerifiedAt
      ? `<t:${Math.floor(heroRec.lastVerifiedAt / 1000)}:f>`
      : verifiedSec
        ? `<t:${verifiedSec}:f>`
        : "",
    sold_out_at:
      heroRec && !heroRec.isAvailable && heroRec.soldOutAt
        ? `<t:${Math.floor(heroRec.soldOutAt / 1000)}:R>`
        : "",
    store_url: STORE_CATEGORY_URL,
    listing_url: heroRec
      ? sanitizeHttpUrl(heroPres?.source.url, `${STORE_HOME_URL}package/${heroRec.id}`)
      : STORE_CATEGORY_URL,
    website_url: websiteUrl,
    check_interval: CHECK_INTERVAL_LABEL,
    last_store_check: `<t:${checkedSec}:R>`,
    last_successful_check: verifiedSec ? `<t:${verifiedSec}:R>` : "",
    monitor_state: statusText,
    recent_releases: recentReleasesSummary,
    active_count: String(activeRecords.length),
    last_widget_update: `<t:${widgetUpdatedSec}:R>`,
  };

  const inStockTag = [inStockEmoji, resolveTemplateVariables(tpl.inStockLabel || "In Stock", varValues) || "In Stock"]
    .filter(Boolean)
    .join(" ");
  const soldOutTag = [soldOutEmoji, resolveTemplateVariables(tpl.soldOutLabel || "Sold Out", varValues) || "Sold Out"]
    .filter(Boolean)
    .join(" ");

  const titleEmoji = formatEmojiForDiscordText(tpl.titleEmoji);
  const resolvedTitle =
    resolveTemplateVariables(tpl.title || DEFAULT_WIDGET_TEMPLATE.title, varValues) ||
    DEFAULT_WIDGET_TEMPLATE.title;
  const embedTitle = [titleEmoji, resolvedTitle].filter(Boolean).join(" ").slice(0, 256);

  const timestampLines: string[] = [];
  if (tpl.showLastStoreCheck !== false) {
    const label =
      resolveTemplateVariables(tpl.lastStoreCheckLabel || "Last Store Check", varValues) ||
      "Last Store Check";
    timestampLines.push(`**${label}:** <t:${checkedSec}:f> (<t:${checkedSec}:R>)`);
  }
  if (tpl.showLastVerifiedStock !== false) {
    const label =
      resolveTemplateVariables(tpl.lastVerifiedStockLabel || "Last Verified Stock", varValues) ||
      "Last Verified Stock";
    timestampLines.push(
      verifiedSec ? `**${label}:** <t:${verifiedSec}:R>` : `**${label}:** Pending verification`
    );
  }
  if (tpl.showMonitorState !== false) {
    const label =
      resolveTemplateVariables(tpl.monitorStateLabel || "Monitor State", varValues) || "Monitor State";
    timestampLines.push(`**${label}:** ${statusText}`);
  }
  if (tpl.showLastUpdated !== false) {
    const label =
      resolveTemplateVariables(tpl.lastUpdatedLabel || "Widget Last Updated", varValues) ||
      "Widget Last Updated";
    timestampLines.push(`**${label}:** <t:${widgetUpdatedSec}:R>`);
  }

  const widgetConditionCtx = {
    isSoldOut: activeRecords.length === 0,
    hasFeatures: heroFeatures.length > 0,
    hasTrading: Boolean(heroPres?.effective.tradingRestriction),
    hasDelivery: Boolean(heroPres?.effective.deliveryInfo),
    activeCount: activeRecords.length,
  };

  const inlineCustomFields: Array<{ name: string; value: string; inline: boolean }> = [];
  const descriptionCustomBlocks: string[] = [];
  for (const cs of tpl.customSections || []) {
    if (!cs.enabled) continue;
    if (!matchesSectionCondition(cs.condition, widgetConditionCtx)) continue;
    const resolvedTitleSec = resolveTemplateVariables(cs.title, varValues);
    const resolvedBodySec = resolveTemplateVariables(cs.content, varValues);
    if (!resolvedTitleSec && !resolvedBodySec) continue;
    if (cs.inline && resolvedTitleSec && resolvedBodySec) {
      inlineCustomFields.push({
        name: resolvedTitleSec.slice(0, 256),
        value: resolvedBodySec.slice(0, 1024),
        inline: true,
      });
    } else if (resolvedTitleSec && resolvedBodySec) {
      descriptionCustomBlocks.push(`**${resolvedTitleSec}**\n${resolvedBodySec}`);
    } else if (resolvedBodySec) {
      descriptionCustomBlocks.push(resolvedBodySec);
    }
  }

  const descParts: string[] = [];
  const sectionOrder = tpl.sectionOrder || DEFAULT_WIDGET_SECTION_ORDER;
  for (const sec of sectionOrder) {
    if (sec === "subtitle" && tpl.subtitle?.trim()) {
      const sub = resolveTemplateVariables(tpl.subtitle, varValues);
      if (sub) descParts.push(sub);
    } else if (sec === "intro" && tpl.introMessage?.trim()) {
      const intro = resolveTemplateVariables(tpl.introMessage, varValues);
      if (intro) descParts.push(intro);
    } else if (sec === "timestamps" && timestampLines.length > 0) {
      descParts.push(timestampLines.join("\n"));
    } else if (sec === "stale_warning" && tpl.showStaleWarning && isStale && tpl.staleWarningText?.trim()) {
      const warn = resolveTemplateVariables(tpl.staleWarningText, varValues);
      if (warn) descParts.push(`> **Notice:** ${warn}`);
    } else if (sec === "custom_sections" && descriptionCustomBlocks.length > 0) {
      descParts.push(descriptionCustomBlocks.join("\n\n"));
    }
  }

  const viewLabel =
    (resolveTemplateVariables(tpl.viewButtonLabel || "View", varValues) || "View")
      .trim()
      .slice(0, 40);

  const fields: Array<{ name: string; value: string; inline: boolean }> = [];

  if (tpl.showActiveSummary) {
    const heading =
      resolveTemplateVariables(tpl.activeSummaryHeading || "Active Listings", varValues) ||
      "Active Listings";
    if (activeRecords.length > 0) {
      const activeSummaryLines = activeRecords.slice(0, 3).map((rec) => {
        const pres = resolveListingPresentation(
          {
            id: rec.id,
            name: rec.payload?.name || `Limited #${rec.id}`,
            description: rec.payload?.description || "",
            url: rec.payload?.url,
            images: rec.payload?.images,
          },
          rec.override
        );
        return `${inStockEmoji ? `${inStockEmoji} ` : ""}**${neutralizeDiscordMentions(pres.effective.name)}** • [${viewLabel}](${sanitizeHttpUrl(pres.source.url, `${STORE_HOME_URL}package/${rec.id}`)})`;
      });
      fields.push({
        name: `${heading} (${activeRecords.length})`.slice(0, 256),
        value: activeSummaryLines.join("\n").slice(0, 1024),
        inline: false,
      });
    } else {
      fields.push({
        name: `${heading} (0)`.slice(0, 256),
        value: `No active limited vehicles right now. [${viewLabel} Store](${STORE_CATEGORY_URL})`,
        inline: false,
      });
    }
  }

  if (selectedRecords.length === 0) {
    const emptyMsg =
      resolveTemplateVariables(
        tpl.emptyStateMessage || DEFAULT_WIDGET_TEMPLATE.emptyStateMessage,
        varValues
      ) || DEFAULT_WIDGET_TEMPLATE.emptyStateMessage;
    fields.push({
      name: "Recent Limited Releases",
      value: emptyMsg.slice(0, 1024),
      inline: false,
    });
  } else {
    for (const { rec, pres } of resolvedPresentations) {
      const statusTag = rec.isAvailable ? inStockTag : soldOutTag;
      const storeUrl = rec.isAvailable
        ? sanitizeHttpUrl(pres.source.url, `${STORE_HOME_URL}package/${rec.id}`)
        : `${STORE_HOME_URL}package/${rec.id}`;

      const valueLines: string[] = [`${statusTag} • [${viewLabel}](${storeUrl})`];

      if (tpl.showFeatures) {
        const feats = sortAndFilterFeatures(pres.effective.features, "widget", {
          featureOrder: tpl.featureOrder,
          featureLabelOverrides: tpl.featureLabelOverrides,
          hiddenFeatureKeys: tpl.hiddenFeatureKeys,
          maxCount: 4,
        });
        for (const f of feats) {
          const fe = formatEmojiForDiscordText(f.emoji);
          valueLines.push(`${fe ? `${fe} ` : "• "}${neutralizeDiscordMentions(f.label)}`);
        }
      }

      fields.push({
        name: neutralizeDiscordMentions(pres.effective.name).slice(0, 256),
        value: valueLines.join("\n").slice(0, 1024),
        inline: true,
      });
    }
  }

  if (inlineCustomFields.length > 0) {
    fields.push(...inlineCustomFields);
  }

  let featuredImageUrl: string | undefined;
  if (tpl.showFeaturedImage && heroRec) {
    featuredImageUrl = pickValidListingImage(heroRec.payload?.images, tpl.featuredImageSlot ?? 3, {
      listingId: heroRec.id,
      cacheBustVersion: params.catalogVersion || 1,
      safeOrigin: params.safeOrigin,
    });
  }

  const embedColor = tpl.useDynamicStockColor
    ? activeRecords.length > 0
      ? hexToDiscordInt(tpl.inStockColor, 0x10b981)
      : hexToDiscordInt(tpl.soldOutColor, 0x52525b)
    : hexToDiscordInt(tpl.accentColor, 0x10b981);

  const footerEmojiText =
    tpl.footerEmoji?.kind === "unicode" ? `${tpl.footerEmoji.name} ` : "";
  const resolvedFooter =
    resolveTemplateVariables(tpl.footerText || DEFAULT_WIDGET_TEMPLATE.footerText, varValues) ||
    DEFAULT_WIDGET_TEMPLATE.footerText;
  const embedFooterText = `${footerEmojiText}${resolvedFooter}`.slice(0, 2048);

  const embed: Record<string, any> = {
    title: embedTitle,
    description: descParts.join("\n\n").slice(0, 4096),
    color: embedColor,
    fields: fields.slice(0, 25),
    footer: { text: embedFooterText },
  };

  if (tpl.showEmbedTimestamp !== false) {
    embed.timestamp = new Date(widgetUpdatedAt).toISOString();
  }

  if (featuredImageUrl) {
    embed.image = { url: featuredImageUrl };
  }

  const actionButtons: any[] = [];
  if (tpl.showButtonsRow) {
    const resolvedSiteLabel = resolveTemplateVariables(tpl.websiteButtonLabel || "", varValues);
    if (websiteUrl && resolvedSiteLabel.trim()) {
      const btn: any = {
        type: 2,
        style: 5,
        label: resolvedSiteLabel.trim().slice(0, 80),
        url: websiteUrl,
      };
      const em = formatEmojiForDiscordComponent(tpl.websiteButtonEmoji);
      if (em) btn.emoji = em;
      actionButtons.push(btn);
    }
    const resolvedStoreLabel = resolveTemplateVariables(tpl.storeButtonLabel || "", varValues);
    if (resolvedStoreLabel.trim()) {
      const customUrl = tpl.customStoreButtonUrl?.trim()
        ? sanitizeHttpUrl(
            resolveTemplateVariables(tpl.customStoreButtonUrl, varValues, {
              escapeMentions: false,
              stripUnknownTokens: true,
              collapseEmptyTokenLines: false,
            }),
            STORE_CATEGORY_URL
          )
        : STORE_CATEGORY_URL;
      const btn: any = {
        type: 2,
        style: 5,
        label: resolvedStoreLabel.trim().slice(0, 80),
        url: customUrl,
      };
      const em = formatEmojiForDiscordComponent(tpl.storeButtonEmoji);
      if (em) btn.emoji = em;
      actionButtons.push(btn);
    }
  }

  return {
    embeds: [embed],
    ...(actionButtons.length > 0
      ? { components: [{ type: 1, components: actionButtons }] }
      : {}),
  };
}

/**
 * Computes a deterministic content hash strictly from meaningful vehicle catalog state
 * and static widget presentation settings. Excludes routine monitor check timestamps,
 * execution sources, authoritative/stale flags, and widgetUpdatedAt so store checks
 * that discover no changes never trigger Discord edits or KV writes.
 */
export function computeWidgetContentHash(params: {
  records: WidgetBuildInputListing[];
  template?: WidgetTemplateConfig;
  catalogVersion?: number;
  portalOrigin?: string;
  safeOrigin?: string;
}): string {
  const tpl = normalizeWidgetTemplateConfig(params.template, DEFAULT_WIDGET_TEMPLATE);
  const { selectedRecords, activeRecords } = selectOrderedWidgetRecords(params.records, tpl);

  const semanticSelected = selectedRecords.map((rec) => {
    const pres = resolveListingPresentation(
      {
        id: rec.id,
        name: rec.payload?.name || `Limited #${rec.id}`,
        description: rec.payload?.description || "",
        url: rec.payload?.url,
        images: rec.payload?.images,
      },
      rec.override
    );
    const feats = tpl.showFeatures
      ? sortAndFilterFeatures(pres.effective.features, "widget", {
          featureOrder: tpl.featureOrder,
          featureLabelOverrides: tpl.featureLabelOverrides,
          hiddenFeatureKeys: tpl.hiddenFeatureKeys,
          maxCount: 4,
        }).map((f) => ({
          key: f.key,
          label: f.label,
          emoji: f.emoji ? `${f.emoji.kind}:${f.emoji.id || f.emoji.name}` : "",
        }))
      : [];
    return {
      id: rec.id,
      isAvailable: rec.isAvailable,
      firstSeenAt: rec.firstSeenAt,
      soldOutAt: rec.isAvailable ? null : rec.soldOutAt || null,
      name: pres.effective.name,
      shortDescription: pres.effective.shortDescription,
      fullDescription: pres.effective.fullDescription,
      trading: pres.effective.tradingRestriction || "",
      delivery: pres.effective.deliveryInfo || "",
      url: pres.source.url,
      images: Array.isArray(rec.payload?.images) ? rec.payload.images : [],
      features: feats,
    };
  });

  const activeIdsAndNames = activeRecords.slice(0, 3).map((rec) => {
    const pres = resolveListingPresentation(
      {
        id: rec.id,
        name: rec.payload?.name || `Limited #${rec.id}`,
        description: rec.payload?.description || "",
        url: rec.payload?.url,
        images: rec.payload?.images,
      },
      rec.override
    );
    return { id: rec.id, name: pres.effective.name, url: pres.source.url };
  });

  const heroCandidate = selectedRecords.find((r) => r.isAvailable) || selectedRecords[0];
  const featuredImageUrl =
    tpl.showFeaturedImage && heroCandidate
      ? pickValidListingImage(heroCandidate.payload?.images, tpl.featuredImageSlot ?? 3, {
          listingId: heroCandidate.id,
          cacheBustVersion: params.catalogVersion || 1,
          safeOrigin: params.safeOrigin,
        }) || ""
      : "";

  return computeStableHash({
    template: tpl,
    portalOrigin: params.portalOrigin || "",
    safeOrigin: params.safeOrigin || "",
    activeCount: activeRecords.length,
    activeSummary: activeIdsAndNames,
    selected: semanticSelected,
    featuredImageUrl,
  });
}

export function validateDiscordPayloadLimits(payload: any): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (Array.isArray(payload?.embeds)) {
    if (payload.embeds.length > 10) {
      errors.push("Discord allows a maximum of 10 embeds per message.");
    }
    let totalChars = 0;
    payload.embeds.forEach((emb: any, idx: number) => {
      const prefix = payload.embeds.length > 1 ? `Embed ${idx + 1}: ` : "";
      const titleLen = String(emb?.title || "").length;
      const descLen = String(emb?.description || "").length;
      const footerLen = String(emb?.footer?.text || "").length;
      totalChars += titleLen + descLen + footerLen;

      if (titleLen > 256) errors.push(`${prefix}Title exceeds Discord 256-character limit.`);
      if (descLen > 4096) errors.push(`${prefix}Description exceeds Discord 4,096-character limit.`);
      if (footerLen > 2048) errors.push(`${prefix}Footer exceeds Discord 2,048-character limit.`);

      if (Array.isArray(emb?.fields)) {
        if (emb.fields.length > 25) {
          errors.push(`${prefix}Exceeds Discord maximum of 25 fields.`);
        }
        emb.fields.forEach((f: any, fIdx: number) => {
          const nLen = String(f?.name || "").length;
          const vLen = String(f?.value || "").length;
          totalChars += nLen + vLen;
          if (nLen === 0) errors.push(`${prefix}Field ${fIdx + 1} name cannot be empty.`);
          if (nLen > 256) errors.push(`${prefix}Field ${fIdx + 1} name exceeds 256 characters.`);
          if (vLen === 0) errors.push(`${prefix}Field ${fIdx + 1} value cannot be empty.`);
          if (vLen > 1024) errors.push(`${prefix}Field ${fIdx + 1} value exceeds 1,024 characters.`);
        });
      }
    });
    if (totalChars > 6000) {
      errors.push(`Combined embed character count (${totalChars}) exceeds Discord 6,000-character limit.`);
    } else if (totalChars > 4800) {
      warnings.push(`Embed is approaching Discord's 6,000-character limit (${totalChars}/6000).`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function computeStableHash(input: unknown): string {
  const str = typeof input === "string" ? input : JSON.stringify(input);
  let h1 = 0xdeadbeef ^ str.length;
  let h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function resolveEffectiveWidgetTemplate(
  bundle: PresentationConfigBundle,
  templateId?: string,
  guildCustomTemplateId?: string
): WidgetTemplateConfig {
  // Precedence: Global Defaults -> Server Configuration -> Widget-Specific Template
  const defaultTpl = normalizeWidgetTemplateConfig(bundle.widgetDefault, DEFAULT_WIDGET_TEMPLATE);
  const chosenId = templateId || guildCustomTemplateId || "default";
  if (!chosenId || chosenId === "default") {
    return defaultTpl;
  }
  const found = (bundle.widgetTemplates || []).find((t) => t.id === chosenId);
  return found ? normalizeWidgetTemplateConfig(found, defaultTpl) : defaultTpl;
}

export function getHeroActiveMessages(hero: HeroConfig): HeroMessageItem[] {
  const enabled = (hero.messages || []).filter((m) => m && m.enabled && m.text.trim());
  if (enabled.length > 0) return enabled;
  const fallback = (hero.messages || []).find((m) => m?.isDefault && m.text.trim());
  if (fallback) return [fallback];
  return DEFAULT_HERO_CONFIG.messages;
}
