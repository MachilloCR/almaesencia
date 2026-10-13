import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../lib/supabase/server-client";
import { orderRequestSchema } from "../../../validations/order-request";

export const POST: APIRoute = async (context) => {
  const responseHeaders = new Headers();
  const supabase = createSupabaseServerClient(context, responseHeaders);
  const payload = orderRequestSchema.safeParse(await context.request.json());

  if (!payload.success) {
    return Response.json({ error: "Revisa tus datos y los productos de la solicitud." }, { status: 400, headers: responseHeaders });
  }

  const { data, error } = await supabase.rpc("create_order_request", {
    p_customer_name: payload.data.customerName,
    p_customer_phone: payload.data.customerPhone,
    p_delivery_notes: payload.data.deliveryNotes,
    p_items: payload.data.items.map((item) => ({
      product_id: item.productId,
      quantity: item.quantity,
      options: {},
    })),
  });

  if (error) {
    console.error("No fue posible crear la solicitud de pedido", {
      code: error.code,
      message: error.message,
      details: error.details,
    });

    const message = error.message.includes("productos no disponibles")
      ? "Uno o más productos de tu solicitud ya no están disponibles. Quítalos y vuelve a intentarlo."
      : error.message || "No fue posible crear la solicitud. Intenta nuevamente en unos minutos.";

    return Response.json(
      { error: message },
      { status: 400, headers: responseHeaders },
    );
  }

  if (!data[0]) {
    return Response.json({ error: "No recibimos la confirmación de tu solicitud. Intenta nuevamente." }, { status: 500, headers: responseHeaders });
  }

  return Response.json({ orderNumber: data[0].order_number }, { status: 201, headers: responseHeaders });
};
