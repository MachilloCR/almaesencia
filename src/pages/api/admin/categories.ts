import type { APIRoute } from "astro";
import { createCategory, requireAdmin } from "../../../services/admin-catalog";
import { categoryInputSchema } from "../../../validations/admin-catalog";
import { createSupabaseServerClient } from "../../../lib/supabase/server-client";

function json(data: unknown, responseHeaders: Headers, status = 200) {
  return Response.json(data, { status, headers: responseHeaders });
}

export const POST: APIRoute = async (context) => {
  const responseHeaders = new Headers();
  const supabase = createSupabaseServerClient(context, responseHeaders);

  if (!(await requireAdmin(supabase))) {
    return json({ error: "No tienes autorización para realizar esta acción." }, responseHeaders, 401);
  }

  const payload = categoryInputSchema.safeParse(await context.request.json());
  if (!payload.success) {
    return json({ error: "Revisa el nombre y la descripción de la categoría." }, responseHeaders, 400);
  }

  try {
    const category = await createCategory(supabase, payload.data);
    return json({ category }, responseHeaders, 201);
  } catch {
    return json({ error: "No fue posible crear la categoría." }, responseHeaders, 500);
  }
};
