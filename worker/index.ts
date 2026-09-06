/** Cloudflare Worker entry point for Twogether. */
import handler from "vinext/server/app-router-entry";
import { sendDueNotifications } from "./push";

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    try {
      const response = await handler.fetch(request, env, ctx);
      const headers = new Headers(response.headers);

      // Login state and couple data must never enter a shared or browser cache.
      headers.set("Cache-Control", "private, no-store");
      headers.set("Vary", "Cookie");
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      console.error(JSON.stringify({
        message: "Unhandled Twogether request error",
        path: url.pathname,
        error: error instanceof Error ? error.message : String(error),
      }));
      return url.pathname.startsWith("/api/")
        ? Response.json({ error: "Something went wrong" }, { status: 500, headers: { "Cache-Control": "no-store" } })
        : new Response("Twogether is temporarily unavailable.", { status: 500, headers: { "Cache-Control": "no-store" } });
    }
  },
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    try {
      await sendDueNotifications(env, controller.scheduledTime);
    } catch (error) {
      console.error(JSON.stringify({
        message: "Scheduled Twogether notification check failed",
        scheduledAt: new Date(controller.scheduledTime).toISOString(),
        error: error instanceof Error ? error.message : String(error),
      }));
      throw error;
    }
  },
} satisfies ExportedHandler<Env>;

export default worker;
