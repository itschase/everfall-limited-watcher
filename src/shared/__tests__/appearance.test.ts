import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SITE_ICON_DEFINITIONS,
  isValidSiteIconKey,
  sanitizeSiteIconKey,
  searchSiteIcons,
} from "../icons";
import { SiteIcon } from "../../web/components/common/SiteIcon";
import { normalizePageExtensions } from "../pageSections";

test("expanded icon catalog preserves saved identifiers and every choice renders a vector", () => {
  const legacy = [
    "none",
    "bell",
    "megaphone",
    "radio",
    "send",
    "zap",
    "car-front",
    "gauge",
    "flame",
    "star",
    "award",
    "images",
    "eye",
    "sparkles",
    "layout-panel-top",
    "layout-dashboard",
    "sliders-horizontal",
    "layers",
    "bot",
    "users",
    "terminal",
    "server",
    "activity",
    "clock",
    "refresh-cw",
    "history",
    "wrench",
    "database",
    "hard-drive",
    "cpu",
    "globe",
    "shield-check",
    "check-circle-2",
    "lock",
    "file-text",
    "scale",
    "info",
  ];
  for (const key of legacy)
    assert.ok(isValidSiteIconKey(key), `Saved icon remains supported: ${key}`);
  assert.ok(SITE_ICON_DEFINITIONS.length >= 150);
  assert.equal(
    new Set(SITE_ICON_DEFINITIONS.map((icon) => icon.key)).size,
    SITE_ICON_DEFINITIONS.length,
  );
  for (const icon of SITE_ICON_DEFINITIONS) {
    const html = renderToStaticMarkup(
      createElement(SiteIcon, { name: icon.key }),
    );
    if (icon.key === "none") assert.equal(html, "");
    else {
      assert.match(html, /<svg/);
      assert.doesNotMatch(html, /undefined|<script|onerror=/);
    }
  }
  assert.equal(sanitizeSiteIconKey('<svg onload="alert(1)">', "none"), "none");
  assert.equal(sanitizeSiteIconKey("unknown-icon", "bell"), "bell");
});

test("icon search supports purpose keywords, multiple words and scoped categories", () => {
  assert.ok(
    searchSiteIcons("notification").some((icon) => icon.key === "bell"),
  );
  assert.ok(
    searchSiteIcons("privacy").some((icon) => icon.key === "file-text"),
  );
  assert.ok(
    searchSiteIcons("vehicle automobile", "Vehicles").some(
      (icon) => icon.key === "car-front",
    ),
  );
  assert.equal(searchSiteIcons("notification", "Vehicles").length, 0);
  assert.equal(searchSiteIcons("<script>").length, 0);
  assert.equal(searchSiteIcons("   ").length, SITE_ICON_DEFINITIONS.length);
});

test("new section presentation options survive normalization and unsafe settings fall back", () => {
  const source: any = {
    extraSections: [
      {
        id: "appearance",
        title: "Details",
        body: "Useful content",
        enabled: true,
        icon: "camera",
        contentWidth: "wide",
        iconSize: "large",
        buttonStyle: "primary",
        buttonUrl: "https://example.com/",
        alignment: "center",
        spacing: "compact",
        style: "bordered",
      },
    ],
  };
  const normalized = normalizePageExtensions(source, {});
  assert.equal(normalized.extraSections?.[0].contentWidth, "wide");
  assert.equal(normalized.extraSections?.[0].iconSize, "large");
  assert.equal(normalized.extraSections?.[0].buttonStyle, "primary");
  assert.equal(normalized.extraSections?.[0].icon, "camera");
  assert.deepEqual(normalizePageExtensions(normalized, {}), normalized);
  const invalid = normalizePageExtensions(
    {
      extraSections: [
        {
          ...source.extraSections[0],
          contentWidth: "10000px",
          iconSize: "url(evil)",
          buttonStyle: "script",
          icon: "<svg>",
          buttonUrl: "javascript:alert(1)",
        },
      ],
    },
    {},
  );
  assert.equal(invalid.extraSections?.[0].contentWidth, "standard");
  assert.equal(invalid.extraSections?.[0].iconSize, "medium");
  assert.equal(invalid.extraSections?.[0].buttonStyle, "outline");
  assert.equal(invalid.extraSections?.[0].icon, "none");
  assert.equal(invalid.extraSections?.[0].buttonUrl, "");
});
