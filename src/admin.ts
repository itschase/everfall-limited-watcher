// admin.ts – User & Admin Dashboard with Iframe-Safe Discord OAuth2 Authentication

import {
  getAllGuildIds,
  getGuildConfig,
  getEmbedConfig,
  getListingHistory,
  getMonitorStatus,
  setEmbedConfig,
  setGuildConfig,
  EmbedConfig,
  DEFAULT_EMBED_CONFIG,
} from "./kv";
import {
  getKnownCars,
  dispatchListingToGuild,
  manualPullCurrentListings,
  resolvePublicOrigin,
} from "./scraper";
import { EF_LOGO_BASE64 } from "./assets";
import { fetchDiscordWithRetry } from "./discord";

const REDIRECT_PATH = "/auth/callback";
const SESSION_COOKIE = "everfall_session";
const OAUTH_STATE_COOKIE = "everfall_oauth_state";
export const BOT_PERMISSIONS = "8462935362366544";

export interface SessionUser {
  id: string;
  username: string;
  avatarUrl: string;
  isAdmin: boolean;
}

export interface BotGuild {
  id: string;
  name: string;
  icon?: string | null;
  approximate_member_count?: number;
}

export interface GuildChannelOption {
  id: string;
  name: string;
  type: number;
}

export interface GuildRoleOption {
  id: string;
  name: string;
  managed?: boolean;
}

export function getRequestOrigin(request: Request, env: any): string {
  const url = new URL(request.url);
  const protoHeader = request.headers.get("x-forwarded-proto");
  const hostHeader = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const protocol = protoHeader ? protoHeader.split(",")[0].trim() : url.protocol.replace(":", "");
  const host = hostHeader ? hostHeader.split(",")[0].trim() : url.host;
  const hostname = host.split(":")[0];

  const isLocalHost =
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";

  if (!isLocalHost && host) {
    const normalizedProto =
      hostname.endsWith(".run.app") || hostname.endsWith(".workers.dev") ? "https" : protocol;
    return `${normalizedProto}://${host}`;
  }

  const configured = resolvePublicOrigin(env);
  if (configured) return configured;

  return `${protocol}://${host || url.host}`;
}

function isHttpsContext(request: Request, origin: string): boolean {
  return origin.startsWith("https://") || request.headers.get("x-forwarded-proto") === "https";
}

function getCookieAttributes(isHttps: boolean, maxAgeSeconds: number): string {
  return isHttps
    ? `Path=/; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=${maxAgeSeconds}`
    : `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function buildLogoutCookie(request: Request, env: any): string {
  const origin = getRequestOrigin(request, env);
  const isHttps = isHttpsContext(request, origin);
  return `${SESSION_COOKIE}=; ${getCookieAttributes(isHttps, 0)}`;
}

export async function getManagedGuildsForUser(env: any, userId: string): Promise<any[]> {
  if (!env.DISCORD_BOT) return [];
  const raw = await env.DISCORD_BOT.get(`user_guilds:${userId}`);
  if (!raw) return [];
  try {
    const guilds: any[] = JSON.parse(raw);
    return guilds.filter((guild) => {
      if (guild.owner) return true;
      const permissions = BigInt(guild.permissions || "0");
      return (permissions & 0x20n) === 0x20n || (permissions & 0x8n) === 0x8n;
    });
  } catch {
    return [];
  }
}

const BOT_GUILDS_CACHE_KEY = "bot:guilds:cache";
const BOT_GUILDS_STALE_KEY = "bot:guilds:stale";
const BOT_GUILDS_CACHE_TTL = 60;
const BOT_GUILDS_STALE_TTL = 3600;
const GUILD_CONTROLS_CACHE_TTL = 60;
const inFlightBotGuilds = new Map<string, Promise<BotGuild[]>>();

export async function getGuildControlOptions(
  env: any,
  guildId: string,
  forceRefresh = false
): Promise<{ channels: GuildChannelOption[]; roles: GuildRoleOption[]; error?: string }> {
  const token = env.DISCORD_BOT_TOKEN;
  if (!token) return { channels: [], roles: [], error: "DISCORD_BOT_TOKEN is not configured." };

  const kv = env.DISCORD_BOT as KVNamespace;
  const cacheKey = `guild_controls:${guildId}`;
  if (kv && !forceRefresh) {
    const cached = await kv.get(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed?.channels) && Array.isArray(parsed?.roles)) {
          return { channels: parsed.channels, roles: parsed.roles };
        }
      } catch {
        // Ignore malformed cache
      }
    }
  }

  const headers = { Authorization: `Bot ${token}` };
  try {
    const [channelsResponse, rolesResponse] = await Promise.all([
      fetchDiscordWithRetry(`https://discord.com/api/v10/guilds/${guildId}/channels`, { headers }),
      fetchDiscordWithRetry(`https://discord.com/api/v10/guilds/${guildId}/roles`, { headers }),
    ]);
    const channels = channelsResponse.ok
      ? ((await channelsResponse.json()) as GuildChannelOption[])
          .filter((channel) => channel.type === 0 || channel.type === 5)
          .sort((a, b) => a.name.localeCompare(b.name))
      : [];
    const roles = rolesResponse.ok
      ? ((await rolesResponse.json()) as GuildRoleOption[])
          .filter((role) => role.id !== guildId && !role.managed)
          .sort((a, b) => a.name.localeCompare(b.name))
      : [];
    const error =
      !channelsResponse.ok || !rolesResponse.ok
        ? `Discord API returned ${channelsResponse.status}/${rolesResponse.status}`
        : undefined;
    if (!error && kv) {
      await kv.put(cacheKey, JSON.stringify({ channels, roles }), {
        expirationTtl: GUILD_CONTROLS_CACHE_TTL,
      });
    }
    return { channels, roles, error };
  } catch (error) {
    console.error(`Failed to load dashboard controls for guild ${guildId}:`, error);
    return { channels: [], roles: [], error: "Failed to contact Discord API." };
  }
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderAppearanceControls(
  config: EmbedConfig,
  action: string,
  previewListing: any,
  guildId?: string
): string {
  const color = /^#[0-9a-f]{6}$/i.test(config.color || "")
    ? config.color!
    : DEFAULT_EMBED_CONFIG.color;
  const titlePrefix = config.titlePrefix || DEFAULT_EMBED_CONFIG.titlePrefix;
  const footerText = config.footerText || DEFAULT_EMBED_CONFIG.footerText;
  const galleryHeading = config.galleryHeading || DEFAULT_EMBED_CONFIG.galleryHeading;
  const storeButtonLabel = config.storeButtonLabel || DEFAULT_EMBED_CONFIG.storeButtonLabel;
  const showDetectionTime = config.showDetectionTime !== false;
  const image = previewListing?.images?.[0] || "";
  const previewName = previewListing?.name || "Latest discovered listing";
  const previewDesc =
    previewListing?.description?.split("\n\n")[0] ||
    "The most recently discovered listing will appear here.";

  return `
    <form action="${escapeHtml(action)}" method="POST" class="appearance-form">
      ${guildId ? `<input type="hidden" name="guildId" value="${escapeHtml(guildId)}">` : ""}
      <label>Accent Color</label>
      <div class="color-control">
        <input type="color" class="color-picker" value="${escapeHtml(color)}">
        <input type="text" class="color-text" name="color" value="${escapeHtml(color)}" maxlength="7" pattern="#[0-9A-Fa-f]{6}">
      </div>
      <label>Title Prefix / Tag</label>
      <input type="text" name="titlePrefix" value="${escapeHtml(titlePrefix)}" maxlength="120">
      <label>Footer Notice</label>
      <input type="text" name="footerText" value="${escapeHtml(footerText)}" maxlength="200">
      <label>Gallery Heading</label>
      <input type="text" name="galleryHeading" value="${escapeHtml(galleryHeading)}" maxlength="80">
      <label>Store Button Label</label>
      <input type="text" name="storeButtonLabel" maxlength="80" value="${escapeHtml(storeButtonLabel)}">
      <label class="checkbox-label">
        <input type="checkbox" name="showDetectionTime" ${showDetectionTime ? "checked" : ""}>
        Show original discovery time
      </label>
      <div class="discord-preview" style="border-left-color:${escapeHtml(color)}">
        <div class="embed-title">${escapeHtml(titlePrefix)} ${escapeHtml(previewName)}</div>
        <div class="embed-desc">${escapeHtml(previewDesc)}</div>
        <div class="preview-gallery-heading">📸 ${escapeHtml(galleryHeading)}</div>
        <div class="preview-detected" style="display:${showDetectionTime ? "block" : "none"}; font-size:0.78rem; color:#949BA4; margin-bottom:8px;">🕒 Detected: just now</div>
        ${image ? `<img class="embed-img" src="${escapeHtml(image)}" alt="Latest listing preview">` : ""}
        <div class="preview-button">${escapeHtml(storeButtonLabel)}</div>
        <div class="embed-footer">${escapeHtml(footerText)}${showDetectionTime ? " • Today at 12:00 PM" : ""}</div>
      </div>
      <button type="submit" class="btn" data-loading-text="Saving…">💾 Save Appearance</button>
    </form>`;
}

// Helper: HMAC sign & verify for secure session cookies
async function getCryptoKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const entry of cookieHeader.split(";")) {
    const separator = entry.indexOf("=");
    if (separator < 0) continue;
    if (entry.slice(0, separator).trim() === name) return entry.slice(separator + 1).trim();
  }
  return null;
}

export function getSessionSecret(env: any): string {
  return env.DISCORD_CLIENT_SECRET || "";
}

async function signToken(payloadObj: Record<string, unknown>, secret: string): Promise<string> {
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payloadObj)));
  const key = await getCryptoKey(secret);
  const sigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const signature = bytesToBase64Url(new Uint8Array(sigBuffer));
  return `${payload}.${signature}`;
}

async function verifyToken<T = Record<string, any>>(
  token: string,
  secret: string,
  maxAgeMs: number
): Promise<T | null> {
  if (!secret || !token) return null;
  try {
    const separator = token.lastIndexOf(".");
    if (separator < 1) return null;
    const payload = token.slice(0, separator);
    const signature = base64UrlToBytes(token.slice(separator + 1));
    const key = await getCryptoKey(secret);
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      new TextEncoder().encode(payload)
    );
    if (!isValid) return null;
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload)));
    if (
      typeof parsed.issuedAt !== "number" ||
      Date.now() - parsed.issuedAt > maxAgeMs ||
      parsed.issuedAt > Date.now() + 60_000
    ) {
      return null;
    }
    return parsed as T;
  } catch {
    return null;
  }
}

export async function createSessionToken(
  userId: string,
  username: string,
  avatarUrl: string,
  secret: string
): Promise<string> {
  return signToken({ userId, username, avatarUrl, issuedAt: Date.now() }, secret);
}

export async function createSessionCookie(
  userId: string,
  username: string,
  avatarUrl: string,
  secret: string,
  isHttps: boolean
): Promise<string> {
  const token = await createSessionToken(userId, username, avatarUrl, secret);
  return `${SESSION_COOKIE}=${token}; ${getCookieAttributes(isHttps, 86400)}`;
}

export async function verifySessionCookie(
  cookieHeader: string | null,
  secret: string,
  primaryAdministratorId = ""
): Promise<SessionUser | null> {
  if (!secret) return null;
  const value = readCookie(cookieHeader, SESSION_COOKIE);
  if (!value) return null;

  const parsed = await verifyToken<{
    userId: string;
    username: string;
    avatarUrl: string;
    issuedAt: number;
  }>(value, secret, 86400 * 1000);
  if (
    !parsed ||
    typeof parsed.userId !== "string" ||
    typeof parsed.username !== "string" ||
    typeof parsed.avatarUrl !== "string"
  ) {
    return null;
  }

  return {
    id: parsed.userId,
    username: parsed.username,
    avatarUrl: parsed.avatarUrl,
    isAdmin: Boolean(primaryAdministratorId) && parsed.userId === primaryAdministratorId,
  };
}

export async function getCreatorProfile(
  env: any
): Promise<{ id: string; username: string; avatarUrl: string; profileUrl: string }> {
  const primaryAdministratorId = String(env.DISCORD_PRIMARY_ADMINISTRATOR || "151037568484507648").trim();
  const profileUrl = /^\d+$/.test(primaryAdministratorId)
    ? `https://discord.com/users/${primaryAdministratorId}`
    : "";
  const defaultAvatarIndex = /^\d+$/.test(primaryAdministratorId)
    ? (BigInt(primaryAdministratorId) >> 22n) % 6n
    : 0n;
  const defaultAvatar = `https://cdn.discordapp.com/embed/avatars/${defaultAvatarIndex}.png`;
  const defaultProfile = {
    id: primaryAdministratorId,
    username: "xchasex",
    avatarUrl: defaultAvatar,
    profileUrl,
  };

  const kv = env.DISCORD_BOT as KVNamespace;
  if (kv) {
    const cached = await kv.get("creator:profile");
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed && (!parsed.id || parsed.id === primaryAdministratorId)) {
          return {
            id: primaryAdministratorId,
            username: parsed.username || "xchasex",
            avatarUrl: parsed.avatarUrl || defaultAvatar,
            profileUrl,
          };
        }
      } catch {}
    }
  }

  const token = env.DISCORD_BOT_TOKEN;
  if (!token || !/^\d+$/.test(primaryAdministratorId)) return defaultProfile;

  try {
    const res = await fetchDiscordWithRetry(
      `https://discord.com/api/v10/users/${primaryAdministratorId}`,
      { headers: { Authorization: `Bot ${token}` } }
    );
    if (res.ok) {
      const data: any = await res.json();
      const avatarUrl = data.avatar
        ? `https://cdn.discordapp.com/avatars/${primaryAdministratorId}/${data.avatar}.png?size=64`
        : defaultAvatar;
      const profile = {
        id: primaryAdministratorId,
        username: data.username || "xchasex",
        avatarUrl,
        profileUrl,
      };
      if (kv) {
        await kv.put("creator:profile", JSON.stringify(profile));
      }
      return profile;
    }
  } catch (err) {
    console.error("Failed to fetch creator profile:", err);
  }

  return defaultProfile;
}

async function readCachedBotGuilds(kv: KVNamespace | undefined, key: string): Promise<BotGuild[] | null> {
  if (!kv) return null;
  const raw = await kv.get(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.guilds)) return parsed.guilds;
  } catch {
    // Ignore malformed cache
  }
  return null;
}

export async function getBotGuilds(env: any, forceRefresh = false): Promise<BotGuild[]> {
  const token = env.DISCORD_BOT_TOKEN;
  if (!token) return [];

  const kv = env.DISCORD_BOT as KVNamespace | undefined;
  if (!forceRefresh) {
    const cached = await readCachedBotGuilds(kv, BOT_GUILDS_CACHE_KEY);
    if (cached) return cached;
  }

  const dedupKey = `${env.DISCORD_APPLICATION_ID || env.DISCORD_CLIENT_ID || "default"}:${forceRefresh ? "refresh" : "cached"}`;
  const existingRequest = inFlightBotGuilds.get(dedupKey);
  if (existingRequest) return existingRequest;

  const task = (async (): Promise<BotGuild[]> => {
    const guilds: BotGuild[] = [];
    let after = "";
    try {
      for (;;) {
        const params = new URLSearchParams({ limit: "200" });
        if (after) params.set("after", after);
        const response = await fetchDiscordWithRetry(
          `https://discord.com/api/v10/users/@me/guilds?${params}`,
          { headers: { Authorization: `Bot ${token}` } }
        );
        if (!response.ok) {
          const errorBody = await response.text();
          console.warn(
            `Discord bot guilds fetch returned ${response.status}: ${errorBody.slice(0, 200)}`
          );
          const stale = await readCachedBotGuilds(kv, BOT_GUILDS_STALE_KEY);
          return stale || [];
        }
        const page = (await response.json()) as BotGuild[];
        guilds.push(...page);
        if (page.length < 200) break;
        after = page[page.length - 1].id;
      }

      if (kv) {
        const payload = JSON.stringify({ guilds, fetchedAt: Date.now() });
        await Promise.all([
          kv.put(BOT_GUILDS_CACHE_KEY, payload, { expirationTtl: BOT_GUILDS_CACHE_TTL }),
          kv.put(BOT_GUILDS_STALE_KEY, payload, { expirationTtl: BOT_GUILDS_STALE_TTL }),
        ]);
      }
      return guilds;
    } catch (error) {
      console.error("Failed to fetch bot guilds:", error);
      const stale = await readCachedBotGuilds(kv, BOT_GUILDS_STALE_KEY);
      return stale || [];
    } finally {
      inFlightBotGuilds.delete(dedupKey);
    }
  })();

  inFlightBotGuilds.set(dedupKey, task);
  return task;
}

async function buildDiscordOAuthUrl(request: Request, env: any): Promise<{
  url: string;
  stateCookie: string;
  origin: string;
}> {
  const origin = getRequestOrigin(request, env);
  const redirectUri = `${origin}${REDIRECT_PATH}`;
  const appId = env.DISCORD_APPLICATION_ID || env.DISCORD_CLIENT_ID || "1571958001928245378";
  const secret = getSessionSecret(env);
  const nonce = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(24)));
  const state = secret ? await signToken({ nonce, issuedAt: Date.now() }, secret) : nonce;

  const kv = env.DISCORD_BOT as KVNamespace;
  if (kv) {
    await kv.put(`oauth_state:${nonce}`, "1", { expirationTtl: 600 });
  }

  const isHttps = isHttpsContext(request, origin);
  const discordAuthUrl =
    `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(appId)}` +
    `&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=identify%20guilds&state=${encodeURIComponent(state)}`;
  const stateCookie = `${OAUTH_STATE_COOKIE}=${state}; ${getCookieAttributes(isHttps, 600)}`;
  return { url: discordAuthUrl, stateCookie, origin };
}

export async function handleAuthUrl(request: Request, env: any): Promise<Response> {
  if (!env.DISCORD_CLIENT_SECRET) {
    return new Response(
      JSON.stringify({
        error:
          "DISCORD_CLIENT_SECRET is missing. Add it to your environment secrets to activate Discord login.",
        setupUrl: "/login",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      }
    );
  }

  const { url, stateCookie } = await buildDiscordOAuthUrl(request, env);
  return new Response(JSON.stringify({ url }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Set-Cookie": stateCookie,
    },
  });
}

export async function handleLoginRedirect(request: Request, env: any): Promise<Response> {
  const sessionSecret = getSessionSecret(env);
  const existingUser = await verifySessionCookie(
    request.headers.get("Cookie"),
    sessionSecret,
    env.DISCORD_PRIMARY_ADMINISTRATOR
  );
  const origin = getRequestOrigin(request, env);
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "1";

  if (existingUser && !forceRefresh) {
    return Response.redirect(`${origin}/dashboard`, 302);
  }

  if (!env.DISCORD_CLIENT_SECRET) {
    return new Response(
      renderOAuthSetupNotice(
        "DISCORD_CLIENT_SECRET is missing. Add your staging Discord OAuth2 Client Secret in your environment settings to activate Discord login.",
        `${origin}${REDIRECT_PATH}`
      ),
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  const { url: discordAuthUrl, stateCookie } = await buildDiscordOAuthUrl(request, env);

  return new Response(null, {
    status: 302,
    headers: {
      Location: discordAuthUrl,
      "Set-Cookie": stateCookie,
    },
  });
}

async function isValidOAuthState(
  returnedState: string | null,
  cookieHeader: string | null,
  secret: string,
  env: any
): Promise<boolean> {
  if (!returnedState) return false;
  const expectedCookieState = readCookie(cookieHeader, OAUTH_STATE_COOKIE);
  if (expectedCookieState && returnedState === expectedCookieState) {
    return true;
  }

  const parsed = await verifyToken<{ nonce?: string; issuedAt: number }>(
    returnedState,
    secret,
    600 * 1000
  );
  if (!parsed?.nonce) return false;

  const kv = env.DISCORD_BOT as KVNamespace;
  if (kv) {
    const key = `oauth_state:${parsed.nonce}`;
    const stored = await kv.get(key);
    if (!stored) return false;
    await kv.delete(key);
  }
  return true;
}

export async function handleOAuthCallback(request: Request, env: any): Promise<Response> {
  const url = new URL(request.url);
  const origin = getRequestOrigin(request, env);
  const isHttps = isHttpsContext(request, origin);
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error");
  const redirectUri = `${origin}${REDIRECT_PATH}`;
  const appId = env.DISCORD_APPLICATION_ID || env.DISCORD_CLIENT_ID || "1571958001928245378";
  const clientSecret = env.DISCORD_CLIENT_SECRET;
  const sessionSecret = getSessionSecret(env);
  const returnedState = url.searchParams.get("state");

  if (oauthError) {
    return new Response(
      `<!DOCTYPE html><html><body style="background:#0B0E14;color:#fff;font-family:sans-serif;padding:40px;text-align:center;"><h2>Discord Login Cancelled</h2><p style="color:#9CA3AF;">${escapeHtml(oauthError)}</p><p><a href="/" style="color:#5865F2;">Return Home</a></p></body></html>`,
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  if (!code || !clientSecret || !sessionSecret) {
    return new Response("Missing authorization code or server-side OAuth configuration", {
      status: 400,
    });
  }

  const stateValid = await isValidOAuthState(
    returnedState,
    request.headers.get("Cookie"),
    sessionSecret,
    env
  );
  if (!stateValid) {
    return new Response(
      "Invalid or expired OAuth state. Please return home and try logging in again.",
      { status: 400 }
    );
  }

  const tokenParams = new URLSearchParams({
    client_id: appId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  const tokenRes = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenParams.toString(),
  });

  if (!tokenRes.ok) {
    const errorText = await tokenRes.text();
    return new Response(`Discord OAuth exchange failed: ${errorText}`, { status: 400 });
  }

  const tokenData: any = await tokenRes.json();

  const userRes = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userRes.ok) {
    return new Response("Failed to fetch Discord user profile", { status: 500 });
  }

  const userData: any = await userRes.json();
  const avatarUrl = userData.avatar
    ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png?size=64`
    : `https://cdn.discordapp.com/embed/avatars/${(BigInt(userData.id) >> 22n) % 6n}.png`;

  if (userData.id === env.DISCORD_PRIMARY_ADMINISTRATOR && env.DISCORD_BOT) {
    await env.DISCORD_BOT.put(
      "creator:profile",
      JSON.stringify({
        id: userData.id,
        username: userData.username || "xchasex",
        avatarUrl,
        profileUrl: `https://discord.com/users/${userData.id}`,
        updatedAt: Date.now(),
      })
    );
  }

  try {
    const guildsRes = await fetchDiscordWithRetry("https://discord.com/api/v10/users/@me/guilds", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (guildsRes.ok && env.DISCORD_BOT) {
      const guildsData = await guildsRes.json();
      await env.DISCORD_BOT.put(`user_guilds:${userData.id}`, JSON.stringify(guildsData), {
        expirationTtl: 86400,
      });
      await env.DISCORD_BOT.delete(BOT_GUILDS_CACHE_KEY);
    }
  } catch (err) {
    console.error("Failed to fetch user guilds:", err);
  }

  const sessionToken = await createSessionToken(
    userData.id,
    userData.username,
    avatarUrl,
    sessionSecret
  );
  const sessionCookie = `${SESSION_COOKIE}=${sessionToken}; ${getCookieAttributes(isHttps, 86400)}`;
  const clearStateCookie = `${OAUTH_STATE_COOKIE}=; ${getCookieAttributes(isHttps, 0)}`;
  const destination =
    userData.id === env.DISCORD_PRIMARY_ADMINISTRATOR ? "/admin" : "/dashboard";

  const handoffId = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(24)));
  const handoffToken = await signToken(
    { handoffId, sessionToken, destination, issuedAt: Date.now() },
    sessionSecret
  );
  const kv = env.DISCORD_BOT as KVNamespace;
  if (kv) {
    await kv.put(`oauth_handoff:${handoffId}`, "1", { expirationTtl: 120 });
  }

  const headers = new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  headers.append("Set-Cookie", sessionCookie);
  headers.append("Set-Cookie", clearStateCookie);

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Signed In</title></head>
<body style="background:#0B0E14;color:#F3F4F6;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;">
  <div>
    <h2 style="margin-bottom:8px;">Discord Connected</h2>
    <p style="color:#9CA3AF;">Completing sign-in…</p>
    <p style="margin-top:14px;"><a href="${escapeHtml(destination)}" style="color:#93C5FD;">Continue</a></p>
  </div>
  <script>
    (function () {
      var dest = ${JSON.stringify(destination)};
      var handoff = ${JSON.stringify(handoffToken)};
      if (window.opener) {
        try {
          window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', destination: dest, handoff: handoff }, '*');
        } catch (e) {}
        window.close();
      } else {
        window.location.replace(dest);
      }
    })();
  </script>
</body>
</html>`;

  return new Response(html, { status: 200, headers });
}

export async function handleAuthHandoff(request: Request, env: any): Promise<Response> {
  const sessionSecret = getSessionSecret(env);
  if (!sessionSecret) {
    return new Response(JSON.stringify({ error: "OAuth not configured" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = await verifyToken<{
    handoffId: string;
    sessionToken: string;
    destination: string;
    issuedAt: number;
  }>(String(body?.handoff || ""), sessionSecret, 120 * 1000);

  if (!parsed?.handoffId || !parsed?.sessionToken) {
    return new Response(JSON.stringify({ error: "Invalid or expired handoff" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const kv = env.DISCORD_BOT as KVNamespace;
  if (kv) {
    const key = `oauth_handoff:${parsed.handoffId}`;
    const valid = await kv.get(key);
    if (!valid) {
      return new Response(JSON.stringify({ error: "Handoff already used" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    await kv.delete(key);
  }

  const origin = getRequestOrigin(request, env);
  const isHttps = isHttpsContext(request, origin);
  const sessionCookie = `${SESSION_COOKIE}=${parsed.sessionToken}; ${getCookieAttributes(isHttps, 86400)}`;

  return new Response(JSON.stringify({ ok: true, destination: parsed.destination || "/dashboard" }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Set-Cookie": sessionCookie,
    },
  });
}

export async function renderDashboard(request: Request, env: any): Promise<Response> {
  const sessionSecret = getSessionSecret(env);
  const user = await verifySessionCookie(
    request.headers.get("Cookie"),
    sessionSecret,
    env.DISCORD_PRIMARY_ADMINISTRATOR
  );

  if (!user) {
    if (!env.DISCORD_CLIENT_SECRET) {
      return handleLoginRedirect(request, env);
    }
    return new Response(
      `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Sign In – Everfall Watcher</title></head>
      <body style="background:#0B0E14;color:#F3F4F6;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;">
        <div style="background:#141824;border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:32px;max-width:420px;">
          <h2 style="margin-bottom:10px;">Discord Login Required</h2>
          <p style="color:#9CA3AF;margin-bottom:22px;font-size:0.95rem;">Sign in with your Discord account to manage servers or administrator settings.</p>
          <a href="/login" id="gateLoginBtn" style="display:inline-block;background:#5865F2;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600;">Login with Discord</a>
          <p style="margin-top:16px;"><a href="/" style="color:#93C5FD;font-size:0.85rem;">Return Home</a></p>
        </div>
        <script>
          if (window.self === window.top) {
            window.location.replace('/login');
          } else {
            document.getElementById('gateLoginBtn').addEventListener('click', async function (e) {
              e.preventDefault();
              var res = await fetch('/api/auth/url');
              if (!res.ok) { window.location.href = '/login'; return; }
              var data = await res.json();
              window.open(data.url, 'discord_oauth', 'width=540,height=720');
            });
            window.addEventListener('message', async function (event) {
              if (event.data && event.data.type === 'OAUTH_AUTH_SUCCESS') {
                if (event.data.handoff) {
                  await fetch('/api/auth/handoff', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ handoff: event.data.handoff })
                  });
                }
                window.location.reload();
              }
            });
          }
        </script>
      </body></html>`,
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
    );
  }

  const url = new URL(request.url);
  const origin = getRequestOrigin(request, env);
  const isAdminPage = url.pathname === "/admin";
  if (isAdminPage && !user.isAdmin) {
    return Response.redirect(`${origin}/dashboard`, 302);
  }

  const alertSent = isAdminPage && url.searchParams.get("alert") === "sent";
  const alertDeliveries = Number(url.searchParams.get("alertDeliveries") || "0");
  const saved = url.searchParams.get("saved");
  const errorMsg = url.searchParams.get("error");
  const pulledListings = url.searchParams.get("pulled");
  const pullDeliveries = Number(url.searchParams.get("deliveries") || "0");
  const verifiedPull = url.searchParams.get("verified") === "1";

  const config = await getEmbedConfig(env);
  const listingHistory = await getListingHistory(env);
  const monitorStatus = await getMonitorStatus(env);
  const latestListing = listingHistory[0]?.payload || getKnownCars()[0];
  const adminAppearanceControls = renderAppearanceControls(
    config,
    "/admin/save-config",
    latestListing
  );
  const appId = env.DISCORD_APPLICATION_ID || env.DISCORD_CLIENT_ID || "1571958001928245378";

  const forceRefresh = url.searchParams.get("refresh") === "1";

  const guildIds = await getAllGuildIds(env);
  const botGuilds = await getBotGuilds(env, forceRefresh);
  const botGuildIds = new Set(botGuilds.map((guild) => guild.id));
  const connectedGuilds: any[] = [];
  for (const guild of botGuilds) {
    const guildConfig = await getGuildConfig(env, guild.id);
    connectedGuilds.push({ ...guild, config: guildConfig });
  }
  if (connectedGuilds.length === 0) {
    for (const id of guildIds) {
      const guildConfig = await getGuildConfig(env, id);
      if (guildConfig) {
        botGuildIds.add(id);
        connectedGuilds.push({ id, name: `Server ${id}`, config: guildConfig });
      }
    }
  }

  const userManagedGuilds = await getManagedGuildsForUser(env, user.id);
  const guildControlOptions = new Map<
    string,
    { channels: GuildChannelOption[]; roles: GuildRoleOption[]; error?: string }
  >();
  if (!isAdminPage) {
    await Promise.all(
      userManagedGuilds
        .filter((guild) => botGuildIds.has(guild.id))
        .map(async (guild) => {
          guildControlOptions.set(
            guild.id,
            await getGuildControlOptions(env, guild.id, forceRefresh)
          );
        })
    );
  }

  const availableCount = listingHistory.filter((r) => r.isAvailable).length;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Everfall Watcher – ${isAdminPage ? "Administrator Dashboard" : "Server Dashboard"}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" type="image/webp" href="${EF_LOGO_BASE64}">
  <link rel="shortcut icon" type="image/webp" href="${EF_LOGO_BASE64}">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0B0E14;
      --surface: #141824;
      --surface-hover: #1B2132;
      --border: rgba(255, 255, 255, 0.08);
      --primary: #5865F2;
      --primary-hover: #4752C4;
      --accent: #F59E0B;
      --text: #F3F4F6;
      --muted: #9CA3AF;
      --success: #10B981;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', sans-serif;
      background: var(--bg);
      color: var(--text);
      padding: 32px 20px;
      line-height: 1.6;
      user-select: none;
      -webkit-user-select: none;
    }
    input, textarea, select, option { user-select: text; -webkit-user-select: text; }
    .wrapper { max-width: 1100px; margin: 0 auto; }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 32px;
      flex-wrap: wrap;
      gap: 16px;
    }
    .user-profile-header { display: flex; align-items: center; gap: 14px; }
    .avatar-header { width: 48px; height: 48px; border-radius: 50%; border: 2px solid var(--primary); }
    .badge-admin {
      background: rgba(245, 158, 11, 0.15); color: var(--accent);
      border: 1px solid rgba(245, 158, 11, 0.3); padding: 4px 12px;
      border-radius: 20px; font-size: 0.8rem; font-weight: 700;
    }
    .badge-user {
      background: rgba(88, 101, 242, 0.15); color: #93C5FD;
      border: 1px solid rgba(88, 101, 242, 0.3); padding: 4px 12px;
      border-radius: 20px; font-size: 0.8rem; font-weight: 700;
    }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    @media(max-width: 800px) { .grid { grid-template-columns: 1fr; } }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 24px; }
    h2 { font-size: 1.25rem; font-weight: 700; margin-bottom: 16px; }
    label { display: block; font-size: 0.85rem; color: var(--muted); margin-bottom: 6px; font-weight: 600; }
    input[type="text"], select {
      width: 100%; background: rgba(0,0,0,0.25); border: 1px solid var(--border);
      border-radius: 8px; padding: 10px 14px; color: var(--text);
      font-family: inherit; font-size: 0.95rem; margin-bottom: 16px;
    }
    .guild-settings-form { width:100%; margin-top:14px; padding-top:18px; border-top:1px solid var(--border); }
    .role-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:8px; margin:8px 0 18px; }
    .role-option { display:flex; align-items:center; gap:8px; color:var(--text); background:rgba(0,0,0,.2); border:1px solid var(--border); border-radius:8px; padding:8px 10px; cursor:pointer; }
    .control-warning { color:#F59E0B; font-size:.82rem; margin-bottom:10px; }
    .color-control { display:grid; grid-template-columns:52px 1fr; gap:10px; align-items:start; }
    input[type="color"] { width:52px; height:42px; padding:3px; border-radius:8px; border:1px solid var(--border); background:rgba(0,0,0,.25); cursor:pointer; }
    .checkbox-label { display:flex; align-items:center; gap:9px; margin-bottom:18px; cursor:pointer; }
    .btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 8px;
      background: var(--primary); color: #fff; font-weight: 600; padding: 10px 18px;
      border-radius: 8px; border: none; cursor: pointer; font-size: 0.95rem;
      transition: background 0.15s ease; text-decoration: none;
    }
    .btn:hover { background: var(--primary-hover); }
    .btn-secondary { background: rgba(255,255,255,0.08); color: var(--text); }
    .btn-secondary:hover { background: rgba(255,255,255,0.15); }
    .discord-preview {
      background: #2B2D31; border-radius: 8px; padding: 16px;
      border-left: 4px solid ${escapeHtml(config.color || "#F59E0B")};
      margin: 14px 0 18px;
    }
    .embed-title { font-weight: 700; font-size: 1rem; color: #00A8FC; margin-bottom: 6px; }
    .embed-desc { font-size: 0.85rem; color: #DBDEE1; margin-bottom: 12px; line-height: 1.4; }
    .embed-img { width: 100%; border-radius: 6px; margin-bottom: 8px; aspect-ratio: 16/9; object-fit: cover; }
    .embed-footer { font-size: 0.75rem; color: #949BA4; }
    .preview-gallery-heading { color:#DBDEE1; font-size:.82rem; font-weight:700; margin:10px 0 7px; }
    .preview-button { display:inline-block; color:#fff; background:#5865F2; border-radius:5px; padding:6px 10px; font-size:.75rem; font-weight:700; margin:4px 0 10px; }
    .server-item {
      padding: 14px; background: rgba(0,0,0,0.25); border: 1px solid var(--border);
      border-radius: 10px; margin-bottom: 12px; display: flex;
      justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;
    }
    .server-name { font-weight: 700; font-size: 1rem; display: flex; align-items: center; gap: 8px; }
    .appearance-form { width:100%; margin-top:14px; padding-top:18px; border-top:1px solid var(--border); }
    .banner-ok { background:rgba(16,185,129,.15); border:1px solid rgba(16,185,129,.4); color:#34D399; padding:14px 18px; border-radius:10px; margin-bottom:24px; font-weight:600; }
    .banner-warn { background:rgba(245,158,11,.15); border:1px solid rgba(245,158,11,.4); color:#FBBF24; padding:14px 18px; border-radius:10px; margin-bottom:24px; font-weight:600; }
    .banner-err { background:rgba(239,68,68,.15); border:1px solid rgba(239,68,68,.4); color:#F87171; padding:14px 18px; border-radius:10px; margin-bottom:24px; font-weight:600; }
    .stat-row { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:18px; }
    .stat-box { background:rgba(0,0,0,0.25); border:1px solid var(--border); border-radius:10px; padding:12px; }
    .stat-label { font-size:0.75rem; color:var(--muted); text-transform:uppercase; }
    .stat-value { font-size:1.25rem; font-weight:800; margin-top:2px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <header>
      <div class="user-profile-header">
        <img src="${escapeHtml(user.avatarUrl)}" alt="${escapeHtml(user.username)}" class="avatar-header">
        <div>
          <h1 style="font-size: 1.35rem; font-weight: 800;">${escapeHtml(user.username)}</h1>
          <p style="color:var(--muted); font-size:0.85rem;">
            ${isAdminPage ? "Administrator Dashboard" : "Server Manager Dashboard"} &bull; Discord ID: ${escapeHtml(user.id)}
          </p>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:14px;">
        <span class="${isAdminPage ? "badge-admin" : "badge-user"}">
          ${isAdminPage ? "🛡️ Master Administrator" : "🎮 Server Manager"}
        </span>
        ${user.isAdmin ? `<a href="${isAdminPage ? "/dashboard" : "/admin"}" style="color:#93C5FD; text-decoration:none; font-size:.9rem; font-weight:600;">${isAdminPage ? "Server Dashboard" : "Admin Dashboard"}</a>` : ""}
        <a href="/" style="color:var(--muted); text-decoration:none; font-size:0.9rem;">Home</a>
        <a href="/logout" style="color:#EF4444; text-decoration:none; font-size:0.9rem; font-weight:600;">Log Out</a>
      </div>
    </header>

    ${errorMsg ? `<div class="banner-err">⚠️ ${escapeHtml(errorMsg)}</div>` : ""}
    ${saved ? `<div class="banner-ok">✅ Settings saved successfully.</div>` : ""}
    ${
      alertSent
        ? alertDeliveries > 0
          ? `<div class="banner-ok">🎉 Test Broadcast Dispatched! Delivered to ${alertDeliveries} configured server channel(s).</div>`
          : `<div class="banner-warn">⚠️ Test broadcast ran, but 0 messages were delivered. Verify bot token and configured server alert channels.</div>`
        : ""
    }
    ${
      pulledListings !== null
        ? `<div class="${verifiedPull ? "banner-ok" : "banner-warn"}">
            ${verifiedPull ? "✅ Verified storefront pull" : "ℹ️ Fallback/cached pull"}: tracked ${escapeHtml(pulledListings)} available listing(s) and completed ${pullDeliveries} new delivery/deliveries.
           </div>`
        : ""
    }

    ${
      isAdminPage
        ? `
      <!-- Master Administrator View -->
      <div class="grid">
        <div class="card">
          <h2>🎨 Listing Presentation Controls</h2>
          ${adminAppearanceControls}

          <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--border);">
            <h2>🔄 Pull Current Store Listings</h2>
            <p style="color:var(--muted); font-size:0.85rem; margin-bottom:14px;">
              Refreshes current availability, records newly discovered products, archives their images, and publishes unsent listings. Existing verified history is preserved if the store challenges verification.
            </p>
            <form action="/admin/pull-current" method="POST">
              <button type="submit" class="btn" data-loading-text="Pulling…">🔄 Pull and Publish Current Listings</button>
            </form>
          </div>

          <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--border);">
            <h2>🚀 Test Live Drop Broadcast</h2>
            <p style="color:var(--muted); font-size:0.85rem; margin-bottom: 14px;">
              Broadcasts the most recently discovered listing batch with its preserved discovery time, gallery, and role mentions to configured servers.
            </p>
            <form action="/admin/test-alert" method="POST">
              <button type="submit" class="btn btn-secondary" data-loading-text="Broadcasting…">⚡ Broadcast Latest Discovery (Test)</button>
            </form>
          </div>
        </div>

        <div style="display:flex; flex-direction:column; gap:24px;">
          <div class="card">
            <h2>📊 Monitor Health & Catalog</h2>
            <div class="stat-row">
              <div class="stat-box">
                <div class="stat-label">Tracked Total</div>
                <div class="stat-value">${listingHistory.length}</div>
              </div>
              <div class="stat-box">
                <div class="stat-label">Available Now</div>
                <div class="stat-value" style="color:#34D399;">${availableCount}</div>
              </div>
              <div class="stat-box">
                <div class="stat-label">Last Check</div>
                <div class="stat-value" style="font-size:0.95rem; color:${monitorStatus?.authoritative ? "#34D399" : "#FBBF24"};">
                  ${monitorStatus ? (monitorStatus.authoritative ? "Verified" : "Preserved") : "Pending"}
                </div>
              </div>
            </div>
            <p style="color:var(--muted); font-size:0.85rem;">
              ${
                monitorStatus
                  ? `Last checked ${escapeHtml(new Date(monitorStatus.checkedAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }))} ET.${monitorStatus.notice ? ` ${escapeHtml(monitorStatus.notice)}` : ""}`
                  : "No storefront sweep has been recorded in this storage session yet."
              }
            </p>
          </div>

          <div class="card">
            <h2>📡 All Connected Discord Servers (${connectedGuilds.length})</h2>
            <p style="color:var(--muted); font-size:0.85rem; margin-bottom:16px;">
              Servers Discord reports the bot is currently installed in, alongside channel/role setup status.
            </p>
            ${
              connectedGuilds.length === 0
                ? '<p style="color:var(--muted); font-size:0.88rem;">Discord did not return any installed servers (or DISCORD_BOT_TOKEN is unset).</p>'
                : connectedGuilds
                    .map(
                      (g) => `
                  <div class="server-item">
                    <div>
                      <div class="server-name">${escapeHtml(g.name || `Server ${g.id}`)}</div>
                      <div style="font-size:0.85rem; color:var(--muted); margin-top:4px;">
                        <b>ID:</b> ${escapeHtml(g.id)} &bull; <b>Alert Channel:</b> ${g.config?.channelId ? `&lt;#${escapeHtml(g.config.channelId)}&gt;` : "Not configured"} &bull; <b>Roles:</b> ${
                          g.config?.roleIds?.length ? escapeHtml(g.config.roleIds.join(", ")) : "None"
                        }
                      </div>
                    </div>
                    <span style="font-size:0.8rem; color:${g.config?.channelId ? "#34D399" : "#F59E0B"}; font-weight:600;">
                      ${g.config?.channelId ? "🟢 Configured" : "🟠 Setup needed"}
                    </span>
                  </div>`
                    )
                    .join("")
            }
          </div>
        </div>
      </div>
      `
        : `
      <!-- Server Manager / Member View -->
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
          <div>
            <h2 style="margin-bottom:4px;">🖥️ Your Managed Discord Servers</h2>
            <p style="color:var(--muted); font-size:0.9rem;">
              Check if Everfall Limited Watcher is active in your servers, or configure alert channels and role mentions below.
            </p>
          </div>
          <a href="/login?refresh=1" class="btn btn-secondary refresh-oauth-btn" style="font-size:0.85rem; padding:8px 14px;">🔄 Refresh Server List</a>
        </div>

        ${
          userManagedGuilds.length === 0
            ? `<div style="text-align:center; padding:32px 16px;">
                <p style="color:var(--muted); margin-bottom:16px;">No servers found with Manage Server or Administrator permissions.</p>
                <a href="https://discord.com/oauth2/authorize?client_id=${escapeHtml(appId)}&permissions=${BOT_PERMISSIONS}&integration_type=0&scope=bot+applications.commands" target="_blank" rel="noopener noreferrer" class="btn">
                  ➕ Add Bot to a New Server
                </a>
              </div>`
            : userManagedGuilds
                .map((g) => {
                  const botConfig = connectedGuilds.find((guild) => guild.id === g.id)?.config;
                  const isInstalled = botGuildIds.has(g.id);
                  const controls = guildControlOptions.get(g.id) || { channels: [], roles: [] };
                  const iconUrl = g.icon
                    ? `https://cdn.discordapp.com/icons/${encodeURIComponent(g.id)}/${encodeURIComponent(g.icon)}.png?size=64`
                    : null;
                  const initials = String(g.name || "SV").substring(0, 2);

                  return `
              <div class="server-item">
                <div style="display:flex; align-items:center; gap:12px;">
                  ${
                    iconUrl
                      ? `<img src="${escapeHtml(iconUrl)}" alt="${escapeHtml(g.name)}" style="width:40px; height:40px; border-radius:10px;">`
                      : `<div style="width:40px; height:40px; border-radius:10px; background:rgba(255,255,255,0.08); display:flex; align-items:center; justify-content:center; font-weight:700;">${escapeHtml(initials)}</div>`
                  }
                  <div>
                    <div class="server-name">${escapeHtml(g.name)}</div>
                    <div style="font-size:0.82rem; color:var(--muted);">
                      ${
                        isInstalled
                          ? botConfig?.channelId
                            ? `Alert Channel: &lt;#${escapeHtml(botConfig.channelId)}&gt; &bull; Roles: ${
                                botConfig.roleIds?.length ? botConfig.roleIds.length + " configured" : "None"
                              }`
                            : "Bot installed • Alert channel not configured"
                          : "Bot not yet installed"
                      }
                    </div>
                  </div>
                </div>

                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                  ${
                    isInstalled
                      ? `<span style="font-size:0.85rem; color:#34D399; font-weight:700; padding:6px 14px; background:rgba(16, 185, 129, 0.12); border-radius:8px; border:1px solid rgba(16, 185, 129, 0.3);">
                          🟢 Active & Watching
                        </span>
                        <a href="https://discord.com/oauth2/authorize?client_id=${escapeHtml(appId)}&guild_id=${escapeHtml(g.id)}&permissions=${BOT_PERMISSIONS}&integration_type=0&scope=bot+applications.commands" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="font-size:0.8rem; padding:6px 12px;">
                          🔑 Update Permissions
                        </a>`
                      : `<a href="https://discord.com/oauth2/authorize?client_id=${escapeHtml(appId)}&guild_id=${escapeHtml(g.id)}&permissions=${BOT_PERMISSIONS}&integration_type=0&scope=bot+applications.commands" target="_blank" rel="noopener noreferrer" class="btn" style="font-size:0.85rem; padding:8px 14px;">
                          ➕ Invite Bot
                        </a>`
                  }
                </div>
                ${
                  isInstalled
                    ? `<div style="width:100%;">
                        <h3 style="font-size:1rem; margin-top:8px;">Bot settings for ${escapeHtml(g.name)}</h3>
                        <p style="color:var(--muted); font-size:.82rem; margin-bottom:14px;">Choose the alert channel and every role that should be notified for this server.</p>
                        <form action="/dashboard/save-guild" method="POST" class="guild-settings-form">
                          <input type="hidden" name="guildId" value="${escapeHtml(g.id)}">
                          <label for="channel-${escapeHtml(g.id)}">Alert channel</label>
                          <select id="channel-${escapeHtml(g.id)}" name="channelId" required>
                            <option value="">Select a text channel…</option>
                            ${controls.channels
                              .map(
                                (channel) =>
                                  `<option value="${escapeHtml(channel.id)}" ${botConfig?.channelId === channel.id ? "selected" : ""}># ${escapeHtml(channel.name)}</option>`
                              )
                              .join("")}
                          </select>
                          ${
                            controls.channels.length === 0
                              ? `<p class="control-warning">Channel list unavailable${controls.error ? ` (${escapeHtml(controls.error)})` : ""}. Confirm the bot is installed and can view channels in this server.</p>`
                              : ""
                          }

                          <label>Notification roles</label>
                          <div class="role-grid">
                            ${
                              controls.roles.length
                                ? controls.roles
                                    .map(
                                      (role) =>
                                        `<label class="role-option"><input type="checkbox" name="roleIds" value="${escapeHtml(role.id)}" ${botConfig?.roleIds?.includes(role.id) ? "checked" : ""}> @${escapeHtml(role.name)}</label>`
                                    )
                                    .join("")
                                : `<span class="control-warning">No assignable roles were returned.</span>`
                            }
                          </div>
                          <button type="submit" class="btn" data-loading-text="Saving…">💾 Save Server Settings</button>
                        </form>
                       </div>`
                    : ""
                }
              </div>`;
                })
                .join("")
        }

        <div style="margin-top:24px; padding-top:20px; border-top:1px solid var(--border); font-size:0.88rem; color:var(--muted);">
          <b>💡 Quick Setup Tip:</b> Once the bot joins your server, run <code style="background:rgba(255,255,255,0.08); padding:2px 6px; border-radius:4px; color:#93C5FD;">/setup #your-channel</code> in Discord to immediately post active store listings!
        </div>
      </div>
      `
    }
  </div>
  <script>
    var previewListingName = ${JSON.stringify(latestListing?.name || "Latest listing")};
    document.querySelectorAll('.appearance-form').forEach(function (form) {
      var picker = form.querySelector('.color-picker');
      var colorText = form.querySelector('.color-text');
      var preview = form.querySelector('.discord-preview');
      var syncColor = function (value) {
        if (/^#[0-9a-f]{6}$/i.test(value)) {
          picker.value = value;
          colorText.value = value.toUpperCase();
          preview.style.borderLeftColor = value;
        }
      };
      if (picker && colorText) {
        picker.addEventListener('input', function () { syncColor(picker.value); });
        colorText.addEventListener('input', function () { syncColor(colorText.value); });
      }

      var titleInput = form.querySelector('[name="titlePrefix"]');
      var footerInput = form.querySelector('[name="footerText"]');
      var galleryInput = form.querySelector('[name="galleryHeading"]');
      var buttonInput = form.querySelector('[name="storeButtonLabel"]');
      var showTimeCheckbox = form.querySelector('[name="showDetectionTime"]');

      var titleTarget = form.querySelector('.embed-title');
      var footerTarget = form.querySelector('.embed-footer');
      var galleryTarget = form.querySelector('.preview-gallery-heading');
      var buttonTarget = form.querySelector('.preview-button');
      var detectedTarget = form.querySelector('.preview-detected');

      if (titleInput && titleTarget) {
        titleInput.addEventListener('input', function () {
          titleTarget.textContent = (titleInput.value || '') + ' ' + previewListingName;
        });
      }
      if (galleryInput && galleryTarget) {
        galleryInput.addEventListener('input', function () {
          galleryTarget.textContent = '📸 ' + galleryInput.value;
        });
      }
      if (buttonInput && buttonTarget) {
        buttonInput.addEventListener('input', function () {
          buttonTarget.textContent = buttonInput.value;
        });
      }
      var updateTimePreview = function () {
        var show = !showTimeCheckbox || showTimeCheckbox.checked;
        if (detectedTarget) detectedTarget.style.display = show ? 'block' : 'none';
        if (footerTarget && footerInput) {
          footerTarget.textContent = footerInput.value + (show ? ' • Today at 12:00 PM' : '');
        }
      };
      if (footerInput) footerInput.addEventListener('input', updateTimePreview);
      if (showTimeCheckbox) showTimeCheckbox.addEventListener('change', updateTimePreview);
    });

    document.querySelectorAll('form').forEach(function (form) {
      form.addEventListener('submit', function () {
        var button = form.querySelector('button[type="submit"]');
        if (button) {
          button.disabled = true;
          button.textContent = button.getAttribute('data-loading-text') || 'Working…';
        }
      });
    });

    var refreshBtn = document.querySelector('.refresh-oauth-btn');
    if (refreshBtn && window.self !== window.top) {
      refreshBtn.addEventListener('click', async function (e) {
        e.preventDefault();
        try {
          var res = await fetch('/api/auth/url');
          if (!res.ok) { window.location.href = '/login?refresh=1'; return; }
          var data = await res.json();
          window.open(data.url, 'discord_oauth', 'width=540,height=720');
        } catch (err) {
          window.location.href = '/login?refresh=1';
        }
      });
      window.addEventListener('message', async function (event) {
        if (event.data && event.data.type === 'OAUTH_AUTH_SUCCESS') {
          if (event.data.handoff) {
            await fetch('/api/auth/handoff', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ handoff: event.data.handoff })
            });
          }
          window.location.reload();
        }
      });
    }
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function handleSaveConfig(request: Request, env: any): Promise<Response> {
  const sessionSecret = getSessionSecret(env);
  const user = await verifySessionCookie(
    request.headers.get("Cookie"),
    sessionSecret,
    env.DISCORD_PRIMARY_ADMINISTRATOR
  );

  if (!user || !user.isAdmin) {
    return new Response("Unauthorized", { status: 401 });
  }

  const formData = await request.formData();
  await setEmbedConfig(env, parseEmbedConfig(formData));
  const origin = getRequestOrigin(request, env);

  return Response.redirect(`${origin}/admin?saved=appearance`, 303);
}

function parseEmbedConfig(formData: FormData): EmbedConfig {
  const submittedColor = String(formData.get("color") || "").toUpperCase();
  const color = /^#[0-9A-F]{6}$/.test(submittedColor)
    ? submittedColor
    : DEFAULT_EMBED_CONFIG.color;
  return {
    color,
    titlePrefix:
      String(formData.get("titlePrefix") || "").trim().slice(0, 120) ||
      DEFAULT_EMBED_CONFIG.titlePrefix,
    footerText:
      String(formData.get("footerText") || "").trim().slice(0, 180) ||
      DEFAULT_EMBED_CONFIG.footerText,
    galleryHeading:
      String(formData.get("galleryHeading") || "").trim().slice(0, 80) ||
      DEFAULT_EMBED_CONFIG.galleryHeading,
    storeButtonLabel:
      String(formData.get("storeButtonLabel") || "").trim().slice(0, 80) ||
      DEFAULT_EMBED_CONFIG.storeButtonLabel,
    showDetectionTime: formData.get("showDetectionTime") === "on",
  };
}

export async function handleSaveGuildSettings(request: Request, env: any): Promise<Response> {
  const sessionSecret = getSessionSecret(env);
  const user = await verifySessionCookie(
    request.headers.get("Cookie"),
    sessionSecret,
    env.DISCORD_PRIMARY_ADMINISTRATOR
  );
  if (!user) return new Response("Unauthorized", { status: 401 });

  const origin = getRequestOrigin(request, env);
  const formData = await request.formData();
  const guildId = String(formData.get("guildId") || "");
  if (!/^\d{17,20}$/.test(guildId)) {
    return Response.redirect(`${origin}/dashboard?error=${encodeURIComponent("Invalid server ID.")}`, 303);
  }

  const managedGuilds = await getManagedGuildsForUser(env, user.id);
  const authorized = managedGuilds.some((guild) => guild.id === guildId);
  if (!authorized) return new Response("Forbidden", { status: 403 });

  const channelId = String(formData.get("channelId") || "");
  const requestedRoleIds = formData.getAll("roleIds").map(String);
  let controls = await getGuildControlOptions(env, guildId);
  if (!controls.channels.some((channel) => channel.id === channelId)) {
    controls = await getGuildControlOptions(env, guildId, true);
  }
  if (!controls.channels.some((channel) => channel.id === channelId)) {
    return Response.redirect(
      `${origin}/dashboard?error=${encodeURIComponent("Invalid or inaccessible alert channel. Verify the bot can view that channel.")}`,
      303
    );
  }
  const allowedRoleIds = new Set(controls.roles.map((role) => role.id));
  const roleIds = [...new Set(requestedRoleIds.filter((roleId) => allowedRoleIds.has(roleId)))];
  const existing = (await getGuildConfig(env, guildId)) || { channelId: "", roleIds: [] };
  await setGuildConfig(env, guildId, { ...existing, channelId, roleIds, embedConfig: undefined });

  return Response.redirect(`${origin}/dashboard?saved=server`, 303);
}

export async function handleTestAlert(request: Request, env: any): Promise<Response> {
  const sessionSecret = getSessionSecret(env);
  const user = await verifySessionCookie(
    request.headers.get("Cookie"),
    sessionSecret,
    env.DISCORD_PRIMARY_ADMINISTRATOR
  );

  if (!user || !user.isAdmin) {
    return new Response("Unauthorized", { status: 401 });
  }

  const origin = getRequestOrigin(request, env);
  const history = await getListingHistory(env);
  const sampleRecord = history[0];
  let deliveries = 0;

  if (sampleRecord) {
    const guildIds = await getAllGuildIds(env);
    for (const guildId of guildIds) {
      const cfg = await getGuildConfig(env, guildId);
      if (cfg?.environment === "test" && cfg.channelId) {
        const res = await dispatchListingToGuild(
          env,
          {
            ...sampleRecord.payload,
            id: sampleRecord.id,
            detectedAt: sampleRecord.firstSeenAt,
            lastVerifiedAt: sampleRecord.lastVerifiedAt,
            soldOutAt: sampleRecord.soldOutAt,
            isAvailable: sampleRecord.isAvailable,
          },
          guildId,
          { method: "test", includeRoleMentions: false }
        );
        if (res.ok) deliveries++;
      }
    }
  }

  const dest = new URL(`${origin}/admin/testing`);
  dest.searchParams.set("alert", "sent");
  dest.searchParams.set("alertDeliveries", String(deliveries));
  return Response.redirect(dest.toString(), 303);
}

export async function handleManualPull(request: Request, env: any): Promise<Response> {
  const sessionSecret = getSessionSecret(env);
  const user = await verifySessionCookie(
    request.headers.get("Cookie"),
    sessionSecret,
    env.DISCORD_PRIMARY_ADMINISTRATOR
  );
  if (!user || !user.isAdmin) return new Response("Unauthorized", { status: 401 });

  const origin = getRequestOrigin(request, env);
  const result = await manualPullCurrentListings(env, origin);
  const destination = new URL(`${origin}/admin`);
  destination.searchParams.set("pulled", String(result.listings));
  destination.searchParams.set("deliveries", String(result.deliveries));
  destination.searchParams.set("verified", result.usedVerifiedStoreResponse ? "1" : "0");
  return Response.redirect(destination.toString(), 303);
}

function renderOAuthSetupNotice(msg: string, callbackUrl: string): string {
  return `<!DOCTYPE html><html><body style="background:#0B0E14;color:#fff;font-family:sans-serif;padding:40px;text-align:center;">
    <h2>⚙️ Discord OAuth2 Setup Required</h2>
    <p style="color:#F59E0B; margin: 16px 0;">${escapeHtml(msg)}</p>
    <div style="background:#141824; max-width:640px; margin:20px auto; padding:20px; border-radius:12px; text-align:left; font-size:0.9rem; border:1px solid rgba(255,255,255,0.1);">
      <ol style="margin-left: 20px; line-height: 1.8;">
        <li>Go to <a href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer" style="color:#5865F2;">Discord Developer Portal</a> &rarr; Your Staging App.</li>
        <li>Under <b>OAuth2</b> &rarr; <b>Redirects</b>, add: <br><code style="background:rgba(0,0,0,0.4); padding:3px 6px; border-radius:4px; word-break:break-all;">${escapeHtml(callbackUrl)}</code></li>
        <li>Under <b>OAuth2</b>, copy your <b>Client Secret</b>.</li>
        <li>In your environment settings, add secrets <code>DISCORD_CLIENT_SECRET</code> and <code>DISCORD_BOT_TOKEN</code> (plus <code>DISCORD_APPLICATION_ID</code>, <code>DISCORD_CLIENT_ID</code>, and <code>DISCORD_PUBLIC_KEY</code> for your staging app).</li>
      </ol>
    </div>
    <p><a href="/" style="color:#5865F2;">Return to Home</a></p>
  </body></html>`;
}
