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
> & { image: AdminProductImage | null };
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
    products: products.map((product) => ({ ...product, image: imageByProduct.get(product.id) ?? null })) as AdminProduct[],
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

  return { ...data, image: null } as AdminProduct;
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

  return { ...data, image: await getAdminProductImage(supabase, id) } as AdminProduct;
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
