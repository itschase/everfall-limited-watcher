// admin.ts – User & Admin Dashboard with Discord OAuth2 Authentication

import { getAllGuildIds, getGuildConfig, getEmbedConfig, setEmbedConfig, EmbedConfig } from "./kv";
import { getKnownCars, broadcastAllListings } from "./scraper";
import { EF_LOGO_BASE64 } from "./assets";

export const ADMIN_DISCORD_ID = "151037568484507648";
const REDIRECT_PATH = "/auth/callback";

export interface SessionUser {
  id: string;
  username: string;
  avatarUrl: string;
  isAdmin: boolean;
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

export async function createSessionCookie(
  userId: string,
  username: string,
  avatarUrl: string,
  secret: string
): Promise<string> {
  const timestamp = Date.now().toString();
  const payload = `${userId}:${encodeURIComponent(username)}:${encodeURIComponent(avatarUrl)}:${timestamp}`;
  const key = await getCryptoKey(secret);
  const encoder = new TextEncoder();
  const sigBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const sigHex = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `session=${payload}.${sigHex}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`;
}

export async function verifySessionCookie(
  cookieHeader: string | null,
  secret: string
): Promise<SessionUser | null> {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/session=([^;]+)/);
  if (!match) return null;

  const [payload, sigHex] = match[1].split(".");
  if (!payload || !sigHex) return null;

  const parts = payload.split(":");
  if (parts.length < 4) return null;

  const [userId, encUsername, encAvatar, timestampStr] = parts;
  const timestamp = parseInt(timestampStr, 10);
  if (Date.now() - timestamp > 86400 * 1000) return null;

  const key = await getCryptoKey(secret);
  const expectedBuffer = new Uint8Array(sigHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
  const isValid = await crypto.subtle.verify("HMAC", key, expectedBuffer, new TextEncoder().encode(payload));

  if (!isValid) return null;

  return {
    id: userId,
    username: decodeURIComponent(encUsername),
    avatarUrl: decodeURIComponent(encAvatar),
    isAdmin: userId === ADMIN_DISCORD_ID,
  };
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
    const res = await fetch("https://discord.com/api/v10/users/151037568484507648", {
      headers: { Authorization: `Bot ${token}` },
    });
    if (res.ok) {
      const data: any = await res.json();
      const avatarUrl = data.avatar
        ? `https://cdn.discordapp.com/avatars/151037568484507648/${data.avatar}.png?size=64`
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

export async function handleLoginRedirect(request: Request, env: any): Promise<Response> {
  // If the user already has a valid session, bypass the OAuth flow
  const sessionSecret = env.DISCORD_PUBLIC_KEY || "everfall-fallback-session-key";
  const existingUser = await verifySessionCookie(request.headers.get("Cookie"), sessionSecret);
  if (existingUser) {
    // Redirect to dashboard (or home) where the user can see their servers
    return Response.redirect("/dashboard", 302);
  }


   const url = new URL(request.url);
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

   const discordAuthUrl = `https://discord.com/oauth2/authorize?client_id=${appId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=identify%20guilds`;

   return Response.redirect(discordAuthUrl, 302);
 }
export async function handleOAuthCallback(request: Request, env: any): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const redirectUri = `${url.origin}${REDIRECT_PATH}`;
  const appId = env.DISCORD_APPLICATION_ID || env.DISCORD_CLIENT_ID || "1571958001928245378";
  const clientSecret = env.DISCORD_CLIENT_SECRET;
  const sessionSecret = env.DISCORD_PUBLIC_KEY || "everfall-fallback-session-key";

  if (!code || !clientSecret) {
    return new Response("Missing authorization code or client secret", { status: 400 });
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
  if (userData.id === ADMIN_DISCORD_ID && env.DISCORD_BOT) {
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

  return new Response(null, {
    status: 302,
    headers: {
      Location: "/dashboard",
      "Set-Cookie": cookie,
    },
  });
}

export async function renderDashboard(request: Request, env: any): Promise<Response> {
  const sessionSecret = env.DISCORD_PUBLIC_KEY || "everfall-fallback-session-key";
  const user = await verifySessionCookie(request.headers.get("Cookie"), sessionSecret);

  if (!user) {
    return handleLoginRedirect(request, env);
  }

  const url = new URL(request.url);
  const alertSent = url.searchParams.get("alert") === "sent";
  const config = await getEmbedConfig(env);
  const appId = env.DISCORD_APPLICATION_ID || env.DISCORD_CLIENT_ID || "1571958001928245378";

  // Check connected bot servers in KV
  const guildIds = await getAllGuildIds(env);
  const connectedGuilds: any[] = [];
  for (const id of guildIds) {
    const g = await getGuildConfig(env, id);
    if (g) connectedGuilds.push({ id, ...g });
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
  <title>Everfall Watcher – Dashboard</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" type="image/jpeg" href="${EF_LOGO_BASE64}?v=1">
  <link rel="shortcut icon" type="image/jpeg" href="${EF_LOGO_BASE64}?v=1">
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
    }
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
  </style>
</head>
<body>
  <div class="wrapper">
    <header>
      <div class="user-profile-header">
        <img src="${user.avatarUrl}" alt="${user.username}" class="avatar-header">
        <div>
          <h1 style="font-size: 1.35rem; font-weight: 800;">${user.username}</h1>
          <p style="color:var(--muted); font-size:0.85rem;">Discord ID: ${user.id}</p>
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
            🎉 Test Broadcast Dispatched! Every active store listing has been sent to all connected channels.
          </div>`
        : ""
    }

    ${
      user.isAdmin
        ? `
      <!-- Master Administrator View -->
      <div class="grid">
        <div class="card">
          <h2>🎨 Embed Appearance Settings</h2>
          <form action="/admin/save-config" method="POST">
            <label for="color">Embed Accent Color</label>
            <input type="text" id="color" name="color" value="${config.color || "#F59E0B"}" placeholder="#F59E0B">

            <label for="titlePrefix">Title Prefix / Tag</label>
            <input type="text" id="titlePrefix" name="titlePrefix" value="${
              config.titlePrefix || "<:everfall:1571981507973746868> Limited Edition Drop:"
            }">

            <label for="footerText">Footer Notice</label>
            <input type="text" id="footerText" name="footerText" value="${
              config.footerText || "Everfall Limited Watcher • Verified Drop Alert"
            }">

            <button type="submit" class="btn">💾 Save Embed Appearance</button>
          </form>

          <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--border);">
            <h2>🚀 Test Live Drop Broadcast</h2>
            <p style="color:var(--muted); font-size:0.85rem; margin-bottom: 14px;">
              Broadcasts all active store listings (both <b>73C</b> and <b>Seraph GTS</b>) with the new multi-image gallery view and role mentions to all configured servers.
            </p>
            <form action="/admin/test-alert" method="POST">
              <button type="submit" class="btn btn-secondary">⚡ Broadcast All Active Listings (Test)</button>
            </form>
          </div>
        </div>

        <div class="card">
          <h2>📡 All Connected Discord Servers (${connectedGuilds.length})</h2>
          <p style="color:var(--muted); font-size:0.85rem; margin-bottom:16px;">
            Servers where the bot is installed and configured for vehicle drop alerts:
          </p>
          ${
            connectedGuilds.length === 0
              ? '<p style="color:var(--muted); font-size:0.88rem;">No servers have configured an alert channel yet.</p>'
              : connectedGuilds
                  .map(
                    (g) => `
                <div class="server-item">
                  <div>
                    <div class="server-name">🖥️ Server ID: ${g.id}</div>
                    <div style="font-size:0.85rem; color:var(--muted); margin-top:4px;">
                      <b>Alert Channel:</b> &lt;#${g.channelId}&gt; &bull; <b>Roles:</b> ${
                      g.roleIds?.length ? g.roleIds.join(", ") : "None"
                    }
                    </div>
                  </div>
                  <span style="font-size:0.8rem; color:#34D399; font-weight:600;">🟢 Active</span>
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
                  const botConfig = connectedGuilds.find((cg) => cg.id === g.id);
                  const isInstalled = !!botConfig;
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
                          ? `Alert Channel: &lt;#${botConfig.channelId}&gt; &bull; Roles: ${
                              botConfig.roleIds?.length ? botConfig.roleIds.length + " configured" : "None"
                            }`
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
</body>
</html>`;

  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function handleSaveConfig(request: Request, env: any): Promise<Response> {
  const sessionSecret = env.DISCORD_PUBLIC_KEY || "everfall-fallback-session-key";
  const user = await verifySessionCookie(request.headers.get("Cookie"), sessionSecret);

  if (!user || !user.isAdmin) {
    return new Response("Unauthorized", { status: 401 });
  }

  const formData = await request.formData();
  const color = formData.get("color") as string;
  const titlePrefix = formData.get("titlePrefix") as string;
  const footerText = formData.get("footerText") as string;

  await setEmbedConfig(env, { color, titlePrefix, footerText });

  return Response.redirect(new URL("/dashboard", request.url).toString(), 303);
}

export async function handleTestAlert(request: Request, env: any): Promise<Response> {
  const sessionSecret = env.DISCORD_PUBLIC_KEY || "everfall-fallback-session-key";
  const user = await verifySessionCookie(request.headers.get("Cookie"), sessionSecret);

  if (!user || !user.isAdmin) {
    return new Response("Unauthorized", { status: 401 });
  }

  await broadcastAllListings(env, true);

  return Response.redirect(new URL("/dashboard?alert=sent", request.url).toString(), 303);
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
