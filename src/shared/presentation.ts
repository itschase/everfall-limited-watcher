import {
  DEFAULT_FEATURE_ORDER,
  EmojiReference,
  ListingSourceInput,
  resolveListingPresentation,
  sortAndFilterFeatures,
  VehicleFeature,
  VehicleMetadataOverride,
} from "./features";

export type DiscordEmojiRef = EmojiReference;

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
  showDeliveryInfo: boolean;
  showDetectionTime: boolean;
  showLastVerified: boolean;
  showSoldOutTime: boolean;
  galleryMode: "all_gallery" | "primary_only" | "custom_slot" | "none";
  primaryImageSlot: number;
  footerText: string;
  footerEmoji?: DiscordEmojiRef | null;
  showStoreButton: boolean;
  storeButtonLabel: string;
  storeButtonEmoji?: DiscordEmojiRef | null;
  storeButtonUrlMode: "listing" | "category" | "store_home" | "website";
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
  showTimestamps: boolean;
  showStaleWarning: boolean;
  staleWarningText: string;
  emptyStateMessage: string;
  footerText: string;
  footerEmoji?: DiscordEmojiRef | null;
  viewButtonLabel: string;
  showButtonsRow: boolean;
  websiteButtonLabel: string;
  websiteButtonEmoji?: DiscordEmojiRef | null;
  storeButtonLabel: string;
  storeButtonEmoji?: DiscordEmojiRef | null;
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

export const STORE_CATEGORY_URL = "https://store.everfallcommunity.com/category/limited-cars";
export const STORE_HOME_URL = "https://store.everfallcommunity.com/";

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
  showDeliveryInfo: true,
  showDetectionTime: true,
  showLastVerified: true,
  showSoldOutTime: false,
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
  showDeliveryInfo: false,
  showDetectionTime: true,
  showLastVerified: true,
  showSoldOutTime: true,
  galleryMode: "all_gallery",
  primaryImageSlot: 0,
  footerText: "Everfall Limited Watcher • Archived Sold Out Listing",
  footerEmoji: null,
  showStoreButton: true,
  storeButtonLabel: "Open Everfall Store",
  storeButtonEmoji: null,
  storeButtonUrlMode: "store_home",
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
  showTimestamps: true,
  showStaleWarning: true,
  staleWarningText: "Latest store check could not verify live stock; showing last verified history.",
  emptyStateMessage: "No limited vehicles have been recorded in the store catalog yet.",
  footerText: "Everfall Limited Watcher • Live Status Widget",
  footerEmoji: null,
  viewButtonLabel: "View",
  showButtonsRow: true,
  websiteButtonLabel: "Live Archive",
  websiteButtonEmoji: null,
  storeButtonLabel: "Everfall Store",
  storeButtonEmoji: null,
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

export function createDefaultPresentationConfig(): PresentationConfigBundle {
  return {
    version: 1,
    updatedAt: Date.now(),
    announcements: {
      inStock: { ...DEFAULT_IN_STOCK_TEMPLATE, featureOrder: [...DEFAULT_IN_STOCK_TEMPLATE.featureOrder] },
      soldOut: { ...DEFAULT_SOLD_OUT_TEMPLATE, featureOrder: [...DEFAULT_SOLD_OUT_TEMPLATE.featureOrder] },
    },
    widgetDefault: {
      ...DEFAULT_WIDGET_TEMPLATE,
      featureOrder: [...DEFAULT_WIDGET_TEMPLATE.featureOrder],
      featureLabelOverrides: {},
      hiddenFeatureKeys: [],
    },
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
  // Reject HTML injection or oversized junk for unicode strings
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
}

export function buildCarDropPayload(params: BuildCarDropPayloadParams) {
  const { car, override, isTest = false, isUpdate = false } = params;
  const isSoldOut = car.isAvailable === false;
  const defaultTpl = isSoldOut ? DEFAULT_SOLD_OUT_TEMPLATE : DEFAULT_IN_STOCK_TEMPLATE;
  const tpl: AnnouncementTemplate = params.template || defaultTpl;
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
  const titlePrefix = String(tpl.titlePrefix || "").trim();
  const titleParts = [titleEmoji, titlePrefix, presentation.effective.name].filter(Boolean);
  const testBanner = isTest ? "**[TEST NOTIFICATION]**\n" : "";

  const statusEmoji = formatEmojiForDiscordText(tpl.statusEmoji);
  const statusHeading = String(tpl.availabilityHeading || "Availability").trim();
  const statusLabel = String(tpl.statusLabel || (isSoldOut ? "Sold Out" : "In Stock")).trim();

  const featureBlock =
    visibleFeatures.length > 0
      ? formatFeaturesText(visibleFeatures, tpl.featureStyle)
      : "";

  let mainBodyText = presentation.effective.fullDescription;
  if (tpl.descriptionMode === "short_summary") {
    mainBodyText = presentation.effective.shortDescription;
  } else if (tpl.descriptionMode === "custom" && tpl.customDescription.trim()) {
    mainBodyText = tpl.customDescription
      .replace(/\{name\}/gi, presentation.effective.name)
      .replace(/\{short_description\}/gi, presentation.effective.shortDescription)
      .replace(/\{full_description\}/gi, presentation.effective.fullDescription)
      .replace(/\{features\}/gi, featureBlock || "Limited Release")
      .replace(
        /\{trading\}/gi,
        presentation.effective.tradingRestriction || "Standard Store Terms"
      )
      .replace(
        /\{delivery\}/gi,
        presentation.effective.deliveryInfo || "Automatic garage delivery"
      );
  }

  const detectedSec = Math.floor((car.detectedAt || Date.now()) / 1000);
  const verifiedSec = Math.floor((car.lastVerifiedAt || car.detectedAt || Date.now()) / 1000);

  const lines: string[] = [
    `${testBanner}# ${titleParts.join(" ")}`.slice(0, 256),
    `**${statusHeading}:** ${statusEmoji ? `${statusEmoji} ` : ""}${statusLabel}`,
  ];

  if (tpl.descriptionMode !== "custom" && featureBlock) {
    lines.push(featureBlock);
  }

  if (mainBodyText.trim()) {
    lines.push(mainBodyText.trim().slice(0, 2200));
  }

  const extraInfoLines: string[] = [];
  if (tpl.showTradingInfo && presentation.effective.tradingRestriction) {
    extraInfoLines.push(`**Trading:** ${presentation.effective.tradingRestriction}`);
  }
  if (tpl.showDeliveryInfo && presentation.effective.deliveryInfo) {
    extraInfoLines.push(`**Delivery:** ${presentation.effective.deliveryInfo}`);
  }
  if (extraInfoLines.length > 0) {
    lines.push(extraInfoLines.join("\n"));
  }

  const timeLines: string[] = [];
  if (tpl.showDetectionTime) {
    timeLines.push(`**First Detected:** <t:${detectedSec}:f> (<t:${detectedSec}:R>)`);
  }
  if (tpl.showLastVerified) {
    timeLines.push(`**Last Verified:** <t:${verifiedSec}:f>`);
  }
  if (isSoldOut && tpl.showSoldOutTime && car.soldOutAt) {
    const soldOutSec = Math.floor(car.soldOutAt / 1000);
    timeLines.push(`**Confirmed Sold Out:** <t:${soldOutSec}:f> (<t:${soldOutSec}:R>)`);
  }
  if (timeLines.length > 0) {
    lines.push(timeLines.join("\n"));
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

  if (tpl.showStoreButton) {
    let buttonUrl = sanitizeHttpUrl(car.url, `${STORE_HOME_URL}package/${car.id}`);
    if (tpl.storeButtonUrlMode === "store_home") {
      buttonUrl = STORE_HOME_URL;
    } else if (tpl.storeButtonUrlMode === "category") {
      buttonUrl = STORE_CATEGORY_URL;
    } else if (tpl.storeButtonUrlMode === "website" && params.portalOrigin) {
      buttonUrl = sanitizeHttpUrl(params.portalOrigin, STORE_HOME_URL);
    }

    const storeButton: Record<string, any> = {
      type: 2,
      style: 5,
      label: (tpl.storeButtonLabel || "View Store").trim().slice(0, 80),
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
    containerComponents.push({
      type: 1,
      components: [storeButton],
    });
  }

  const footerEmoji = formatEmojiForDiscordText(tpl.footerEmoji);
  const footerParts = [
    [footerEmoji, tpl.footerText?.trim()].filter(Boolean).join(" "),
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
}

export function buildWidgetPayload(params: BuildWidgetPayloadParams) {
  const tpl = params.template || DEFAULT_WIDGET_TEMPLATE;
  const now = params.nowMs || Date.now();
  const staleThreshold = params.staleThresholdMs ?? 30 * 60 * 1000;

  const sortedByRecent = [...params.records].sort((a, b) => b.firstSeenAt - a.firstSeenAt);
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

  const titleEmoji = formatEmojiForDiscordText(tpl.titleEmoji);
  const embedTitle = [titleEmoji, tpl.title || DEFAULT_WIDGET_TEMPLATE.title]
    .filter(Boolean)
    .join(" ")
    .slice(0, 256);

  const descParts: string[] = [];
  if (tpl.subtitle?.trim()) {
    descParts.push(tpl.subtitle.trim());
  }
  if (tpl.introMessage?.trim()) {
    descParts.push(tpl.introMessage.trim());
  }

  if (tpl.showTimestamps) {
    const statusText = isBlocked
      ? "Verification Blocked (Using Verified History)"
      : monitor?.authoritative
        ? `Verified (${sourceLabel})`
        : "Pending Store Check";
    descParts.push(
      `**Last Store Check:** <t:${checkedSec}:f> (<t:${checkedSec}:R>)` +
        (verifiedSec ? `\n**Last Verified Stock:** <t:${verifiedSec}:R>` : "") +
        `\n**Monitor State:** ${statusText}`
    );
  }

  if (tpl.showStaleWarning && isStale && tpl.staleWarningText?.trim()) {
    descParts.push(`> **Notice:** ${tpl.staleWarningText.trim()}`);
  }

  const inStockEmoji = formatEmojiForDiscordText(tpl.inStockEmoji);
  const soldOutEmoji = formatEmojiForDiscordText(tpl.soldOutEmoji);
  const inStockTag = [inStockEmoji, tpl.inStockLabel || "In Stock"].filter(Boolean).join(" ");
  const soldOutTag = [soldOutEmoji, tpl.soldOutLabel || "Sold Out"].filter(Boolean).join(" ");

  const fields: Array<{ name: string; value: string; inline: boolean }> = [];

  if (tpl.showActiveSummary) {
    const heading = tpl.activeSummaryHeading?.trim() || "Active Listings";
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
        return `${inStockEmoji ? `${inStockEmoji} ` : ""}**${pres.effective.name}** • [${tpl.viewButtonLabel || "View"}](${sanitizeHttpUrl(pres.source.url, `${STORE_HOME_URL}package/${rec.id}`)})`;
      });
      fields.push({
        name: `${heading} (${activeRecords.length})`.slice(0, 256),
        value: activeSummaryLines.join("\n").slice(0, 1024),
        inline: false,
      });
    } else {
      fields.push({
        name: `${heading} (0)`.slice(0, 256),
        value: `No active limited vehicles right now. [${tpl.viewButtonLabel || "View"} Store](${STORE_CATEGORY_URL})`,
        inline: false,
      });
    }
  }

  if (selectedRecords.length === 0) {
    fields.push({
      name: "Recent Limited Releases",
      value: (tpl.emptyStateMessage || DEFAULT_WIDGET_TEMPLATE.emptyStateMessage).slice(0, 1024),
      inline: false,
    });
  } else {
    for (const rec of selectedRecords) {
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

      const statusText = rec.isAvailable ? inStockTag : soldOutTag;
      const storeUrl = rec.isAvailable
        ? sanitizeHttpUrl(pres.source.url, `${STORE_HOME_URL}package/${rec.id}`)
        : `${STORE_HOME_URL}package/${rec.id}`;

      const valueLines: string[] = [
        `${statusText} • [${(tpl.viewButtonLabel || "View").trim().slice(0, 40)}](${storeUrl})`,
      ];

      if (tpl.showFeatures) {
        const feats = sortAndFilterFeatures(pres.effective.features, "widget", {
          featureOrder: tpl.featureOrder,
          featureLabelOverrides: tpl.featureLabelOverrides,
          hiddenFeatureKeys: tpl.hiddenFeatureKeys,
          maxCount: 4,
        });
        for (const f of feats) {
          const fe = formatEmojiForDiscordText(f.emoji);
          valueLines.push(`${fe ? `${fe} ` : "• "}${f.label}`);
        }
      }

      fields.push({
        name: pres.effective.name.slice(0, 256),
        value: valueLines.join("\n").slice(0, 1024),
        inline: true,
      });
    }
  }

  let featuredImageUrl: string | undefined;
  if (tpl.showFeaturedImage && selectedRecords.length > 0) {
    const heroCandidate =
      selectedRecords.find((r) => r.isAvailable) || selectedRecords[0];
    if (heroCandidate) {
      featuredImageUrl = pickValidListingImage(
        heroCandidate.payload?.images,
        tpl.featuredImageSlot ?? 3,
        {
          listingId: heroCandidate.id,
          cacheBustVersion: params.catalogVersion || 1,
          safeOrigin: params.safeOrigin,
        }
      );
    }
  }

  const embedColor = tpl.useDynamicStockColor
    ? activeRecords.length > 0
      ? hexToDiscordInt(tpl.inStockColor, 0x10b981)
      : hexToDiscordInt(tpl.soldOutColor, 0x52525b)
    : hexToDiscordInt(tpl.accentColor, 0x10b981);

  const footerEmojiText =
    tpl.footerEmoji?.kind === "unicode" ? `${tpl.footerEmoji.name} ` : "";
  const embedFooterText = `${footerEmojiText}${tpl.footerText || DEFAULT_WIDGET_TEMPLATE.footerText}`.slice(
    0,
    2048
  );

  const embed: Record<string, any> = {
    title: embedTitle,
    description: descParts.join("\n\n").slice(0, 4096),
    color: embedColor,
    fields: fields.slice(0, 25),
    footer: { text: embedFooterText },
    timestamp: new Date(checkedAt).toISOString(),
  };

  if (featuredImageUrl) {
    embed.image = { url: featuredImageUrl };
  }

  const actionButtons: any[] = [];
  if (tpl.showButtonsRow) {
    if (params.portalOrigin && /^https?:\/\//i.test(params.portalOrigin) && tpl.websiteButtonLabel?.trim()) {
      const btn: any = {
        type: 2,
        style: 5,
        label: tpl.websiteButtonLabel.trim().slice(0, 80),
        url: sanitizeHttpUrl(params.portalOrigin, STORE_HOME_URL),
      };
      const em = formatEmojiForDiscordComponent(tpl.websiteButtonEmoji);
      if (em) btn.emoji = em;
      actionButtons.push(btn);
    }
    if (tpl.storeButtonLabel?.trim()) {
      const btn: any = {
        type: 2,
        style: 5,
        label: tpl.storeButtonLabel.trim().slice(0, 80),
        url: STORE_CATEGORY_URL,
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
  const defaultTpl = bundle.widgetDefault || DEFAULT_WIDGET_TEMPLATE;
  const chosenId = templateId || guildCustomTemplateId || "default";
  if (!chosenId || chosenId === "default") {
    return defaultTpl;
  }
  const found = (bundle.widgetTemplates || []).find((t) => t.id === chosenId);
  return found || defaultTpl;
}

export function getHeroActiveMessages(hero: HeroConfig): HeroMessageItem[] {
  const enabled = (hero.messages || []).filter((m) => m && m.enabled && m.text.trim());
  if (enabled.length > 0) return enabled;
  const fallback = (hero.messages || []).find((m) => m?.isDefault && m.text.trim());
  if (fallback) return [fallback];
  return DEFAULT_HERO_CONFIG.messages;
}
