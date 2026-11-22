import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VehicleCardsGuide } from "../../web/features/dashboard/PresentationGuide";
import { createDefaultPresentationConfig } from "../presentation";
import type { ListingItem } from "../../web/lib/api";

test("Operator vehicle guide renders the published Discord announcement for each stock state", () => {
  const announcements = createDefaultPresentationConfig().announcements;
  announcements.inStock.titlePrefix = "Server drop announcement";
  announcements.soldOut.titlePrefix = "Server sold-out update";
  const listing: ListingItem = {
    id: "7815819", name: "Seraph GTS", description: "Custom sound with limited availability",
    url: "https://store.everfallcommunity.com/package/7815819",
    images: Array.from({ length: 7 }, (_, index) => `https://images.example/vehicle-${index}.webp`),
    isAvailable: true, detectedAt: 1760000000000, lastVerifiedAt: 1760000060000,
    soldOutAt: null, lastHttpStatus: 200, readiness: "ready",
  };
  for (const isAvailable of [true, false]) {
    const html = renderToStaticMarkup(createElement(VehicleCardsGuide, {
      listings: [{ ...listing, isAvailable, soldOutAt: isAvailable ? null : 1760000120000 }],
      announcements, monitorStatus: null, portalOrigin: "https://portal.example",
    }));
    assert.match(html, isAvailable ? /Server drop announcement/ : /Server sold-out update/);
    assert.match(html, /data-preview-region="announcement-0"/);
    assert.match(html, /Discord image gallery/);
    assert.match(html, /Member action links/);
    assert.match(html, /vehicle-6.webp/);
    assert.doesNotMatch(html, /View Metadata &amp; Specs|First Recorded:|vehicle-title|vehicle-price/);
  }
  const missing = renderToStaticMarkup(createElement(VehicleCardsGuide, { listings: [listing], monitorStatus: null }));
  assert.match(missing, /announcement format is unavailable/);
  assert.doesNotMatch(missing, /data-preview-region="announcement-/);
});

test("Operator guide handles an empty catalog without inventing a preview", () => {
  const html = renderToStaticMarkup(createElement(VehicleCardsGuide, { listings: [], monitorStatus: null }));
  assert.match(html, /No vehicles are available for preview/);
  assert.doesNotMatch(html, /data-preview-region="announcement-/);
});
