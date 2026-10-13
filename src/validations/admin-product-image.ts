import { z } from "zod";

export const productImageLinkSchema = z.object({
  productId: z.uuid(),
  altText: z.string().trim().min(3).max(240),
});

export const productImageUnlinkSchema = z.object({ productId: z.uuid() });
