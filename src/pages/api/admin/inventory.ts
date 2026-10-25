import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../lib/supabase/server-client";
import {
  InventoryChangedError,
  requireAdmin,
  setAdminProductInventory,
} from "../../../services/admin-catalog";
import { adminInventoryUpdateSchema } from "../../../validations/admin-catalog";

function json(data: unknown, headers: Headers, status = 200) {
  return Response.json(data, { status, headers });
}

export const PATCH: APIRoute = async (context) => {
  const headers = new Headers();
  const supabase = createSupabaseServerClient(context, headers);
  const user = await requireAdmin(supabase);

  if (!user) {
    return json({ error: "No tienes autorización para realizar esta acción." }, headers, 401);
  }

  const payload = adminInventoryUpdateSchema.safeParse(await context.request.json());
  if (!payload.success) {
    return json({ error: "Revisa la cantidad y la disponibilidad del producto." }, headers, 400);
  }

  try {
    const result = await setAdminProductInventory(supabase, payload.data);
    return json(result, headers);
  } catch (error) {
    if (error instanceof InventoryChangedError) return json({ error: error.message }, headers, 409);
    return json({ error: "No fue posible actualizar las existencias y la disponibilidad." }, headers, 500);
  }
};
