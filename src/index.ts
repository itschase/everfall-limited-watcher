import { handleInteraction } from "./commands";
import { runCron } from "./scraper";

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
    // Simple health check
    return new Response("Everfall Limited Watcher is alive", { status: 200 });
  },
  async scheduled(controller: any, env: any, ctx: any): Promise<void> {
    await runCron(env);
  },
};
