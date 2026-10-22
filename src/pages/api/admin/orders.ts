import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../lib/supabase/server-client";
import { requireAdmin } from "../../../services/admin-catalog";
import { orderAdminNotesUpdateSchema, orderHistoryQuerySchema, orderStatusUpdateSchema } from "../../../validations/admin-orders";

export const GET: APIRoute = async (context) => {
  const headers = new Headers();
  const supabase = createSupabaseServerClient(context, headers);
  if (!(await requireAdmin(supabase))) return Response.json({ error: "No autorizado." }, { status: 401, headers });
  const parsed = orderHistoryQuerySchema.safeParse({ orderId: context.url.searchParams.get("orderId") });
  if (!parsed.success) return Response.json({ error: "El pedido no es válido." }, { status: 400, headers });

  const { data, error } = await supabase
    .from("order_status_history")
    .select("id, order_id, status_type, previous_value, next_value, note, created_at, changed_by")
    .eq("order_id", parsed.data.orderId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("No fue posible cargar el historial del pedido", { code: error.code, message: error.message, details: error.details });
    return Response.json({ error: "No fue posible cargar el historial del pedido." }, { status: 500, headers });
  }
  return Response.json({ history: data ?? [] }, { headers });
};

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
  const notesPayload = orderAdminNotesUpdateSchema.safeParse(body);
  if (notesPayload.success) {
    const { data, error } = await supabase.from("orders").update({ admin_notes: notesPayload.data.adminNotes || null }).eq("id", notesPayload.data.id).select("id, admin_notes").single();
    if (error) {
      console.error("No fue posible guardar las notas del pedido", { code: error.code, message: error.message, details: error.details });
      return Response.json({ error: "No fue posible guardar la nota del pedido." }, { status: 500, headers });
    }
    return Response.json({ order: data }, { headers });
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
