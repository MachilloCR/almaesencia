import { useEffect, useMemo, useRef, useState } from "react";
import { Toaster, sileo } from "sileo";
import type { AdminCategory } from "../../services/admin-catalog";
import type { PublicProduct } from "../../services/public-catalog";
import { useCartStore } from "../../stores/cart-store";
import StatusBadge, { getStatusLabel } from "../ui/StatusBadge";
import SearchField from "../ui/SearchField";

type Props = { categories: AdminCategory[]; products: PublicProduct[] };
type ImagePreview = { url: string; altText: string; productName: string };
const productsPerPage = 12;

function formatPrice(value: number, currency: string) {
  return new Intl.NumberFormat("es-CR", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

function getVisiblePages(currentPage: number, pageCount: number): number[] {
  const visibleCount = Math.min(3, pageCount);
  const firstVisiblePage = Math.max(1, Math.min(currentPage - 1, pageCount - visibleCount + 1));
  return Array.from({ length: visibleCount }, (_, index) => firstVisiblePage + index);
}

export default function CatalogProductGrid({ categories, products }: Props) {
  const add = useCartStore((state) => state.add);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(() => new Set());
  const [addedProductIds, setAddedProductIds] = useState<Set<string>>(() => new Set());
  const [imagePreview, setImagePreview] = useState<ImagePreview | null>(null);
  const productGridRef = useRef<HTMLDivElement | null>(null);
  const previewTriggerRef = useRef<HTMLButtonElement | null>(null);
  const previewCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const categoriesById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const filteredProducts = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase("es");
    return products.filter((product) => {
      const productCategories = product.categoryIds.map((categoryId) => categoriesById.get(categoryId)).filter((category) => category !== undefined);
      const matchesQuery = !normalizedQuery || `${product.name} ${product.description ?? ""} ${productCategories.map((category) => category.name).join(" ")}`
        .toLocaleLowerCase("es")
        .includes(normalizedQuery);
      const matchesCategory = categoryFilter === "all" || product.categoryIds.includes(categoryFilter);
      const matchesAvailability = availabilityFilter === "all" || product.availability_status === availabilityFilter;
      return matchesQuery && matchesCategory && matchesAvailability;
    });
  }, [products, categoriesById, searchQuery, categoryFilter, availabilityFilter]);
  const hasFilters = Boolean(searchQuery || categoryFilter !== "all" || availabilityFilter !== "all");
  const pageCount = Math.ceil(filteredProducts.length / productsPerPage);
  const activePage = Math.min(currentPage, Math.max(pageCount, 1));
  const pageProducts = filteredProducts.slice((activePage - 1) * productsPerPage, activePage * productsPerPage);
  const previousPageRef = useRef(activePage);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, categoryFilter, availabilityFilter]);

  useEffect(() => {
    if (previousPageRef.current === activePage) return;

    previousPageRef.current = activePage;
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    productGridRef.current?.scrollIntoView({ behavior, block: "start" });
  }, [activePage]);

  useEffect(() => {
    if (!imagePreview) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    previewCloseButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setImagePreview(null);
      } else if (event.key === "Tab") {
        event.preventDefault();
        previewCloseButtonRef.current?.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      previewTriggerRef.current?.focus();
    };
  }, [imagePreview]);

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
      <div className="mb-8 min-w-0 rounded-[20px] border border-border-subtle bg-surface-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <SearchField className="w-full sm:max-w-md" id="public-product-search" label="Buscar producto" placeholder="Nombre, descripción o categoría" value={searchQuery} onChange={setSearchQuery} />
          <p className="text-sm text-text-secondary">{filteredProducts.length} de {products.length} producto{products.length === 1 ? "" : "s"}</p>
        </div>
        <div className="mt-5">
          <p className="text-xs font-semibold text-text-secondary">Categoría</p>
          <div className="mt-2 flex gap-2 overflow-x-auto scrollbar-none pb-1" role="group" aria-label="Filtrar por categoría">
            <button className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition ${categoryFilter === "all" ? "bg-brand-primary text-white" : "bg-brand-primary-soft text-text-secondary hover:text-brand-primary"}`} type="button" aria-pressed={categoryFilter === "all"} onClick={() => setCategoryFilter("all")}>Todas</button>
            {categories.map((category) => <button className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition ${categoryFilter === category.id ? "bg-brand-primary text-white" : "bg-brand-primary-soft text-text-secondary hover:text-brand-primary"}`} key={category.id} type="button" aria-pressed={categoryFilter === category.id} onClick={() => setCategoryFilter(category.id)}>{category.name}</button>)}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por disponibilidad">
          <span className="mr-1 text-xs font-semibold text-text-secondary">Disponibilidad</span>
          {(["all", "in_stock", "on_order"] as const).map((status) => {
            const label = status === "all" ? "Todas" : getStatusLabel("product", status);
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
      <div id="catalog-product-grid" ref={productGridRef} className="scroll-mt-6 grid w-full min-w-0 grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 lg:gap-6">
        {pageProducts.map((product, index) => {
          const categoryNames = product.categoryIds.map((categoryId) => categoriesById.get(categoryId)?.name).filter((name): name is string => Boolean(name));
          const canAdd = product.availability_status !== "out_of_stock" && product.availability_status !== "inactive";
          const wasAdded = addedProductIds.has(product.id);
          const isCosmetics = categoryNames.some((name) => /cosm[eé]t|maquillaje|farmasi/i.test(name));
          const imageUrl = product.image?.url;
          const imageAltText = product.image?.altText || product.name;

          return (
            <article className="group w-full min-w-0 overflow-hidden rounded-[20px] border border-border-subtle bg-surface-card shadow-[0_4px_20px_-2px_rgba(134,54,93,0.05)] transition duration-300 hover:-translate-y-1 hover:border-accent-rose hover:shadow-[0_12px_28px_-4px_rgba(134,54,93,0.10)] motion-reduce:transform-none motion-reduce:transition-none" key={product.id}>
              <div className={`relative ${isCosmetics ? "aspect-square" : "aspect-[4/5]"} overflow-hidden bg-gradient-to-br from-surface-soft via-brand-primary-soft to-[#F6E4D8]`}>
                {imageUrl && !failedImageIds.has(product.id) ? (
                  <button
                    className="absolute inset-2 overflow-hidden rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
                    type="button"
                    aria-label={`Ampliar imagen de ${product.name}`}
                    onClick={(event) => {
                      previewTriggerRef.current = event.currentTarget;
                      setImagePreview({ url: imageUrl, altText: imageAltText, productName: product.name });
                    }}
                  >
                    <img className="size-full object-contain transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100" src={imageUrl} alt={imageAltText} width="640" height={isCosmetics ? "640" : "800"} loading={index < 4 ? "eager" : "lazy"} onError={() => setFailedImageIds((current) => new Set(current).add(product.id))} />
                  </button>
                ) : <div className="absolute inset-0 transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100">
                  <div className="absolute inset-4 flex items-end rounded-xl border border-white/70 bg-white/45 p-4 backdrop-blur-sm">
                    <p className="font-display text-xl italic text-brand-primary/75">Alma Esencia CR</p>
                  </div>
                </div>}
                <div className="absolute left-4 top-4 max-w-[calc(100%-2rem)] drop-shadow-sm">
                  <StatusBadge context="product" status={product.availability_status} size="compact" />
                </div>
              </div>
              <div className="min-w-0 px-3 py-3 sm:px-4 sm:py-4">
                <p className="line-clamp-2 min-h-8 text-xs font-semibold tracking-[0.12em] text-text-secondary uppercase">{categoryNames.join(" · ")}</p>
                <h3 className="mt-2 truncate font-display text-lg font-medium text-text-primary sm:text-xl" title={product.name}>{product.name}</h3>
                {product.availability_status === "in_stock" && product.stockQuantity !== null && <p className="mt-1 text-xs font-semibold text-[#2D6A4F]">{product.stockQuantity} {product.stockQuantity === 1 ? "unidad" : "unidades"} en stock</p>}
                <div className="mt-3 flex min-w-0 items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-text-primary sm:text-lg">{formatPrice(Number(product.price), product.currency)}</p>
                    <p className="mt-0.5 text-xs text-text-secondary">Precio estimado</p>
                  </div>
                  <button
                    className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary disabled:cursor-not-allowed disabled:bg-brand-primary-soft disabled:text-text-secondary ${wasAdded ? "bg-status-success hover:bg-[#166534]" : "bg-brand-primary hover:bg-brand-primary-hover"}`}
                    type="button"
                    aria-label={`${canAdd ? wasAdded ? "Agregar otra unidad a la solicitud" : "Agregar a solicitud" : "Agotado"}: ${product.name}`}
                    title={canAdd ? wasAdded ? "Agregar otra unidad" : "Agregar a solicitud" : "Agotado"}
                    disabled={!canAdd}
                    onClick={() => {
                      add({ id: product.id, name: product.name, slug: product.slug, price: Number(product.price), currency: product.currency, availability_status: product.availability_status, imageUrl: product.image?.url ?? null, imageAltText: product.image?.altText || product.name });
                      setAddedProductIds((current) => new Set(current).add(product.id));
                      sileo.success({ title: "Agregado a tu solicitud", description: product.name });
                    }}
                  >
                    {wasAdded ? (
                      <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>
                    ) : (
                      <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3.75 4.5h2l2.1 10.1a2.25 2.25 0 0 0 2.2 1.79h7.4a2.25 2.25 0 0 0 2.2-1.79l1.1-5.35H7" />
                        <circle cx="10" cy="19.5" r="1" />
                        <circle cx="17.5" cy="19.5" r="1" />
                        <path d="M14 9v4m-2-2h4" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      )}
      {pageCount > 1 && (
        <nav className="mt-8 flex flex-col items-center gap-3" aria-label="Paginación de productos">
          <p className="text-sm text-text-secondary">Página {activePage} de {pageCount}</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              className="inline-flex size-11 items-center justify-center rounded-full border border-border-subtle bg-white text-text-secondary transition hover:bg-brand-primary-soft disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              aria-label="Página anterior"
              title="Página anterior"
              disabled={activePage === 1}
              onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
            >
              <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            {getVisiblePages(activePage, pageCount).map((page) => (
              <button
                className={`inline-flex size-11 items-center justify-center rounded-full border text-sm font-semibold transition ${activePage === page ? "border-brand-primary bg-brand-primary text-white" : "border-border-subtle bg-white text-text-secondary hover:bg-brand-primary-soft"}`}
                key={page}
                type="button"
                aria-label={`Ir a la página ${page}`}
                aria-current={activePage === page ? "page" : undefined}
                onClick={() => setCurrentPage(page)}
              >
                {page}
              </button>
            ))}
            <button
              className="inline-flex size-11 items-center justify-center rounded-full border border-border-subtle bg-white text-text-secondary transition hover:bg-brand-primary-soft disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              aria-label="Página siguiente"
              title="Página siguiente"
              disabled={activePage === pageCount}
              onClick={() => setCurrentPage((page) => Math.min(page + 1, pageCount))}
            >
              <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </button>
          </div>
        </nav>
      )}
      {imagePreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#2C1A23]/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`Vista previa de ${imagePreview.productName}`}
          onClick={() => setImagePreview(null)}
        >
          <div className="relative max-h-full max-w-full rounded-[20px] border border-border-subtle bg-white p-3 shadow-[0_20px_40px_-8px_rgba(44,26,35,0.35)] sm:p-5" onClick={(event) => event.stopPropagation()}>
            <button
              ref={previewCloseButtonRef}
              className="absolute right-5 top-5 z-10 inline-flex size-11 items-center justify-center rounded-full bg-white/95 text-brand-primary shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
              type="button"
              aria-label="Cerrar vista previa"
              title="Cerrar vista previa"
              onClick={() => setImagePreview(null)}
            >
              <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
            <img className="mx-auto max-h-[78vh] w-auto max-w-full rounded-xl object-contain" src={imagePreview.url} alt={imagePreview.altText} />
            <p className="mt-3 text-center font-display text-lg font-medium text-text-primary">{imagePreview.productName}</p>
          </div>
        </div>
      )}
    </>
  );
}
