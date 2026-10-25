import { z } from "zod";

const endpointSchema = z.url().refine((value) => value.startsWith("https://"), {
  message: "El endpoint de notificaciones debe usar HTTPS.",
});

export const pushSubscriptionSchema = z.object({
  endpoint: endpointSchema,
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(200),
  }),
});

export const pushSubscriptionRemovalSchema = z.object({
  endpoint: endpointSchema,
});
