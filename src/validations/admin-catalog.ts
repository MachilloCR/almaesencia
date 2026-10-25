import { z } from "zod";

const optionalDescription = z.string().trim().max(2_000).transform((value) => value || null);

export const categoryInputSchema = z.object({
  name: z.string().trim().transform((value) => value.replace(/\s+/g, " ")).pipe(z.string().min(2).max(80)),
  description: optionalDescription.nullish().transform((value) => value ?? null),
});

const productDetailsSchema = z.object({
  categoryIds: z.array(z.uuid()).min(1).refine((ids) => new Set(ids).size === ids.length, "No repitas una categoría."),
  name: z.string().trim().min(2).max(140),
  description: optionalDescription,
  price: z.coerce.number().min(0).max(10_000_000),
});

export const productCreateSchema = productDetailsSchema.extend({
  availabilityStatus: z.enum(["in_stock", "on_order", "out_of_stock"]),
  initialQuantity: z.coerce.number().int().min(0).max(1_000_000),
}).superRefine((value, context) => {
  if ((value.initialQuantity > 0) !== (value.availabilityStatus === "in_stock")) {
    context.addIssue({ code: "custom", path: ["availabilityStatus"], message: "La disponibilidad no coincide con la cantidad inicial." });
  }
});

export const productUpdateSchema = productDetailsSchema.extend({
  id: z.uuid(),
});

export const adminInventoryUpdateSchema = z.object({
  productId: z.uuid(),
  expectedQuantity: z.number().int().min(0).max(1_000_000),
  quantity: z.coerce.number().int().min(0).max(1_000_000),
  availabilityStatus: z.enum(["in_stock", "on_order", "out_of_stock"]),
}).superRefine((value, context) => {
  if ((value.quantity > 0) !== (value.availabilityStatus === "in_stock")) {
    context.addIssue({ code: "custom", path: ["availabilityStatus"], message: "La disponibilidad no coincide con la cantidad." });
  }
});

export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
export type AdminInventoryUpdate = z.infer<typeof adminInventoryUpdateSchema>;
