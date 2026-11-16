// admin.ts – Web Admin Dashboard & Discord OAuth2 Authentication

import { getAllGuildIds, getGuildConfig, getEmbedConfig, setEmbedConfig, EmbedConfig } from "./kv";
import { getKnownCars, broadcastListing } from "./scraper";

const ADMIN_DISCORD_ID = "151037568484507648";
const REDIRECT_PATH = "/auth/callback";

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

export async function createSessionCookie(userId: string, secret: string): Promise<string> {
  const timestamp = Date.now().toString();
  const payload = `${userId}:${timestamp}`;
  const key = await getCryptoKey(secret);
  const encoder = new TextEncoder();
  const sigBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const sigHex = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `admin_session=${payload}.${sigHex}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`;
}

export async function verifySessionCookie(cookieHeader: string | null, secret: string): Promise<string | null> {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/admin_session=([^;]+)/);
  if (!match) return null;

  const [payload, sigHex] = match[1].split(".");
  if (!payload || !sigHex) return null;

  const [userId, timestampStr] = payload.split(":");
  const timestamp = parseInt(timestampStr, 10);
  // Session expires after 24 hours
  if (Date.now() - timestamp > 86400 * 1000) return null;

  const key = await getCryptoKey(secret);
  const encoder = new TextEncoder();
  const expectedBuffer = new Uint8Array(sigHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
  const isValid = await crypto.subtle.verify("HMAC", key, expectedBuffer, encoder.encode(payload));

  return isValid ? userId : null;
}

export function handleLoginRedirect(request: Request, env: any): Response {
  const url = new URL(request.url);
  const redirectUri = `${url.origin}${REDIRECT_PATH}`;
  const appId = env.DISCORD_APPLICATION_ID || "1571958001928245378";

  if (!env.DISCORD_CLIENT_SECRET) {
    return new Response(
      renderOAuthSetupNotice(
        "DISCORD_CLIENT_SECRET is missing. Please add it in Cloudflare Dashboard (Variables & Secrets) to activate OAuth2 login."
      ),
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  const discordAuthUrl = `https://discord.com/oauth2/authorize?client_id=${appId}&response_type=code&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&scope=identify`;

  return Response.redirect(discordAuthUrl, 302);
}

export async function handleOAuthCallback(request: Request, env: any): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const redirectUri = `${url.origin}${REDIRECT_PATH}`;
  const appId = env.DISCORD_APPLICATION_ID || "1571958001928245378";
  const clientSecret = env.DISCORD_CLIENT_SECRET;
  const sessionSecret = env.DISCORD_PUBLIC_KEY || "everfall-fallback-session-key";

  if (!code || !clientSecret) {
    return new Response("Missing authorization code or client secret", { status: 400 });
  }

  // Exchange code for token
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

  // Authorization check: Only user ID 151037568484507648 is allowed
  if (userData.id !== ADMIN_DISCORD_ID) {
    return new Response(
      `<!DOCTYPE html><html><body style="background:#0B0E14;color:#fff;font-family:sans-serif;padding:40px;text-align:center;">
        <h2>⛔ Access Denied</h2>
        <p>Logged in as <b>${userData.username}</b> (ID: ${userData.id}).</p>
        <p style="color:#ef4444;">Only the designated bot administrator (${ADMIN_DISCORD_ID}) can access this control panel.</p>
        <p><a href="/" style="color:#5865F2;">Return to Home</a></p>
      </body></html>`,
      { status: 403, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  const cookie = await createSessionCookie(userData.id, sessionSecret);

  return new Response(null, {
    status: 302,
    headers: {
      Location: "/admin",
      "Set-Cookie": cookie,
    },
  });
}

export async function renderAdminDashboard(request: Request, env: any): Promise<Response> {
  const sessionSecret = env.DISCORD_PUBLIC_KEY || "everfall-fallback-session-key";
  const userId = await verifySessionCookie(request.headers.get("Cookie"), sessionSecret);

  if (userId !== ADMIN_DISCORD_ID) {
    return handleLoginRedirect(request, env);
  }

  const config = await getEmbedConfig(env);
  const guildIds = await getAllGuildIds(env);
  const guilds = [];
  for (const id of guildIds) {
    const g = await getGuildConfig(env, id);
    if (g) guilds.push({ id, ...g });
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Everfall Watcher – Admin Control Panel</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
    }
    .badge-admin {
      background: rgba(245, 158, 11, 0.15);
      color: var(--accent);
      border: 1px solid rgba(245, 158, 11, 0.3);
      padding: 4px 12px;
      border-radius: 999px;
      font-size: 0.8rem;
      font-weight: 700;
      text-transform: uppercase;
    }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
    @media(max-width: 860px) { .grid { grid-template-columns: 1fr; } }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px;
    }
    .card h2 { font-size: 1.25rem; font-weight: 700; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
    label { display: block; font-size: 0.85rem; font-weight: 600; color: var(--muted); margin-bottom: 6px; }
    input[type="text"], input[type="color"] {
      width: 100%;
      background: rgba(0,0,0,0.25);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px 14px;
      color: #fff;
      font-size: 0.95rem;
      margin-bottom: 18px;
    }
    input[type="color"] { height: 44px; padding: 4px 8px; cursor: pointer; }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: var(--primary);
      color: #fff;
      border: none;
      border-radius: 10px;
      padding: 12px 24px;
      font-weight: 600;
      cursor: pointer;
      font-size: 0.95rem;
      transition: background 0.2s;
    }
    .btn:hover { background: var(--primary-hover); }
    .btn-secondary { background: var(--surface-hover); border: 1px solid var(--border); }
    .btn-secondary:hover { background: rgba(255,255,255,0.1); }
    
    /* Discord Embed Live Preview */
    .discord-preview {
      background: #2B2D31;
      border-radius: 8px;
      padding: 16px;
      border-left: 4px solid ${config.color || "#F59E0B"};
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    }
    .embed-title { font-weight: 700; color: #fff; font-size: 1.05rem; margin-bottom: 8px; }
    .embed-desc { font-size: 0.9rem; color: #DBDEE1; margin-bottom: 12px; }
    .embed-img { width: 100%; max-height: 240px; object-fit: cover; border-radius: 8px; margin-bottom: 12px; }
    .embed-footer { font-size: 0.75rem; color: #949BA4; }
  </style>
</head>
<body>
  <div class="wrapper">
    <header>
      <div>
        <h1 style="font-size:1.6rem; font-weight:800;">Everfall Admin Portal</h1>
        <p style="color:var(--muted); font-size:0.9rem;">Authenticated as Owner (${ADMIN_DISCORD_ID})</p>
      </div>
      <div style="display:flex; gap:12px; align-items:center;">
        <span class="badge-admin">Verified Administrator</span>
        <a href="/logout" style="color:var(--muted); text-decoration:none; font-size:0.85rem;">Log Out</a>
      </div>
    </header>

    <div class="grid">
      <!-- Embed Appearance Customizer -->
      <div class="card">
        <h2>🎨 Discord Embed Customizer</h2>
        <form action="/admin/save-config" method="POST">
          <label for="color">Embed Accent Color</label>
          <input type="color" id="color" name="color" value="${config.color || "#F59E0B"}">

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
          <h2>🚀 Test Live Drop Alert</h2>
          <p style="color:var(--muted); font-size:0.85rem; margin-bottom: 14px;">
            Broadcasts a live sample drop of the <b>73C</b> or <b>Seraph GTS</b> (with pagination buttons & role pings) to all configured channels.
          </p>
          <form action="/admin/test-alert" method="POST">
            <button type="submit" class="btn btn-secondary">⚡ Broadcast Test Drop</button>
          </form>
        </div>
      </div>

      <!-- Live Discord Preview & Connected Servers -->
      <div class="card">
        <h2>👁️ Live Discord Preview</h2>
        <div class="discord-preview">
          <div class="embed-title">${config.titlePrefix || "<:everfall:1571981507973746868> Limited Edition Drop:"} 73C</div>
          <div class="embed-desc">This vehicle is quantity-limited; get it while it is still available. It comes with a custom sound and can only be traded with other limiteds.</div>
          <img class="embed-img" src="https://dunb17ur4ymx4.cloudfront.net/packages/images/1594533412dc1894320075c877107402e62d84a3.webp" alt="Car preview">
          <div class="embed-footer">${config.footerText || "Everfall Limited Watcher • Verified Drop Alert"}</div>
        </div>

        <div style="margin-top:24px;">
          <h2>📡 Connected Discord Servers (${guilds.length})</h2>
          ${
            guilds.length === 0
              ? '<p style="color:var(--muted); font-size:0.88rem;">No servers have configured an alert channel yet.</p>'
              : guilds
                  .map(
                    (g) => `
              <div style="padding:10px 14px; background:rgba(0,0,0,0.2); border-radius:8px; margin-bottom:8px; font-size:0.88rem;">
                <b>Server ID:</b> ${g.id} &bull; <b>Channel:</b> &lt;#${g.channelId}&gt; &bull; <b>Roles:</b> ${
                      g.roleIds.length ? g.roleIds.join(", ") : "None"
                    }
              </div>`
                  )
                  .join("")
          }
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function handleSaveConfig(request: Request, env: any): Promise<Response> {
  const sessionSecret = env.DISCORD_PUBLIC_KEY || "everfall-fallback-session-key";
  const userId = await verifySessionCookie(request.headers.get("Cookie"), sessionSecret);

  if (userId !== ADMIN_DISCORD_ID) {
    return new Response("Unauthorized", { status: 401 });
  }

  const formData = await request.formData();
  const color = formData.get("color") as string;
  const titlePrefix = formData.get("titlePrefix") as string;
  const footerText = formData.get("footerText") as string;

  await setEmbedConfig(env, { color, titlePrefix, footerText });

  return Response.redirect(new URL("/admin", request.url).toString(), 303);
}

export async function handleTestAlert(request: Request, env: any): Promise<Response> {
  const sessionSecret = env.DISCORD_PUBLIC_KEY || "everfall-fallback-session-key";
  const userId = await verifySessionCookie(request.headers.get("Cookie"), sessionSecret);

  if (userId !== ADMIN_DISCORD_ID) {
    return new Response("Unauthorized", { status: 401 });
  }

  const knownCars = getKnownCars();
  const sample = knownCars[0]; // 73C
  if (sample) {
    await broadcastListing(env, sample);
  }

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
        <li>In Cloudflare Dashboard &rarr; Worker &rarr; <b>Settings &rarr; Variables and Secrets</b>, add secret <code>DISCORD_CLIENT_SECRET</code>.</li>
      </ol>
    </div>
    <p><a href="/" style="color:#5865F2;">Return to Home</a></p>
  </body></html>`;
}
