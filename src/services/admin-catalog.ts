import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import type { CategoryInput, ProductInput } from "../validations/admin-catalog";

type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];
type ProductRow = Database["public"]["Tables"]["products"]["Row"];

export type AdminCategory = Pick<CategoryRow, "id" | "name" | "slug" | "description" | "is_active">;
export type AdminProduct = Pick<
  ProductRow,
  | "id"
  | "category_id"
  | "name"
  | "slug"
  | "description"
  | "price"
  | "currency"
  | "availability_status"
  | "is_active"
>;

type AdminSupabaseClient = SupabaseClient<Database>;

function slugify(value: string) {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "producto";
}

async function createUniqueSlug(
  supabase: AdminSupabaseClient,
  table: "categories" | "products",
  value: string,
) {
  const baseSlug = slugify(value);
  const { data, error } = await supabase.from(table).select("slug").like("slug", `${baseSlug}%`);

  if (error) {
    throw new Error("No fue posible preparar el identificador del elemento.");
  }

  const existingSlugs = new Set(data.map((item) => item.slug));

  if (!existingSlugs.has(baseSlug)) {
    return baseSlug;
  }

  let suffix = 2;
  while (existingSlugs.has(`${baseSlug}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseSlug}-${suffix}`;
}

export async function requireAdmin(supabase: AdminSupabaseClient): Promise<User | null> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || profile?.role !== "admin") {
    return null;
  }

  return user;
}

export async function getAdminCatalogData(supabase: AdminSupabaseClient) {
  const [categoriesResult, productsResult] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, slug, description, is_active")
      .order("name", { ascending: true }),
    supabase
      .from("products")
      .select("id, category_id, name, slug, description, price, currency, availability_status, is_active")
      .order("created_at", { ascending: false }),
  ]);

  if (categoriesResult.error || productsResult.error) {
    throw new Error("No fue posible cargar el catálogo administrativo.");
  }

  return {
    categories: categoriesResult.data as AdminCategory[],
    products: productsResult.data as AdminProduct[],
  };
}

export async function createCategory(supabase: AdminSupabaseClient, input: CategoryInput) {
  const slug = await createUniqueSlug(supabase, "categories", input.name);
  const { data, error } = await supabase
    .from("categories")
    .insert({ ...input, slug })
    .select("id, name, slug, description, is_active")
    .single();

  if (error) {
    throw new Error("No fue posible crear la categoría.");
  }

  return data as AdminCategory;
}

export async function createProduct(supabase: AdminSupabaseClient, input: ProductInput) {
  const slug = await createUniqueSlug(supabase, "products", input.name);
  const { data, error } = await supabase
    .from("products")
    .insert({
      category_id: input.categoryId,
      name: input.name,
      slug,
      description: input.description,
      price: input.price,
      availability_status: input.availabilityStatus,
      is_active: input.isActive,
    })
    .select("id, category_id, name, slug, description, price, currency, availability_status, is_active")
    .single();

  if (error) {
    throw new Error("No fue posible crear el producto.");
  }

  return data as AdminProduct;
}

export async function updateProduct(
  supabase: AdminSupabaseClient,
  id: string,
  input: ProductInput,
) {
  const { data, error } = await supabase
    .from("products")
    .update({
      category_id: input.categoryId,
      name: input.name,
      description: input.description,
      price: input.price,
      availability_status: input.availabilityStatus,
      is_active: input.isActive,
    })
    .eq("id", id)
    .select("id, category_id, name, slug, description, price, currency, availability_status, is_active")
    .single();

  if (error) {
    throw new Error("No fue posible actualizar el producto.");
  }

  return data as AdminProduct;
}
