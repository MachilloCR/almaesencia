import { useEffect, useState } from "react";
import { sileo } from "sileo";
import type { AdminInventoryItem, AdminProduct } from "../../services/admin-catalog";

type Props = {
  item: AdminInventoryItem;
  product: AdminProduct;
  onUpdated: (item: AdminInventoryItem, availabilityStatus?: AdminProduct["availability_status"]) => void;
};

async function updateInventory(body: unknown) {
  const response = await fetch("/api/admin/inventory", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json() as { item?: AdminInventoryItem; availabilityStatus?: "out_of_stock"; error?: string };
  if (!response.ok || !result.item) throw new Error(result.error ?? "No fue posible actualizar las existencias.");
  return { item: result.item, availabilityStatus: result.availabilityStatus };
}

export default function ProductInventoryControl({ item, product, onUpdated }: Props) {
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [saving, setSaving] = useState(false);

  useEffect(() => setQuantity(String(item.quantity)), [item.quantity]);

  async function saveQuantity() {
    const nextQuantity = Number(quantity);
    if (!Number.isInteger(nextQuantity) || nextQuantity < 0 || nextQuantity > 1_000_000 || quantity.trim() === "") {
      sileo.error({ title: "Cantidad no válida", description: "Usa un número entero entre 0 y 1 000 000." });
      return;
    }

    setSaving(true);
    try {
      const result = await sileo.promise(
        updateInventory({ productId: product.id, quantity: nextQuantity }),
        {
          loading: { title: "Actualizando existencias…" },
          success: { title: "Inventario actualizado" },
          error: (error) => ({ title: "No se pudo guardar", description: String(error) }),
        },
      );
      onUpdated(result.item, result.availabilityStatus);
    } catch {
      // Sileo informa el error.
    } finally {
      setSaving(false);
    }
  }

  async function markOutOfStock() {
    setSaving(true);
    try {
      const result = await sileo.promise(
        updateInventory({ action: "mark_out_of_stock", productId: product.id }),
        {
          loading: { title: "Marcando como agotado…" },
          success: { title: "Producto agotado", description: "La cantidad quedó en cero." },
          error: (error) => ({ title: "No se pudo actualizar", description: String(error) }),
        },
      );
      onUpdated(result.item, result.availabilityStatus);
    } catch {
      // Sileo informa el error.
    } finally {
      setSaving(false);
    }
  }

  return <div className="mt-4 rounded-xl border border-border-subtle bg-surface-soft p-3">
    <label className="block text-xs font-semibold text-text-primary" htmlFor={`stock-${product.id}`}>
      Unidades físicas
    </label>
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input
        className="min-h-11 w-20 rounded-lg border border-border-subtle bg-white px-2 text-center text-sm outline-none focus:border-brand-primary focus:ring-3 focus:ring-brand-primary/12"
        id={`stock-${product.id}`}
        type="number"
        min="0"
        max="1000000"
        step="1"
        inputMode="numeric"
        value={quantity}
        onChange={(event) => setQuantity(event.target.value)}
      />
      <button className="min-h-11 rounded-full bg-brand-primary px-3 text-xs font-semibold text-white hover:bg-brand-primary-hover disabled:opacity-60" type="button" onClick={() => void saveQuantity()} disabled={saving || quantity === String(item.quantity)}>
        {saving ? "Guardando…" : "Guardar cantidad"}
      </button>
    </div>
    <p className="mt-2 text-xs text-text-secondary">Actualizado: {new Intl.DateTimeFormat("es-CR", { dateStyle: "medium" }).format(new Date(item.updated_at))}</p>
    <button className="mt-2 min-h-11 rounded-full px-3 text-xs font-semibold text-brand-primary hover:bg-brand-primary-soft disabled:opacity-60" type="button" onClick={() => void markOutOfStock()} disabled={saving || (item.quantity === 0 && product.availability_status === "out_of_stock")}>
      Marcar agotado
    </button>
  </div>;
}
