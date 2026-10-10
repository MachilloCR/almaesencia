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
    throw new Error("No fue posible cargar el catálogo.");
  }

  const activeCategoryIds = new Set(categoriesResult.data.map((category) => category.id));
  const products = (productsResult.data as AdminProduct[]).filter((product) => activeCategoryIds.has(product.category_id));
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
