import { z } from "zod";

export const orderRequestSchema = z.object({
  customerName: z.string().trim().min(2).max(120),
  customerPhone: z.string().trim().min(8).max(24),
  deliveryNotes: z.string().trim().max(1_000).optional().default(""),
  items: z.array(z.object({ productId: z.uuid(), quantity: z.number().int().min(1).max(100) })).min(1),
});
