import { type SubmitEvent, useMemo, useState } from "react";
import { Toaster, sileo } from "sileo";
import type { AdminCategory, AdminProduct } from "../../services/admin-catalog";
import type { ProductAvailabilityStatus } from "../../types/database";

type Props = { initialCategories: AdminCategory[]; initialProducts: AdminProduct[] };
type Draft = {
  categoryId: string;
  name: string;
  description: string;
  price: string;
  availabilityStatus: ProductAvailabilityStatus;
  isActive: boolean;
};

const labels: Record<ProductAvailabilityStatus, string> = {
  in_stock: "Disponible",
  on_order: "Por encargo",
  out_of_stock: "Agotado",
  inactive: "Inactivo",
};
const badgeStyles: Record<ProductAvailabilityStatus, string> = {
  in_stock: "border-[#74C69D] bg-[#B7E4C7] text-[#1B4332]",
  on_order: "border-[#F59E0B] bg-[#FCD34D] text-[#78350F]",
  out_of_stock: "border-[#F87171] bg-[#FECACA] text-[#991B1B]",
  inactive: "border-[#A99AA1] bg-[#D6CDD1] text-[#493B42]",
};

function blankDraft(categoryId = ""): Draft {
  return { categoryId, name: "", description: "", price: "", availabilityStatus: "in_stock", isActive: true };
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

export default function CatalogManager({ initialCategories, initialProducts }: Props) {
  const [categories, setCategories] = useState(initialCategories);
  const [products, setProducts] = useState(initialProducts);
  const [categoryName, setCategoryName] = useState("");
  const [categoryDescription, setCategoryDescription] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const [visibilityFilter, setVisibilityFilter] = useState("all");
  const [draft, setDraft] = useState<Draft>(() => blankDraft(initialCategories.find((item) => item.is_active)?.id));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const activeCategories = categories.filter((category) => category.is_active);
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase("es");
  const filteredProducts = products.filter((product) => {
    const category = categoryById.get(product.category_id);
    const matchesQuery = !normalizedQuery || `${product.name} ${product.description ?? ""} ${category?.name ?? ""}`
      .toLocaleLowerCase("es")
      .includes(normalizedQuery);
    const matchesCategory = categoryFilter === "all" || product.category_id === categoryFilter;
    const matchesAvailability = availabilityFilter === "all" || product.availability_status === availabilityFilter;
    const isVisible = product.is_active && product.availability_status !== "inactive" && category?.is_active;
    const matchesVisibility = visibilityFilter === "all" || (visibilityFilter === "visible" ? isVisible : !isVisible);
    return matchesQuery && matchesCategory && matchesAvailability && matchesVisibility;
  });
  const hasFilters = Boolean(searchQuery || categoryFilter !== "all" || availabilityFilter !== "all" || visibilityFilter !== "all");

  const set = <Key extends keyof Draft>(key: Key, value: Draft[Key]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const reset = () => {
    setEditingId(null);
    setDraft(blankDraft(activeCategories[0]?.id));
  };

  async function createCategory(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const { category } = await sileo.promise(
        api<{ category: AdminCategory }>("/api/admin/categories", "POST", { name: categoryName, description: categoryDescription }),
        {
          loading: { title: "Creando categoría…" },
          success: { title: "Categoría creada", description: "Ya puedes asignarla a un producto." },
          error: (error) => ({ title: "No se pudo crear", description: String(error) }),
        },
      );
      setCategories((current) => [...current, category].sort((a, b) => a.name.localeCompare(b.name)));
      window.dispatchEvent(new CustomEvent<AdminCategory>("admin:category-changed", { detail: category }));
      setCategoryName("");
      setCategoryDescription("");
      if (!draft.categoryId) set("categoryId", category.id);
    } catch {
      // Sileo informa el error.
    } finally {
      setSaving(false);
    }
  }

  async function persist(productId?: string, changes?: Partial<Draft>) {
    const values = { ...draft, ...changes };
    if (!values.categoryId) {
      sileo.error({ title: "Crea una categoría primero", description: "Todo producto debe pertenecer a una categoría." });
      return;
    }
    setSaving(true);
    try {
      const { product } = await sileo.promise(
        api<{ product: AdminProduct }>("/api/admin/products", productId ? "PATCH" : "POST", {
          ...(productId ? { id: productId } : {}),
          ...values,
          price: Number(values.price),
        }),
        {
          loading: { title: productId ? "Guardando producto…" : "Creando producto…" },
          success: { title: productId ? "Producto actualizado" : "Producto creado" },
          error: (error) => ({ title: "No se pudo guardar", description: String(error) }),
        },
      );
      setProducts((current) => [product, ...current.filter((item) => item.id !== product.id)]);
      window.dispatchEvent(new CustomEvent<AdminProduct>("admin:product-changed", { detail: product }));
      reset();
    } catch {
      // Sileo informa el error.
    } finally {
      setSaving(false);
    }
  }

  function edit(product: AdminProduct) {
    setEditingId(product.id);
    setDraft({
      categoryId: product.category_id,
      name: product.name,
      description: product.description ?? "",
      price: String(product.price),
      availabilityStatus: product.availability_status,
      isActive: product.is_active,
    });
  }

  function toggle(product: AdminProduct) {
    const changes: Draft = {
      categoryId: product.category_id,
      name: product.name,
      description: product.description ?? "",
      price: String(product.price),
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
      <section className="grid justify-start gap-6 xl:grid-cols-[minmax(0,52rem)_22.5rem]">
        <div className="rounded-[20px] border border-border-subtle bg-surface-card p-6 shadow-[0_4px_20px_-2px_rgba(134,54,93,0.05)] sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold tracking-[0.14em] text-brand-primary uppercase">Productos</p>
              <h2 className="mt-2 font-display text-2xl font-semibold">{editingId ? "Editar producto" : "Agregar producto"}</h2>
              <p className="mt-2 text-sm leading-6 text-text-secondary">El inventario inicia en cero y se ajustará en su propia sección.</p>
            </div>
            {editingId && <button className="min-h-11 rounded-full px-4 text-sm font-semibold text-brand-primary hover:bg-brand-primary-soft" type="button" onClick={reset}>Cancelar edición</button>}
          </div>

          <form className="mt-7 grid gap-5 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void persist(editingId ?? undefined); }}>
            <label className="text-sm font-semibold">Nombre
              <input className="mt-2 min-h-11 w-full rounded-lg border border-border-subtle bg-white px-3 font-normal outline-none focus:border-brand-primary focus:ring-3 focus:ring-brand-primary/12" value={draft.name} onChange={(event) => set("name", event.target.value)} minLength={2} maxLength={140} required />
            </label>
            <label className="text-sm font-semibold">Categoría
              <select className="mt-2 min-h-11 w-full rounded-lg border border-border-subtle bg-white px-3 font-normal outline-none focus:border-brand-primary focus:ring-3 focus:ring-brand-primary/12" value={draft.categoryId} onChange={(event) => set("categoryId", event.target.value)} required>
                <option value="">Selecciona una categoría</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.is_active ? "" : " (inactiva)"}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold">Precio estimado (CRC)
              <input className="mt-2 min-h-11 w-full rounded-lg border border-border-subtle bg-white px-3 font-normal outline-none focus:border-brand-primary focus:ring-3 focus:ring-brand-primary/12" value={draft.price} onChange={(event) => set("price", event.target.value)} type="number" min="0" step="0.01" inputMode="decimal" required />
            </label>
            <label className="text-sm font-semibold">Disponibilidad
              <select className="mt-2 min-h-11 w-full rounded-lg border border-border-subtle bg-white px-3 font-normal outline-none focus:border-brand-primary focus:ring-3 focus:ring-brand-primary/12" value={draft.availabilityStatus} onChange={(event) => set("availabilityStatus", event.target.value as ProductAvailabilityStatus)}>
                {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="sm:col-span-2 text-sm font-semibold">Descripción <span className="font-normal text-text-secondary">(opcional)</span>
              <textarea className="mt-2 min-h-28 w-full rounded-lg border border-border-subtle bg-white px-3 py-2 font-normal outline-none focus:border-brand-primary focus:ring-3 focus:ring-brand-primary/12" value={draft.description} onChange={(event) => set("description", event.target.value)} maxLength={2_000} />
            </label>
            <label className="sm:col-span-2 flex min-h-11 items-center gap-3 rounded-lg bg-surface-soft px-3 text-sm">
              <input className="size-5 accent-brand-primary" checked={draft.isActive} onChange={(event) => set("isActive", event.target.checked)} type="checkbox" />
              Mostrar este producto en el catálogo cuando su categoría esté activa.
            </label>
            <div className="sm:col-span-2 flex flex-wrap gap-3">
              <button className="min-h-11 rounded-full bg-brand-primary px-5 py-3 text-sm font-semibold text-white hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:bg-brand-primary-soft disabled:text-text-secondary" type="submit" disabled={saving || activeCategories.length === 0}>{saving ? "Guardando…" : editingId ? "Guardar cambios" : "Crear producto"}</button>
              {activeCategories.length === 0 && <p className="self-center text-sm text-text-secondary">Crea una categoría activa para añadir productos.</p>}
            </div>
          </form>
        </div>

        <aside className="h-fit rounded-[20px] border border-border-subtle bg-surface-card p-6 shadow-[0_4px_20px_-2px_rgba(134,54,93,0.05)]">
          <p className="text-xs font-semibold tracking-[0.14em] text-brand-primary uppercase">Categorías</p>
          <h2 className="mt-2 font-display text-2xl font-semibold">Organiza el catálogo</h2>
          <form className="mt-5 space-y-4" onSubmit={createCategory}>
            <label className="block text-sm font-semibold">Nombre
              <input className="mt-2 min-h-11 w-full rounded-lg border border-border-subtle bg-white px-3 font-normal outline-none focus:border-brand-primary focus:ring-3 focus:ring-brand-primary/12" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} minLength={2} maxLength={80} required />
            </label>
            <label className="block text-sm font-semibold">Descripción <span className="font-normal text-text-secondary">(opcional)</span>
              <textarea className="mt-2 min-h-24 w-full rounded-lg border border-border-subtle bg-white px-3 py-2 font-normal outline-none focus:border-brand-primary focus:ring-3 focus:ring-brand-primary/12" value={categoryDescription} onChange={(event) => setCategoryDescription(event.target.value)} maxLength={2_000} />
            </label>
            <button className="min-h-11 w-full rounded-full border-[1.5px] border-brand-primary px-5 py-3 text-sm font-semibold text-brand-primary hover:bg-brand-primary-soft disabled:cursor-not-allowed disabled:border-border-subtle disabled:text-text-secondary" type="submit" disabled={saving}>{saving ? "Creando…" : "Crear categoría"}</button>
          </form>
          <ul className="mt-6 space-y-2 border-t border-border-subtle pt-5" aria-label="Categorías existentes">
            {categories.length === 0 ? <li className="text-sm text-text-secondary">Aún no hay categorías.</li> : categories.map((category) => <li className="flex justify-between gap-3 rounded-xl bg-surface-soft px-3 py-3" key={category.id}><span className="text-sm font-semibold">{category.name}</span><span className="text-xs text-text-secondary">{category.is_active ? "Activa" : "Inactiva"}</span></li>)}
          </ul>
        </aside>
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold tracking-[0.14em] text-brand-primary uppercase">Catálogo interno</p><h2 className="mt-2 font-display text-2xl font-semibold">Productos registrados</h2></div><p className="text-sm text-text-secondary">Mostrando {filteredProducts.length} de {products.length} producto{products.length === 1 ? "" : "s"}</p></div>
        <div className="mt-5 grid gap-3 rounded-[16px] border border-border-subtle bg-surface-card p-4 sm:grid-cols-2 xl:grid-cols-[minmax(14rem,1.5fr)_repeat(3,minmax(10rem,1fr))]">
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
        </div>
        {products.length === 0 ? <div className="mt-5 rounded-[20px] border border-dashed border-border-subtle bg-surface-card px-6 py-12 text-center"><h3 className="font-display text-xl font-semibold">Tu catálogo está listo para comenzar</h3><p className="mt-3 text-sm leading-6 text-text-secondary">Agrega una categoría y luego registra tu primer producto.</p></div> :
          filteredProducts.length === 0 ? <div className="mt-5 rounded-[20px] border border-dashed border-border-subtle bg-surface-card px-6 py-10 text-center"><h3 className="font-display text-xl font-semibold">No encontramos productos con esos filtros</h3><p className="mt-2 text-sm text-text-secondary">Prueba otro nombre o cambia las opciones seleccionadas.</p>{hasFilters && <button className="mt-4 min-h-11 rounded-full px-4 text-sm font-semibold text-brand-primary hover:bg-brand-primary-soft" type="button" onClick={() => { setSearchQuery(""); setCategoryFilter("all"); setAvailabilityFilter("all"); setVisibilityFilter("all"); }}>Limpiar filtros</button>}</div> :
          <ul className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(17rem,17rem))] justify-start gap-4">{filteredProducts.map((product) => {
            const category = categoryById.get(product.category_id);
            const visible = product.is_active && product.availability_status !== "inactive" && category?.is_active;
            return <li className="relative rounded-[20px] border border-border-subtle bg-surface-card p-5 shadow-[0_4px_20px_-2px_rgba(134,54,93,0.05)]" key={product.id}>
              <p className="max-w-[60%] text-xs font-semibold tracking-[0.12em] text-text-secondary uppercase">{category?.name ?? "Categoría eliminada"}</p>
              <span className={`absolute right-5 top-5 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${badgeStyles[product.availability_status]}`}>
                <svg aria-hidden="true" className="size-3.5 shrink-0" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  {product.availability_status === "in_stock" && <path d="m3.5 8 3 3 6-6" />}
                  {product.availability_status === "on_order" && <><circle cx="8" cy="8" r="5.5" /><path d="M8 4.5V8l2.25 1.5" /></>}
                  {(product.availability_status === "out_of_stock" || product.availability_status === "inactive") && <><circle cx="8" cy="8" r="5.5" /><path d="m4.1 4.1 7.8 7.8" /></>}
                </svg>
                {labels[product.availability_status]}
              </span>
              <h3 className="mt-2 font-display text-xl font-medium">{product.name}</h3>
              <p className="mt-4 text-lg font-semibold">{price(Number(product.price), product.currency)}</p>
              {product.description && <p className="mt-2 text-sm leading-6 text-text-secondary">{product.description}</p>}
              <p className="mt-4 text-xs text-text-secondary">{visible ? "Visible en el catálogo" : "No visible en el catálogo"}</p>
              <div className="mt-5 flex flex-wrap gap-2"><button className="min-h-11 rounded-full border-[1.5px] border-brand-primary px-4 text-sm font-semibold text-brand-primary hover:bg-brand-primary-soft" type="button" onClick={() => edit(product)}>Editar</button><button className="min-h-11 rounded-full px-4 text-sm font-semibold text-brand-primary hover:bg-brand-primary-soft disabled:text-text-secondary" type="button" onClick={() => toggle(product)} disabled={saving}>{product.is_active ? "Desactivar" : "Activar"}</button></div>
            </li>;
          })}</ul>}
      </section>
    </>
  );
}
