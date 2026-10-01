import type { APIRoute } from "astro";
import {
  createProduct,
  requireAdmin,
  updateProduct,
} from "../../../services/admin-catalog";
import { productInputSchema, productUpdateSchema } from "../../../validations/admin-catalog";
import { createSupabaseServerClient } from "../../../lib/supabase/server-client";

function json(data: unknown, responseHeaders: Headers, status = 200) {
  return Response.json(data, { status, headers: responseHeaders });
}

async function getAuthorizedSupabase(context: Parameters<APIRoute>[0]) {
  const responseHeaders = new Headers();
  const supabase = createSupabaseServerClient(context, responseHeaders);
  const user = await requireAdmin(supabase);

  return { responseHeaders, supabase, user };
}

export const POST: APIRoute = async (context) => {
  const { responseHeaders, supabase, user } = await getAuthorizedSupabase(context);
  if (!user) {
    return json({ error: "No tienes autorización para realizar esta acción." }, responseHeaders, 401);
  }

  const payload = productInputSchema.safeParse(await context.request.json());
  if (!payload.success) {
    return json({ error: "Revisa los datos obligatorios del producto." }, responseHeaders, 400);
  }

  try {
    const product = await createProduct(supabase, payload.data);
    return json({ product }, responseHeaders, 201);
  } catch {
    return json({ error: "No fue posible crear el producto." }, responseHeaders, 500);
  }
};

export const PATCH: APIRoute = async (context) => {
  const { responseHeaders, supabase, user } = await getAuthorizedSupabase(context);
  if (!user) {
    return json({ error: "No tienes autorización para realizar esta acción." }, responseHeaders, 401);
  }

  const payload = productUpdateSchema.safeParse(await context.request.json());
  if (!payload.success) {
    return json({ error: "Revisa los datos obligatorios del producto." }, responseHeaders, 400);
  }

  try {
    const { id, ...input } = payload.data;
    const product = await updateProduct(supabase, id, input);
    return json({ product }, responseHeaders);
  } catch {
    return json({ error: "No fue posible actualizar el producto." }, responseHeaders, 500);
  }
};
