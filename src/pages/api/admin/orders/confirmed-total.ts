import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../../lib/supabase/server-client";
import { requireAdmin } from "../../../../services/admin-catalog";
import { confirmedOrderTotalSchema } from "../../../../validations/admin-orders";

export const PATCH: APIRoute = async (context) => {
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

  const payload = confirmedOrderTotalSchema.safeParse(body);
  if (!payload.success) {
    return Response.json({ error: "El total confirmado no es válido." }, { status: 400, headers });
  }

  const { data, error } = await supabase.rpc("set_order_confirmed_total", {
    p_order_id: payload.data.orderId,
    p_confirmed_total: payload.data.confirmedTotal,
  });

  if (error) {
    console.error("No fue posible guardar el total confirmado", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
  } else if (!data?.[0]) {
    console.error("La función de total confirmado no devolvió un pedido", {
      orderId: payload.data.orderId,
    });
  }

  if (error || !data?.[0]) {
    const message = error?.message.includes("menor a los pagos")
      ? "El total no puede ser menor que los pagos ya registrados."
      : error?.message.includes("no tiene movimientos registrados")
        ? "Este pedido tiene un estado de pago previo sin movimientos. Revisa su historial antes de cambiar el total."
      : "No fue posible guardar el total confirmado.";
    return Response.json({ error: message }, { status: 400, headers });
  }

  return Response.json({ order: data[0] }, { headers });
};
