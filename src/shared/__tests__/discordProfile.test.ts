import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDiscordProfileAppearance,
  getDiscordAvatarUrl,
  normalizeDiscordProfileAppearance,
} from "../discordProfile";
import { createSessionToken, verifySessionCookie } from "../../admin";

test("builds only documented Discord CDN profile assets", () => {
  const profile = buildDiscordProfileAppearance("123456789012345678", {
    global_name: "Everfall Creator",
    banner: "a_bannerhash",
    accent_color: 0xabcdef,
    avatar_decoration_data: { asset: "decoration_hash" },
    collectibles: { nameplate: { label: "Twilight", palette: "purple" } },
    primary_guild: {
      identity_guild_id: "234567890123456789",
      tag: "EVF",
      badge: "badge_hash",
    },
  });

  assert.equal(profile.globalName, "Everfall Creator");
  assert.equal(
    profile.bannerUrl,
    "https://cdn.discordapp.com/banners/123456789012345678/a_bannerhash.webp?size=1024&animated=true"
  );
  assert.equal(profile.accentColor, "#abcdef");
  assert.equal(
    profile.avatarDecorationUrl,
    "https://cdn.discordapp.com/avatar-decoration-presets/decoration_hash.png?size=128"
  );
  assert.deepEqual(profile.nameplate, { label: "Twilight", palette: "purple" });
  assert.deepEqual(profile.primaryGuild, {
    tag: "EVF",
    badgeUrl:
      "https://cdn.discordapp.com/guild-tag-badges/234567890123456789/badge_hash.png?size=32",
  });
});

test("rejects malformed or non-Discord profile asset URLs", () => {
  const profile = normalizeDiscordProfileAppearance({
    bannerUrl: "https://example.com/banner.png",
    accentColor: "red",
    avatarDecorationUrl: "javascript:alert(1)",
    nameplate: { label: "x".repeat(80), palette: "javascript:alert(1)" },
    primaryGuild: {
      tag: "x".repeat(12),
      badgeUrl: "https://example.com/badge.png",
    },
  });

  assert.ok(profile);
  assert.equal(profile.bannerUrl, null);
  assert.equal(profile.accentColor, null);
  assert.equal(profile.avatarDecorationUrl, null);
  assert.equal(profile.nameplate?.label?.length, 48);
  assert.equal(profile.primaryGuild?.tag?.length, 8);
  assert.equal(profile.primaryGuild?.badgeUrl, null);
});

test("keeps rich Discord appearance in the signed session cookie", async () => {
  const profile = buildDiscordProfileAppearance("123456789012345678", {
    global_name: "Creator",
    banner: "bannerhash",
  });
  const secret = "profile_test_session_secret_0123456789";
  const token = await createSessionToken(
    "123456789012345678",
    "creator",
    getDiscordAvatarUrl("123456789012345678", "avatarhash"),
    secret,
    profile
  );
  const sessionUser = await verifySessionCookie(`everfall_session=${token}`, secret);

  assert.equal(sessionUser?.profile?.globalName, "Creator");
  assert.equal(sessionUser?.profile?.bannerUrl, profile.bannerUrl);
});
