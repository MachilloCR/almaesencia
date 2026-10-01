import type { APIRoute } from "astro";
import { z } from "zod";
import {
  createSupabaseServerClient,
  redirectWithSupabaseHeaders,
} from "../../../lib/supabase/server-client";

const credentialsSchema = z.object({
  email: z.string().trim().refine((value) => /^\S+@\S+\.\S+$/.test(value)),
  password: z.string().min(8),
});

export const POST: APIRoute = async (context) => {
  const responseHeaders = new Headers();
  const formData = await context.request.formData();
  const credentials = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!credentials.success) {
    return redirectWithSupabaseHeaders(
      new URL("/admin/login?error=invalid_input", context.request.url),
      responseHeaders,
    );
  }

  const supabase = createSupabaseServerClient(context, responseHeaders);
  const { data, error } = await supabase.auth.signInWithPassword(credentials.data);

  if (error || !data.user) {
    return redirectWithSupabaseHeaders(
      new URL("/admin/login?error=invalid_credentials", context.request.url),
      responseHeaders,
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    await supabase.auth.signOut();
    return redirectWithSupabaseHeaders(
      new URL("/admin/login?error=unauthorized", context.request.url),
      responseHeaders,
    );
  }

  return redirectWithSupabaseHeaders(new URL("/admin", context.request.url), responseHeaders);
};
