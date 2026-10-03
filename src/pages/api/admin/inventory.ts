import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../lib/supabase/server-client";
import {
  markProductOutOfStock,
  requireAdmin,
  updateInventoryQuantity,
} from "../../../services/admin-catalog";
import {
  inventoryAdjustmentSchema,
  markOutOfStockSchema,
} from "../../../validations/admin-catalog";

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

  const body = await context.request.json();

  if (body.action === "mark_out_of_stock") {
    const payload = markOutOfStockSchema.safeParse(body);
    if (!payload.success) {
      return json({ error: "El producto seleccionado no es válido." }, headers, 400);
    }

    try {
      const item = await markProductOutOfStock(supabase, payload.data.productId, user.id);
      return json({ item, availabilityStatus: "out_of_stock" }, headers);
    } catch {
      return json({ error: "No fue posible marcar el producto como agotado." }, headers, 500);
    }
  }

  const payload = inventoryAdjustmentSchema.safeParse(body);
  if (!payload.success) {
    return json({ error: "La cantidad debe ser un número entero igual o mayor a cero." }, headers, 400);
  }

  try {
    const item = await updateInventoryQuantity(supabase, payload.data.productId, payload.data.quantity, user.id);
    return json({ item }, headers);
  } catch {
    return json({ error: "No fue posible actualizar las existencias." }, headers, 500);
  }
};
