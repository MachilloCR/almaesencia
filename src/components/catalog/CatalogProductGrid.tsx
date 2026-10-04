import { useMemo, useState } from "react";
import { Toaster, sileo } from "sileo";
import type { AdminCategory, AdminProduct } from "../../services/admin-catalog";
import { useCartStore } from "../../stores/cart-store";

type Props = { categories: AdminCategory[]; products: AdminProduct[] };

const availability = {
  in_stock: { label: "Disponible", classes: "border-[#C8E6C9] bg-[#E8F5E9] text-[#2D6A4F]" },
  on_order: { label: "Por encargo", classes: "border-[#FDE68A] bg-[#FEF3C7] text-[#8A5A12]" },
  out_of_stock: { label: "Agotado", classes: "border-[#F87171] bg-[#FECACA] text-[#991B1B]" },
  inactive: { label: "Inactivo", classes: "border-[#E2D9DD] bg-[#F0ECEE] text-[#6B5E65]" },
} as const;

function formatPrice(value: number, currency: string) {
  return new Intl.NumberFormat("es-CR", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

export default function CatalogProductGrid({ categories, products }: Props) {
  const add = useCartStore((state) => state.add);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const categoriesById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const filteredProducts = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase("es");
    return products.filter((product) => {
      const category = categoriesById.get(product.category_id);
      const matchesQuery = !normalizedQuery || `${product.name} ${product.description ?? ""} ${category?.name ?? ""}`
        .toLocaleLowerCase("es")
        .includes(normalizedQuery);
      const matchesCategory = categoryFilter === "all" || product.category_id === categoryFilter;
      const matchesAvailability = availabilityFilter === "all" || product.availability_status === availabilityFilter;
      return matchesQuery && matchesCategory && matchesAvailability;
    });
  }, [products, categoriesById, searchQuery, categoryFilter, availabilityFilter]);
  const hasFilters = Boolean(searchQuery || categoryFilter !== "all" || availabilityFilter !== "all");

  return (
    <>
      <Toaster
        position="top-center"
        options={{
          fill: "#2C1A23",
          roundness: 16,
          duration: 2_000,
          styles: { title: "text-white!", description: "text-white/80!" },
        }}
      />
      <div className="mb-8 rounded-[20px] border border-border-subtle bg-surface-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <label className="block w-full text-xs font-semibold text-text-secondary sm:max-w-md">Buscar producto
            <input className="mt-2 min-h-11 w-full rounded-xl border border-border-subtle bg-white px-4 text-sm font-normal text-text-primary outline-none placeholder:text-text-secondary/70 focus:border-brand-primary focus:ring-3 focus:ring-brand-primary/12" type="search" placeholder="Nombre, descripción o categoría" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
          </label>
          <p className="text-sm text-text-secondary">{filteredProducts.length} de {products.length} producto{products.length === 1 ? "" : "s"}</p>
        </div>
        <div className="mt-5">
          <p className="text-xs font-semibold text-text-secondary">Categoría</p>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtrar por categoría">
            <button className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition ${categoryFilter === "all" ? "bg-brand-primary text-white" : "bg-brand-primary-soft text-text-secondary hover:text-brand-primary"}`} type="button" aria-pressed={categoryFilter === "all"} onClick={() => setCategoryFilter("all")}>Todas</button>
            {categories.map((category) => <button className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition ${categoryFilter === category.id ? "bg-brand-primary text-white" : "bg-brand-primary-soft text-text-secondary hover:text-brand-primary"}`} key={category.id} type="button" aria-pressed={categoryFilter === category.id} onClick={() => setCategoryFilter(category.id)}>{category.name}</button>)}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por disponibilidad">
          <span className="mr-1 text-xs font-semibold text-text-secondary">Disponibilidad</span>
          {(["all", "in_stock", "on_order", "out_of_stock"] as const).map((status) => {
            const label = status === "all" ? "Todas" : availability[status].label;
            return <button className={`min-h-10 rounded-full px-4 text-sm font-semibold transition ${availabilityFilter === status ? "bg-brand-primary text-white" : "bg-brand-primary-soft text-text-secondary hover:text-brand-primary"}`} key={status} type="button" aria-pressed={availabilityFilter === status} onClick={() => setAvailabilityFilter(status)}>{label}</button>;
          })}
          {hasFilters && <button className="min-h-10 rounded-full px-3 text-sm font-semibold text-brand-primary hover:underline" type="button" onClick={() => { setSearchQuery(""); setCategoryFilter("all"); setAvailabilityFilter("all"); }}>Limpiar filtros</button>}
        </div>
      </div>

      {filteredProducts.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-border-subtle bg-surface-card px-6 py-12 text-center">
          <h3 className="font-display text-xl font-semibold text-text-primary">No encontramos productos con esos filtros</h3>
          <p className="mt-2 text-sm leading-6 text-text-secondary">Prueba con otro nombre o cambia la categoría o disponibilidad.</p>
          {hasFilters && <button className="mt-4 min-h-11 rounded-full px-4 text-sm font-semibold text-brand-primary hover:bg-brand-primary-soft" type="button" onClick={() => { setSearchQuery(""); setCategoryFilter("all"); setAvailabilityFilter("all"); }}>Limpiar filtros</button>}
        </div>
      ) : (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 lg:gap-6">
        {filteredProducts.map((product) => {
          const category = categoriesById.get(product.category_id);
          const status = availability[product.availability_status];
          const canAdd = product.availability_status !== "out_of_stock" && product.availability_status !== "inactive";

          return (
            <article className="group w-full overflow-hidden rounded-[20px] border border-border-subtle bg-surface-card shadow-[0_4px_20px_-2px_rgba(134,54,93,0.05)] transition duration-300 hover:-translate-y-1 hover:border-accent-rose hover:shadow-[0_12px_28px_-4px_rgba(134,54,93,0.10)] motion-reduce:transform-none motion-reduce:transition-none" key={product.id}>
              <div className="relative aspect-[4/5] overflow-hidden bg-gradient-to-br from-surface-soft via-brand-primary-soft to-[#F6E4D8]">
                <div className="absolute inset-0 transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100">
                  <div className="absolute inset-4 flex items-end rounded-xl border border-white/70 bg-white/45 p-4 backdrop-blur-sm">
                    <p className="font-display text-xl italic text-brand-primary/75">Alma Esencia CR</p>
                  </div>
                </div>
                <span className={`absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${status.classes}`}>
                  <svg aria-hidden="true" className="size-3.5 shrink-0" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    {product.availability_status === "in_stock" && <path d="m3.5 8 3 3 6-6" />}
                    {product.availability_status === "on_order" && <><circle cx="8" cy="8" r="5.5" /><path d="M8 4.5V8l2.25 1.5" /></>}
                    {(product.availability_status === "out_of_stock" || product.availability_status === "inactive") && <><circle cx="8" cy="8" r="5.5" /><path d="m4.1 4.1 7.8 7.8" /></>}
                  </svg>
                  {status.label}
                </span>
              </div>
              <div className="px-3 py-3 sm:px-4 sm:py-4">
                <p className="text-xs font-semibold tracking-[0.12em] text-text-secondary uppercase">{category?.name}</p>
                <h3 className="mt-2 truncate font-display text-lg font-medium text-text-primary sm:text-xl" title={product.name}>{product.name}</h3>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-base font-semibold text-text-primary sm:text-lg">{formatPrice(Number(product.price), product.currency)}</p>
                    <p className="mt-0.5 text-xs text-text-secondary">Precio estimado</p>
                  </div>
                  <button className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-brand-primary text-white transition hover:bg-brand-primary-hover focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-brand-primary-soft disabled:text-text-secondary" type="button" aria-label={`${canAdd ? "Agregar a solicitud" : "Agotado"}: ${product.name}`} title={canAdd ? "Agregar a solicitud" : "Agotado"} disabled={!canAdd} onClick={() => { add({ id: product.id, name: product.name, slug: product.slug, price: Number(product.price), currency: product.currency, availability_status: product.availability_status }); sileo.success({ title: "Agregado a tu solicitud", description: product.name }); }}>
                    <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3.75 4.5h2l2.1 10.1a2.25 2.25 0 0 0 2.2 1.79h7.4a2.25 2.25 0 0 0 2.2-1.79l1.1-5.35H7" />
                      <circle cx="10" cy="19.5" r="1" />
                      <circle cx="17.5" cy="19.5" r="1" />
                      {canAdd && <path d="M14 9v4m-2-2h4" />}
                    </svg>
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      )}
    </>
  );
}
