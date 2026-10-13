import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import type { CategoryInput, ProductInput } from "../validations/admin-catalog";

type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];
type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type InventoryRow = Database["public"]["Tables"]["inventory"]["Row"];

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
> & { categoryIds: string[]; image: AdminProductImage | null };
export type AdminProductImage = { storagePath: string; altText: string; url: string | null };
export type AdminInventoryItem = Pick<InventoryRow, "product_id" | "quantity" | "updated_at">;

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

  const products = productsResult.data;
  const associationsResult = products.length
    ? await supabase.from("product_categories").select("product_id, category_id").in("product_id", products.map((product) => product.id))
    : { data: [], error: null };
  if (associationsResult.error) throw new Error("No fue posible cargar las categorías de los productos.");
  const categoryIdsByProduct = new Map<string, string[]>();
  for (const association of associationsResult.data) {
    const ids = categoryIdsByProduct.get(association.product_id) ?? [];
    ids.push(association.category_id);
    categoryIdsByProduct.set(association.product_id, ids);
  }
  const imagesResult = products.length
    ? await supabase.from("product_images").select("product_id, storage_path, alt_text, sort_order").in("product_id", products.map((product) => product.id)).order("sort_order")
    : { data: [], error: null };
  if (imagesResult.error) throw new Error("No fue posible cargar las imagenes del catalogo.");
  const imageByProduct = new Map<string, AdminProductImage>();
  for (const image of imagesResult.data) {
    if (imageByProduct.has(image.product_id)) continue;
    const { data, error } = await supabase.storage.from("product-images").createSignedUrl(image.storage_path, 60 * 60);
    imageByProduct.set(image.product_id, { storagePath: image.storage_path, altText: image.alt_text, url: error || !data ? null : data.signedUrl });
  }

  return {
    categories: categoriesResult.data as AdminCategory[],
    products: products.map((product) => ({
      ...product,
      categoryIds: [product.category_id, ...(categoryIdsByProduct.get(product.id) ?? []).filter((id) => id !== product.category_id)],
      image: imageByProduct.get(product.id) ?? null,
    })) as AdminProduct[],
  };
}

export async function replaceProductImage(supabase: AdminSupabaseClient, productId: string, file: File, altText: string) {
  const { data: product, error: productError } = await supabase.from("products").select("id").eq("id", productId).maybeSingle();
  if (productError || !product) throw new Error("No se encontro el producto que recibira la imagen.");
  const { data: existingImages, error: imageReadError } = await supabase.from("product_images").select("id, storage_path").eq("product_id", productId).order("sort_order");
  if (imageReadError) throw new Error("No fue posible consultar la imagen anterior.");
  if (existingImages.length > 1) throw new Error("Este producto tiene varias imagenes registradas; resuelve esos registros antes de reemplazar la imagen unica.");

  const storagePath = `products/${productId}/${crypto.randomUUID()}.${file.type === "image/webp" ? "webp" : "jpg"}`;
  const { error: uploadError } = await supabase.storage.from("product-images").upload(storagePath, file, { contentType: file.type, cacheControl: "3600", upsert: false });
  if (uploadError) throw new Error("No fue posible subir la nueva imagen. La imagen anterior sigue vinculada.");

  const previous = existingImages[0];
  const referenceResult = previous
    ? await supabase.from("product_images").update({ storage_path: storagePath, alt_text: altText }).eq("id", previous.id).select("id").single()
    : await supabase.from("product_images").insert({ product_id: productId, storage_path: storagePath, alt_text: altText, sort_order: 0 }).select("id").single();
  if (referenceResult.error) {
    const { data: recoveredReference, error: recoveryError } = await supabase.from("product_images").select("id").eq("storage_path", storagePath).maybeSingle();
    if (recoveryError) throw new Error("No se pudo confirmar si la nueva referencia quedó guardada; el archivo nuevo se conserva para evitar romper el producto. Recarga y revisa la imagen.");
    if (!recoveredReference) {
      const { error: cleanupError } = await supabase.storage.from("product-images").remove([storagePath]);
      throw new Error(cleanupError
        ? "No se guardo la referencia ni se pudo limpiar el archivo nuevo. La imagen anterior sigue vinculada; solicita revision tecnica."
        : "No se guardo la referencia de la imagen. La imagen anterior sigue vinculada.");
    }
  }

  let warning: string | null = null;
  if (previous) {
    const { error: cleanupError } = await supabase.storage.from("product-images").remove([previous.storage_path]);
    if (cleanupError) warning = "La nueva imagen ya está activa, pero el archivo anterior sigue en Storage y requiere limpieza.";
  }
  const { data: signed, error: signedError } = await supabase.storage.from("product-images").createSignedUrl(storagePath, 60 * 60);
  if (signedError || !signed) warning = [warning, "La imagen quedó guardada, pero no se pudo preparar su vista previa. Recarga para comprobarla."].filter(Boolean).join(" ");
  return { image: { storagePath, altText, url: signed?.signedUrl ?? null } satisfies AdminProductImage, warning };
}

export async function unlinkProductImage(supabase: AdminSupabaseClient, productId: string): Promise<string | null> {
  const { data: images, error: readError } = await supabase.from("product_images").select("id, storage_path").eq("product_id", productId);
  if (readError) throw new Error("No fue posible consultar la imagen del producto.");
  if (images.length > 1) throw new Error("Este producto tiene varias imagenes registradas; resuelve esos registros antes de desvincular la imagen unica.");
  const image = images[0];
  if (!image) return null;
  const { error: unlinkError } = await supabase.from("product_images").delete().eq("id", image.id);
  if (unlinkError) throw new Error("No se pudo desvincular la imagen del producto.");
  const { error: deleteError } = await supabase.storage.from("product-images").remove([image.storage_path]);
  return deleteError ? "La imagen quedó desvinculada, pero el archivo sigue en Storage y requiere limpieza." : null;
}

export async function createCategory(supabase: AdminSupabaseClient, input: CategoryInput) {
  const normalizedName = input.name.trim().replace(/\s+/g, " ");
  const { data: existingCategories, error: existingError } = await supabase.from("categories").select("id, name");
  if (existingError) throw new Error("No fue posible validar el nombre de la categoría.");
  const canonicalName = normalizedName.toLocaleLowerCase("es");
  if (existingCategories.some((category) => category.name.trim().replace(/\s+/g, " ").toLocaleLowerCase("es") === canonicalName)) {
    throw new CategoryAlreadyExistsError();
  }

  const slug = await createUniqueSlug(supabase, "categories", normalizedName);
  const { data, error } = await supabase
    .from("categories")
    .insert({ ...input, name: normalizedName, slug })
    .select("id, name, slug, description, is_active")
    .single();

  if (error?.code === "23505") throw new CategoryAlreadyExistsError();
  if (error) {
    throw new Error("No fue posible crear la categoría.");
  }

  return data as AdminCategory;
}

export class CategoryAlreadyExistsError extends Error {
  constructor() {
    super("Ya existe una categoría con ese nombre.");
    this.name = "CategoryAlreadyExistsError";
  }
}

export async function createProduct(supabase: AdminSupabaseClient, input: ProductInput) {
  const slug = await createUniqueSlug(supabase, "products", input.name);
  const { data, error } = await supabase.rpc("save_admin_product", {
    p_product_id: null,
    p_category_ids: input.categoryIds,
    p_name: input.name,
    p_slug: slug,
    p_description: input.description,
    p_price: input.price,
    p_availability_status: input.availabilityStatus,
    p_is_active: input.isActive,
  });

  if (error || !data?.[0]) {
    throw new Error("No fue posible crear el producto.");
  }

  return { ...data[0], categoryIds: input.categoryIds, image: null } as AdminProduct;
}

export async function updateProduct(
  supabase: AdminSupabaseClient,
  id: string,
  input: ProductInput,
) {
  const { data, error } = await supabase.rpc("save_admin_product", {
    p_product_id: id,
    p_category_ids: input.categoryIds,
    p_name: input.name,
    p_slug: "",
    p_description: input.description,
    p_price: input.price,
    p_availability_status: input.availabilityStatus,
    p_is_active: input.isActive,
  });

  if (error || !data?.[0]) {
    throw new Error("No fue posible actualizar el producto.");
  }

  return { ...data[0], categoryIds: input.categoryIds, image: await getAdminProductImage(supabase, id) } as AdminProduct;
}

async function getAdminProductImage(supabase: AdminSupabaseClient, productId: string): Promise<AdminProductImage | null> {
  const { data, error } = await supabase.from("product_images").select("storage_path, alt_text").eq("product_id", productId).order("sort_order").limit(1).maybeSingle();
  if (error || !data) return null;
  const { data: signed, error: signedError } = await supabase.storage.from("product-images").createSignedUrl(data.storage_path, 60 * 60);
  return { storagePath: data.storage_path, altText: data.alt_text, url: signedError || !signed ? null : signed.signedUrl };
}

export async function getAdminInventoryData(supabase: AdminSupabaseClient) {
  const { data, error } = await supabase
    .from("inventory")
    .select("product_id, quantity, updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error("No fue posible cargar el inventario.");
  }

  return data as AdminInventoryItem[];
}

export async function updateInventoryQuantity(
  supabase: AdminSupabaseClient,
  productId: string,
  quantity: number,
  updatedBy: string,
) {
  const { data, error } = await supabase
    .from("inventory")
    .update({ quantity, updated_by: updatedBy })
    .eq("product_id", productId)
    .select("product_id, quantity, updated_at")
    .single();

  if (error) {
    throw new Error("No fue posible actualizar las existencias.");
  }

  return data as AdminInventoryItem;
}

export async function markProductOutOfStock(
  supabase: AdminSupabaseClient,
  productId: string,
  updatedBy: string,
) {
  const { error: productError } = await supabase
    .from("products")
    .update({ availability_status: "out_of_stock" })
    .eq("id", productId);

  if (productError) {
    throw new Error("No fue posible marcar el producto como agotado.");
  }

  return updateInventoryQuantity(supabase, productId, 0, updatedBy);
}
