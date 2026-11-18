import { handleInteraction } from "./commands";
import { runCron, getArchivedListingImage, ensureHistoricalKnownListingsPreserved } from "./scraper";
import { renderLandingPage } from "./landing";
import { registerCommands } from "./register";
import {
  handleAuthUrl,
  handleAuthHandoff,
  handleLoginRedirect,
  handleOAuthCallback,
  handleSaveConfig,
  handleSaveGuildSettings,
  handleTestAlert,
  handleManualPull,
  verifySessionCookie,
  getSessionSecret,
  getCreatorProfile,
  getRequestOrigin,
  buildLogoutCookies,
} from "./admin";
import { handleApiRequest } from "./api";
import { EF_LOGO_BASE64 } from "./assets";
import { getListingHistory, getMonitorStatus } from "./kv";

function getLogoBinaryResponse(): Response {
  const b64Data = EF_LOGO_BASE64.replace(/^data:image\/webp;base64,/, "");
  const binaryString = atob(b64Data);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

async function isAuthorizedMaintenanceRequest(request: Request, env: any): Promise<boolean> {
  const authHeader = request.headers.get("Authorization") || "";
  const headerSecret = request.headers.get("X-Cron-Secret") || "";
  const cronSecret = env.CRON_SECRET || env.MAINTENANCE_SECRET || "";
  if (cronSecret && (authHeader === `Bearer ${cronSecret}` || headerSecret === cronSecret)) {
    return true;
  }
  const user = await verifySessionCookie(
    request.headers.get("Cookie"),
    getSessionSecret(env),
    env.DISCORD_PRIMARY_ADMINISTRATOR
  );
  return Boolean(user?.isAdmin);
}

export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = getRequestOrigin(request, env);

    if (url.pathname === "/.well-known/discord") {
      return new Response("dh=d0600a94d4fa65192fc95f7b86f65fb91373ef4c", {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "public, max-age=300",
        },
      });
    }

    if (
      url.pathname === "/favicon.ico" ||
      url.pathname === "/icon.webp" ||
      url.pathname === "/icon.png"
    ) {
      return getLogoBinaryResponse();
    }

    const mediaMatch = url.pathname.match(/^\/media\/listings\/(\d+)\/(\d+)$/);
    if (mediaMatch) {
      return getArchivedListingImage(env, mediaMatch[1], Number(mediaMatch[2]), request);
    }

    // 1. Discord Interactions Webhook Endpoint
    if (request.method === "POST" && url.pathname === "/interactions") {
      return handleInteraction(request, env, ctx, origin);
    }

    // 2. Protected Cron & Diagnostics Health Endpoints
    if (url.pathname === "/cron") {
      if (request.method !== "POST" && request.method !== "GET") {
        return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
          status: 405,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      }
      if (!(await isAuthorizedMaintenanceRequest(request, env))) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "Unauthorized /cron trigger.",
            hint: "Send POST /cron with header X-Cron-Secret: <CRON_SECRET> or Authorization: Bearer <CRON_SECRET> (e.g. from cron-job.org).",
          }),
          {
            status: 401,
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          }
        );
      }
      const result = await runCron(env, origin, "cron-fetch");
      return new Response(JSON.stringify({ ok: true, ...result }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }

    if (url.pathname === "/health") {
      const kvAvailable = Boolean(env.DISCORD_BOT);
      const monitorStatus = kvAvailable ? await getMonitorStatus(env) : null;
      return new Response(
        JSON.stringify({
          ok: true,
          service: "Everfall Limited Watcher",
          kvAvailable,
          botConfigured: Boolean(env.DISCORD_BOT_TOKEN),
          lastCheckedAt: monitorStatus?.checkedAt ?? null,
          lastSuccessAt: monitorStatus?.lastSuccessAt ?? null,
          authoritative: monitorStatus?.authoritative ?? null,
        }),
        {
          status: kvAvailable ? 200 : 503,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        }
      );
    }

    // 3. Protected Command Registration Endpoint
    if (url.pathname === "/register-commands") {
      if (!(await isAuthorizedMaintenanceRequest(request, env))) {
        return new Response("Unauthorized", { status: 401 });
      }
      return registerCommands(env);
    }

    // 4. OAuth2 Endpoints
    if (request.method === "GET" && url.pathname === "/api/auth/url") {
      return handleAuthUrl(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/auth/handoff") {
      return handleAuthHandoff(request, env);
    }

    // 5. Typed JSON REST APIs (must run before static asset / SPA fallback)
    if (url.pathname.startsWith("/api/")) {
      const apiRes = await handleApiRequest(request, env, url);
      if (apiRes) return apiRes;
    }

    if (url.pathname === "/login") {
      return handleLoginRedirect(request, env);
    }

    if (url.pathname === "/auth/callback" || url.pathname === "/auth/callback/") {
      return handleOAuthCallback(request, env);
    }

    if (request.method === "POST" && url.pathname === "/admin/save-config") {
      return handleSaveConfig(request, env);
    }

    if (request.method === "POST" && url.pathname === "/dashboard/save-guild") {
      return handleSaveGuildSettings(request, env);
    }

    if (request.method === "POST" && url.pathname === "/admin/test-alert") {
      return handleTestAlert(request, env);
    }

    if (request.method === "POST" && url.pathname === "/admin/pull-current") {
      return handleManualPull(request, env);
    }

    if (url.pathname === "/logout") {
      const headers = new Headers({
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        Vary: "Cookie",
      });
      for (const cookie of buildLogoutCookies(request, env)) {
        headers.append("Set-Cookie", cookie);
      }
      if (request.method === "POST") {
        headers.set("Content-Type", "application/json; charset=utf-8");
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
      }
      headers.set("Location", "/");
      return new Response(null, { status: 302, headers });
    }

    // 6. Serve React SPA & Vite Static Assets
    if (env.ASSETS && (request.method === "GET" || request.method === "HEAD")) {
      const assetResponse = await env.ASSETS.fetch(request);
      const contentType = assetResponse.headers.get("Content-Type") || "";
      if (contentType.includes("text/html")) {
        const headers = new Headers(assetResponse.headers);
        headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
        headers.set("Vary", "Cookie");
        return new Response(assetResponse.body, {
          status: assetResponse.status,
          statusText: assetResponse.statusText,
          headers,
        });
      }
      return assetResponse;
    }

    // Fallback when static asset binding is absent
    await ensureHistoricalKnownListingsPreserved(env, origin);
    const appId = env.DISCORD_APPLICATION_ID || env.DISCORD_CLIENT_ID || "1571958001928245378";
    const currentUser = await verifySessionCookie(
      request.headers.get("Cookie"),
      getSessionSecret(env),
      env.DISCORD_PRIMARY_ADMINISTRATOR
    );
    const creatorProfile = await getCreatorProfile(env);
    const history = await getListingHistory(env);
    const displayListings = history.slice(0, 10).map((record) => ({
      ...record.payload,
      id: record.id,
      detectedAt: record.firstSeenAt,
      isAvailable: record.isAvailable,
    }));
    const monitorStatus = await getMonitorStatus(env);

    return renderLandingPage(appId, displayListings, currentUser, creatorProfile, monitorStatus);
  },

  async scheduled(_controller: any, env: any, _ctx: ExecutionContext): Promise<void> {
    await runCron(env);
  },
};
