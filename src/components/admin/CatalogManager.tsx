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
  in_stock: "border-[#C8E6C9] bg-[#E8F5E9] text-[#2D6A4F]",
  on_order: "border-[#FDE68A] bg-[#FEF3C7] text-[#8A5A12]",
  out_of_stock: "border-[#E2D9DD] bg-[#F0ECEE] text-[#6B5E65]",
  inactive: "border-[#E2D9DD] bg-[#F0ECEE] text-[#6B5E65]",
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
  const [draft, setDraft] = useState<Draft>(() => blankDraft(initialCategories.find((item) => item.is_active)?.id));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const activeCategories = categories.filter((category) => category.is_active);

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
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
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
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold tracking-[0.14em] text-brand-primary uppercase">Catálogo interno</p><h2 className="mt-2 font-display text-2xl font-semibold">Productos registrados</h2></div><p className="text-sm text-text-secondary">{products.length} producto{products.length === 1 ? "" : "s"}</p></div>
        {products.length === 0 ? <div className="mt-5 rounded-[20px] border border-dashed border-border-subtle bg-surface-card px-6 py-12 text-center"><h3 className="font-display text-xl font-semibold">Tu catálogo está listo para comenzar</h3><p className="mt-3 text-sm leading-6 text-text-secondary">Agrega una categoría y luego registra tu primer producto.</p></div> :
          <ul className="mt-5 grid gap-4 md:grid-cols-2">{products.map((product) => {
            const category = categoryById.get(product.category_id);
            const visible = product.is_active && product.availability_status !== "inactive" && category?.is_active;
            return <li className="rounded-[20px] border border-border-subtle bg-surface-card p-5 shadow-[0_4px_20px_-2px_rgba(134,54,93,0.05)]" key={product.id}>
              <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold tracking-[0.12em] text-text-secondary uppercase">{category?.name ?? "Categoría eliminada"}</p><h3 className="mt-2 font-display text-xl font-medium">{product.name}</h3></div><span className={`rounded-full border px-3 py-1 text-xs font-semibold ${badgeStyles[product.availability_status]}`}>{labels[product.availability_status]}</span></div>
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
