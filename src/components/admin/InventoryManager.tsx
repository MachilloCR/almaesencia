import { useEffect, useMemo, useState } from "react";
import { sileo } from "sileo";
import type { AdminCategory, AdminInventoryItem, AdminProduct } from "../../services/admin-catalog";

type Props = {
  initialInventory: AdminInventoryItem[];
  products: AdminProduct[];
  categories: AdminCategory[];
};

type ApiResponse = { item: AdminInventoryItem; availabilityStatus?: "out_of_stock" };

type InventoryDisplayStatus = AdminProduct["availability_status"];

const availabilityLabels: Record<InventoryDisplayStatus, string> = {
  in_stock: "Disponible",
  on_order: "Por encargo",
  out_of_stock: "Agotado",
  inactive: "Inactivo",
};

const availabilityStyles: Record<InventoryDisplayStatus, string> = {
  in_stock: "border-[#74C69D] bg-[#B7E4C7] text-[#1B4332]",
  on_order: "border-[#F59E0B] bg-[#FCD34D] text-[#78350F]",
  out_of_stock: "border-[#F87171] bg-[#FECACA] text-[#991B1B]",
  inactive: "border-[#A99AA1] bg-[#D6CDD1] text-[#493B42]",
};

async function updateInventory(body: unknown) {
  const response = await fetch("/api/admin/inventory", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as ApiResponse & { error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? "No fue posible actualizar el inventario.");
  }

  return data;
}

export default function InventoryManager({ initialInventory, products, categories }: Props) {
  const [inventory, setInventory] = useState(initialInventory);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [savingProductId, setSavingProductId] = useState<string | null>(null);
  const [productChanges, setProductChanges] = useState<Record<string, AdminProduct>>({});
  const [categoryChanges, setCategoryChanges] = useState<Record<string, AdminCategory>>({});
  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, productChanges[product.id] ?? product])),
    [products, productChanges],
  );
  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, categoryChanges[category.id] ?? category])),
    [categories, categoryChanges],
  );
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase("es");
  const filteredInventory = inventory.filter((item) => {
    const product = productsById.get(item.product_id);
    const category = product ? categoriesById.get(product.category_id) : undefined;
    const matchesQuery = !normalizedQuery || `${product?.name ?? ""} ${category?.name ?? ""}`
      .toLocaleLowerCase("es")
      .includes(normalizedQuery);
    const matchesCategory = categoryFilter === "all" || product?.category_id === categoryFilter;
    const matchesAvailability = availabilityFilter === "all" || product?.availability_status === availabilityFilter;
    const matchesStock = stockFilter === "all" || (stockFilter === "available" ? item.quantity > 0 : item.quantity === 0);
    return matchesQuery && matchesCategory && matchesAvailability && matchesStock;
  });
  const hasFilters = Boolean(searchQuery || categoryFilter !== "all" || availabilityFilter !== "all" || stockFilter !== "all");

  useEffect(() => {
    function handleProductChange(event: Event) {
      const product = (event as CustomEvent<AdminProduct>).detail;
      setProductChanges((current) => ({ ...current, [product.id]: product }));
      setInventory((current) =>
        current.some((item) => item.product_id === product.id)
          ? current
          : [{ product_id: product.id, quantity: 0, updated_at: new Date().toISOString() }, ...current],
      );
    }

    function handleCategoryChange(event: Event) {
      const category = (event as CustomEvent<AdminCategory>).detail;
      setCategoryChanges((current) => ({ ...current, [category.id]: category }));
    }

    window.addEventListener("admin:product-changed", handleProductChange);
    window.addEventListener("admin:category-changed", handleCategoryChange);
    return () => {
      window.removeEventListener("admin:product-changed", handleProductChange);
      window.removeEventListener("admin:category-changed", handleCategoryChange);
    };
  }, []);

  function replaceItem(item: AdminInventoryItem) {
    setInventory((current) => current.map((entry) => (entry.product_id === item.product_id ? item : entry)));
  }

  async function saveQuantity(item: AdminInventoryItem) {
    const quantity = Number(quantities[item.product_id] ?? item.quantity);
    if (!Number.isInteger(quantity) || quantity < 0) {
      sileo.error({ title: "Cantidad no válida", description: "Usa un número entero igual o mayor a cero." });
      return;
    }

    setSavingProductId(item.product_id);
    try {
      const { item: updatedItem } = await sileo.promise(
        updateInventory({ productId: item.product_id, quantity }),
        {
          loading: { title: "Actualizando existencias…" },
          success: { title: "Inventario actualizado" },
          error: (error) => ({ title: "No se pudo guardar", description: String(error) }),
        },
      );
      replaceItem(updatedItem);
      setQuantities((current) => ({ ...current, [item.product_id]: String(updatedItem.quantity) }));
    } catch {
      // Sileo informa el error.
    } finally {
      setSavingProductId(null);
    }
  }

  async function markOutOfStock(item: AdminInventoryItem) {
    setSavingProductId(item.product_id);
    try {
      const { item: updatedItem } = await sileo.promise(
        updateInventory({ action: "mark_out_of_stock", productId: item.product_id }),
        {
          loading: { title: "Marcando como agotado…" },
          success: { title: "Producto agotado", description: "La cantidad quedó en cero." },
          error: (error) => ({ title: "No se pudo actualizar", description: String(error) }),
        },
      );
      replaceItem(updatedItem);
      setQuantities((current) => ({ ...current, [item.product_id]: "0" }));
      const product = productsById.get(item.product_id);
      if (product) {
        window.dispatchEvent(
          new CustomEvent<AdminProduct>("admin:product-changed", {
            detail: { ...product, availability_status: "out_of_stock" },
          }),
        );
      }
    } catch {
      // Sileo informa el error.
    } finally {
      setSavingProductId(null);
    }
  }

  return (
    <section className="mt-12 border-t border-border-subtle pt-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-brand-primary uppercase">Inventario</p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-text-primary">Existencias actuales</h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">Ajusta la cantidad física sin modificar solicitudes de pedido.</p>
        </div>
        <p className="text-sm text-text-secondary">Mostrando {filteredInventory.length} de {inventory.length} producto{inventory.length === 1 ? "" : "s"}</p>
      </div>

      <div className="mt-5 grid gap-3 rounded-[16px] border border-border-subtle bg-surface-card p-4 sm:grid-cols-2 xl:grid-cols-[minmax(14rem,1.5fr)_repeat(3,minmax(10rem,1fr))]">
        <label className="text-xs font-semibold text-text-secondary">Buscar producto
          <input className="mt-2 min-h-11 w-full rounded-lg border border-border-subtle bg-white px-3 text-sm font-normal text-text-primary outline-none placeholder:text-text-secondary/70 focus:border-brand-primary focus:ring-3 focus:ring-brand-primary/12" type="search" placeholder="Nombre o categoría" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
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
            <option value="in_stock">Disponible</option>
            <option value="on_order">Por encargo</option>
            <option value="out_of_stock">Agotado</option>
            <option value="inactive">Inactivo</option>
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

      {inventory.length === 0 ? (
        <div className="mt-5 rounded-[20px] border border-dashed border-border-subtle bg-surface-card px-6 py-10 text-center text-sm text-text-secondary">
          El inventario aparecerá al crear productos.
        </div>
      ) : filteredInventory.length === 0 ? (
        <div className="mt-5 rounded-[20px] border border-dashed border-border-subtle bg-surface-card px-6 py-10 text-center">
          <h3 className="font-display text-xl font-semibold text-text-primary">No encontramos productos con esos filtros</h3>
          <p className="mt-2 text-sm text-text-secondary">Prueba con otro nombre o ajusta las opciones seleccionadas.</p>
          {hasFilters && <button className="mt-4 min-h-11 rounded-full px-4 text-sm font-semibold text-brand-primary hover:bg-brand-primary-soft" type="button" onClick={() => { setSearchQuery(""); setCategoryFilter("all"); setAvailabilityFilter("all"); setStockFilter("all"); }}>Limpiar filtros</button>}
        </div>
      ) : (
        <ul className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(17rem,17rem))] justify-start gap-4">
          {filteredInventory.map((item) => {
            const product = productsById.get(item.product_id);
            const category = product ? categoriesById.get(product.category_id) : undefined;
            const isSaving = savingProductId === item.product_id;
            const visibleQuantity = quantities[item.product_id] ?? String(item.quantity);
            const availabilityStatus: InventoryDisplayStatus = !product || !product.is_active
              ? "inactive"
              : product.availability_status;

            return (
              <li className="relative rounded-[20px] border border-border-subtle bg-surface-card p-5 shadow-[0_4px_20px_-2px_rgba(134,54,93,0.05)]" key={item.product_id}>
                <p className="max-w-[60%] text-xs font-semibold tracking-[0.12em] text-text-secondary uppercase">{category?.name ?? "Sin categoría"}</p>
                <span className={`absolute right-5 top-5 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${availabilityStyles[availabilityStatus]}`}>
                  <svg aria-hidden="true" className="size-3.5 shrink-0" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    {availabilityStatus === "in_stock" && <path d="m3.5 8 3 3 6-6" />}
                    {availabilityStatus === "on_order" && <><circle cx="8" cy="8" r="5.5" /><path d="M8 4.5V8l2.25 1.5" /></>}
                    {(availabilityStatus === "out_of_stock" || availabilityStatus === "inactive") && <><circle cx="8" cy="8" r="5.5" /><path d="m4.1 4.1 7.8 7.8" /></>}
                  </svg>
                  {availabilityLabels[availabilityStatus]}
                </span>
                <h3 className="mt-2 font-display text-xl font-medium text-text-primary">{product?.name ?? "Producto no disponible"}</h3>
                <label className="mt-5 block text-sm font-semibold text-text-primary">
                  Unidades físicas
                  <input
                    className="mt-2 min-h-11 w-full rounded-lg border border-border-subtle bg-white px-3 font-normal outline-none focus:border-brand-primary focus:ring-3 focus:ring-brand-primary/12"
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={visibleQuantity}
                    onChange={(event) => setQuantities((current) => ({ ...current, [item.product_id]: event.target.value }))}
                  />
                </label>
                <p className="mt-2 text-xs text-text-secondary">Actualizado: {new Intl.DateTimeFormat("es-CR", { dateStyle: "medium" }).format(new Date(item.updated_at))}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button className="min-h-11 rounded-full bg-brand-primary px-4 text-sm font-semibold text-white hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:bg-brand-primary-soft disabled:text-text-secondary" type="button" onClick={() => void saveQuantity(item)} disabled={isSaving}>{isSaving ? "Guardando…" : "Guardar cantidad"}</button>
                  <button className="min-h-11 rounded-full px-4 text-sm font-semibold text-brand-primary hover:bg-brand-primary-soft disabled:text-text-secondary" type="button" onClick={() => void markOutOfStock(item)} disabled={isSaving}>Marcar agotado</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
