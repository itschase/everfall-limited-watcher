import { handleInteraction } from "./commands";
import { runCron } from "./scraper";
import { renderLandingPage } from "./landing";

export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/interactions") {
      return handleInteraction(request, env);
    }

    if (request.method === "POST" && url.pathname === "/cron") {
      await runCron(env);
      return new Response("Cron executed", { status: 200 });
    }

    if (url.pathname === "/health") {
      return new Response("Everfall Limited Watcher is alive", { status: 200 });
    }

    // Default: Serve responsive landing page with Discord invite CTA
    const appId = env.DISCORD_APPLICATION_ID || "1571958001928245378";
    return renderLandingPage(appId);
  },

  async scheduled(controller: any, env: any, ctx: any): Promise<void> {
    await runCron(env);
  },
};
