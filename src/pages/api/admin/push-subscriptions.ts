import type { APIRoute } from "astro";
import { requireAdmin } from "../../../services/admin-catalog";
import { createSupabaseServerClient } from "../../../lib/supabase/server-client";
import { pushSubscriptionRemovalSchema, pushSubscriptionSchema } from "../../../validations/admin-push";

export const POST: APIRoute = async (context) => {
  const headers = new Headers();
  const supabase = createSupabaseServerClient(context, headers);
  const admin = await requireAdmin(supabase);
  if (!admin) return Response.json({ error: "No autorizado." }, { status: 401, headers });

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: "La suscripción no es válida." }, { status: 400, headers });
  }

  const parsed = pushSubscriptionSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "La suscripción no es válida." }, { status: 400, headers });

  const { error } = await supabase.from("admin_push_subscriptions").upsert({
    admin_user_id: admin.id,
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
    updated_at: new Date().toISOString(),
  }, { onConflict: "endpoint" });

  if (error) {
    console.error("No fue posible guardar la suscripción de notificaciones", { code: error.code, message: error.message });
    return Response.json({ error: "No fue posible activar las notificaciones." }, { status: 500, headers });
  }

  return Response.json({ ok: true }, { status: 201, headers });
};

export const DELETE: APIRoute = async (context) => {
  const headers = new Headers();
  const supabase = createSupabaseServerClient(context, headers);
  if (!(await requireAdmin(supabase))) return Response.json({ error: "No autorizado." }, { status: 401, headers });

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: "La suscripción no es válida." }, { status: 400, headers });
  }

  const parsed = pushSubscriptionRemovalSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "La suscripción no es válida." }, { status: 400, headers });

  const { error } = await supabase.from("admin_push_subscriptions").delete().eq("endpoint", parsed.data.endpoint);
  if (error) {
    console.error("No fue posible eliminar la suscripción de notificaciones", { code: error.code, message: error.message });
    return Response.json({ error: "No fue posible desactivar las notificaciones." }, { status: 500, headers });
  }

  return Response.json({ ok: true }, { headers });
};
