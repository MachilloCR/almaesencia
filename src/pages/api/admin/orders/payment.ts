import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../../lib/supabase/server-client";
import { requireAdmin } from "../../../../services/admin-catalog";
import { orderPaymentSchema } from "../../../../validations/admin-orders";

export const POST: APIRoute = async (context) => {
  const headers = new Headers();
  const supabase = createSupabaseServerClient(context, headers);

  if (!(await requireAdmin(supabase))) {
    return Response.json({ error: "No autorizado." }, { status: 401, headers });
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: "El cuerpo JSON no es valido." }, { status: 400, headers });
  }

  const payload = orderPaymentSchema.safeParse(body);
  if (!payload.success) {
    return Response.json({ error: "Revisa el monto y los datos del pago." }, { status: 400, headers });
  }

  const { data, error } = await supabase.rpc("record_order_payment", {
    p_order_id: payload.data.orderId,
    p_amount: payload.data.amount,
    p_payment_method: payload.data.paymentMethod,
    p_note: payload.data.note || null,
  });

  if (error) {
    console.error("No fue posible registrar el pago del pedido", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
  } else if (!data?.[0]) {
    console.error("La funcion de registro de pago no devolvio un movimiento", {
      orderId: payload.data.orderId,
    });
  }

  if (error || !data?.[0]) {
    const message = error?.message.includes("supera el saldo")
      ? "El monto supera el saldo pendiente."
      : error?.message.includes("Confirma el total")
        ? "Confirma primero el total del pedido."
        : "No fue posible registrar el pago.";
    return Response.json({ error: message }, { status: 400, headers });
  }

  return Response.json({ payment: data[0] }, { headers });
};
