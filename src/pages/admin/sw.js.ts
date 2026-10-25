import type { APIRoute } from "astro";
import workerSource from "../../lib/pwa/admin-worker.js?raw";

export const GET: APIRoute = () => new Response(workerSource, {
  headers: {
    "Content-Type": "application/javascript; charset=utf-8",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Service-Worker-Allowed": "/admin/",
  },
});
