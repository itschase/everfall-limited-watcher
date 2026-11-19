export type FeatureIconName =
  | "sparkles"
  | "volume"
  | "wrench"
  | "clock"
  | "shield"
  | "zap"
  | "star"
  | "gauge"
  | "tag"
  | "flame"
  | "award"
  | "check";

export type FeatureSurface = "card" | "in_stock_embed" | "sold_out_embed" | "widget";

export interface EmojiReference {
  kind: "unicode" | "custom";
  id?: string;
  name: string;
  animated?: boolean;
  source?: "unicode" | "application" | "guild";
  guildId?: string;
  guildName?: string;
  imageUrl?: string;
}

export interface VehicleFeature {
  key: string;
  label: string;
  value?: string;
  icon: FeatureIconName;
  emoji?: EmojiReference | null;
  visibleOn?: FeatureSurface[];
  priority: number;
  source: "extracted" | "admin";
}

export interface ExtractedVehicleMetadata {
  quantityLimited: boolean;
  customSound: boolean;
  customOptionsCount: number | null;
  customOptionsIsOver: boolean;
  customOptionsLabel: string | null;
  tradingRestriction: string | null;
  deliveryInfo: string | null;
  timeLimited: boolean;
  features: VehicleFeature[];
  shortSummary: string;
}

export interface VehicleMetadataOverride {
  listingId: string;
  displayName?: string;
  shortDescription?: string;
  fullDescription?: string;
  featuresOverride?: VehicleFeature[] | null;
  hiddenFeatureKeys?: string[];
  updatedAt: number;
  updatedBy?: string;
}

export interface ListingSourceInput {
  id: string;
  name: string;
  description: string;
  url?: string;
  images?: string[];
}

export interface NormalizedListingPresentation {
  listingId: string;
  source: {
    name: string;
    description: string;
    url: string;
    images: string[];
    extracted: ExtractedVehicleMetadata;
  };
  override: VehicleMetadataOverride | null;
  effective: {
    name: string;
    shortDescription: string;
    fullDescription: string;
    features: VehicleFeature[];
    tradingRestriction: string | null;
    deliveryInfo: string | null;
    hasOverrides: boolean;
  };
}

export const DEFAULT_FEATURE_ORDER = [
  "quantity_limited",
  "custom_sound",
  "custom_options",
] as const;

export const SUPPORTED_FEATURE_TEMPLATES: Array<{
  key: string;
  label: string;
  icon: FeatureIconName;
  priority: number;
}> = [
  { key: "quantity_limited", label: "Quantity Limited", icon: "sparkles", priority: 10 },
  { key: "custom_sound", label: "Custom Sound", icon: "volume", priority: 20 },
  { key: "custom_options", label: "Custom Options", icon: "wrench", priority: 30 },
  { key: "time_limited", label: "Time Limited", icon: "clock", priority: 40 },
  { key: "custom_handling", label: "Custom Handling", icon: "gauge", priority: 45 },
  { key: "special_effects", label: "Special Effects", icon: "flame", priority: 50 },
  { key: "exclusive_upgrades", label: "Exclusive Upgrades", icon: "award", priority: 55 },
  { key: "unique_appearance", label: "Unique Appearance", icon: "star", priority: 60 },
  { key: "trading_restricted", label: "Limited-Only Trading", icon: "shield", priority: 70 },
];

export function normalizeWhitespace(text: string): string {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractVehicleMetadata(
  _name: string,
  description: string,
  _url?: string
): ExtractedVehicleMetadata {
  const cleanDesc = normalizeWhitespace(description);
  const lower = cleanDesc.toLowerCase();
  const features: VehicleFeature[] = [];

  // 1. Quantity Limited (Priority 10)
  const quantityLimited =
    /\bquantity[\s-]+limited\b/i.test(cleanDesc) ||
    /\blimited[\s-]+quantity\b/i.test(cleanDesc);
  if (quantityLimited) {
    features.push({
      key: "quantity_limited",
      label: "Quantity Limited",
      value: "Yes",
      icon: "sparkles",
      priority: 10,
      source: "extracted",
    });
  }

  // 2. Custom Sound (Priority 20)
  const customSound =
    /\bcustom\s+sound\b/i.test(cleanDesc) ||
    /\bunique\s+(?:vehicle\s+|engine\s+)?sound\b/i.test(cleanDesc) ||
    /\bsound\s+profile\b/i.test(cleanDesc) ||
    /\bengine\s+sound\b/i.test(cleanDesc);
  if (customSound) {
    features.push({
      key: "custom_sound",
      label: "Custom Sound",
      value: "Yes",
      icon: "volume",
      priority: 20,
      source: "extracted",
    });
  }

  // 3. Customization Options Count (Priority 30)
  let customOptionsCount: number | null = null;
  let customOptionsIsOver = false;
  let customOptionsLabel: string | null = null;

  const overMatch = cleanDesc.match(
    /(?:(over|more\s+than|at\s+least)\s+)(\d+)\s*(?:\+\s*)?(?:cosmetic\s+)?(?:customization|custom)\s+options?/i
  );
  const plusOrExactMatch = cleanDesc.match(
    /(\d+)(\+)?\s*(?:cosmetic\s+)?(?:customization|custom)\s+options?/i
  );

  if (overMatch) {
    const count = parseInt(overMatch[2], 10);
    if (Number.isFinite(count) && count > 0) {
      customOptionsCount = count;
      customOptionsIsOver = true;
      customOptionsLabel = `${count}+ Custom Options`;
      features.push({
        key: "custom_options",
        label: customOptionsLabel,
        value: `Over ${count}`,
        icon: "wrench",
        priority: 30,
        source: "extracted",
      });
    }
  } else if (plusOrExactMatch) {
    const count = parseInt(plusOrExactMatch[1], 10);
    const hasPlus = Boolean(plusOrExactMatch[2]);
    if (Number.isFinite(count) && count > 0) {
      customOptionsCount = count;
      customOptionsIsOver = hasPlus;
      customOptionsLabel = hasPlus
        ? `${count}+ Custom Options`
        : `${count} Custom Option${count === 1 ? "" : "s"}`;
      features.push({
        key: "custom_options",
        label: customOptionsLabel,
        value: hasPlus ? `${count}+` : String(count),
        icon: "wrench",
        priority: 30,
        source: "extracted",
      });
    }
  } else if (/\b(?:cosmetic\s+)?customi[sz]ation\b/i.test(lower)) {
    customOptionsLabel = "Custom Options";
    features.push({
      key: "custom_options",
      label: customOptionsLabel,
      value: "Included",
      icon: "wrench",
      priority: 30,
      source: "extracted",
    });
  }

  // 4. Additional verified features (never invent features absent from description)
  const timeLimited =
    /\btime[\s-]+limited\b/i.test(cleanDesc) ||
    /\blimited[\s-]+time\b/i.test(cleanDesc) ||
    /\bavailable\s+until\b/i.test(cleanDesc) ||
    /\bexpires?\s+(?:on|at|in)\b/i.test(cleanDesc);
  if (timeLimited) {
    features.push({
      key: "time_limited",
      label: "Time Limited",
      value: "Yes",
      icon: "clock",
      priority: 40,
      source: "extracted",
    });
  }

  if (/\b(?:custom|unique|bespoke)\s+handling\b/i.test(cleanDesc)) {
    features.push({
      key: "custom_handling",
      label: "Custom Handling",
      value: "Yes",
      icon: "gauge",
      priority: 45,
      source: "extracted",
    });
  }

  if (/\bspecial\s+effects?\b|\bparticle\s+effects?\b|\bexhaust\s+flames?\b/i.test(cleanDesc)) {
    features.push({
      key: "special_effects",
      label: "Special Effects",
      value: "Yes",
      icon: "flame",
      priority: 50,
      source: "extracted",
    });
  }

  if (/\bexclusive\s+upgrades?\b/i.test(cleanDesc)) {
    features.push({
      key: "exclusive_upgrades",
      label: "Exclusive Upgrades",
      value: "Yes",
      icon: "award",
      priority: 55,
      source: "extracted",
    });
  }

  if (/\bunique\s+appearance\b|\bexclusive\s+livery\b/i.test(cleanDesc)) {
    features.push({
      key: "unique_appearance",
      label: "Unique Appearance",
      value: "Yes",
      icon: "star",
      priority: 60,
      source: "extracted",
    });
  }

  // 5. Trading restriction & delivery instructions (extracted cleanly, separate from main badges)
  let tradingRestriction: string | null = null;
  if (/can\s+only\s+be\s+traded\s+with\s+other\s+limiteds/i.test(cleanDesc)) {
    tradingRestriction = "Limited-only trading";
  } else if (/limited[\s-]+only\s+trad/i.test(cleanDesc)) {
    tradingRestriction = "Limited-only trading";
  } else if (/\b(?:non[\s-]?tradable|not\s+tradable|cannot\s+be\s+traded)\b/i.test(cleanDesc)) {
    tradingRestriction = "Non-tradable";
  }

  let deliveryInfo: string | null = null;
  const deliveryMatch = cleanDesc.match(
    /(Your\s+vehicle\s+will\s+be\s+automatically\s+delivered[^.\n]*(?:\.[^.\n]*garage[^.\n]*)?\.?)/i
  );
  if (deliveryMatch) {
    deliveryInfo = deliveryMatch[1].trim();
  } else if (/\bautomatically\s+delivered\b|\bgarage\b/i.test(cleanDesc)) {
    deliveryInfo = "Automatically delivered to your garage.";
  }

  features.sort((a, b) => a.priority - b.priority);

  const shortSummary = buildConciseSummary({
    quantityLimited,
    customSound,
    customOptionsCount,
    customOptionsIsOver,
    customOptionsLabel,
    tradingRestriction,
    timeLimited,
    features,
    fallbackDescription: cleanDesc,
  });

  return {
    quantityLimited,
    customSound,
    customOptionsCount,
    customOptionsIsOver,
    customOptionsLabel,
    tradingRestriction,
    deliveryInfo,
    timeLimited,
    features,
    shortSummary,
  };
}

export function buildConciseSummary(input: {
  quantityLimited?: boolean;
  customSound?: boolean;
  customOptionsCount?: number | null;
  customOptionsIsOver?: boolean;
  customOptionsLabel?: string | null;
  tradingRestriction?: string | null;
  timeLimited?: boolean;
  features: VehicleFeature[];
  fallbackDescription?: string;
}): string {
  const parts: string[] = [];

  if (input.customOptionsCount && input.customOptionsCount > 0) {
    if (input.customOptionsIsOver) {
      parts.push(`Over ${input.customOptionsCount} cosmetic customization options`);
    } else {
      parts.push(
        `${input.customOptionsCount} cosmetic customization option${input.customOptionsCount === 1 ? "" : "s"}`
      );
    }
  } else if (input.customOptionsLabel) {
    parts.push("cosmetic customization options");
  }

  if (input.customSound) {
    parts.push("a custom sound profile");
  }

  const extraFeatures = input.features.filter(
    (f) =>
      f.key !== "quantity_limited" &&
      f.key !== "custom_sound" &&
      f.key !== "custom_options" &&
      f.key !== "time_limited"
  );
  for (const extra of extraFeatures.slice(0, 2)) {
    parts.push(extra.label.toLowerCase());
  }

  if (input.quantityLimited && input.timeLimited) {
    parts.push("time- and quantity-limited availability");
  } else if (input.quantityLimited) {
    parts.push("limited-release availability");
  } else if (input.timeLimited) {
    parts.push("time-limited availability");
  }

  if (parts.length > 0) {
    const joined =
      parts.length === 1
        ? parts[0]
        : parts.length === 2
          ? `${parts[0]} and ${parts[1]}`
          : `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
    const capitalized = joined.charAt(0).toUpperCase() + joined.slice(1);
    return `${capitalized}.`;
  }

  const raw = normalizeWhitespace(input.fallbackDescription || "");
  if (!raw) return "Limited-edition vehicle release on Everfall Store.";
  const firstPara = raw.split("\n\n")[0] || raw;
  return firstPara.length > 150 ? `${firstPara.slice(0, 147).trimEnd()}...` : firstPara;
}

export function sortAndFilterFeatures(
  features: VehicleFeature[],
  surface: FeatureSurface,
  options?: {
    featureOrder?: string[];
    featureLabelOverrides?: Record<string, string>;
    hiddenFeatureKeys?: string[];
    maxCount?: number;
  }
): VehicleFeature[] {
  const hiddenSet = new Set(options?.hiddenFeatureKeys || []);
  const orderList = options?.featureOrder && options.featureOrder.length > 0
    ? options.featureOrder
    : [...DEFAULT_FEATURE_ORDER];
  const orderMap = new Map(orderList.map((key, idx) => [key, idx]));

  const visible = features
    .filter((feat) => {
      if (!feat || !feat.key || !feat.label) return false;
      if (hiddenSet.has(feat.key)) return false;
      if (Array.isArray(feat.visibleOn) && !feat.visibleOn.includes(surface)) return false;
      return true;
    })
    .map((feat) => {
      const overrideLabel = options?.featureLabelOverrides?.[feat.key]?.trim();
      return overrideLabel ? { ...feat, label: overrideLabel } : feat;
    });

  visible.sort((a, b) => {
    const idxA = orderMap.has(a.key) ? (orderMap.get(a.key) as number) : 1000 + a.priority;
    const idxB = orderMap.has(b.key) ? (orderMap.get(b.key) as number) : 1000 + b.priority;
    if (idxA !== idxB) return idxA - idxB;
    return a.priority - b.priority;
  });

  if (options?.maxCount && options.maxCount > 0) {
    return visible.slice(0, options.maxCount);
  }
  return visible;
}

export function resolveListingPresentation(
  source: ListingSourceInput,
  override?: VehicleMetadataOverride | null
): NormalizedListingPresentation {
  const sourceName = String(source.name || `Limited Vehicle #${source.id}`).trim();
  const sourceDescription = normalizeWhitespace(
    source.description || "Limited-edition vehicle listing on Everfall Store."
  );
  const sourceUrl = String(
    source.url || `https://store.everfallcommunity.com/package/${source.id}`
  );
  const sourceImages = Array.isArray(source.images) ? source.images : [];

  const extracted = extractVehicleMetadata(sourceName, sourceDescription, sourceUrl);

  const hasNameOverride = Boolean(override?.displayName && override.displayName.trim());
  const hasFullDescOverride = Boolean(
    override?.fullDescription && override.fullDescription.trim()
  );
  const hasShortDescOverride = Boolean(
    override?.shortDescription && override.shortDescription.trim()
  );
  const hasFeaturesOverride = Array.isArray(override?.featuresOverride);
  const hiddenSet = new Set(override?.hiddenFeatureKeys || []);

  const rawFeatures = hasFeaturesOverride
    ? (override!.featuresOverride || [])
    : extracted.features;

  const normalizedFeatures: VehicleFeature[] = rawFeatures
    .filter((f) => f && f.key && f.label && !hiddenSet.has(f.key))
    .map((f, index) => ({
      ...f,
      priority: typeof f.priority === "number" ? f.priority : (index + 1) * 10,
      source: f.source || (hasFeaturesOverride ? "admin" : "extracted"),
    }));

  if (!hasFeaturesOverride) {
    normalizedFeatures.sort((a, b) => a.priority - b.priority);
  }

  const fullDescription = hasFullDescOverride
    ? normalizeWhitespace(override!.fullDescription!)
    : sourceDescription;

  const shortDescription = hasShortDescOverride
    ? normalizeWhitespace(override!.shortDescription!)
    : hasFeaturesOverride
      ? buildConciseSummary({
          quantityLimited: normalizedFeatures.some((f) => f.key === "quantity_limited"),
          customSound: normalizedFeatures.some((f) => f.key === "custom_sound"),
          customOptionsLabel:
            normalizedFeatures.find((f) => f.key === "custom_options")?.label || null,
          timeLimited: normalizedFeatures.some((f) => f.key === "time_limited"),
          features: normalizedFeatures,
          fallbackDescription: fullDescription,
        })
      : extracted.shortSummary;

  const hasOverrides = Boolean(
    override &&
      (hasNameOverride ||
        hasShortDescOverride ||
        hasFullDescOverride ||
        hasFeaturesOverride ||
        hiddenSet.size > 0)
  );

  return {
    listingId: source.id,
    source: {
      name: sourceName,
      description: sourceDescription,
      url: sourceUrl,
      images: sourceImages,
      extracted,
    },
    override: override ?? null,
    effective: {
      name: hasNameOverride ? override!.displayName!.trim() : sourceName,
      shortDescription,
      fullDescription,
      features: normalizedFeatures,
      tradingRestriction: extracted.tradingRestriction,
      deliveryInfo: extracted.deliveryInfo,
      hasOverrides,
    },
  };
}
