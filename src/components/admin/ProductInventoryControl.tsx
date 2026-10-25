import { useEffect, useRef, useState } from "react";
import { sileo } from "sileo";
import type { AdminInventoryItem, AdminProduct } from "../../services/admin-catalog";

type Props = {
  item: AdminInventoryItem;
  product: AdminProduct;
  onEdit: () => void;
  onUpdated: (item: AdminInventoryItem, availabilityStatus: AdminProduct["availability_status"], isActive: boolean) => void;
};

async function updateInventory(body: unknown) {
  const response = await fetch("/api/admin/inventory", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json() as { item?: AdminInventoryItem; availabilityStatus?: AdminProduct["availability_status"]; isActive?: boolean; error?: string };
  if (!response.ok || !result.item || !result.availabilityStatus || result.isActive === undefined) {
    throw new Error(result.error ?? "No fue posible actualizar las existencias.");
  }
  return { item: result.item, availabilityStatus: result.availabilityStatus, isActive: result.isActive };
}

const maxQuantity = 1_000_000;

export default function ProductInventoryControl({ item, product, onEdit, onUpdated }: Props) {
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [confirmingOutOfStock, setConfirmingOutOfStock] = useState(false);
  const outOfStockDialog = useRef<HTMLDialogElement>(null);
  const parsedQuantity = quantity.trim() === "" ? Number.NaN : Number(quantity);
  const quantityIsValid = Number.isInteger(parsedQuantity) && parsedQuantity >= 0 && parsedQuantity <= maxQuantity;
  const hasChanges = quantityIsValid && parsedQuantity !== item.quantity;
  const statusMatchesQuantity = item.quantity > 0
    ? product.availability_status === "in_stock" && product.is_active
    : (product.availability_status === "on_order" && product.is_active)
      || (product.availability_status === "out_of_stock" && !product.is_active);

  useEffect(() => {
    setQuantity(String(item.quantity));
    setSaveError(null);
    setSaveSuccess(false);
  }, [item.quantity]);

  useEffect(() => {
    const dialog = outOfStockDialog.current;
    if (!dialog) return;
    if (confirmingOutOfStock && !dialog.open) dialog.showModal();
    else if (!confirmingOutOfStock && dialog.open) dialog.close();
  }, [confirmingOutOfStock]);

  async function save(nextQuantity: number, availabilityStatus: "in_stock" | "on_order" | "out_of_stock", title: string) {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const result = await updateInventory({ productId: product.id, expectedQuantity: item.quantity, quantity: nextQuantity, availabilityStatus });
      onUpdated(result.item, result.availabilityStatus, result.isActive);
      setQuantity(String(result.item.quantity));
      setSaveSuccess(title === "Inventario actualizado");
      void sileo.success({ title });
    } catch (error) {
      const message = error instanceof Error ? error.message : "No fue posible actualizar las existencias. Inténtalo de nuevo.";
      setSaveError(message);
      void sileo.error({ title: "No se pudo guardar", description: message });
    } finally {
      setSaving(false);
    }
  }

  function saveQuantity() {
    if (!quantityIsValid || !hasChanges) return;
    void save(parsedQuantity, parsedQuantity > 0 ? "in_stock" : "on_order", "Inventario actualizado");
  }

  function adjustQuantity(amount: number) {
    const current = quantityIsValid ? parsedQuantity : item.quantity;
    setQuantity(String(Math.min(maxQuantity, Math.max(0, current + amount))));
    setSaveError(null);
    setSaveSuccess(false);
  }

  const updatedDate = new Date(item.updated_at);

  const editButton = <button className="inline-flex min-h-11 min-w-36 flex-1 items-center justify-center gap-2 rounded-full bg-brand-primary px-3 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2" type="button" onClick={onEdit}>
    <svg aria-hidden="true" className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m16 4 4 4M4 20l4-.8L19.2 8a2.1 2.1 0 0 0-3-3L5 16.2 4 20Z" /><path d="M13.5 6.5 17.5 10.5" /></svg>
    Editar
  </button>;
  const actionButtonClass = "inline-flex min-h-11 min-w-36 flex-1 items-center justify-center gap-2 rounded-full px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60";

  return <div className="flex flex-1 flex-col">
    <section aria-labelledby={`inventory-title-${product.id}`} className="mt-3 rounded-2xl border border-[#F4D3E0] bg-[#FFF5F8] p-2.5">
    <h4 className="flex items-center gap-2 text-sm font-semibold text-text-primary" id={`inventory-title-${product.id}`}>
      <svg aria-hidden="true" className="size-5 shrink-0 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="M3 8v9l9 5 9-5V8m-9 5v9" /></svg>
      Inventario físico
    </h4>
    <div className="mt-2 grid min-w-0 grid-cols-[minmax(0,1.4fr)_minmax(4rem,1fr)] items-stretch gap-2">
      <div className="flex min-w-0 overflow-hidden rounded-xl border border-[#E8CCD8] bg-white shadow-sm">
        <button aria-label={`Disminuir unidades de ${product.name}`} className="min-h-11 w-11 shrink-0 border-r border-[#E8CCD8] text-xl font-medium text-brand-primary hover:bg-brand-primary-soft focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-primary disabled:cursor-not-allowed disabled:text-text-secondary/50" type="button" onClick={() => adjustQuantity(-1)} disabled={saving || (quantityIsValid ? parsedQuantity : item.quantity) <= 0}>−</button>
        <input
          aria-label={`Unidades disponibles de ${product.name}`}
          aria-describedby={`${!quantityIsValid ? `stock-validation-${product.id}` : ""}${!quantityIsValid && saveError ? " " : ""}${saveError ? `stock-error-${product.id}` : ""}` || undefined}
          aria-invalid={!quantityIsValid}
          className="min-h-11 w-full min-w-0 flex-1 border-0 bg-white px-1 text-center text-base font-semibold text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-primary"
          id={`stock-${product.id}`}
          inputMode="numeric"
          max={maxQuantity}
          min="0"
          onChange={(event) => {
            setQuantity(event.target.value);
            setSaveError(null);
            setSaveSuccess(false);
          }}
          step="1"
          type="number"
          value={quantity}
        />
        <button aria-label={`Aumentar unidades de ${product.name}`} className="min-h-11 w-11 shrink-0 border-l border-[#E8CCD8] text-xl font-medium text-brand-primary hover:bg-brand-primary-soft focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-primary disabled:cursor-not-allowed disabled:text-text-secondary/50" type="button" onClick={() => adjustQuantity(1)} disabled={saving || (quantityIsValid ? parsedQuantity : item.quantity) >= maxQuantity}>+</button>
      </div>
      <button className="min-h-11 min-w-0 rounded-full bg-brand-primary px-2 text-[11px] font-semibold leading-tight text-white transition-colors hover:bg-brand-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-brand-primary-soft disabled:text-text-secondary" type="button" onClick={saveQuantity} disabled={saving || !hasChanges}>
        {saving ? "Guardando…" : "Guardar cantidad"}
      </button>
    </div>
    {!quantityIsValid && <p className="mt-1 text-xs leading-4 text-[#9B1C1C]" id={`stock-validation-${product.id}`} role="status">Ingresa un número entero entre 0 y {maxQuantity.toLocaleString("es-CR")}.</p>}
    {saveError && <p className="mt-1 text-xs leading-4 text-[#9B1C1C]" id={`stock-error-${product.id}`} role="alert">{saveError}</p>}
    {saveSuccess && <p className="mt-1 text-xs leading-4 font-medium text-[#2D6A4F]" role="status">Cantidad actualizada correctamente.</p>}
    <p className="mt-1 text-[11px] text-text-secondary">Actualizado: {Number.isNaN(updatedDate.getTime()) ? "Fecha no disponible" : new Intl.DateTimeFormat("es-CR", { dateStyle: "medium" }).format(updatedDate)}</p>
    </section>
    <div className="mt-auto pt-3">
      <div className="flex flex-wrap gap-2">
        {editButton}
        {item.quantity === 0 && (product.availability_status !== "on_order" || !product.is_active) && <button className={`${actionButtonClass} bg-status-warning text-white hover:bg-[#92400E]`} type="button" onClick={() => void save(0, "on_order", "Producto disponible por encargo")} disabled={saving || quantity !== String(item.quantity)}>
          <svg aria-hidden="true" className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
          Por encargo
        </button>}
        {item.quantity === 0 && (product.availability_status !== "out_of_stock" || product.is_active) && <button className={`${actionButtonClass} border border-[#DC2626] bg-transparent text-[#DC2626] hover:bg-[#FEF2F2]`} type="button" onClick={() => setConfirmingOutOfStock(true)} disabled={saving || quantity !== String(item.quantity)}>
          <svg aria-hidden="true" className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6m0-6-6 6" /></svg>
          Agotado
        </button>}
        {item.quantity > 0 && !statusMatchesQuantity && <button className={`${actionButtonClass} border border-brand-primary bg-transparent text-brand-primary hover:bg-brand-primary-soft`} type="button" onClick={() => void save(item.quantity, "in_stock", "Producto marcado como disponible")} disabled={saving || quantity !== String(item.quantity)}>
          <svg aria-hidden="true" className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>
          Marcar disponible
        </button>}
      </div>
    </div>
    <dialog
      aria-describedby={`out-of-stock-description-${product.id}`}
      aria-labelledby={`out-of-stock-title-${product.id}`}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-border-subtle bg-surface-card p-5 text-text-primary shadow-[0_20px_40px_-8px_rgba(44,26,35,0.16)] backdrop:bg-[rgba(44,26,35,0.45)] backdrop:backdrop-blur-sm"
      onCancel={() => setConfirmingOutOfStock(false)}
      ref={outOfStockDialog}
    >
      <h2 className="font-display text-xl font-semibold" id={`out-of-stock-title-${product.id}`}>Marcar producto como agotado</h2>
      <p className="mt-2 text-sm leading-6 text-text-secondary" id={`out-of-stock-description-${product.id}`}>La disponibilidad comercial de “{product.name}” cambiará a Agotado y el producto dejará de ofrecerse por encargo.</p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button className="min-h-11 min-w-28 rounded-full border border-border-subtle px-4 text-sm font-semibold text-text-primary hover:bg-brand-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary" type="button" onClick={() => setConfirmingOutOfStock(false)}>Cancelar</button>
        <button className="min-h-11 min-w-28 rounded-full border border-[#DC2626] px-4 text-sm font-semibold text-[#DC2626] hover:bg-[#FEF2F2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] disabled:cursor-wait disabled:opacity-60" type="button" onClick={() => {
          setConfirmingOutOfStock(false);
          void save(0, "out_of_stock", "Producto marcado como agotado");
        }} disabled={saving}>{saving ? "Guardando…" : "Agotado"}</button>
      </div>
    </dialog>
  </div>;
}
