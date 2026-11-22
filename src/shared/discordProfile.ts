export interface DiscordNameplateAppearance {
  label: string | null;
  palette: string | null;
}

export interface DiscordPrimaryGuildAppearance {
  tag: string | null;
  badgeUrl: string | null;
}

export interface DiscordProfileAppearance {
  globalName: string | null;
  bannerUrl: string | null;
  accentColor: string | null;
  avatarDecorationUrl: string | null;
  nameplate: DiscordNameplateAppearance | null;
  primaryGuild: DiscordPrimaryGuildAppearance | null;
}

export const EMPTY_DISCORD_PROFILE_APPEARANCE: DiscordProfileAppearance = {
  globalName: null,
  bannerUrl: null,
  accentColor: null,
  avatarDecorationUrl: null,
  nameplate: null,
  primaryGuild: null,
};

const DISCORD_CDN = "https://cdn.discordapp.com";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : null;
}

function safeHash(value: unknown): string | null {
  return typeof value === "string" && /^[a-zA-Z0-9_]{1,128}$/.test(value) ? value : null;
}

function isDiscordCdnUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "cdn.discordapp.com";
  } catch {
    return false;
  }
}

function getImageExtension(hash: string): { extension: string; animated: string } {
  return hash.startsWith("a_")
    ? { extension: "webp", animated: "&animated=true" }
    : { extension: "png", animated: "" };
}

export function getDiscordAvatarUrl(userId: string, avatarHash: unknown, size = 256): string {
  if (!/^\d+$/.test(userId)) return "";
  const hash = safeHash(avatarHash);
  if (hash) {
    const { extension, animated } = getImageExtension(hash);
    return `${DISCORD_CDN}/avatars/${userId}/${hash}.${extension}?size=${size}${animated}`;
  }
  const defaultAvatarIndex = Number((BigInt(userId) >> 22n) % 6n);
  return `${DISCORD_CDN}/embed/avatars/${defaultAvatarIndex}.png`;
}

export function normalizeDiscordProfileAppearance(
  value: unknown
): DiscordProfileAppearance | null {
  if (!isRecord(value)) return null;

  const rawNameplate = isRecord(value.nameplate) ? value.nameplate : null;
  const rawPrimaryGuild = isRecord(value.primaryGuild) ? value.primaryGuild : null;
  const nameplateLabel = boundedText(rawNameplate?.label, 48);
  const nameplatePalette = boundedText(rawNameplate?.palette, 32);
  const primaryGuildTag = boundedText(rawPrimaryGuild?.tag, 8);
  const primaryGuildBadge = isDiscordCdnUrl(rawPrimaryGuild?.badgeUrl)
    ? rawPrimaryGuild.badgeUrl
    : null;

  return {
    globalName: boundedText(value.globalName, 64),
    bannerUrl: isDiscordCdnUrl(value.bannerUrl) ? value.bannerUrl : null,
    accentColor:
      typeof value.accentColor === "string" && /^#[\da-f]{6}$/i.test(value.accentColor)
        ? value.accentColor
        : null,
    avatarDecorationUrl: isDiscordCdnUrl(value.avatarDecorationUrl)
      ? value.avatarDecorationUrl
      : null,
    nameplate:
      nameplateLabel || nameplatePalette
        ? { label: nameplateLabel, palette: nameplatePalette }
        : null,
    primaryGuild:
      primaryGuildTag || primaryGuildBadge
        ? { tag: primaryGuildTag, badgeUrl: primaryGuildBadge }
        : null,
  };
}

export function buildDiscordProfileAppearance(
  userId: string,
  userData: unknown
): DiscordProfileAppearance {
  if (!isRecord(userData) || !/^\d+$/.test(userId)) {
    return { ...EMPTY_DISCORD_PROFILE_APPEARANCE };
  }

  const bannerHash = safeHash(userData.banner);
  const decorationData = isRecord(userData.avatar_decoration_data)
    ? userData.avatar_decoration_data
    : null;
  const decorationAsset = safeHash(decorationData?.asset);
  const collectibles = isRecord(userData.collectibles) ? userData.collectibles : null;
  const rawNameplate = isRecord(collectibles?.nameplate) ? collectibles.nameplate : null;
  const rawPrimaryGuild = isRecord(userData.primary_guild) ? userData.primary_guild : null;
  const primaryGuildId =
    typeof rawPrimaryGuild?.identity_guild_id === "string" &&
    /^\d+$/.test(rawPrimaryGuild.identity_guild_id)
      ? rawPrimaryGuild.identity_guild_id
      : null;
  const primaryGuildBadge = safeHash(rawPrimaryGuild?.badge);
  const accentColor =
    typeof userData.accent_color === "number" &&
    Number.isInteger(userData.accent_color) &&
    userData.accent_color >= 0 &&
    userData.accent_color <= 0xffffff
      ? `#${userData.accent_color.toString(16).padStart(6, "0")}`
      : null;

  const banner = bannerHash
    ? getImageExtension(bannerHash)
    : null;
  const profile = {
    globalName: userData.global_name,
    bannerUrl: banner
      ? `${DISCORD_CDN}/banners/${userId}/${bannerHash}.${banner.extension}?size=1024${banner.animated}`
      : null,
    accentColor,
    avatarDecorationUrl: decorationAsset
      ? `${DISCORD_CDN}/avatar-decoration-presets/${decorationAsset}.png?size=128`
      : null,
    nameplate: rawNameplate
      ? {
          label: rawNameplate.label,
          palette: rawNameplate.palette,
        }
      : null,
    primaryGuild:
      rawPrimaryGuild && (rawPrimaryGuild.tag || (primaryGuildId && primaryGuildBadge))
        ? {
            tag: rawPrimaryGuild.tag,
            badgeUrl:
              primaryGuildId && primaryGuildBadge
                ? `${DISCORD_CDN}/guild-tag-badges/${primaryGuildId}/${primaryGuildBadge}.png?size=32`
                : null,
          }
        : null,
  };

  return (
    normalizeDiscordProfileAppearance(profile) ?? {
      ...EMPTY_DISCORD_PROFILE_APPEARANCE,
    }
  );
}
