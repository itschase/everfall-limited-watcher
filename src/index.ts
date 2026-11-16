import { handleInteraction } from "./commands";
import { runCron, fetchStoreListings, getKnownCars } from "./scraper";
import { renderLandingPage } from "./landing";
import { registerCommands } from "./register";
import {
  handleLoginRedirect,
  handleOAuthCallback,
  renderDashboard,
  handleSaveConfig,
  handleTestAlert,
  verifySessionCookie,
  getCreatorProfile,
} from "./admin";
import { EF_LOGO_BASE64 } from "./assets";

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

    // Favicon & Icon Routes
    if (url.pathname === "/favicon.ico" || url.pathname === "/icon.webp" || url.pathname === "/icon.png") {
      return getLogoBinaryResponse();
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
      return handleLoginRedirect(request, env);
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

    if (request.method === "POST" && url.pathname === "/admin/test-alert") {
      return handleTestAlert(request, env);
    }

    if (url.pathname === "/logout") {
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/",
          "Set-Cookie": "session=; Path=/; HttpOnly; Max-Age=0",
        },
      });
    }

    // 5. Default Public Landing Page
    const appId = env.DISCORD_APPLICATION_ID || env.DISCORD_CLIENT_ID || "1571958001928245378";
    const sessionSecret = env.DISCORD_PUBLIC_KEY || "everfall-fallback-session-key";
    const currentUser = await verifySessionCookie(request.headers.get("Cookie"), sessionSecret);
    const creatorProfile = await getCreatorProfile(env);

    const { listings } = await fetchStoreListings();
    const displayListings = listings && listings.length > 0 ? listings : getKnownCars();

    return renderLandingPage(appId, displayListings, currentUser, creatorProfile);
  },

  async scheduled(controller: any, env: any, ctx: any): Promise<void> {
    await runCron(env);
  },
};
