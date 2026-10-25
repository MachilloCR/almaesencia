# Notificaciones de solicitudes

Esta función recibe eventos insertados en `public.admin_order_push_events` y envía una notificación Web Push a las suscripciones administrativas. El evento contiene únicamente el código del pedido.

Configura estos secretos en Supabase antes de desplegar:

- `PUSH_WEBHOOK_SECRET`: secreto aleatorio para autorizar el webhook de base de datos.
- `VAPID_SUBJECT`: contacto VAPID, por ejemplo `mailto:admin@tu-dominio.com`.
- `VAPID_PUBLIC_KEY`: clave pública VAPID.
- `VAPID_PRIVATE_KEY`: clave privada VAPID; nunca la incluyas en el cliente o en Git.

Puedes generar un par VAPID con `pnpm dlx web-push generate-vapid-keys`. Guarda la clave privada solo en los secretos de Edge Functions y configura la clave pública tanto en los secretos de Edge Functions como en `PUBLIC_VAPID_PUBLIC_KEY` para el build de Astro.

Supabase proporciona `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` al runtime de Edge Functions. La clave de servicio se usa solo en el servidor para consultar y limpiar suscripciones.

Después de aplicar la migración:

1. Configura los secretos listados en esta carpeta y despliega `send-admin-order-push`; `supabase/config.toml` establece `verify_jwt = false`, y la función valida el encabezado `Authorization: Bearer <PUSH_WEBHOOK_SECRET>`.
2. En Supabase Database Webhooks, crea un webhook `INSERT` para `public.admin_order_push_events` que llame a la función `send-admin-order-push`.
3. Configura el encabezado `Authorization` con el mismo `PUSH_WEBHOOK_SECRET` y `Content-Type: application/json`.
4. Configura `PUBLIC_VAPID_PUBLIC_KEY` en el entorno de build de Astro/Vercel con la clave pública correspondiente.

La base de datos remota y Vercel no se actualizan desde este cambio de código.
