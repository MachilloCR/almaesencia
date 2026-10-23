import { useEffect, useMemo, useRef, useState } from "react";
import { Toaster, sileo } from "sileo";
import { optimizeProductImage, ProductImageProcessingError } from "../../lib/images/optimize-product-image";
import CategoryMultiSelect from "./CategoryMultiSelect";
import ProductInventoryControl from "./ProductInventoryControl";
import type { AdminCategory, AdminInventoryItem, AdminProduct } from "../../services/admin-catalog";
import type { ProductAvailabilityStatus } from "../../types/database";

type Props = { initialCategories: AdminCategory[]; initialProducts: AdminProduct[]; initialInventory: AdminInventoryItem[] };
type Draft = {
  categoryIds: string[];
  name: string;
  description: string;
  price: string;
  initialQuantity: string;
  availabilityStatus: ProductAvailabilityStatus;
  isActive: boolean;
};

const labels: Record<ProductAvailabilityStatus, string> = {
  in_stock: "Disponible",
  on_order: "Por encargo",
  out_of_stock: "Agotado",
  inactive: "Inactivo",
};
const availabilityOptions: ProductAvailabilityStatus[] = ["in_stock", "on_order", "out_of_stock", "inactive"];
const badgeStyles: Record<ProductAvailabilityStatus, string> = {
  in_stock: "border-[#74C69D] bg-[#B7E4C7] text-[#1B4332]",
  on_order: "border-[#F59E0B] bg-[#FCD34D] text-[#78350F]",
  out_of_stock: "border-[#F87171] bg-[#FECACA] text-[#991B1B]",
  inactive: "border-[#A99AA1] bg-[#D6CDD1] text-[#493B42]",
};

function blankDraft(categoryIds: string[] = []): Draft {
  return { categoryIds, name: "", description: "", price: "", initialQuantity: "", availabilityStatus: "in_stock", isActive: true };
}

function normalizeCategoryName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
}

async function api<T>(url: string, method: "POST" | "PATCH", body: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "No fue posible completar la acción.");
  return data;
}

function price(value: number, currency: string) {
  return new Intl.NumberFormat("es-CR", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

export default function CatalogManager({ initialCategories, initialProducts, initialInventory }: Props) {
  const [categories, setCategories] = useState(initialCategories);
  const [products, setProducts] = useState(initialProducts);
  const [inventory, setInventory] = useState(initialInventory);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const [visibilityFilter, setVisibilityFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [draft, setDraft] = useState<Draft>(() => blankDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [categorySelectionError, setCategorySelectionError] = useState("");
  const [selectedImage, setSelectedImage] = useState<{ file: File; previewUrl: string } | null>(null);
  const [imageAltText, setImageAltText] = useState("");
  const [processingImage, setProcessingImage] = useState(false);
  const [savingImage, setSavingImage] = useState(false);
  const [failedProductImageIds, setFailedProductImageIds] = useState<Set<string>>(() => new Set());
  const [productModalOpen, setProductModalOpen] = useState(false);
  const productDialogRef = useRef<HTMLDialogElement>(null);
  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const inventoryByProductId = useMemo(() => new Map(inventory.map((item) => [item.product_id, item])), [inventory]);
  const activeCategories = categories.filter((category) => category.is_active);
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase("es");
  const filteredProducts = products.filter((product) => {
    const productCategories = product.categoryIds.map((id) => categoryById.get(id)).filter((category) => category !== undefined);
    const matchesQuery = !normalizedQuery || `${product.name} ${product.description ?? ""} ${productCategories.map((category) => category.name).join(" ")}`
      .toLocaleLowerCase("es")
      .includes(normalizedQuery);
    const matchesCategory = categoryFilter === "all" || product.categoryIds.includes(categoryFilter);
    const matchesAvailability = availabilityFilter === "all" || product.availability_status === availabilityFilter;
    const isVisible = product.is_active && product.availability_status !== "inactive" && productCategories.some((category) => category.is_active);
    const matchesVisibility = visibilityFilter === "all" || (visibilityFilter === "visible" ? isVisible : !isVisible);
    const quantity = inventoryByProductId.get(product.id)?.quantity ?? 0;
    const matchesStock = stockFilter === "all" || (stockFilter === "available" ? quantity > 0 : quantity === 0);
    return matchesQuery && matchesCategory && matchesAvailability && matchesVisibility && matchesStock;
  });
  const hasFilters = Boolean(searchQuery || categoryFilter !== "all" || availabilityFilter !== "all" || visibilityFilter !== "all" || stockFilter !== "all");

  const set = <Key extends keyof Draft>(key: Key, value: Draft[Key]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const reset = () => {
    setProductModalOpen(false);
    setCategorySelectionError("");
    setEditingId(null);
    setDraft(blankDraft());
    setSelectedImage(null);
    setImageAltText("");
  };

  useEffect(() => () => {
    if (selectedImage) URL.revokeObjectURL(selectedImage.previewUrl);
  }, [selectedImage]);

  useEffect(() => {
    const dialog = productDialogRef.current;
    if (!dialog) return;
    if (productModalOpen && !dialog.open) dialog.showModal();
    else if (!productModalOpen && dialog.open) dialog.close();
  }, [productModalOpen]);

  async function ensureCategory(name: string, description: string | null = null) {
    const existing = categories.find((category) => normalizeCategoryName(category.name) === normalizeCategoryName(name));
    if (existing) return existing;
    const { category } = await api<{ category: AdminCategory }>("/api/admin/categories", "POST", { name, description });
    setCategories((current) => current.some((item) => item.id === category.id)
      ? current
      : [...current, category].sort((a, b) => a.name.localeCompare(b.name)));
    window.dispatchEvent(new CustomEvent<AdminCategory>("admin:category-changed", { detail: category }));
    return category;
  }

  async function createCategoryFromSelector(name: string) {
    return sileo.promise(ensureCategory(name), {
      loading: { title: "Creando categoría…" },
      success: { title: "Categoría creada" },
      error: (error) => ({ title: "No se pudo crear", description: String(error) }),
    });
  }


  async function uploadSelectedImage(product: Pick<AdminProduct, "id" | "name">) {
    if (!selectedImage) return null;
    const form = new FormData();
    form.set("productId", product.id);
    const typedAlt = imageAltText.trim();
    form.set("altText", typedAlt || (product.name.trim().length >= 3 ? product.name.trim() : `Imagen ${product.name.trim()}`));
    form.set("image", selectedImage.file);
    const response = await fetch("/api/admin/product-image", { method: "POST", body: form });
    const result = await response.json() as { image?: AdminProduct["image"]; warning?: string | null; error?: string };
    if (!response.ok || !result.image) throw new Error(result.error ?? "El producto se guardó, pero la imagen no pudo subirse.");
    return result;
  }

  async function persist(productId?: string, changes?: Partial<Draft>) {
    const values = { ...draft, ...changes };
    if (!productId && (values.initialQuantity.trim() === "" || !Number.isInteger(Number(values.initialQuantity)) || Number(values.initialQuantity) < 0 || Number(values.initialQuantity) > 1_000_000)) {
      sileo.error({ title: "Cantidad inicial no válida", description: "Indica un número entero entre 0 y 1 000 000." });
      return;
    }
    if (selectedImage && imageAltText.trim().length > 0 && imageAltText.trim().length < 3) {
      sileo.error({ title: "Completa el texto alternativo", description: "Usa al menos 3 caracteres o deja el campo vacío para usar el nombre del producto." });
      return;
    }
    if (values.categoryIds.length === 0) {
      setCategorySelectionError("Selecciona al menos una categoría para el producto.");
      sileo.error({ title: "Selecciona una categoría", description: "Todo producto debe pertenecer al menos a una categoría." });
      return;
    }
    setCategorySelectionError("");
    setSaving(true);
    try {
      const { product, inventoryItem } = await api<{ product: AdminProduct; inventoryItem?: AdminInventoryItem }>("/api/admin/products", productId ? "PATCH" : "POST", {
        ...(productId ? { id: productId } : {}),
        ...values,
        price: Number(values.price),
        ...(!productId ? { initialQuantity: Number(values.initialQuantity) } : {}),
      });
      setProducts((current) => [product, ...current.filter((item) => item.id !== product.id)]);
      if (inventoryItem) setInventory((current) => [inventoryItem, ...current.filter((item) => item.product_id !== product.id)]);
      if (!productId) setEditingId(product.id);
      let savedProduct = product;
      let imageWarning: string | null = null;

      if (selectedImage) {
        try {
          const imageResult = await uploadSelectedImage(product);
          if (!imageResult?.image) throw new Error("No se recibió la confirmación de la imagen.");
          savedProduct = { ...product, image: imageResult.image };
          setProducts((current) => current.map((item) => item.id === product.id ? savedProduct : item));
          setSelectedImage(null);
          imageWarning = imageResult.warning ?? null;
        } catch (error) {
          window.dispatchEvent(new CustomEvent<AdminProduct>("admin:product-changed", { detail: savedProduct }));
          sileo.error({ title: "Producto guardado; falta la imagen", description: error instanceof Error ? error.message : "La imagen sigue seleccionada. Revisa la conexión e inténtalo de nuevo." });
          return;
        }
      }

      window.dispatchEvent(new CustomEvent<AdminProduct>("admin:product-changed", { detail: savedProduct }));
      if (imageWarning) sileo.warning({ title: "Producto e imagen guardados con aviso", description: imageWarning });
      else sileo.success({ title: productId ? "Producto actualizado" : "Producto creado" });
      reset();
    } catch (error) {
      sileo.error({ title: "No se pudo guardar el producto", description: error instanceof Error ? error.message : "Revisa la conexión e inténtalo de nuevo." });
    } finally {
      setSaving(false);
    }
  }

  function edit(product: AdminProduct) {
    setCategorySelectionError("");
    setEditingId(product.id);
    setDraft({
      categoryIds: product.categoryIds,
      name: product.name,
      description: product.description ?? "",
      price: String(product.price),
      initialQuantity: String(inventoryByProductId.get(product.id)?.quantity ?? 0),
      availabilityStatus: product.availability_status,
      isActive: product.is_active,
    });
    setSelectedImage(null);
    setImageAltText(product.image?.altText ?? product.name);
    setProductModalOpen(true);
  }

  function createProductDraft() {
    setCategorySelectionError("");
    setEditingId(null);
    setDraft(blankDraft());
    setSelectedImage(null);
    setImageAltText("");
    setProductModalOpen(true);
  }

  async function selectImage(file?: File) {
    setSelectedImage(null);
    if (!file) return;
    setProcessingImage(true);
    try {
      const optimized = await optimizeProductImage(file);
      setSelectedImage({ file: optimized.file, previewUrl: URL.createObjectURL(optimized.file) });
      sileo.success({ title: "Imagen preparada", description: `${optimized.width} × ${optimized.height}px, máximo 2 MiB.` });
    } catch (error) {
      sileo.error({ title: "No se pudo preparar la imagen", description: error instanceof ProductImageProcessingError ? error.message : "Prueba con otra fotografía." });
    } finally {
      setProcessingImage(false);
    }
  }

  async function unlinkImage(product: AdminProduct) {
    if (!product.image || !window.confirm("¿Desvincular la imagen de este producto?")) return;
    setSavingImage(true);
    try {
      const response = await fetch("/api/admin/product-image", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: product.id }) });
      const result = await response.json() as { error?: string; warning?: string | null };
      if (!response.ok) throw new Error(result.error ?? "No fue posible desvincular la imagen.");
      setProducts((current) => current.map((item) => item.id === product.id ? { ...item, image: null } : item));
      if (result.warning) sileo.warning({ title: "Imagen desvinculada con aviso", description: result.warning });
      else sileo.success({ title: "Imagen desvinculada", description: "El producto ya no muestra esta imagen." });
    } catch (error) {
      sileo.error({ title: "No se pudo desvincular", description: error instanceof Error ? error.message : "Revisa la conexión e inténtalo de nuevo." });
    } finally {
      setSavingImage(false);
    }
  }

  function toggle(product: AdminProduct) {
    const changes: Draft = {
      categoryIds: product.categoryIds,
      name: product.name,
      description: product.description ?? "",
      price: String(product.price),
      initialQuantity: String(inventoryByProductId.get(product.id)?.quantity ?? 0),
      availabilityStatus: product.availability_status,
      isActive: !product.is_active,
    };
    setEditingId(product.id);
    setDraft(changes);
    void persist(product.id, changes);
  }

  return (
    <>
      <Toaster position="top-right" options={{ fill: "#FFFFFF", roundness: 16, duration: 4_000 }} />
      <section className="grid justify-start gap-6">
        <div className="rounded-[20px] border border-border-subtle bg-surface-card p-6 shadow-[0_4px_20px_-2px_rgba(134,54,93,0.05)] sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div>
              <p className="text-xs font-semibold tracking-[0.14em] text-brand-primary uppercase">Productos</p>
              <h2 className="mt-2 font-display text-2xl font-semibold">Administra el catálogo</h2>
              <p className="mt-2 text-sm leading-6 text-text-secondary">Crea productos, consulta existencias y ajusta cada artículo desde esta página.</p>
            </div>
            <button className="min-h-11 rounded-full bg-brand-primary px-5 py-3 text-sm font-semibold text-white hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:bg-brand-primary-soft disabled:text-text-secondary" type="button" onClick={createProductDraft}>
              Crear producto
            </button>
          </div>

          {activeCategories.length === 0 && <p className="mt-4 text-sm text-text-secondary">Puedes crear la primera categoría desde el modal de producto.</p>}

          <dialog
            ref={productDialogRef}
            className="m-auto max-h-[90dvh] w-[min(96vw,58rem)] overflow-y-auto rounded-[20px] border border-border-subtle bg-surface-card p-0 text-text-primary shadow-[0_20px_40px_-8px_rgba(44,26,35,0.16)] backdrop:bg-[#2C1A23]/45 backdrop:backdrop-blur-sm"
            aria-labelledby="product-dialog-title"
            onCancel={(event) => { event.preventDefault(); reset(); }}
            onClick={(event) => { if (event.target === event.currentTarget) reset(); }}
          >
            <div className="flex items-start justify-between gap-4 border-b border-border-subtle px-5 py-5 sm:px-8">
              <div>
                <p className="text-xs font-semibold tracking-[0.14em] text-brand-primary uppercase">Productos</p>
                <h2 id="product-dialog-title" className="mt-2 font-display text-2xl font-semibold">{editingId ? "Editar producto" : "Crear producto"}</h2>
                <p className="mt-2 text-sm leading-6 text-text-secondary">{editingId ? "Edita el producto aquí y sus existencias en la tarjeta." : "Registra los datos del producto y sus unidades iniciales."}</p>
              </div>
          <button className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-brand-primary hover:bg-brand-primary-soft" type="button" onClick={reset} aria-label="Cerrar ventana">
            <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
            </div>

          <form className="grid gap-5 px-5 py-6 sm:grid-cols-2 sm:px-8" onSubmit={(event) => { event.preventDefault(); void persist(editingId ?? undefined); }}>
            <label className="text-sm font-semibold">Nombre
              <input className="mt-2 min-h-11 w-full rounded-lg border border-border-subtle bg-white px-3 font-normal outline-none focus:border-brand-primary focus:ring-3 focus:ring-brand-primary/12" value={draft.name} onChange={(event) => set("name", event.target.value)} minLength={2} maxLength={140} required />
            </label>
            <div className="sm:col-span-2">
              <CategoryMultiSelect
                categories={categories}
                selectedIds={draft.categoryIds}
                onChange={(categoryIds) => { set("categoryIds", categoryIds); if (categoryIds.length) setCategorySelectionError(""); }}
                onCreateCategory={createCategoryFromSelector}
                disabled={saving}
              />
              {categorySelectionError && <p className="mt-2 text-sm text-red-700" role="alert">{categorySelectionError}</p>}
            </div>
            <label className="text-sm font-semibold">Precio estimado (CRC)
              <input className="mt-2 min-h-11 w-full rounded-lg border border-border-subtle bg-white px-3 font-normal outline-none focus:border-brand-primary focus:ring-3 focus:ring-brand-primary/12" value={draft.price} onChange={(event) => set("price", event.target.value)} type="number" min="0" step="0.01" inputMode="decimal" required />
            </label>
            {!editingId && <label className="text-sm font-semibold">Unidades físicas iniciales
              <input className="mt-2 min-h-11 w-full rounded-lg border border-border-subtle bg-white px-3 font-normal outline-none focus:border-brand-primary focus:ring-3 focus:ring-brand-primary/12" value={draft.initialQuantity} onChange={(event) => {
                const initialQuantity = event.target.value;
                setDraft((current) => ({
                  ...current,
                  initialQuantity,
                  availabilityStatus: initialQuantity !== "" && Number(initialQuantity) > 0
                    ? "in_stock"
                    : current.availabilityStatus === "in_stock" ? "on_order" : current.availabilityStatus,
                }));
              }} type="number" min="0" max="1000000" step="1" inputMode="numeric" required />
            </label>}
            <fieldset className="min-w-0" disabled={saving}>
              <legend className="text-sm font-semibold">Disponibilidad</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {availabilityOptions.map((status) => {
                  const selected = draft.availabilityStatus === status;
                  const unavailableForInitialStock = !editingId && draft.initialQuantity !== "" && (Number(draft.initialQuantity) > 0 ? status !== "in_stock" : status === "in_stock");
                  const selectedClass = selected
                    ? "border-brand-primary bg-brand-primary text-white"
                    : "border-border-subtle bg-white text-text-primary hover:border-accent-rose hover:bg-brand-primary-soft";
                  return <label key={status} className={`relative inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm font-semibold focus-within:outline-none ${saving || unavailableForInitialStock ? "cursor-not-allowed opacity-60" : "cursor-pointer"} ${selectedClass} focus-within:ring-2 focus-within:ring-brand-primary focus-within:ring-offset-2`}>
                    <input
                      className="peer sr-only"
                      type="radio"
                      name="availabilityStatus"
                      value={status}
                      checked={selected}
                      disabled={unavailableForInitialStock}
                      onChange={() => set("availabilityStatus", status)}
                    />
                    <svg aria-hidden="true" className="size-4 shrink-0" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      {status === "in_stock" && <><circle cx="10" cy="10" r="7" /><path d="m6.5 10 2.2 2.2 4.8-5" /></>}
                      {status === "on_order" && <><circle cx="10" cy="10" r="7" /><path d="M10 6v4l2.5 1.5" /></>}
                      {status === "out_of_stock" && <><circle cx="10" cy="10" r="7" /><path d="M6.5 10h7" /></>}
                      {status === "inactive" && <><path d="M2.5 10s2.7-5 7.5-5 7.5 5 7.5 5-2.7 5-7.5 5-7.5-5-7.5-5Z" /><circle cx="10" cy="10" r="2" /><path d="m4 4 12 12" /></>}
                    </svg>
                    <span>{labels[status]}</span>
                    {selected && <svg aria-hidden="true" className="size-4 shrink-0" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m4.5 10.5 3.5 3 7.5-7" /></svg>}
                  </label>;
                })}
              </div>
            </fieldset>
            <label className="sm:col-span-2 text-sm font-semibold">Descripción <span className="font-normal text-text-secondary">(opcional)</span>
              <textarea className="mt-2 min-h-28 w-full rounded-lg border border-border-subtle bg-white px-3 py-2 font-normal outline-none focus:border-brand-primary focus:ring-3 focus:ring-brand-primary/12" value={draft.description} onChange={(event) => set("description", event.target.value)} maxLength={2_000} />
            </label>
            <label className="sm:col-span-2 flex min-h-11 items-center gap-3 rounded-lg bg-surface-soft px-3 text-sm">
              <input className="size-5 accent-brand-primary" checked={draft.isActive} onChange={(event) => set("isActive", event.target.checked)} type="checkbox" />
              Mostrar este producto en el catálogo cuando su categoría esté activa.
            </label>
            {(() => {
              const product = editingId ? products.find((item) => item.id === editingId) : undefined;
              const preview = selectedImage?.previewUrl ?? product?.image?.url;
              return <section className="sm:col-span-2 rounded-2xl border border-border-subtle bg-surface-soft p-4" aria-label="Imagen del producto">
                <h3 className="font-display text-lg font-semibold">Imagen del producto</h3>
                <p className="mt-1 text-sm text-text-secondary">Una imagen por producto. JPG, PNG, WebP o HEIC/HEIF; se optimiza en este dispositivo y se guarda junto con el producto.</p>
                {preview ? <img className="mt-4 aspect-[4/5] w-36 rounded-xl border border-border-subtle bg-white object-cover" src={preview} alt={imageAltText || product?.name || draft.name || "Vista previa del producto"} width="360" height="450" /> : <p className="mt-4 text-sm text-text-secondary">{product?.image ? "La imagen guardada no está disponible para vista previa." : "Aún no se ha seleccionado una imagen."}</p>}
                <label className="mt-4 block text-sm font-semibold">Texto alternativo
                  <input className="mt-2 min-h-11 w-full rounded-lg border border-border-subtle bg-white px-3 font-normal outline-none focus:border-brand-primary focus:ring-3 focus:ring-brand-primary/12 disabled:bg-surface-soft" value={imageAltText} onChange={(event) => setImageAltText(event.target.value)} maxLength={240} disabled={saving} placeholder={`Descripción breve de ${draft.name || "la imagen"}`} />
                </label>
                <label className="mt-4 inline-flex min-h-11 cursor-pointer items-center rounded-full border-[1.5px] border-brand-primary px-4 text-sm font-semibold text-brand-primary hover:bg-white">
                  {processingImage ? "Preparando…" : selectedImage ? "Elegir otra fotografía" : product?.image ? "Reemplazar fotografía" : "Seleccionar fotografía"}
                  <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" disabled={processingImage || savingImage || saving} onChange={(event) => { void selectImage(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
                </label>
                {selectedImage && <button className="ml-2 min-h-11 rounded-full px-4 text-sm font-semibold text-text-secondary hover:bg-white disabled:opacity-60" type="button" disabled={saving} onClick={() => setSelectedImage(null)}>Descartar selección</button>}
                {product?.image && <div className="mt-4"><button className="min-h-11 rounded-full px-4 text-sm font-semibold text-brand-primary hover:bg-white disabled:opacity-60" type="button" disabled={savingImage || saving} onClick={() => void unlinkImage(product)}>Desvincular imagen</button></div>}
              </section>;
            })()}
            <div className="sm:col-span-2 flex flex-wrap gap-3">
              <button className="min-h-11 rounded-full bg-brand-primary px-5 py-3 text-sm font-semibold text-white hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:bg-brand-primary-soft disabled:text-text-secondary" type="submit" disabled={saving || processingImage}>{saving ? "Guardando…" : "Guardar producto"}</button>
              {activeCategories.length === 0 && <p className="self-center text-sm text-text-secondary">Crea una categoría activa desde este selector.</p>}
            </div>
          </form>
          </dialog>
        </div>

      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold tracking-[0.14em] text-brand-primary uppercase">Catálogo interno</p><h2 className="mt-2 font-display text-2xl font-semibold">Productos registrados</h2></div><p className="text-sm text-text-secondary">Mostrando {filteredProducts.length} de {products.length} producto{products.length === 1 ? "" : "s"}</p></div>
        <div className="mt-5 grid gap-3 rounded-[16px] border border-border-subtle bg-surface-card p-4 sm:grid-cols-2 xl:grid-cols-5">
          <label className="text-xs font-semibold text-text-secondary">Buscar producto
            <input className="mt-2 min-h-11 w-full rounded-lg border border-border-subtle bg-white px-3 text-sm font-normal text-text-primary outline-none placeholder:text-text-secondary/70 focus:border-brand-primary focus:ring-3 focus:ring-brand-primary/12" type="search" placeholder="Nombre, descripción o categoría" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
          </label>
          <label className="text-xs font-semibold text-text-secondary">Categoría
            <select className="mt-2 min-h-11 w-full rounded-lg border border-border-subtle bg-white px-3 text-sm font-normal text-text-primary outline-none focus:border-brand-primary focus:ring-3 focus:ring-brand-primary/12" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="all">Todas</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-text-secondary">Disponibilidad
            <select className="mt-2 min-h-11 w-full rounded-lg border border-border-subtle bg-white px-3 text-sm font-normal text-text-primary outline-none focus:border-brand-primary focus:ring-3 focus:ring-brand-primary/12" value={availabilityFilter} onChange={(event) => setAvailabilityFilter(event.target.value)}>
              <option value="all">Todas</option>
              {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-text-secondary">Visibilidad
            <select className="mt-2 min-h-11 w-full rounded-lg border border-border-subtle bg-white px-3 text-sm font-normal text-text-primary outline-none focus:border-brand-primary focus:ring-3 focus:ring-brand-primary/12" value={visibilityFilter} onChange={(event) => setVisibilityFilter(event.target.value)}>
              <option value="all">Todos</option>
              <option value="visible">Visible en catálogo</option>
              <option value="hidden">No visible</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-text-secondary">Existencias
            <select className="mt-2 min-h-11 w-full rounded-lg border border-border-subtle bg-white px-3 text-sm font-normal text-text-primary outline-none focus:border-brand-primary focus:ring-3 focus:ring-brand-primary/12" value={stockFilter} onChange={(event) => setStockFilter(event.target.value)}>
              <option value="all">Todas</option>
              <option value="available">Con unidades</option>
              <option value="empty">Sin unidades</option>
            </select>
          </label>
        </div>
        {products.length === 0 ? <div className="mt-5 rounded-[20px] border border-dashed border-border-subtle bg-surface-card px-6 py-12 text-center"><h3 className="font-display text-xl font-semibold">Tu catálogo está listo para comenzar</h3><p className="mt-3 text-sm leading-6 text-text-secondary">Agrega una categoría y luego registra tu primer producto.</p></div> :
          filteredProducts.length === 0 ? <div className="mt-5 rounded-[20px] border border-dashed border-border-subtle bg-surface-card px-6 py-10 text-center"><h3 className="font-display text-xl font-semibold">No encontramos productos con esos filtros</h3><p className="mt-2 text-sm text-text-secondary">Prueba otro nombre o cambia las opciones seleccionadas.</p>{hasFilters && <button className="mt-4 min-h-11 rounded-full px-4 text-sm font-semibold text-brand-primary hover:bg-brand-primary-soft" type="button" onClick={() => { setSearchQuery(""); setCategoryFilter("all"); setAvailabilityFilter("all"); setVisibilityFilter("all"); setStockFilter("all"); }}>Limpiar filtros</button>}</div> :
          <ul className="mt-5 grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{filteredProducts.map((product) => {
            const productCategories = product.categoryIds.map((id) => categoryById.get(id)).filter((category) => category !== undefined);
            const visible = product.is_active && product.availability_status !== "inactive" && productCategories.some((category) => category.is_active);
            const inventoryItem = inventoryByProductId.get(product.id);
            return <li className="flex h-full flex-col rounded-[20px] border border-border-subtle bg-surface-card p-3 shadow-[0_4px_20px_-2px_rgba(134,54,93,0.05)]" key={product.id}>
              <div className="relative aspect-[4/5] overflow-hidden rounded-xl border border-border-subtle bg-gradient-to-br from-surface-soft via-brand-primary-soft to-[#F6E4D8]">
                {product.image?.url && !failedProductImageIds.has(product.id)
                  ? <img className="size-full object-cover" src={product.image.url} alt={product.image.altText} width="480" height="600" loading="lazy" onError={() => setFailedProductImageIds((current) => new Set(current).add(product.id))} />
                  : <div className="flex size-full items-end p-4"><span className="rounded-xl border border-white/70 bg-white/55 px-4 py-3 font-display text-lg italic text-brand-primary/80">Alma Esencia CR</span></div>}
                <span className={`absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold shadow-sm ${badgeStyles[product.availability_status]}`}>
                  <svg aria-hidden="true" className="size-3.5 shrink-0" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    {product.availability_status === "in_stock" && <path d="m3.5 8 3 3 6-6" />}
                    {product.availability_status === "on_order" && <><circle cx="8" cy="8" r="5.5" /><path d="M8 4.5V8l2.25 1.5" /></>}
                    {(product.availability_status === "out_of_stock" || product.availability_status === "inactive") && <><circle cx="8" cy="8" r="5.5" /><path d="m4.1 4.1 7.8 7.8" /></>}
                  </svg>
                  {labels[product.availability_status]}
                </span>
              </div>
              <div className="flex flex-1 flex-col pt-4">
                <p className="line-clamp-2 min-h-8 text-xs font-semibold tracking-[0.12em] text-text-secondary uppercase">{productCategories.map((category) => category.name).join(" · ") || "Categoría eliminada"}</p>
                <h3 className="mt-2 line-clamp-2 min-h-14 font-display text-xl font-medium">{product.name}</h3>
                <p className="mt-2 line-clamp-2 min-h-12 text-sm leading-6 text-text-secondary">{product.description || "Sin descripción."}</p>
                <div className="mt-auto pt-4">
                  <p className="text-lg font-semibold">{price(Number(product.price), product.currency)}</p>
                  <p className="mt-1 min-h-5 text-xs text-text-secondary">{visible ? "Visible en el catálogo" : "No visible en el catálogo"}</p>
                  {inventoryItem && <ProductInventoryControl item={inventoryItem} product={product} onUpdated={(updatedItem, availabilityStatus) => {
                    setInventory((current) => current.map((item) => item.product_id === updatedItem.product_id ? updatedItem : item));
                    if (availabilityStatus) setProducts((current) => current.map((item) => item.id === product.id ? { ...item, availability_status: availabilityStatus } : item));
                  }} />}
                  {!inventoryItem && <p className="mt-4 text-xs text-text-secondary">No se pudo mostrar el inventario de este producto. Recarga la página.</p>}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button className="min-h-11 rounded-full border-[1.5px] border-brand-primary px-4 text-sm font-semibold text-brand-primary hover:bg-brand-primary-soft" type="button" onClick={() => edit(product)}>Editar</button>
                    <button className="min-h-11 rounded-full px-4 text-sm font-semibold text-brand-primary hover:bg-brand-primary-soft disabled:text-text-secondary" type="button" onClick={() => toggle(product)} disabled={saving}>{product.is_active ? "Desactivar" : "Activar"}</button>
                  </div>
                </div>
              </div>
            </li>;
          })}</ul>}
      </section>
    </>
  );
}
