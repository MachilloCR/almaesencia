import { z } from "zod";

export const orderStatusUpdateSchema = z.object({
  id: z.uuid(),
  orderStatus: z.enum(["pending_review", "confirmed", "cancelled", "completed"]),
  procurementStatus: z.enum(["not_required", "pending_supplier", "ordered", "received"]),
  fulfillmentStatus: z.enum(["pending", "ready", "delivered"]),
});

export const orderPaymentSchema = z.object({
  orderId: z.uuid(),
  amount: z.number().positive().max(9_999_999_999.99),
  paymentMethod: z.enum(["cash", "sinpe_movil", "bank_transfer", "other"]),
  note: z.string().trim().max(500).optional().default(""),
});

export const confirmedOrderTotalSchema = z.object({
  orderId: z.uuid(),
  confirmedTotal: z.number().positive().max(9_999_999_999.99),
});
