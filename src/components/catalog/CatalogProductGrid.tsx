import { Toaster, sileo } from "sileo";
import type { AdminCategory, AdminProduct } from "../../services/admin-catalog";
import { useCartStore } from "../../stores/cart-store";

type Props = { categories: AdminCategory[]; products: AdminProduct[] };

const availability = {
  in_stock: { label: "Disponible", classes: "border-[#C8E6C9] bg-[#E8F5E9] text-[#2D6A4F]" },
  on_order: { label: "Por encargo", classes: "border-[#FDE68A] bg-[#FEF3C7] text-[#8A5A12]" },
  out_of_stock: { label: "Agotado", classes: "border-[#E2D9DD] bg-[#F0ECEE] text-[#6B5E65]" },
  inactive: { label: "Inactivo", classes: "border-[#E2D9DD] bg-[#F0ECEE] text-[#6B5E65]" },
} as const;

function formatPrice(value: number, currency: string) {
  return new Intl.NumberFormat("es-CR", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

export default function CatalogProductGrid({ categories, products }: Props) {
  const add = useCartStore((state) => state.add);
  const categoriesById = new Map(categories.map((category) => [category.id, category]));

  return (
    <>
      <Toaster position="top-right" options={{ fill: "#FFFFFF", roundness: 16, duration: 3_500 }} />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(17rem,17rem))] justify-start gap-5">
        {products.map((product) => {
          const category = categoriesById.get(product.category_id);
          const status = availability[product.availability_status];
          const canAdd = product.availability_status !== "out_of_stock" && product.availability_status !== "inactive";

          return (
            <article className="overflow-hidden rounded-[20px] border border-border-subtle bg-surface-card shadow-[0_4px_20px_-2px_rgba(134,54,93,0.05)] transition hover:border-accent-rose hover:shadow-[0_12px_28px_-4px_rgba(134,54,93,0.10)]" key={product.id}>
              <div className="relative aspect-[4/5] bg-gradient-to-br from-surface-soft via-brand-primary-soft to-[#F6E4D8] p-4">
                <span className={`absolute left-4 top-4 rounded-full border px-3 py-1 text-xs font-semibold ${status.classes}`}>{status.label}</span>
                <div className="absolute inset-4 flex items-end rounded-xl border border-white/70 bg-white/45 p-4"><p className="font-display text-xl italic text-brand-primary/75">Alma Esencia CR</p></div>
              </div>
              <div className="p-5">
                <p className="text-xs font-semibold tracking-[0.12em] text-text-secondary uppercase">{category?.name}</p>
                <h3 className="mt-2 font-display text-xl font-medium text-text-primary">{product.name}</h3>
                {product.description && <p className="mt-2 text-sm leading-6 text-text-secondary">{product.description}</p>}
                <p className="mt-4 text-lg font-semibold text-text-primary">{formatPrice(Number(product.price), product.currency)}</p>
                <p className="mt-1 text-xs text-text-secondary">Precio estimado</p>
                <button className="mt-5 min-h-11 w-full rounded-full bg-brand-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:bg-brand-primary-soft disabled:text-text-secondary" type="button" disabled={!canAdd} onClick={() => { add({ id: product.id, name: product.name, slug: product.slug, price: Number(product.price), currency: product.currency, availability_status: product.availability_status }); sileo.success({ title: "Agregado a tu solicitud", description: product.name }); }}>
                  {canAdd ? "Agregar a solicitud" : "Agotado"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
