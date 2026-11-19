import test from "node:test";
import assert from "node:assert/strict";
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
import { hasManageServerPermission } from "../../commands";

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
