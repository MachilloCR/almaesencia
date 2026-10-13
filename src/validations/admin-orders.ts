import { z } from "zod";

export const orderStatusUpdateSchema = z.object({
  id: z.uuid(),
  orderStatus: z.enum(["pending_review", "confirmed", "cancelled", "completed"]),
  procurementStatus: z.enum(["not_required", "pending_supplier", "ordered", "received"]),
  fulfillmentStatus: z.enum(["pending", "ready", "delivered"]),
  paymentStatus: z.enum(["pending", "partial", "paid"]),
});
