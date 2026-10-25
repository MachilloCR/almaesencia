import { defineMiddleware } from "astro:middleware";
import { createSupabaseServerClient } from "./lib/supabase/server-client";

export const onRequest = defineMiddleware(async (context, next) => {
  const isAdminPage = context.url.pathname === "/admin" || context.url.pathname.startsWith("/admin/");

  // API routes create their own Supabase client and validate authorization in
  // the handler. Avoid refreshing the same auth session in middleware and
  // again in the API handler, which can race while rotating refresh cookies.
  if (!isAdminPage) return next();

  const responseHeaders = new Headers();
  const supabase = createSupabaseServerClient(context, responseHeaders);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  context.locals.supabase = supabase;
  context.locals.user = user;

  const response = await next();
  responseHeaders.forEach((value, name) => response.headers.set(name, value));

  return response;
});
