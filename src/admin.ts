// admin.ts – User & Admin Dashboard with Discord OAuth2 Authentication

import {
  getAllGuildIds,
  getGuildConfig,
  getEmbedConfig,
  getListingHistory,
  setEmbedConfig,
  setGuildConfig,
  EmbedConfig,
} from "./kv";
import { getKnownCars, broadcastAllListings } from "./scraper";
import { EF_LOGO_BASE64 } from "./assets";

const REDIRECT_PATH = "/auth/callback";
const SESSION_COOKIE = "everfall_session";
const OAUTH_STATE_COOKIE = "everfall_oauth_state";

export interface SessionUser {
  id: string;
  username: string;
  avatarUrl: string;
  isAdmin: boolean;
}

interface BotGuild {
  id: string;
  name: string;
  icon?: string | null;
  approximate_member_count?: number;
}

function escapeHtml(value: unknown): string {
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
  const color = /^#[0-9a-f]{6}$/i.test(config.color || "") ? config.color! : "#F59E0B";
  const titlePrefix = config.titlePrefix || "<:everfall:1571981507973746868> Limited Edition Drop:";
  const footerText = config.footerText || "Everfall Limited Watcher • Verified Drop Alert";
  const galleryHeading = config.galleryHeading || "Vehicle Gallery";
  const storeButtonLabel = config.storeButtonLabel || "View Package on Everfall Store";
  const image = previewListing?.images?.[0] || "";
  return `
    <form action="${action}" method="POST" class="appearance-form">
      ${guildId ? `<input type="hidden" name="guildId" value="${escapeHtml(guildId)}">` : ""}
      <label>Accent Color</label>
      <div class="color-control">
        <input type="color" class="color-picker" value="${color}">
        <input type="text" class="color-text" name="color" value="${color}" maxlength="7" pattern="#[0-9A-Fa-f]{6}">
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
        <input type="checkbox" name="showDetectionTime" ${config.showDetectionTime !== false ? "checked" : ""}>
        Show original discovery time
      </label>
      <div class="discord-preview" style="border-left-color:${color}">
        <div class="embed-title">${escapeHtml(titlePrefix)} ${escapeHtml(previewListing?.name || "Latest discovered listing")}</div>
        <div class="embed-desc">${escapeHtml(previewListing?.description?.split("\n\n")[0] || "The most recently discovered listing will appear here.")}</div>
        <div class="preview-gallery-heading">📸 ${escapeHtml(galleryHeading)}</div>
        ${image ? `<img class="embed-img" src="${escapeHtml(image)}" alt="Latest listing preview">` : ""}
        <div class="preview-button">${escapeHtml(storeButtonLabel)}</div>
        <div class="embed-footer">${escapeHtml(footerText)}</div>
      </div>
      <button type="submit" class="btn">💾 Save Appearance</button>
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
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
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

function getSessionSecret(env: any): string {
  // This reuses an existing server-side secret without exposing or modifying it.
  // DISCORD_PUBLIC_KEY is public and must never be used to sign authentication cookies.
  return env.DISCORD_CLIENT_SECRET || "";
}

export async function createSessionCookie(
  userId: string,
  username: string,
  avatarUrl: string,
  secret: string
): Promise<string> {
  const payload = bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify({ userId, username, avatarUrl, issuedAt: Date.now() }))
  );
  const key = await getCryptoKey(secret);
  const encoder = new TextEncoder();
  const sigBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const signature = bytesToBase64Url(new Uint8Array(sigBuffer));
  return `${SESSION_COOKIE}=${payload}.${signature}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`;
}

export async function verifySessionCookie(
  cookieHeader: string | null,
  secret: string,
  primaryAdministratorId = ""
): Promise<SessionUser | null> {
  if (!secret) return null;
  const value = readCookie(cookieHeader, SESSION_COOKIE);
  if (!value) return null;

  try {
    const separator = value.lastIndexOf(".");
    if (separator < 1) return null;
    const payload = value.slice(0, separator);
    const signature = base64UrlToBytes(value.slice(separator + 1));
    const key = await getCryptoKey(secret);
    const isValid = await crypto.subtle.verify("HMAC", key, signature, new TextEncoder().encode(payload));
    if (!isValid) return null;

    const parsed = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload)));
    if (
      typeof parsed.userId !== "string" ||
      typeof parsed.username !== "string" ||
      typeof parsed.avatarUrl !== "string" ||
      typeof parsed.issuedAt !== "number" ||
      Date.now() - parsed.issuedAt > 86400 * 1000 ||
      parsed.issuedAt > Date.now() + 60_000
    ) return null;

    return {
      id: parsed.userId,
      username: parsed.username,
      avatarUrl: parsed.avatarUrl,
      isAdmin: Boolean(primaryAdministratorId) && parsed.userId === primaryAdministratorId,
    };
  } catch {
    return null;
  }
}

export async function getCreatorProfile(env: any): Promise<{ username: string; avatarUrl: string }> {
  const defaultAvatar = "https://cdn.discordapp.com/embed/avatars/0.png";
  const defaultProfile = { username: "xchasex", avatarUrl: defaultAvatar };

  const kv = env.DISCORD_BOT as KVNamespace;
  if (kv) {
    const cached = await kv.get("creator:profile");
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {}
    }
  }

  const token = env.DISCORD_BOT_TOKEN;
  if (!token) return defaultProfile;

  try {
    const primaryAdministratorId = env.DISCORD_PRIMARY_ADMINISTRATOR;
    if (!primaryAdministratorId) return defaultProfile;
    const res = await fetch(`https://discord.com/api/v10/users/${primaryAdministratorId}`, {
      headers: { Authorization: `Bot ${token}` },
    });
    if (res.ok) {
      const data: any = await res.json();
      const avatarUrl = data.avatar
        ? `https://cdn.discordapp.com/avatars/${primaryAdministratorId}/${data.avatar}.png?size=64`
        : defaultAvatar;
      const profile = { username: data.username || "xchasex", avatarUrl };
      if (kv) {
        await kv.put("creator:profile", JSON.stringify(profile), { expirationTtl: 86400 });
      }
      return profile;
    }
  } catch (err) {
    console.error("Failed to fetch creator profile:", err);
  }

  return defaultProfile;
}

async function getBotGuilds(env: any): Promise<BotGuild[]> {
  const token = env.DISCORD_BOT_TOKEN;
  if (!token) return [];

  const guilds: BotGuild[] = [];
  let after = "";
  try {
    for (;;) {
      const params = new URLSearchParams({ limit: "200", with_counts: "true" });
      if (after) params.set("after", after);
      const response = await fetch(`https://discord.com/api/v10/users/@me/guilds?${params}`, {
        headers: { Authorization: `Bot ${token}` },
      });
      if (!response.ok) {
        console.error("Failed to fetch bot guilds:", response.status, await response.text());
        return [];
      }
      const page = (await response.json()) as BotGuild[];
      guilds.push(...page);
      if (page.length < 200) break;
      after = page[page.length - 1].id;
    }
  } catch (error) {
    console.error("Failed to fetch bot guilds:", error);
    return [];
  }
  return guilds;
}

export async function handleLoginRedirect(request: Request, env: any): Promise<Response> {
  // If the user already has a valid session, bypass the OAuth flow
  const sessionSecret = getSessionSecret(env);
  const existingUser = await verifySessionCookie(
    request.headers.get("Cookie"), sessionSecret, env.DISCORD_PRIMARY_ADMINISTRATOR
  );
  const url = new URL(request.url);
  if (existingUser) {
    // Redirect to dashboard (or home) where the user can see their servers
    return Response.redirect(`${url.origin}/dashboard`, 302);
  }

   const redirectUri = `${url.origin}${REDIRECT_PATH}`;
   const appId = env.DISCORD_APPLICATION_ID || env.DISCORD_CLIENT_ID || "1571958001928245378";

   if (!env.DISCORD_CLIENT_SECRET) {
     return new Response(
       renderOAuthSetupNotice(
         "DISCORD_CLIENT_SECRET is missing. Please add it in your environment settings (Variables & Secrets) to activate Discord login."
       ),
       { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
     );
   }

   const state = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
   const discordAuthUrl = `https://discord.com/oauth2/authorize?client_id=${appId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=identify%20guilds&state=${encodeURIComponent(state)}`;

   return new Response(null, {
     status: 302,
     headers: {
       Location: discordAuthUrl,
       "Set-Cookie": `${OAUTH_STATE_COOKIE}=${state}; Path=${REDIRECT_PATH}; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
     },
   });
 }
export async function handleOAuthCallback(request: Request, env: any): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const redirectUri = `${url.origin}${REDIRECT_PATH}`;
  const appId = env.DISCORD_APPLICATION_ID || env.DISCORD_CLIENT_ID || "1571958001928245378";
  const clientSecret = env.DISCORD_CLIENT_SECRET;
  const sessionSecret = getSessionSecret(env);
  const returnedState = url.searchParams.get("state");
  const expectedState = readCookie(request.headers.get("Cookie"), OAUTH_STATE_COOKIE);

  if (!code || !clientSecret || !sessionSecret) {
    return new Response("Missing authorization code or server-side OAuth configuration", { status: 400 });
  }
  if (!returnedState || !expectedState || returnedState !== expectedState) {
    return new Response("Invalid or expired OAuth state. Please return home and try logging in again.", { status: 400 });
  }

  // Exchange code for access token
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

  // Fetch Discord user info
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

  // If this is Chase, cache the profile image
  if (userData.id === env.DISCORD_PRIMARY_ADMINISTRATOR && env.DISCORD_BOT) {
    await env.DISCORD_BOT.put(
      "creator:profile",
      JSON.stringify({ username: userData.username || "xchasex", avatarUrl }),
      { expirationTtl: 86400 }
    );
  }

  // Fetch user's managed guilds to show in their dashboard
  try {
    const guildsRes = await fetch("https://discord.com/api/v10/users/@me/guilds", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (guildsRes.ok && env.DISCORD_BOT) {
      const guildsData = await guildsRes.json();
      await env.DISCORD_BOT.put(`user_guilds:${userData.id}`, JSON.stringify(guildsData), {
        expirationTtl: 86400,
      });
    }
  } catch (err) {
    console.error("Failed to fetch user guilds:", err);
  }

  const cookie = await createSessionCookie(userData.id, userData.username, avatarUrl, sessionSecret);

  const destination = userData.id === env.DISCORD_PRIMARY_ADMINISTRATOR ? "/admin" : "/dashboard";
  return new Response(null, {
    status: 302,
    headers: {
      Location: destination,
      "Set-Cookie": cookie,
      "Cache-Control": "no-store",
    },
  });
}

export async function renderDashboard(request: Request, env: any): Promise<Response> {
  const sessionSecret = getSessionSecret(env);
  const user = await verifySessionCookie(
    request.headers.get("Cookie"), sessionSecret, env.DISCORD_PRIMARY_ADMINISTRATOR
  );

  if (!user) {
    return handleLoginRedirect(request, env);
  }

  const url = new URL(request.url);
  if (user.isAdmin && url.pathname === "/dashboard") {
    return Response.redirect(`${url.origin}/admin`, 302);
  }
  if (!user.isAdmin && url.pathname === "/admin") {
    return Response.redirect(`${url.origin}/dashboard`, 302);
  }
  const alertSent = url.searchParams.get("alert") === "sent";
  const config = await getEmbedConfig(env);
  const listingHistory = await getListingHistory(env);
  const latestListing = listingHistory[0]?.payload || getKnownCars()[0];
  const adminAppearanceControls = renderAppearanceControls(config, "/admin/save-config", latestListing);
  const appId = env.DISCORD_APPLICATION_ID || env.DISCORD_CLIENT_ID || "1571958001928245378";

  // Discord is authoritative for bot membership; KV only stores per-server configuration.
  const guildIds = await getAllGuildIds(env);
  const botGuilds = await getBotGuilds(env);
  const botGuildIds = new Set(botGuilds.map((guild) => guild.id));
  const connectedGuilds: any[] = [];
  for (const guild of botGuilds) {
    const guildConfig = await getGuildConfig(env, guild.id);
    connectedGuilds.push({ ...guild, config: guildConfig });
  }
  // Preserve configured entries if Discord is temporarily unavailable.
  if (connectedGuilds.length === 0) {
    for (const id of guildIds) {
      const guildConfig = await getGuildConfig(env, id);
      if (guildConfig) {
        botGuildIds.add(id);
        connectedGuilds.push({ id, name: `Server ${id}`, config: guildConfig });
      }
    }
  }

  // If regular user, read their cached guilds
  let userManagedGuilds: any[] = [];
  if (!user.isAdmin && env.DISCORD_BOT) {
    const raw = await env.DISCORD_BOT.get(`user_guilds:${user.id}`);
    if (raw) {
      try {
        const allUserGuilds: any[] = JSON.parse(raw);
        // Filter guilds where user has MANAGE_GUILD (0x20) or ADMINISTRATOR (0x8) or is owner
        userManagedGuilds = allUserGuilds.filter((g) => {
          if (g.owner) return true;
          const perms = BigInt(g.permissions || "0");
          return (perms & 0x20n) === 0x20n || (perms & 0x8n) === 0x8n;
        });
      } catch {}
    }
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Everfall Watcher – ${user.isAdmin ? "Administrator Dashboard" : "Server Dashboard"}</title>
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
    .user-profile-header {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .avatar-header {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      border: 2px solid var(--primary);
    }
    .badge-admin {
      background: rgba(245, 158, 11, 0.15);
      color: var(--accent);
      border: 1px solid rgba(245, 158, 11, 0.3);
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.8rem;
      font-weight: 700;
    }
    .badge-user {
      background: rgba(88, 101, 242, 0.15);
      color: #93C5FD;
      border: 1px solid rgba(88, 101, 242, 0.3);
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.8rem;
      font-weight: 700;
    }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    @media(max-width: 800px) { .grid { grid-template-columns: 1fr; } }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 24px;
    }
    h2 { font-size: 1.25rem; font-weight: 700; margin-bottom: 16px; }
    label { display: block; font-size: 0.85rem; color: var(--muted); margin-bottom: 6px; font-weight: 600; }
    input[type="text"] {
      width: 100%;
      background: rgba(0,0,0,0.25);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px 14px;
      color: var(--text);
      font-family: inherit;
      font-size: 0.95rem;
      margin-bottom: 16px;
    }
    .color-control { display:grid; grid-template-columns:52px 1fr; gap:10px; align-items:start; }
    input[type="color"] { width:52px; height:42px; padding:3px; border-radius:8px; border:1px solid var(--border); background:rgba(0,0,0,.25); cursor:pointer; }
    .checkbox-label { display:flex; align-items:center; gap:9px; margin-bottom:18px; cursor:pointer; }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background: var(--primary);
      color: #fff;
      font-weight: 600;
      padding: 10px 18px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      font-size: 0.95rem;
      transition: background 0.15s ease;
      text-decoration: none;
    }
    .btn:hover { background: var(--primary-hover); }
    .btn-secondary { background: rgba(255,255,255,0.08); color: var(--text); }
    .btn-secondary:hover { background: rgba(255,255,255,0.15); }
    .discord-preview {
      background: #2B2D31;
      border-radius: 8px;
      padding: 16px;
      border-left: 4px solid ${config.color || "#F59E0B"};
      margin-top: 14px;
    }
    .embed-title { font-weight: 700; font-size: 1rem; color: #00A8FC; margin-bottom: 6px; }
    .embed-desc { font-size: 0.85rem; color: #DBDEE1; margin-bottom: 12px; line-height: 1.4; }
    .embed-img { width: 100%; border-radius: 6px; margin-bottom: 8px; aspect-ratio: 16/9; object-fit: cover; }
    .embed-footer { font-size: 0.75rem; color: #949BA4; }
    .preview-gallery-heading { color:#DBDEE1; font-size:.82rem; font-weight:700; margin:10px 0 7px; }
    .preview-button { display:inline-block; color:#fff; background:#5865F2; border-radius:5px; padding:6px 10px; font-size:.75rem; font-weight:700; margin:4px 0 10px; }
    .server-item {
      padding: 14px;
      background: rgba(0,0,0,0.25);
      border: 1px solid var(--border);
      border-radius: 10px;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }
    .server-name { font-weight: 700; font-size: 1rem; display: flex; align-items: center; gap: 8px; }
    .appearance-form { width:100%; margin-top:14px; padding-top:18px; border-top:1px solid var(--border); }
  </style>
</head>
<body>
  <div class="wrapper">
    <header>
      <div class="user-profile-header">
        <img src="${user.avatarUrl}" alt="${user.username}" class="avatar-header">
        <div>
          <h1 style="font-size: 1.35rem; font-weight: 800;">${user.username}</h1>
          <p style="color:var(--muted); font-size:0.85rem;">
            ${user.isAdmin ? "Administrator Dashboard" : "Server Manager Dashboard"} &bull; Discord ID: ${user.id}
          </p>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:14px;">
        <span class="${user.isAdmin ? "badge-admin" : "badge-user"}">
          ${user.isAdmin ? "🛡️ Master Administrator" : "🎮 Server Manager"}
        </span>
        <a href="/" style="color:var(--muted); text-decoration:none; font-size:0.9rem;">Home</a>
        <a href="/logout" style="color:#EF4444; text-decoration:none; font-size:0.9rem; font-weight:600;">Log Out</a>
      </div>
    </header>

    ${
      alertSent
        ? `<div style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); color: #34D399; padding: 14px 18px; border-radius: 10px; margin-bottom: 24px; font-weight: 600;">
            🎉 Test Broadcast Dispatched! The latest available discovery batch was sent to configured channels.
          </div>`
        : ""
    }

    ${
      user.isAdmin
        ? `
      <!-- Master Administrator View -->
      <div class="grid">
        <div class="card">
          <h2>🎨 Listing Presentation Controls</h2>
          ${adminAppearanceControls}

          <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--border);">
            <h2>🚀 Test Live Drop Broadcast</h2>
            <p style="color:var(--muted); font-size:0.85rem; margin-bottom: 14px;">
              Broadcasts only the most recently discovered listing batch with its preserved discovery time, gallery, and role mentions to configured servers.
            </p>
            <form action="/admin/test-alert" method="POST">
              <button type="submit" class="btn btn-secondary">⚡ Broadcast Latest Discovery (Test)</button>
            </form>
          </div>
        </div>

        <div class="card">
          <h2>📡 All Connected Discord Servers (${connectedGuilds.length})</h2>
          <p style="color:var(--muted); font-size:0.85rem; margin-bottom:16px;">
            Every server Discord reports the bot is currently installed in. Configuration status is shown separately.
          </p>
          ${
            connectedGuilds.length === 0
              ? '<p style="color:var(--muted); font-size:0.88rem;">Discord did not return any installed servers.</p>'
              : connectedGuilds
                  .map(
                    (g) => `
                <div class="server-item">
                  <div>
                    <div class="server-name">${g.name || `Server ${g.id}`}</div>
                    <div style="font-size:0.85rem; color:var(--muted); margin-top:4px;">
                      <b>ID:</b> ${g.id} &bull; <b>Alert Channel:</b> ${g.config?.channelId ? `&lt;#${g.config.channelId}&gt;` : "Not configured"} &bull; <b>Roles:</b> ${
                      g.config?.roleIds?.length ? g.config.roleIds.join(", ") : "None"
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
      `
        : `
      <!-- Server Manager / Member View -->
      <div class="card">
        <h2>🖥️ Your Managed Discord Servers</h2>
        <p style="color:var(--muted); font-size:0.9rem; margin-bottom:20px;">
          Below are the Discord servers you manage. Check if Everfall Limited Watcher is active, or add it with one click:
        </p>

        ${
          userManagedGuilds.length === 0
            ? `<div style="text-align:center; padding:32px 16px;">
                <p style="color:var(--muted); margin-bottom:16px;">No servers found with Manage Server or Administrator permissions.</p>
                <a href="https://discord.com/oauth2/authorize?client_id=${appId}&permissions=8462865837583424&integration_type=0&scope=bot+applications.commands" target="_blank" class="btn">
                  ➕ Add Bot to a New Server
                </a>
              </div>`
            : userManagedGuilds
                .map((g) => {
                  const botConfig = connectedGuilds.find((guild) => guild.id === g.id)?.config;
                  const isInstalled = botGuildIds.has(g.id);
                  const iconUrl = g.icon
                    ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64`
                    : null;

                  return `
              <div class="server-item">
                <div style="display:flex; align-items:center; gap:12px;">
                  ${
                    iconUrl
                      ? `<img src="${iconUrl}" alt="${g.name}" style="width:40px; height:40px; border-radius:10px;">`
                      : `<div style="width:40px; height:40px; border-radius:10px; background:rgba(255,255,255,0.08); display:flex; align-items:center; justify-content:center; font-weight:700;">${g.name.substring(
                          0,
                          2
                        )}</div>`
                  }
                  <div>
                    <div class="server-name">${g.name}</div>
                    <div style="font-size:0.82rem; color:var(--muted);">
                      ${
                        isInstalled
                          ? botConfig?.channelId
                            ? `Alert Channel: &lt;#${botConfig.channelId}&gt; &bull; Roles: ${
                                botConfig.roleIds?.length ? botConfig.roleIds.length + " configured" : "None"
                              }`
                            : "Bot installed • Alert channel not configured"
                          : "Bot not yet installed"
                      }
                    </div>
                  </div>
                </div>

                <div>
                  ${
                    isInstalled
                      ? `<span style="font-size:0.85rem; color:#34D399; font-weight:700; padding:6px 14px; background:rgba(16, 185, 129, 0.12); border-radius:8px; border:1px solid rgba(16, 185, 129, 0.3);">
                          🟢 Active & Watching
                        </span>`
                      : `<a href="https://discord.com/oauth2/authorize?client_id=${appId}&guild_id=${g.id}&permissions=8462865837583424&integration_type=0&scope=bot+applications.commands" target="_blank" class="btn" style="font-size:0.85rem; padding:8px 14px;">
                          ➕ Invite Bot
                        </a>`
                  }
                </div>
                ${
                  isInstalled
                    ? `<div style="width:100%;"><h3 style="font-size:1rem; margin-top:8px;">Customize this server's listing alerts</h3>
                        <p style="color:var(--muted); font-size:.82rem;">Preview uses the most recently discovered listing. These settings apply only to this server.</p>
                        ${renderAppearanceControls({ ...config, ...(botConfig?.embedConfig || {}) }, "/dashboard/save-config", latestListing, g.id)}
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
    document.querySelectorAll('.appearance-form').forEach((form) => {
      const picker = form.querySelector('.color-picker');
      const colorText = form.querySelector('.color-text');
      const preview = form.querySelector('.discord-preview');
      const syncColor = (value) => {
        if (/^#[0-9a-f]{6}$/i.test(value)) {
          picker.value = value;
          colorText.value = value.toUpperCase();
          preview.style.borderLeftColor = value;
        }
      };
      picker.addEventListener('input', () => syncColor(picker.value));
      colorText.addEventListener('input', () => syncColor(colorText.value));
      const bindings = [
        ['titlePrefix', '.embed-title', (value) => value + ' ${escapeHtml(latestListing?.name || "Latest listing")}'],
        ['footerText', '.embed-footer'],
        ['galleryHeading', '.preview-gallery-heading', (value) => '📸 ' + value],
        ['storeButtonLabel', '.preview-button'],
      ];
      bindings.forEach(([name, selector, transform]) => {
        const input = form.querySelector('[name="' + name + '"]');
        const target = form.querySelector(selector);
        if (input && target) input.addEventListener('input', () => { target.textContent = transform ? transform(input.value) : input.value; });
      });
    });
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
    request.headers.get("Cookie"), sessionSecret, env.DISCORD_PRIMARY_ADMINISTRATOR
  );

  if (!user || !user.isAdmin) {
    return new Response("Unauthorized", { status: 401 });
  }

  const formData = await request.formData();
  await setEmbedConfig(env, parseEmbedConfig(formData));

  return Response.redirect(new URL("/admin", request.url).toString(), 303);
}

function parseEmbedConfig(formData: FormData): EmbedConfig {
  const submittedColor = String(formData.get("color") || "").toUpperCase();
  const color = /^#[0-9A-F]{6}$/.test(submittedColor) ? submittedColor : "#F59E0B";
  return {
    color,
    titlePrefix: String(formData.get("titlePrefix") || "").slice(0, 120),
    footerText: String(formData.get("footerText") || "").slice(0, 180),
    galleryHeading: String(formData.get("galleryHeading") || "").slice(0, 80),
    storeButtonLabel: String(formData.get("storeButtonLabel") || "").slice(0, 80),
    showDetectionTime: formData.get("showDetectionTime") === "on",
  };
}

export async function handleSaveGuildConfig(request: Request, env: any): Promise<Response> {
  const sessionSecret = getSessionSecret(env);
  const user = await verifySessionCookie(
    request.headers.get("Cookie"), sessionSecret, env.DISCORD_PRIMARY_ADMINISTRATOR
  );
  if (!user) return new Response("Unauthorized", { status: 401 });

  const formData = await request.formData();
  const guildId = String(formData.get("guildId") || "");
  if (!/^\d{17,20}$/.test(guildId)) return new Response("Invalid server", { status: 400 });

  let authorized = user.isAdmin;
  if (!authorized && env.DISCORD_BOT) {
    const raw = await env.DISCORD_BOT.get(`user_guilds:${user.id}`);
    const guilds: any[] = raw ? JSON.parse(raw) : [];
    authorized = guilds.some((guild) => {
      if (guild.id !== guildId) return false;
      if (guild.owner) return true;
      const permissions = BigInt(guild.permissions || "0");
      return (permissions & 0x20n) === 0x20n || (permissions & 0x8n) === 0x8n;
    });
  }
  if (!authorized) return new Response("Forbidden", { status: 403 });

  const existing = (await getGuildConfig(env, guildId)) || { channelId: "", roleIds: [] };
  await setGuildConfig(env, guildId, { ...existing, embedConfig: parseEmbedConfig(formData) });
  return Response.redirect(new URL("/dashboard", request.url).toString(), 303);
}

export async function handleTestAlert(request: Request, env: any): Promise<Response> {
  const sessionSecret = getSessionSecret(env);
  const user = await verifySessionCookie(
    request.headers.get("Cookie"), sessionSecret, env.DISCORD_PRIMARY_ADMINISTRATOR
  );

  if (!user || !user.isAdmin) {
    return new Response("Unauthorized", { status: 401 });
  }

  await broadcastAllListings(env, true);

  return Response.redirect(new URL("/admin?alert=sent", request.url).toString(), 303);
}

function renderOAuthSetupNotice(msg: string): string {
  return `<!DOCTYPE html><html><body style="background:#0B0E14;color:#fff;font-family:sans-serif;padding:40px;text-align:center;">
    <h2>⚙️ Discord OAuth2 Setup Required</h2>
    <p style="color:#F59E0B; margin: 16px 0;">${msg}</p>
    <div style="background:#141824; max-width:600px; margin:20px auto; padding:20px; border-radius:12px; text-align:left; font-size:0.9rem; border:1px solid rgba(255,255,255,0.1);">
      <ol style="margin-left: 20px; line-height: 1.8;">
        <li>Go to <a href="https://discord.com/developers/applications" target="_blank" style="color:#5865F2;">Discord Developer Portal</a> &rarr; Your App.</li>
        <li>Under <b>OAuth2</b> &rarr; <b>Redirects</b>, add: <br><code style="background:rgba(0,0,0,0.4); padding:3px 6px; border-radius:4px;">https://everfall-limited-watcher.itschase.workers.dev/auth/callback</code></li>
        <li>Under <b>OAuth2</b>, copy your <b>Client Secret</b>.</li>
        <li>In your environment settings, add secret <code>DISCORD_CLIENT_SECRET</code>.</li>
      </ol>
    </div>
    <p><a href="/" style="color:#5865F2;">Return to Home</a></p>
  </body></html>`;
}
