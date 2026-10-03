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

  return {
    categories: categoriesResult.data as AdminCategory[],
    products: (productsResult.data as AdminProduct[]).filter((product) => activeCategoryIds.has(product.category_id)),
  };
}
