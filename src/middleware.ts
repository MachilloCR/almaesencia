import { defineMiddleware } from "astro:middleware";
import { createSupabaseServerClient } from "./lib/supabase/server-client";

export const onRequest = defineMiddleware(async (context, next) => {
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
