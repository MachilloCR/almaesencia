import { createClient } from "@supabase/supabase-js";
import { buildPushPayload } from "@block65/webcrypto-web-push";

type PushEvent = {
  type?: unknown;
  table?: unknown;
  schema?: unknown;
  record?: { id?: unknown; order_number?: unknown };
};

type StoredSubscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const expectedSecret = Deno.env.get("PUSH_WEBHOOK_SECRET");
  if (!expectedSecret || request.headers.get("authorization") !== `Bearer ${expectedSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT");
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!supabaseUrl || !serviceRoleKey || !vapidSubject || !vapidPublicKey || !vapidPrivateKey) {
    console.error("Falta configuración requerida para enviar web push.");
    return new Response("Push is not configured", { status: 500 });
  }

  let payload: PushEvent;
  try {
    payload = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (payload.type !== "INSERT" || payload.schema !== "public" || payload.table !== "admin_order_push_events" ||
      typeof payload.record?.id !== "string" || typeof payload.record.order_number !== "string") {
    return new Response("Invalid order event", { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: subscriptions, error } = await supabase
    .from("admin_push_subscriptions")
    .select("id, endpoint, p256dh, auth");

  if (error) {
    console.error("No fue posible consultar suscripciones de administrador", { code: error.code, message: error.message });
    return new Response("Could not load subscriptions", { status: 500 });
  }
  if (!subscriptions?.length) return Response.json({ sent: 0 });

  const vapid = { subject: vapidSubject, publicKey: vapidPublicKey, privateKey: vapidPrivateKey };
  const notification = JSON.stringify({
    title: "Nueva solicitud",
    body: `Recibiste el pedido ${payload.record.order_number}.`,
    url: "/admin/",
    tag: `pedido-${payload.record.id}`,
  });
  const deliveries = await Promise.allSettled((subscriptions as StoredSubscription[]).map(async (subscription) => {
    const webPushSubscription = {
      endpoint: subscription.endpoint,
      expirationTime: null,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    };
    const webPushRequest = await buildPushPayload({ data: notification, options: { ttl: 3600 } }, webPushSubscription, vapid);
    const response = await fetch(subscription.endpoint, webPushRequest);

    if (response.status === 404 || response.status === 410) {
      const { error: deleteError } = await supabase.from("admin_push_subscriptions").delete().eq("id", subscription.id);
      if (deleteError) console.error("No fue posible quitar una suscripción vencida", { code: deleteError.code });
      return "expired" as const;
    }
    if (!response.ok) throw new Error(`Push service returned ${response.status}`);
    return "sent" as const;
  }));

  const sent = deliveries.filter((result) => result.status === "fulfilled" && result.value === "sent").length;
  const expired = deliveries.filter((result) => result.status === "fulfilled" && result.value === "expired").length;
  const failed = deliveries.length - sent - expired;
  if (failed) console.error("Fallaron algunas entregas de notificaciones", { failed });

  return Response.json({ sent, expired, failed }, { status: failed ? 502 : 200 });
});
