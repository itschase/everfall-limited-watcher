import { handleInteraction } from "./commands";
import { runCron, fetchStoreListings, getKnownCars } from "./scraper";
import { renderLandingPage } from "./landing";
import { registerCommands } from "./register";
import {
  handleLoginRedirect,
  handleOAuthCallback,
  renderAdminDashboard,
  handleSaveConfig,
  handleTestAlert,
} from "./admin";

export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    const url = new URL(request.url);

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

    // 4. Admin OAuth2 & Portal Routes
    if (url.pathname === "/login") {
      return handleLoginRedirect(request, env);
    }

    if (url.pathname === "/auth/callback") {
      return handleOAuthCallback(request, env);
    }

    if (url.pathname === "/admin") {
      return renderAdminDashboard(request, env);
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
          "Set-Cookie": "admin_session=; Path=/; HttpOnly; Max-Age=0",
        },
      });
    }

    // 5. Default Public Landing Page
    const appId = env.DISCORD_APPLICATION_ID || env.DISCORD_CLIENT_ID || "1571958001928245378";
    const { listings } = await fetchStoreListings();
    const displayListings = listings && listings.length > 0 ? listings : getKnownCars();
    return renderLandingPage(appId, displayListings);
  },

  async scheduled(controller: any, env: any, ctx: any): Promise<void> {
    await runCron(env);
  },
};
