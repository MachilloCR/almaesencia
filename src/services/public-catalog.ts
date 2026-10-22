import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminCategory, AdminProduct } from "./admin-catalog";
import type { Database } from "../types/database";

export async function getPublicCatalogData(supabase: SupabaseClient<Database>) {
  const [categoriesResult, productsResult] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, slug, description, is_active")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("products")
      .select("id, category_id, name, slug, description, price, currency, availability_status, is_active")
      .eq("is_active", true)
      .neq("availability_status", "inactive")
      .order("created_at", { ascending: false }),
  ]);

  if (categoriesResult.error || productsResult.error) {
    console.error("Falló una consulta del catálogo público", {
      categories: categoriesResult.error
        ? { code: categoriesResult.error.code, message: categoriesResult.error.message }
        : null,
      products: productsResult.error
        ? { code: productsResult.error.code, message: productsResult.error.message }
        : null,
    });
    throw new Error("No fue posible cargar el catálogo.");
  }

  const productRows = productsResult.data;
  const associationsResult = productRows.length
    ? await supabase.from("product_categories").select("product_id, category_id").in("product_id", productRows.map((product) => product.id))
    : { data: [], error: null };
  if (associationsResult.error) throw new Error("No fue posible cargar las categorías del catálogo.");
  const categoryIdsByProduct = new Map<string, string[]>();
  for (const association of associationsResult.data) {
    const ids = categoryIdsByProduct.get(association.product_id) ?? [];
    ids.push(association.category_id);
    categoryIdsByProduct.set(association.product_id, ids);
  }
  const activeCategoryIds = new Set(categoriesResult.data.map((category) => category.id));
  const products = (productRows as AdminProduct[])
    .map((product) => ({ ...product, categoryIds: [product.category_id, ...(categoryIdsByProduct.get(product.id) ?? []).filter((id) => id !== product.category_id)] }))
    .filter((product) => product.categoryIds.some((categoryId) => activeCategoryIds.has(categoryId)));
  const imagesResult = products.length
    ? await supabase.from("product_images").select("product_id, storage_path, alt_text, sort_order").in("product_id", products.map((product) => product.id)).order("sort_order")
    : { data: [], error: null };
  if (imagesResult.error) throw new Error("No fue posible cargar las imagenes del catalogo.");
  const imageByProduct = new Map<string, NonNullable<AdminProduct["image"]>>();
  for (const image of imagesResult.data) {
    if (imageByProduct.has(image.product_id)) continue;
    const { data, error } = await supabase.storage.from("product-images").createSignedUrl(image.storage_path, 60 * 60);
    imageByProduct.set(image.product_id, { storagePath: image.storage_path, altText: image.alt_text, url: error || !data ? null : data.signedUrl });
  }

  return {
    categories: categoriesResult.data as AdminCategory[],
    products: products.map((product) => ({ ...product, image: imageByProduct.get(product.id) ?? null })),
  };
}
