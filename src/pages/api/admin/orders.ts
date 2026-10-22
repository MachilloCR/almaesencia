import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../lib/supabase/server-client";
import { requireAdmin } from "../../../services/admin-catalog";
import { orderStatusUpdateSchema } from "../../../validations/admin-orders";

export const PATCH: APIRoute = async (context) => {
  const headers = new Headers();
  const supabase = createSupabaseServerClient(context, headers);
  if (!(await requireAdmin(supabase))) return Response.json({ error: "No autorizado." }, { status: 401, headers });
  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: "El cuerpo JSON no es valido." }, { status: 400, headers });
  }
  const payload = orderStatusUpdateSchema.safeParse(body);
  if (!payload.success) return Response.json({ error: "Estados no válidos." }, { status: 400, headers });
  const value = payload.data;
  if (value.orderStatus === "completed" && value.fulfillmentStatus !== "delivered") {
    return Response.json({ error: "Solo puedes completar un pedido entregado y pagado." }, { status: 400, headers });
  }
  if (value.orderStatus === "completed") {
    const { data: currentOrder, error: currentOrderError } = await supabase
      .from("orders")
      .select("payment_status")
      .eq("id", value.id)
      .single();
    if (currentOrderError || currentOrder.payment_status !== "paid") {
      return Response.json({ error: "Registra el pago completo antes de completar el pedido." }, { status: 400, headers });
    }
  }
  const { data, error } = await supabase.from("orders").update({ order_status: value.orderStatus, procurement_status: value.procurementStatus, fulfillment_status: value.fulfillmentStatus }).eq("id", value.id).select("id, order_status, procurement_status, fulfillment_status, payment_status").single();
  if (error) {
    console.error("No fue posible actualizar los estados del pedido", {
      code: error.code,
      message: error.message,
      details: error.details,
    });
    return Response.json({ error: "No fue posible actualizar el pedido." }, { status: 500, headers });
  }

  return Response.json({ order: data }, { headers });
};
