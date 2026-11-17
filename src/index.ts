import { handleInteraction } from "./commands";
import { runCron, getArchivedListingImage } from "./scraper";
import { renderLandingPage } from "./landing";
import { registerCommands } from "./register";
import {
  handleLoginRedirect,
  handleOAuthCallback,
  renderDashboard,
  handleSaveConfig,
  handleSaveGuildSettings,
  handleTestAlert,
  handleManualPull,
  verifySessionCookie,
  getCreatorProfile,
} from "./admin";
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

export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/.well-known/discord") {
      return new Response("dh=d0600a94d4fa65192fc95f7b86f65fb91373ef4c", {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "public, max-age=300",
        },
      });
    }

    // Favicon & Icon Routes
    if (url.pathname === "/favicon.ico" || url.pathname === "/icon.webp" || url.pathname === "/icon.png") {
      return getLogoBinaryResponse();
    }

    const mediaMatch = url.pathname.match(/^\/media\/listings\/(\d+)\/(\d+)$/);
    if (mediaMatch) {
      return getArchivedListingImage(env, mediaMatch[1], Number(mediaMatch[2]));
    }

    // 1. Discord Interactions Webhook Endpoint
    if (request.method === "POST" && url.pathname === "/interactions") {
      return handleInteraction(request, env);
    }

    // 2. Cron & Health Endpoints
    if (request.method === "POST" && url.pathname === "/cron") {
      await runCron(env);
      return new Response("Cron executed", { status: 200 });
    }

    if (url.pathname === "/health") {
      return new Response("Everfall Limited Watcher is alive", { status: 200 });
    }

    // 3. Command Registration Endpoint
    if (url.pathname === "/register-commands") {
      return registerCommands(env);
    }

    // 4. User & Admin OAuth2 / Dashboard Routes
    if (url.pathname === "/login") {
      return await handleLoginRedirect(request, env);
    }

    if (url.pathname === "/auth/callback") {
      return handleOAuthCallback(request, env);
    }

    if (url.pathname === "/admin" || url.pathname === "/dashboard") {
      return renderDashboard(request, env);
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
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/",
          "Set-Cookie": "everfall_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
        },
      });
    }

    // 5. Default Public Landing Page
    const appId = env.DISCORD_APPLICATION_ID || env.DISCORD_CLIENT_ID || "1571958001928245378";
    const sessionSecret = env.DISCORD_CLIENT_SECRET || "";
    const currentUser = await verifySessionCookie(
      request.headers.get("Cookie"), sessionSecret, env.DISCORD_PRIMARY_ADMINISTRATOR
    );
    const creatorProfile = await getCreatorProfile(env);

    const history = await getListingHistory(env);
    const displayListings = history.map((record) => ({
      ...record.payload,
      id: record.id,
      detectedAt: record.firstSeenAt,
      isAvailable: record.isAvailable,
    }));
    const monitorStatus = await getMonitorStatus(env);

    return renderLandingPage(appId, displayListings, currentUser, creatorProfile, monitorStatus);
  },

  async scheduled(controller: any, env: any, ctx: any): Promise<void> {
    await runCron(env);
  },
};
