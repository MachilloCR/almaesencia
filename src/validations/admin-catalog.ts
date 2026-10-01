import { z } from "zod";

const optionalDescription = z.string().trim().max(2_000).transform((value) => value || null);

export const categoryInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: optionalDescription,
});

export const productInputSchema = z.object({
  categoryId: z.uuid(),
  name: z.string().trim().min(2).max(140),
  description: optionalDescription,
  price: z.coerce.number().min(0).max(10_000_000),
  availabilityStatus: z.enum(["in_stock", "on_order", "out_of_stock", "inactive"]),
  isActive: z.boolean(),
});

export const productUpdateSchema = productInputSchema.extend({
  id: z.uuid(),
});

export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type ProductInput = z.infer<typeof productInputSchema>;
