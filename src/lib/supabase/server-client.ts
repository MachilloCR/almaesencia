import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import type { APIContext } from "astro";
import type { Database } from "../../types/database";

type SupabaseServerContext = Pick<APIContext, "cookies" | "request">;

export function createSupabaseServerClient(context: SupabaseServerContext, responseHeaders?: Headers) {
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const key = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("Faltan las variables públicas de Supabase.");
  }

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return parseCookieHeader(context.request.headers.get("Cookie") ?? "");
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value, options }) => {
          context.cookies.set(name, value, options);
        });

        Object.entries(headers).forEach(([name, value]) => responseHeaders?.set(name, value));
      },
    },
  });
}

export function redirectWithSupabaseHeaders(url: URL, responseHeaders: Headers) {
  responseHeaders.set("Location", url.toString());

  return new Response(null, {
    status: 303,
    headers: responseHeaders,
  });
}
