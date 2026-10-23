import { useEffect, useState } from "react";
import { sileo } from "sileo";
import type { AdminInventoryItem, AdminProduct } from "../../services/admin-catalog";

type Props = {
  item: AdminInventoryItem;
  product: AdminProduct;
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

export default function ProductInventoryControl({ item, product, onUpdated }: Props) {
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [saving, setSaving] = useState(false);
  const statusMatchesQuantity = item.quantity > 0
    ? product.availability_status === "in_stock" && product.is_active
    : (product.availability_status === "on_order" && product.is_active)
      || (product.availability_status === "out_of_stock" && !product.is_active);

  useEffect(() => setQuantity(String(item.quantity)), [item.quantity]);

  async function save(nextQuantity: number, availabilityStatus: "in_stock" | "on_order" | "out_of_stock", title: string) {
    setSaving(true);
    try {
      const result = await sileo.promise(
        updateInventory({ productId: product.id, expectedQuantity: item.quantity, quantity: nextQuantity, availabilityStatus }),
        {
          loading: { title: "Actualizando existencias…" },
          success: { title },
          error: (error) => ({ title: "No se pudo guardar", description: String(error) }),
        },
      );
      onUpdated(result.item, result.availabilityStatus, result.isActive);
    } catch {
      // Sileo informa el error.
    } finally {
      setSaving(false);
    }
  }

  function saveQuantity() {
    const nextQuantity = Number(quantity);
    if (!Number.isInteger(nextQuantity) || nextQuantity < 0 || nextQuantity > 1_000_000 || quantity.trim() === "") {
      sileo.error({ title: "Cantidad no válida", description: "Usa un número entero entre 0 y 1 000 000." });
      return;
    }
    if (nextQuantity === item.quantity) return;
    void save(nextQuantity, nextQuantity > 0 ? "in_stock" : "on_order", "Inventario actualizado");
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
      <button className="min-h-11 rounded-full bg-brand-primary px-3 text-xs font-semibold text-white hover:bg-brand-primary-hover disabled:opacity-60" type="button" onClick={saveQuantity} disabled={saving || quantity.trim() === "" || Number(quantity) === item.quantity}>
        {saving ? "Guardando…" : "Guardar cantidad"}
      </button>
    </div>
    <p className="mt-2 text-xs leading-5 text-text-secondary">Con unidades se mostrará Disponible. Al llegar a cero se ofrecerá Por encargo.</p>
    <p className="mt-2 text-xs text-text-secondary">Actualizado: {new Intl.DateTimeFormat("es-CR", { dateStyle: "medium" }).format(new Date(item.updated_at))}</p>
    {item.quantity === 0 && (product.availability_status !== "on_order" || !product.is_active) && <button className="mt-2 min-h-11 rounded-full px-3 text-xs font-semibold text-brand-primary hover:bg-brand-primary-soft disabled:opacity-60" type="button" onClick={() => void save(0, "on_order", "Producto disponible por encargo")} disabled={saving || quantity !== String(item.quantity)}>
      Ofrecer por encargo
    </button>}
    {item.quantity === 0 && (product.availability_status !== "out_of_stock" || product.is_active) && <button className="mt-2 min-h-11 rounded-full px-3 text-xs font-semibold text-brand-primary hover:bg-brand-primary-soft disabled:opacity-60" type="button" onClick={() => void save(0, "out_of_stock", "Producto marcado como agotado")} disabled={saving || quantity !== String(item.quantity)}>
      Marcar agotado
    </button>}
    {item.quantity > 0 && !statusMatchesQuantity && <button className="mt-2 min-h-11 rounded-full px-3 text-xs font-semibold text-brand-primary hover:bg-brand-primary-soft disabled:opacity-60" type="button" onClick={() => void save(item.quantity, "in_stock", "Producto marcado como disponible")} disabled={saving || quantity !== String(item.quantity)}>
      Marcar disponible
    </button>}
  </div>;
}
