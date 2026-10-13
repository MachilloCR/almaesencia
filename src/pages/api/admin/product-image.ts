import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../lib/supabase/server-client";
import { replaceProductImage, requireAdmin, unlinkProductImage } from "../../../services/admin-catalog";
import { productImageLinkSchema, productImageUnlinkSchema } from "../../../validations/admin-product-image";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/webp"]);

function json(data: unknown, headers: Headers, status = 200) {
  return Response.json(data, { status, headers });
}

async function authorized(context: Parameters<APIRoute>[0]) {
  const headers = new Headers();
  const supabase = createSupabaseServerClient(context, headers);
  const user = await requireAdmin(supabase);
  return { headers, supabase, user };
}

async function hasValidSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (file.type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (file.type === "image/webp") return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return false;
}

export const POST: APIRoute = async (context) => {
  const { headers, supabase, user } = await authorized(context);
  if (!user) return json({ error: "No tienes autorización para realizar esta acción." }, headers, 401);

  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return json({ error: "El formulario de imagen no es válido." }, headers, 400);
  }
  const parsed = productImageLinkSchema.safeParse({ productId: form.get("productId"), altText: form.get("altText") });
  const file = form.get("image");
  if (!parsed.success || !(file instanceof File)) return json({ error: "Selecciona una imagen válida y agrega su texto alternativo." }, headers, 400);
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES || !ALLOWED_TYPES.has(file.type) || !(await hasValidSignature(file))) {
    return json({ error: "La imagen debe ser JPG o WebP válida y pesar como máximo 2 MiB." }, headers, 400);
  }

  try {
    const result = await replaceProductImage(supabase, parsed.data.productId, file, parsed.data.altText);
    return json(result, headers);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "No fue posible guardar la imagen." }, headers, 500);
  }
};

export const DELETE: APIRoute = async (context) => {
  const { headers, supabase, user } = await authorized(context);
  if (!user) return json({ error: "No tienes autorización para realizar esta acción." }, headers, 401);
  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "La solicitud no es válida." }, headers, 400);
  }
  const parsed = productImageUnlinkSchema.safeParse(body);
  if (!parsed.success) return json({ error: "El producto indicado no es válido." }, headers, 400);
  try {
    const warning = await unlinkProductImage(supabase, parsed.data.productId);
    return json({ ok: true, warning }, headers);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "No fue posible desvincular la imagen." }, headers, 500);
  }
};
