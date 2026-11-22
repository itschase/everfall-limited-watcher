import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSitePagesConfig } from "../presentation";
test("approved copy refreshes exact legacy defaults while preserving custom content, legal text and layout settings", () => {
  const source: any = { home: { sectionTitle: "Verified Release Archive", showHero: false, featureCards: [{ id: "home-roles", title: "Mention Roles", description: "Our own community wording", icon: "users", enabled: true }] }, features: { heading: "A custom collector headline" }, about: { architectureHeading: "Infrastructure & Data Integrity" }, privacy: { heading: "Our custom privacy notice" } };
  const result = normalizeSitePagesConfig(source);
  assert.equal(result.home.sectionTitle, "Recent Limited Vehicles");
  assert.equal(result.home.featureCards?.[0].title, "Notify Your Community");
  assert.equal(result.home.featureCards?.[0].description, "Our own community wording");
  assert.equal(result.home.showHero, false);
  assert.equal(result.features.heading, "A custom collector headline");
  assert.equal(result.about.architectureHeading, "Keeping Listing History Reliable");
  assert.equal(result.privacy.heading, "Our custom privacy notice");
  assert.deepEqual(normalizeSitePagesConfig(result), result);
  assert.equal(source.home.sectionTitle, "Verified Release Archive");
});
