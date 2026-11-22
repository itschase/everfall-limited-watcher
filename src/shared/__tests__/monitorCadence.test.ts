import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CHECK_INTERVAL_LABEL,
  CHECK_INTERVAL_SHORT,
  STORE_MONITOR_INTERVAL_MINUTES,
} from "../appConfig";
import { DEFAULT_SITE_PAGES_CONFIG, normalizeSitePagesConfig } from "../presentation";
import { HomePageSections } from "../../web/features/homepage/HomePageSections";

test("saved homepage-only cadence overrides cannot disagree with the shared source", () => {
  const home = {
    ...DEFAULT_SITE_PAGES_CONFIG.home,
    showHero: false,
    showTelemetry: true,
    showListingsSection: false,
    showFeaturesSection: false,
    showSlashCommands: false,
    scheduledCheckMode: "custom" as const,
    scheduledCheckMinutes: STORE_MONITOR_INTERVAL_MINUTES + 8,
  };
  const normalized = normalizeSitePagesConfig({ ...DEFAULT_SITE_PAGES_CONFIG, home });
  assert.equal(normalized.home.scheduledCheckMode, "automatic");
  assert.equal(normalized.home.scheduledCheckMinutes, STORE_MONITOR_INTERVAL_MINUTES);
  // Exercise raw legacy props too: previews must not revive the old override.
  const html = renderToStaticMarkup(createElement(HomePageSections, {
    homePageCopy: home,
    previewMode: true,
  }));
  assert.ok(html.includes(CHECK_INTERVAL_SHORT));
  assert.ok(!html.includes(`Every ${home.scheduledCheckMinutes}m`));
});

test("saved built-in workflow cadence follows source without changing unrelated numbers or custom copy", () => {
  const legacy = "Automated runners inspect the Everfall Limited Cars category (every 7 minutes) and cross-verify package pages before updating state.";
  const delivery = "Your vehicle can take up to 21 minutes to arrive.";
  const custom = "Our custom team checks this page every 23 minutes.";
  const pages = normalizeSitePagesConfig({
    ...DEFAULT_SITE_PAGES_CONFIG,
    features: {
      ...DEFAULT_SITE_PAGES_CONFIG.features,
      workflowSteps: [
        { id: "feat-step-detect", title: "Detection", description: legacy, enabled: true, icon: "activity" },
        { id: "delivery", title: "Delivery", description: delivery, enabled: true, icon: "car-front" },
        { id: "custom", title: "Custom", description: custom, enabled: true, icon: "activity" },
      ],
    },
  });
  assert.ok(pages.features.workflowSteps![0].description.includes(CHECK_INTERVAL_LABEL.toLowerCase()));
  assert.equal(pages.features.workflowSteps![1].description, delivery);
  assert.equal(pages.features.workflowSteps![2].description, custom);
  assert.deepEqual(normalizeSitePagesConfig(pages), pages);
});
