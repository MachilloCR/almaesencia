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
  if (value.orderStatus === "confirmed") {
    const current = await supabase.from("orders").select("order_status").eq("id", value.id).single();
    if (current.error) {
      return Response.json({ error: "No fue posible consultar el estado actual del pedido." }, { status: 500, headers });
    }
    if (current.data.order_status === "pending_review") {
      const readiness = await supabase.from("order_items").select("stock_deducted_quantity").eq("order_id", value.id).limit(1);
      if (readiness.error) {
        console.error("No fue posible verificar el registro de inventario antes de confirmar", {
          code: readiness.error.code,
          message: readiness.error.message,
        });
        return Response.json({ error: "El control de inventario todavía no está listo para confirmar pedidos. Intenta más tarde." }, { status: 503, headers });
      }
    }
  }
  const { data, error } = await supabase.from("orders").update({ order_status: value.orderStatus, procurement_status: value.procurementStatus, fulfillment_status: value.fulfillmentStatus }).eq("id", value.id).select("id, order_status, procurement_status, fulfillment_status, payment_status, confirmed_at").single();
  if (error) {
    console.error("No fue posible actualizar los estados del pedido", {
      code: error.code,
      message: error.message,
      details: error.details,
    });
    if (error.code === "P0001") {
      return Response.json({ error: error.message }, { status: 409, headers });
    }
    if (error.code === "42501") {
      return Response.json({ error: "No tienes autorización para actualizar este pedido." }, { status: 403, headers });
    }
    return Response.json({ error: "No fue posible actualizar el pedido." }, { status: 500, headers });
  }

  const movements = await supabase.from("order_items").select("id, stock_deducted_quantity").eq("order_id", value.id);
  if (movements.error) {
    console.error("El pedido se actualizó, pero no se pudo cargar su desglose de inventario", {
      code: movements.error.code,
      message: movements.error.message,
    });
  }

  return Response.json({ order: data, stockMovements: movements.data ?? null }, { headers });
};
