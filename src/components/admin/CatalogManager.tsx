import { useEffect, useMemo, useRef, useState } from "react";
import { Toaster, sileo } from "sileo";
import { optimizeProductImage, ProductImageProcessingError } from "../../lib/images/optimize-product-image";
import CategoryMultiSelect from "./CategoryMultiSelect";
import ProductInventoryControl from "./ProductInventoryControl";
import StatusBadge from "../ui/StatusBadge";
import SearchField from "../ui/SearchField";
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
};

const labels: Record<ProductAvailabilityStatus, string> = {
  in_stock: "Disponible",
  on_order: "Por encargo",
  out_of_stock: "Agotado",
  inactive: "Inactivo",
};
const availabilityOptions: ("on_order" | "out_of_stock")[] = ["on_order", "out_of_stock"];
function blankDraft(categoryIds: string[] = []): Draft {
  return { categoryIds, name: "", description: "", price: "", initialQuantity: "0", availabilityStatus: "on_order" };
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
  const modalBusy = saving || processingImage || savingImage;
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
  const hasFilters = Boolean(normalizedQuery || categoryFilter !== "all" || availabilityFilter !== "all" || visibilityFilter !== "all" || stockFilter !== "all");
  const clearFilters = () => {
    setSearchQuery("");
    setCategoryFilter("all");
    setAvailabilityFilter("all");
    setVisibilityFilter("all");
    setStockFilter("all");
  };
  const activeFilters: { key: string; label: string; clear: () => void }[] = [];
  if (normalizedQuery) activeFilters.push({ key: "search", label: `Búsqueda: ${searchQuery.trim()}`, clear: () => setSearchQuery("") });
  if (categoryFilter !== "all") activeFilters.push({ key: "category", label: categoryById.get(categoryFilter)?.name ?? "Categoría", clear: () => setCategoryFilter("all") });
  if (availabilityFilter !== "all") activeFilters.push({ key: "availability", label: labels[availabilityFilter as ProductAvailabilityStatus], clear: () => setAvailabilityFilter("all") });
  if (visibilityFilter !== "all") activeFilters.push({ key: "visibility", label: visibilityFilter === "visible" ? "Visible en catálogo" : "No visible", clear: () => setVisibilityFilter("all") });
  if (stockFilter !== "all") activeFilters.push({ key: "stock", label: stockFilter === "available" ? "Con unidades" : "Sin unidades", clear: () => setStockFilter("all") });

  const set = <Key extends keyof Draft>(key: Key, value: Draft[Key]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  function updateInitialQuantity(initialQuantity: string) {
    setDraft((current) => ({
      ...current,
      initialQuantity,
      availabilityStatus: initialQuantity !== "" && Number(initialQuantity) > 0
        ? "in_stock"
        : current.availabilityStatus === "in_stock" ? "on_order" : current.availabilityStatus,
    }));
  }
  function adjustInitialQuantity(amount: number) {
    const current = Number(draft.initialQuantity);
    const safeCurrent = Number.isInteger(current) && current >= 0 ? current : 0;
    updateInitialQuantity(String(Math.min(1_000_000, Math.max(0, safeCurrent + amount))));
  }
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

  async function persist(productId?: string) {
    const values = draft;
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
        categoryIds: values.categoryIds,
        name: values.name,
        description: values.description,
        price: Number(values.price),
        ...(!productId ? { initialQuantity: Number(values.initialQuantity), availabilityStatus: values.availabilityStatus } : {}),
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
            className="m-auto hidden h-[min(92dvh,56rem)] max-h-[calc(100dvh-1rem)] w-[min(96vw,58rem)] flex-col overflow-hidden rounded-[20px] border border-border-subtle bg-surface-card p-0 text-text-primary shadow-[0_20px_40px_-8px_rgba(44,26,35,0.16)] open:flex backdrop:bg-[#2C1A23]/45 backdrop:backdrop-blur-sm"
            aria-labelledby="product-dialog-title"
            aria-describedby="product-dialog-description"
            onCancel={(event) => { event.preventDefault(); if (!modalBusy) reset(); }}
            onClick={(event) => { if (event.target === event.currentTarget && !modalBusy) reset(); }}
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border-subtle bg-surface-card px-5 py-4 sm:px-8 sm:py-5">
              <div>
                <p className="text-xs font-semibold tracking-[0.14em] text-brand-primary uppercase">Productos</p>
                <h2 id="product-dialog-title" className="mt-2 font-display text-2xl font-semibold">{editingId ? "Editar producto" : "Crear producto"}</h2>
                <p id="product-dialog-description" className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">{editingId ? "Edita el producto aquí y sus existencias en la tarjeta." : "Registra los datos del producto y sus unidades iniciales."}</p>
              </div>
              <button className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-brand-primary hover:bg-brand-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary disabled:cursor-wait disabled:opacity-50" type="button" onClick={reset} aria-label="Cerrar ventana" disabled={modalBusy}>
                <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

          <form className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-8 sm:py-6" onSubmit={(event) => { event.preventDefault(); void persist(editingId ?? undefined); }}>
            <div className="grid gap-5 sm:grid-cols-2">
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
            {!editingId && <div>
              <label className="block text-sm font-semibold" htmlFor="initial-quantity">Cantidad</label>
              <div className="mt-2 inline-flex w-fit overflow-hidden rounded-xl border border-[#E8CCD8] bg-white shadow-sm">
                <button aria-label="Disminuir cantidad" className="min-h-11 w-11 shrink-0 border-r border-[#E8CCD8] text-xl font-medium text-brand-primary hover:bg-brand-primary-soft focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-primary disabled:cursor-not-allowed disabled:text-text-secondary/50" type="button" onClick={() => adjustInitialQuantity(-1)} disabled={saving || Number(draft.initialQuantity) <= 0}>−</button>
                <input className="min-h-11 w-14 border-0 bg-white px-1 text-center text-base font-semibold text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-primary disabled:text-text-secondary" id="initial-quantity" value={draft.initialQuantity} onChange={(event) => updateInitialQuantity(event.target.value)} type="number" min="0" max="1000000" step="1" inputMode="numeric" required disabled={saving} />
                <button aria-label="Aumentar cantidad" className="min-h-11 w-11 shrink-0 border-l border-[#E8CCD8] text-xl font-medium text-brand-primary hover:bg-brand-primary-soft focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-primary disabled:cursor-not-allowed disabled:text-text-secondary/50" type="button" onClick={() => adjustInitialQuantity(1)} disabled={saving || Number(draft.initialQuantity) >= 1_000_000}>+</button>
              </div>
            </div>}
            {!editingId && <fieldset className="min-w-0" aria-label="Disponibilidad del producto sin existencias" disabled={saving}>
              {draft.initialQuantity !== "" && Number(draft.initialQuantity) > 0 && <p className="text-sm text-text-secondary">Con existencias, se mostrará como Disponible.</p>}
              {draft.initialQuantity !== "" && Number(draft.initialQuantity) === 0 && <div className="mt-2 flex flex-wrap gap-2">
                {availabilityOptions.map((status) => {
                  const selected = draft.availabilityStatus === status;
                  const selectedClass = selected
                    ? "border-brand-primary bg-brand-primary text-white"
                    : "border-border-subtle bg-white text-text-primary hover:border-accent-rose hover:bg-brand-primary-soft";
                  return <label key={status} className={`relative inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm font-semibold focus-within:outline-none ${selectedClass} focus-within:ring-2 focus-within:ring-brand-primary focus-within:ring-offset-2`}>
                    <input
                      className="peer sr-only"
                      type="radio"
                      name="availabilityStatus"
                      value={status}
                      checked={selected}
                      onChange={() => set("availabilityStatus", status)}
                    />
                    <svg aria-hidden="true" className="size-4 shrink-0" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      {status === "on_order" && <><circle cx="10" cy="10" r="7" /><path d="M10 6v4l2.5 1.5" /></>}
                      {status === "out_of_stock" && <><circle cx="10" cy="10" r="7" /><path d="M6.5 10h7" /></>}
                    </svg>
                    <span>{labels[status]}</span>
                    {selected && <svg aria-hidden="true" className="size-4 shrink-0" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m4.5 10.5 3.5 3 7.5-7" /></svg>}
                  </label>;
                })}
              </div>}
            </fieldset>}
            <label className="sm:col-span-2 text-sm font-semibold">Descripción <span className="font-normal text-text-secondary">(opcional)</span>
              <textarea className="mt-2 min-h-28 w-full rounded-lg border border-border-subtle bg-white px-3 py-2 font-normal outline-none focus:border-brand-primary focus:ring-3 focus:ring-brand-primary/12" value={draft.description} onChange={(event) => set("description", event.target.value)} maxLength={2_000} />
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
            </div>
            <div className="sticky bottom-0 -mx-5 -mb-5 mt-5 flex flex-col-reverse gap-2 border-t border-border-subtle bg-surface-card/95 px-5 py-4 backdrop-blur sm:-mx-8 sm:-mb-6 sm:flex-row sm:items-center sm:justify-end sm:px-8">
              {activeCategories.length === 0 && <p className="mr-auto text-sm text-text-secondary">Crea una categoría activa desde este selector.</p>}
              <button className="min-h-11 w-full rounded-full border border-border-subtle px-5 text-sm font-semibold text-text-primary transition-colors hover:bg-brand-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary disabled:cursor-wait disabled:opacity-50 sm:w-auto" type="button" onClick={reset} disabled={modalBusy}>Cancelar</button>
              <button className="min-h-11 w-full rounded-full bg-brand-primary px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 disabled:cursor-wait disabled:bg-brand-primary-soft disabled:text-text-secondary sm:w-auto" type="submit" disabled={modalBusy} aria-busy={modalBusy}>{saving ? "Guardando…" : processingImage ? "Preparando imagen…" : "Guardar producto"}</button>
            </div>
          </form>
          </dialog>
        </div>

      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold tracking-[0.14em] text-brand-primary uppercase">Catálogo interno</p><h2 className="mt-2 font-display text-2xl font-semibold">Productos registrados</h2></div><p className="text-sm text-text-secondary" aria-live="polite">Mostrando {filteredProducts.length} de {products.length} producto{products.length === 1 ? "" : "s"}</p></div>
        <div className="mt-5 rounded-[16px] border border-border-subtle bg-surface-card p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">Filtrar productos</h3>
              <p className="mt-1 text-xs text-text-secondary">Combina búsqueda y opciones para encontrar un producto.</p>
            </div>
            {hasFilters && <button className="inline-flex min-h-11 items-center justify-center rounded-full border border-brand-primary px-4 text-sm font-semibold text-brand-primary transition-colors hover:bg-brand-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2" type="button" onClick={clearFilters}>Limpiar filtros</button>}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
            <SearchField className="col-span-2 xl:col-span-1" id="admin-product-search" label="Buscar producto" placeholder="Nombre, descripción o categoría" value={searchQuery} onChange={setSearchQuery} />
            <label className="text-xs font-semibold text-text-secondary">Categoría
              <select className="mt-2 min-h-12 w-full rounded-lg border border-border-subtle bg-white px-3 text-sm font-normal text-text-primary outline-none focus:border-brand-primary focus:ring-3 focus:ring-brand-primary/12" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                <option value="all">Todas</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-text-secondary">Disponibilidad
              <select className="mt-2 min-h-12 w-full rounded-lg border border-border-subtle bg-white px-3 text-sm font-normal text-text-primary outline-none focus:border-brand-primary focus:ring-3 focus:ring-brand-primary/12" value={availabilityFilter} onChange={(event) => setAvailabilityFilter(event.target.value)}>
                <option value="all">Todas</option>
                {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-text-secondary">Visibilidad
              <select className="mt-2 min-h-12 w-full rounded-lg border border-border-subtle bg-white px-3 text-sm font-normal text-text-primary outline-none focus:border-brand-primary focus:ring-3 focus:ring-brand-primary/12" value={visibilityFilter} onChange={(event) => setVisibilityFilter(event.target.value)}>
                <option value="all">Todos</option>
                <option value="visible">Visible en catálogo</option>
                <option value="hidden">No visible</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-text-secondary">Existencias
              <select className="mt-2 min-h-12 w-full rounded-lg border border-border-subtle bg-white px-3 text-sm font-normal text-text-primary outline-none focus:border-brand-primary focus:ring-3 focus:ring-brand-primary/12" value={stockFilter} onChange={(event) => setStockFilter(event.target.value)}>
                <option value="all">Todas</option>
                <option value="available">Con unidades</option>
                <option value="empty">Sin unidades</option>
              </select>
            </label>
          </div>
          {activeFilters.length > 0 && <div className="mt-4 border-t border-border-subtle pt-3">
            <p className="text-xs font-semibold text-text-secondary">Filtros activos</p>
            <ul className="mt-2 flex gap-2 overflow-x-auto pb-1" aria-label="Filtros activos">
              {activeFilters.map((filter) => <li key={filter.key}>
                <button className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border border-border-subtle bg-brand-primary-soft px-3 text-xs font-semibold text-brand-primary hover:border-accent-rose focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2" type="button" onClick={filter.clear} aria-label={"Quitar filtro " + filter.label}>
                  {filter.label}
                  <svg aria-hidden="true" className="size-3.5" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m5 5 10 10M15 5 5 15" /></svg>
                </button>
              </li>)}
            </ul>
          </div>}
        </div>
        {products.length === 0 ? <div className="mt-5 rounded-[20px] border border-dashed border-border-subtle bg-surface-card px-6 py-12 text-center"><h3 className="font-display text-xl font-semibold">Tu catálogo está listo para comenzar</h3><p className="mt-3 text-sm leading-6 text-text-secondary">Agrega una categoría y luego registra tu primer producto.</p></div> :
          filteredProducts.length === 0 ? <div className="mt-5 rounded-[20px] border border-dashed border-border-subtle bg-surface-card px-6 py-10 text-center"><h3 className="font-display text-xl font-semibold">No encontramos productos con esos filtros</h3><p className="mt-2 text-sm text-text-secondary">Prueba otro nombre o cambia las opciones seleccionadas.</p>{hasFilters && <button className="mt-4 min-h-11 rounded-full px-4 text-sm font-semibold text-brand-primary hover:bg-brand-primary-soft" type="button" onClick={clearFilters}>Limpiar filtros</button>}</div> :
          <ul className="mt-5 grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{filteredProducts.map((product) => {
            const productCategories = product.categoryIds.map((id) => categoryById.get(id)).filter((category) => category !== undefined);
            const visible = product.is_active && product.availability_status !== "inactive" && productCategories.some((category) => category.is_active);
            const inventoryItem = inventoryByProductId.get(product.id);
            return <li className="flex h-full flex-col rounded-[20px] border border-border-subtle bg-surface-card p-3 shadow-[0_4px_20px_-2px_rgba(134,54,93,0.05)]" key={product.id}>
              <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-border-subtle bg-[#F1ECE9]">
                {product.image?.url && !failedProductImageIds.has(product.id)
                  ? <img className="size-full object-contain p-1" src={product.image.url} alt={product.image.altText} width="480" height="360" loading="lazy" onError={() => setFailedProductImageIds((current) => new Set(current).add(product.id))} />
                  : <div className="flex size-full items-end p-4"><span className="rounded-xl border border-white/70 bg-white/55 px-4 py-3 font-display text-lg italic text-brand-primary/80">Alma Esencia CR</span></div>}
                <div className="absolute left-3 top-3 max-w-[calc(100%-1.5rem)] drop-shadow-sm">
                  <StatusBadge context="product" status={product.is_active ? product.availability_status : "inactive"} size="compact" />
                </div>
              </div>
              <div className="flex flex-1 flex-col pt-3">
                <p className="line-clamp-1 min-h-4 text-[11px] font-semibold tracking-[0.12em] text-text-secondary uppercase">{productCategories.map((category) => category.name).join(" · ") || "Categoría eliminada"}</p>
                <h3 className="mt-1 line-clamp-2 min-h-12 font-display text-lg font-medium leading-6 text-text-primary">{product.name}</h3>
                <p className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 text-text-secondary">{product.description || "Sin descripción."}</p>
                <div className="flex flex-1 flex-col pt-3">
                  <div className="flex min-h-7 items-center justify-between gap-2">
                    <p className="text-xl font-semibold text-text-primary">{price(Number(product.price), product.currency)}</p>
                    <span className={visible ? "text-status-success" : "text-text-secondary"} role="img" aria-label={visible ? "Visible en el catálogo" : "No visible en el catálogo"} title={visible ? "Visible en el catálogo" : "No visible en el catálogo"}>
                      <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        {visible ? <><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></> : <><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.8 10.8 0 0 1 12 5c6.1 0 9.5 7 9.5 7a14 14 0 0 1-3 4.2M6.6 6.6C3.9 8.4 2.5 12 2.5 12s3.4 7 9.5 7a10 10 0 0 0 4-.8" /></>}
                      </svg>
                    </span>
                  </div>
                  {inventoryItem && <ProductInventoryControl item={inventoryItem} product={product} onEdit={() => edit(product)} onUpdated={(updatedItem, availabilityStatus, isActive) => {
                    setInventory((current) => current.map((item) => item.product_id === updatedItem.product_id ? updatedItem : item));
                    setProducts((current) => current.map((item) => item.id === product.id ? { ...item, availability_status: availabilityStatus, is_active: isActive } : item));
                  }} />}
                  {!inventoryItem && <p className="mt-4 text-xs text-text-secondary">No se pudo mostrar el inventario de este producto. Recarga la página.</p>}
                  {!inventoryItem && <div className="mt-auto border-t border-border-subtle pt-3">
                    <button className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-brand-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2" type="button" onClick={() => edit(product)}>
                      <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m16 4 4 4M4 20l4-.8L19.2 8a2.1 2.1 0 0 0-3-3L5 16.2 4 20Z" /><path d="M13.5 6.5 17.5 10.5" /></svg>
                      Editar
                    </button>
                  </div>}
                </div>
              </div>
            </li>;
          })}</ul>}
      </section>
    </>
  );
}
