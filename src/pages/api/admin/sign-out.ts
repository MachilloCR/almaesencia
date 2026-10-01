import type { APIRoute } from "astro";
import {
  createSupabaseServerClient,
  redirectWithSupabaseHeaders,
} from "../../../lib/supabase/server-client";

export const POST: APIRoute = async (context) => {
  const responseHeaders = new Headers();
  const supabase = createSupabaseServerClient(context, responseHeaders);
  await supabase.auth.signOut();

  return redirectWithSupabaseHeaders(new URL("/admin/login", context.request.url), responseHeaders);
};
