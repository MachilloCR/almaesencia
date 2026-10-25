import { useEffect, useMemo, useState } from "react";
import { Toaster, sileo } from "sileo";
import type { PaymentMethod, PaymentStatus, ProductAvailabilityStatus } from "../../types/database";
import StatusBadge from "../ui/StatusBadge";

type Item = { id: string; order_id: string; product_name_snapshot: string; quantity: number; stock_deducted_quantity: number | null; unit_price_snapshot: number; availability_snapshot: ProductAvailabilityStatus };
type Payment = {
  id: string;
  amount: number;
  payment_method: PaymentMethod;
  note: string | null;
  received_at: string;
};
type StatusHistory = {
  id: string;
  order_id: string;
  status_type: "order" | "procurement" | "fulfillment" | "payment" | string;
  previous_value: string | null;
  next_value: string;
  note: string | null;
  created_at: string;
  changed_by: string | null;
};
type Order = {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  estimated_total: number;
  confirmed_total: number | null;
  confirmed_at: string | null;
  currency: string;
  order_status: string;
  procurement_status: string;
  fulfillment_status: string;
  payment_status: PaymentStatus;
  admin_notes: string | null;
  created_at: string;
  items: Item[];
  payments: Payment[];
  history: StatusHistory[];
};
type Props = { initialOrders: Order[] };
type StatusKey = "order_status" | "procurement_status" | "fulfillment_status";
type StatusDraft = Pick<Order, StatusKey>;
type Section = "summary" | "payments" | "tracking" | "notes";
type PaymentResponse = {
  payment: {
    payment_id: string;
    amount: number;
    payment_method: PaymentMethod;
    note: string | null;
    received_at: string;
    payment_status: PaymentStatus;
  };
};

const fields: { key: StatusKey; label: string; values: string[] }[] = [
  { key: "order_status", label: "Pedido", values: ["pending_review", "confirmed", "completed", "cancelled"] },
  { key: "procurement_status", label: "Abastecimiento", values: ["not_required", "pending_supplier", "ordered", "received"] },
  { key: "fulfillment_status", label: "Entrega", values: ["pending", "ready", "delivered"] },
];
const labels: Record<string, string> = {
  pending_review: "Pendiente de revisión", confirmed: "Confirmado", cancelled: "Cancelado", completed: "Completado",
  not_required: "No requerido", pending_supplier: "Por solicitar", ordered: "Solicitado al proveedor", received: "Recibido",
  pending: "Pendiente", ready: "Listo", delivered: "Entregado", partial: "Abono parcial", paid: "Pagado",
  cash: "Efectivo", sinpe_movil: "SINPE Móvil", bank_transfer: "Transferencia bancaria", other: "Otro",
};
const methods: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Efectivo" },
  { value: "sinpe_movil", label: "SINPE Móvil" },
  { value: "bank_transfer", label: "Transferencia bancaria" },
  { value: "other", label: "Otro" },
];
const availabilitySnapshotLabels: Record<ProductAvailabilityStatus, string> = {
  in_stock: "En stock al solicitar",
  on_order: "Por encargo al solicitar",
  out_of_stock: "Agotado al solicitar",
  inactive: "Inactivo al solicitar",
};
const money = (value: number) => new Intl.NumberFormat("es-CR", { style: "currency", currency: "CRC", maximumFractionDigits: 2 }).format(value);
const dateTime = (value: string) => new Intl.DateTimeFormat("es-CR", {
  dateStyle: "medium", timeStyle: "short", timeZone: "America/Costa_Rica",
}).format(new Date(value)).replace(/[\u00a0\u202f]/g, " ");
const fieldClass = "mt-1 min-h-11 w-full rounded-lg border border-border-subtle bg-white px-3 text-sm text-text-primary outline-none focus:border-brand-primary focus:ring-3 focus:ring-brand-primary/12";
const buttonClass = "inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary disabled:cursor-wait disabled:opacity-60";

async function readResponse<T>(response: Response): Promise<T> {
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "No fue posible guardar los cambios.");
  return data;
}

function totalPaid(order: Order) {
  return order.payments.reduce((total, payment) => total + Math.round(Number(payment.amount) * 100), 0) / 100;
}

function statusWarnings(order: Order) {
  const warnings: string[] = [];
  const deliveryStarted = order.fulfillment_status === "ready" || order.fulfillment_status === "delivered";
  if (deliveryStarted && order.order_status === "pending_review") {
    warnings.push("La entrega avanzó, pero el pedido sigue pendiente de revisión.");
  }
  if (order.order_status === "pending_review" && order.confirmed_at !== null) {
    warnings.push("Este pedido ya fue confirmado antes. Revisa el inventario manualmente antes de cambiar su estado.");
  }
  if (deliveryStarted && ["pending_supplier", "ordered"].includes(order.procurement_status)) {
    warnings.push("La entrega está marcada como lista o entregada, pero aún hay productos por gestionar con el proveedor.");
  }
  if (order.fulfillment_status === "delivered" && order.payment_status !== "paid") {
    warnings.push("El pedido figura como entregado y todavía tiene saldo pendiente.");
  }
  return warnings;
}

const historyTypeLabels: Record<string, string> = {
  order: "Pedido", procurement: "Abastecimiento", fulfillment: "Entrega", payment: "Pago",
};

function whatsappUrl(order: Order) {
  const phone = order.customer_phone.replace(/\D/g, "");
  return `https://wa.me/${phone}?text=${encodeURIComponent(`Hola, te contactamos por tu solicitud ${order.order_number} de Alma Esencia CR.`)}`;
}

export default function OrderManager({ initialOrders }: Props) {
  const [orders, setOrders] = useState(initialOrders);
  const [saving, setSaving] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusDrafts, setStatusDrafts] = useState<Record<string, StatusDraft>>({});
  const [section, setSection] = useState<Section>("summary");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [methodDrafts, setMethodDrafts] = useState<Record<string, PaymentMethod>>({});
  const [totalDrafts, setTotalDrafts] = useState<Record<string, string>>({});
  const [adminNoteDrafts, setAdminNoteDrafts] = useState<Record<string, string>>({});

  const selected = orders.find(order => order.id === selectedId) ?? null;
  useEffect(() => {
    if (!selectedId) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && saving !== selectedId) setSelectedId(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, saving]);
  const counts = useMemo(() => ({
    all: orders.length,
    review: orders.filter(order => order.order_status === "pending_review").length,
    process: orders.filter(order => !["pending_review", "cancelled", "completed"].includes(order.order_status)).length,
    delivery: orders.filter(order => order.order_status !== "cancelled" && order.order_status !== "completed" && order.fulfillment_status === "ready").length,
  }), [orders]);
  const visibleOrders = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es-CR");
    return orders.filter(order => {
      const matchesSearch = !query || order.customer_name.toLocaleLowerCase("es-CR").includes(query) || order.order_number.toLocaleLowerCase("es-CR").includes(query) || order.customer_phone.includes(query);
      const matchesFilter = filter === "all"
        || (filter === "review" && order.order_status === "pending_review")
        || (filter === "process" && !["pending_review", "cancelled", "completed"].includes(order.order_status))
        || (filter === "delivery" && order.order_status !== "cancelled" && order.order_status !== "completed" && order.fulfillment_status === "ready");
      return matchesSearch && matchesFilter;
    });
  }, [orders, search, filter]);

  function changeStatus(orderId: string, key: StatusKey, value: string) {
    const current = orders.find(order => order.id === orderId);
    if (!current) return;
    setStatusDrafts(drafts => ({
      ...drafts,
      [orderId]: {
        order_status: drafts[orderId]?.order_status ?? current.order_status,
        procurement_status: drafts[orderId]?.procurement_status ?? current.procurement_status,
        fulfillment_status: drafts[orderId]?.fulfillment_status ?? current.fulfillment_status,
        [key]: value,
      },
    }));
  }

  async function refreshOrderHistory(orderId: string) {
    try {
      const result = await fetch(`/api/admin/orders?orderId=${encodeURIComponent(orderId)}`)
        .then(response => readResponse<{ history: StatusHistory[] }>(response));
      setOrders(current => current.map(order => order.id === orderId ? { ...order, history: result.history } : order));
    } catch {
      // El cambio principal ya se guardó; el historial se volverá a cargar al abrir Pedidos.
    }
  }

  async function saveStatuses(order: Order) {
    const draft = statusDrafts[order.id];
    if (!draft) return;
    setSaving(order.id);
    try {
      const result = await sileo.promise(
        fetch("/api/admin/orders", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: order.id, orderStatus: draft.order_status, procurementStatus: draft.procurement_status, fulfillmentStatus: draft.fulfillment_status }),
        }).then(response => readResponse<{ order: Partial<Order>; stockMovements: Pick<Item, "id" | "stock_deducted_quantity">[] | null }>(response)),
        { loading: { title: "Actualizando pedido…" }, success: { title: draft.order_status === "confirmed" && order.order_status === "pending_review" ? "Pedido confirmado" : "Pedido actualizado" }, error: error => ({ title: "No se pudo actualizar", description: String(error) }) },
      );
      const deductedByItem = new Map(result.stockMovements?.map(item => [item.id, item.stock_deducted_quantity]) ?? []);
      setOrders(current => current.map(item => item.id === order.id ? {
        ...item,
        ...result.order,
        items: item.items.map(line => deductedByItem.has(line.id) ? { ...line, stock_deducted_quantity: deductedByItem.get(line.id) ?? null } : line),
      } : item));
      setStatusDrafts(current => { const next = { ...current }; delete next[order.id]; return next; });
      await refreshOrderHistory(order.id);
    } catch { /* Sileo muestra el error. */ } finally { setSaving(null); }
  }

  async function saveConfirmedTotal(order: Order) {
    const draft = totalDrafts[order.id] ?? (order.confirmed_total === null ? "" : String(order.confirmed_total));
    const confirmedTotal = Number(draft);
    if (!Number.isFinite(confirmedTotal) || confirmedTotal <= 0) {
      sileo.error({ title: "Revisa el monto", description: "El total confirmado debe ser mayor que cero." });
      return;
    }
    if (order.confirmed_total !== null && confirmedTotal !== order.confirmed_total && !window.confirm(`¿Confirmas cambiar el total de ${money(order.confirmed_total)} a ${money(confirmedTotal)}?`)) return;
    setSaving(order.id);
    try {
      const result = await sileo.promise(
        fetch("/api/admin/orders/confirmed-total", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: order.id, confirmedTotal }) })
          .then(response => readResponse<{ order: { confirmed_total: number; payment_status: PaymentStatus } }>(response)),
        { loading: { title: "Guardando precio acordado…" }, success: { title: "Precio acordado guardado" }, error: error => ({ title: "No se pudo guardar el precio", description: String(error) }) },
      );
      setOrders(current => current.map(item => item.id === order.id ? { ...item, ...result.order } : item));
      setTotalDrafts(current => ({ ...current, [order.id]: String(result.order.confirmed_total) }));
      await refreshOrderHistory(order.id);
    } catch { /* Sileo muestra el error. */ } finally { setSaving(null); }
  }

  async function recordPayment(order: Order) {
    if (saving === order.id || order.confirmed_total === null) return;
    const amount = Number(amountDrafts[order.id]);
    const paymentMethod = methodDrafts[order.id] ?? "cash";
    if (!Number.isFinite(amount) || amount <= 0) {
      sileo.error({ title: "Revisa el monto", description: "El abono debe ser mayor que cero." });
      return;
    }
    setSaving(order.id);
    try {
      const result = await sileo.promise(
        fetch("/api/admin/orders/payment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: order.id, amount, paymentMethod, note: noteDrafts[order.id] ?? "" }) }).then(response => readResponse<PaymentResponse>(response)),
        { loading: { title: "Registrando pago…" }, success: { title: "Pago registrado" }, error: error => ({ title: "No se pudo registrar el pago", description: String(error) }) },
      );
      const payment = paymentToRow(result.payment);
      setOrders(current => current.map(item => item.id === order.id ? { ...item, payment_status: result.payment.payment_status, payments: [payment, ...item.payments] } : item));
      setAmountDrafts(current => ({ ...current, [order.id]: "" }));
      setNoteDrafts(current => ({ ...current, [order.id]: "" }));
      await refreshOrderHistory(order.id);
    } catch { /* Sileo muestra el error. */ } finally { setSaving(null); }
  }

  async function saveAdminNotes(order: Order) {
    setSaving(order.id);
    try {
      const result = await sileo.promise(
        fetch("/api/admin/orders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: order.id, adminNotes: adminNoteDrafts[order.id] ?? order.admin_notes ?? "" }) })
          .then(response => readResponse<{ order: { id: string; admin_notes: string | null } }>(response)),
        { loading: { title: "Guardando nota…" }, success: { title: "Nota guardada" }, error: error => ({ title: "No se pudo guardar la nota", description: String(error) }) },
      );
      setOrders(current => current.map(item => item.id === order.id ? { ...item, admin_notes: result.order.admin_notes } : item));
    } catch { /* Sileo muestra el error. */ } finally { setSaving(null); }
  }

  function openOrder(order: Order) {
    setSelectedId(order.id);
    setSection("summary");
    setStatusDrafts(current => ({ ...current, [order.id]: { order_status: order.order_status, procurement_status: order.procurement_status, fulfillment_status: order.fulfillment_status } }));
    setTotalDrafts(current => ({ ...current, [order.id]: order.confirmed_total === null ? "" : String(order.confirmed_total) }));
    setAdminNoteDrafts(current => ({ ...current, [order.id]: order.admin_notes ?? "" }));
  }

  return (
    <section className="mt-7">
      <Toaster position="top-right" options={{ fill: "#fff", roundness: 16 }} />
      <div className="sticky top-0 z-10 -mx-4 space-y-3 border-b border-border-subtle bg-surface/95 px-4 py-4 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0">
        <label className="block">
          <span className="sr-only">Buscar por cliente, teléfono o número de pedido</span>
          <input className={`${fieldClass} !mt-0 rounded-full`} type="search" placeholder="Buscar por cliente, teléfono o número…" value={search} onChange={event => setSearch(event.target.value)} />
        </label>
        <div className="scrollbar-none flex gap-2 overflow-x-auto pb-1" aria-label="Filtrar pedidos">
          {([
            ["all", "Todos", counts.all], ["review", "Por revisar", counts.review], ["process", "En proceso", counts.process], ["delivery", "Por entregar", counts.delivery],
          ] as const).map(([value, label, count]) => (
            <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value} className={`${buttonClass} shrink-0 border px-4 ${filter === value ? "border-brand-primary bg-brand-primary text-white" : "border-border-subtle bg-white text-text-secondary hover:bg-brand-primary-soft"}`}>
              {label}<span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${filter === value ? "bg-white/20" : "bg-brand-primary-soft text-brand-primary"}`}>{count}</span>
            </button>
          ))}
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="mt-6 rounded-[20px] border border-dashed border-border-subtle bg-surface-card p-10 text-center text-sm text-text-secondary">Aún no hay solicitudes.</div>
      ) : visibleOrders.length === 0 ? (
        <div className="mt-6 rounded-[20px] border border-dashed border-border-subtle bg-surface-card p-10 text-center text-sm text-text-secondary">No hay pedidos que coincidan con la búsqueda o el filtro.</div>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {visibleOrders.map(order => {
            const paid = totalPaid(order);
            const balance = order.confirmed_total === null ? null : Math.max(Math.round((order.confirmed_total - paid) * 100) / 100, 0);
            const progress = order.confirmed_total ? Math.min((paid / order.confirmed_total) * 100, 100) : 0;
            const itemCount = order.items.reduce((total, item) => total + item.quantity, 0);
            return (
              <li className="min-w-0 rounded-[20px] border border-border-subtle bg-white p-3 text-text-primary shadow-[0_4px_20px_-2px_rgba(134,54,93,0.05)] sm:p-4" key={order.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs leading-5"><span className="font-semibold text-brand-primary">#{order.order_number}</span><span className="text-text-secondary"> · {dateTime(order.created_at)}</span></p>
                    <h2 className="mt-1 truncate text-lg font-semibold leading-6">{order.customer_name}</h2>
                  </div>
                  <StatusBadge context="order" status={order.order_status} />
                </div>

                <div className="mt-4 space-y-2.5 text-sm">
                  {order.items.slice(0, 2).map(item => <div className="flex items-start justify-between gap-3" key={item.id}><span className="min-w-0 break-words text-text-secondary">{item.quantity} × {item.product_name_snapshot}</span><span className="shrink-0 font-semibold">{money(Number(item.unit_price_snapshot) * item.quantity)}</span></div>)}
                  {order.items.length > 2 && <p className="text-xs text-text-secondary">y {order.items.length - 2} productos más</p>}
                </div>

                <div className="mt-4 rounded-xl bg-surface-soft p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="text-sm text-text-secondary">{order.confirmed_total === null ? "Precio estimado" : "Total confirmado"}</span>
                    <strong className="text-lg font-semibold">{money(order.confirmed_total ?? Number(order.estimated_total))}</strong>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <StatusBadge context="payment" status={order.payment_status} size="compact" />
                    <span className="text-xs text-text-secondary">{order.confirmed_total === null ? "Precio por confirmar" : `${Math.round(progress)}% pagado`}</span>
                  </div>
                  {order.confirmed_total !== null && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white" role="progressbar" aria-label="Progreso de pago" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><div className="h-full rounded-full bg-[#31B779] transition-[width]" style={{ width: `${progress}%` }} /></div>}
                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                    <div><span className="block text-text-secondary">Abonado</span><strong className="mt-1 block text-sm">{money(paid)}</strong></div>
                    <div className="text-right"><span className="block text-text-secondary">Saldo pendiente</span><strong className="mt-1 block text-sm">{balance === null ? "Por confirmar" : money(balance)}</strong></div>
                  </div>
                </div>

                <div className="mt-4 divide-y divide-border-subtle border-y border-border-subtle text-sm">
                  {fields.filter(field => field.key !== "order_status").map(field => <div className="flex min-h-14 min-w-0 items-center justify-between gap-3 py-3" key={field.key}>
                    <span className="flex min-w-0 items-center gap-2 text-text-secondary">
                      <svg aria-hidden="true" className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        {field.key === "procurement_status" ? <><path d="m12 2 9 5-9 5-9-5 9-5Z" /><path d="M3 7v10l9 5 9-5V7m-9 5v10" /></> : <><path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></>}
                      </svg>
                      {field.label}
                    </span>
                    <StatusBadge context={field.key === "procurement_status" ? "procurement" : "fulfillment"} status={order[field.key]} size="compact" />
                  </div>)}
                </div>
                <p className="sr-only">{itemCount} productos en total.</p>
                <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <button className={`${buttonClass} min-w-0 bg-brand-primary text-white hover:bg-brand-primary-hover`} type="button" onClick={() => openOrder(order)}>Gestionar</button>
                  <a className={`${buttonClass} gap-2 border border-[#16A765] px-4 text-[#087D4B] hover:bg-[#EAF8F0]`} href={whatsappUrl(order)} target="_blank" rel="noreferrer" aria-label={`Contactar por WhatsApp a ${order.customer_name}`}>
                    <svg aria-hidden="true" className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.5 11.5a8.5 8.5 0 0 1-12.4 7.5L3 20l1.1-4.8a8.5 8.5 0 1 1 16.4-3.7Z" /><path d="M8.5 8.5c.5 2.3 2.7 4.5 5 5l1.4-1.2 2 1.1c-.4 1.7-1.5 2.6-3.2 2.4-3.8-.5-6.9-3.6-7.4-7.4-.2-1.7.7-2.8 2.4-3.2l1.1 2-1.3 1.3Z" /></svg>
                    WhatsApp
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {selected && (() => {
        const paid = totalPaid(selected);
        const balance = selected.confirmed_total === null ? null : Math.max(Math.round((selected.confirmed_total - paid) * 100) / 100, 0);
        const progress = selected.confirmed_total ? Math.min((paid / selected.confirmed_total) * 100, 100) : 0;
        const totalDraft = totalDrafts[selected.id] ?? (selected.confirmed_total === null ? "" : String(selected.confirmed_total));
        return (
          <div className="fixed inset-0 z-30 flex items-end justify-center bg-[#2C1A23]/45 backdrop-blur-[4px] sm:items-center sm:p-5" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && saving !== selected.id) setSelectedId(null); }}>
            <section role="dialog" aria-modal="true" aria-labelledby="order-dialog-title" className="max-h-[94dvh] w-full overflow-y-auto rounded-t-[24px] bg-surface p-4 shadow-[0_20px_40px_-8px_rgba(44,26,35,0.16)] sm:max-w-2xl sm:rounded-[24px] sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-xs font-semibold text-brand-primary">Pedido #{selected.order_number}</p><h2 id="order-dialog-title" className="mt-1 font-display text-2xl font-semibold">{selected.customer_name}</h2><p className="mt-1 text-xs text-text-secondary">{dateTime(selected.created_at)} · {selected.customer_phone}</p></div>
                <button type="button" className={`${buttonClass} border border-border-subtle bg-white px-3`} onClick={() => setSelectedId(null)} aria-label="Cerrar detalle">Cerrar</button>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-1 border-b border-border-subtle" role="tablist" aria-label="Secciones del pedido">
                {([ ["summary", "Resumen"], ["payments", "Pagos"], ["tracking", "Seguimiento"], ["notes", "Notas"] ] as [Section, string][]).map(([value, label]) => <button type="button" role="tab" aria-selected={section === value} key={value} onClick={() => setSection(value)} className={`min-h-11 border-b-2 px-1 text-xs font-semibold sm:text-sm ${section === value ? "border-brand-primary text-brand-primary" : "border-transparent text-text-secondary"}`}>{label}</button>)}
              </div>

              {section === "summary" && <div className="space-y-5 py-5">
                <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Productos ({selected.items.length})</h3><StatusBadge context="order" status={selected.order_status} /></div>
                <ul className="space-y-2">{selected.items.map(item => <li className="flex justify-between gap-3 rounded-xl bg-white p-3 text-sm" key={item.id}><span className="min-w-0">{item.product_name_snapshot}<small className="block text-text-secondary">{item.quantity} {item.quantity === 1 ? "unidad" : "unidades"} · {availabilitySnapshotLabels[item.availability_snapshot]}</small>{item.stock_deducted_quantity !== null && <small className="block font-semibold text-[#2D6A4F]">{item.stock_deducted_quantity === 0 ? "Sin descuento de inventario" : `Inventario descontado: ${item.stock_deducted_quantity}`}</small>}{item.stock_deducted_quantity === null && selected.order_status !== "pending_review" && <small className="block text-text-secondary">Descuento sin registro por línea; revisa inventario.</small>}</span><strong className="shrink-0">{money(Number(item.unit_price_snapshot) * item.quantity)}</strong></li>)}</ul>
                <div className="rounded-2xl bg-surface-soft p-4">
                  <label className="block text-xs font-semibold text-text-secondary" htmlFor={`confirmed-total-${selected.id}`}>Precio acordado (CRC)
                    <input className={fieldClass} id={`confirmed-total-${selected.id}`} type="number" min="0.01" max="9999999999.99" step="0.01" value={totalDraft} onChange={event => setTotalDrafts(current => ({ ...current, [selected.id]: event.target.value }))} />
                  </label>
                  <p className="mt-2 text-xs leading-5 text-text-secondary">Precio estimado original: {money(Number(selected.estimated_total))}. Después de guardar el precio, confirma el pedido en Seguimiento para registrar la disponibilidad.</p>
                  {selected.confirmed_total !== null && <p className="mt-2 text-sm">Total confirmado: <strong>{money(selected.confirmed_total)}</strong></p>}
                  <button className={`${buttonClass} mt-3 border border-brand-primary text-brand-primary hover:bg-white`} type="button" disabled={saving === selected.id || !totalDraft} onClick={() => void saveConfirmedTotal(selected)}>{saving === selected.id ? "Guardando…" : "Guardar precio acordado"}</button>
                </div>
                <div className="rounded-2xl bg-white p-4"><div className="flex justify-between text-sm"><span>Pagado</span><strong>{money(paid)}</strong></div><div className="mt-2 flex justify-between text-sm"><span>Saldo pendiente</span><strong>{balance === null ? "Confirma el precio" : money(balance)}</strong></div>{selected.confirmed_total !== null && <><div className="mt-3 h-2 overflow-hidden rounded-full bg-brand-primary-soft" role="progressbar" aria-label="Progreso de pago" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><div className="h-full rounded-full bg-[#31B779]" style={{ width: `${progress}%` }} /></div><p className="mt-1 text-right text-xs text-text-secondary">{Math.round(progress)}% pagado</p></>}</div>
                <div className="flex gap-2"><button className={`${buttonClass} flex-1 bg-brand-primary text-white`} type="button" onClick={() => setSection("payments")}>Ver pagos</button><a className={`${buttonClass} flex-1 border border-[#16A765] text-[#087D4B]`} href={whatsappUrl(selected)} target="_blank" rel="noreferrer">WhatsApp</a></div>
              </div>}

              {section === "payments" && <div className="space-y-5 py-5">
                <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Estado de pago</h3><StatusBadge context="payment" status={selected.payment_status} /></div>
                <div className="grid grid-cols-3 gap-2 rounded-2xl bg-surface-soft p-3 text-xs sm:text-sm"><p>Total confirmado<strong className="mt-1 block">{selected.confirmed_total === null ? "Pendiente" : money(selected.confirmed_total)}</strong></p><p>Pagado<strong className="mt-1 block">{money(paid)}</strong></p><p>Saldo<strong className="mt-1 block">{balance === null ? "—" : money(balance)}</strong></p></div>
                {selected.confirmed_total === null ? <p className="rounded-xl border-l-[3px] border-brand-primary bg-brand-primary-soft p-3 text-sm">Confirma primero el precio final para registrar pagos.</p> : balance === 0 ? <p className="rounded-xl bg-[#E8F5E9] p-3 text-sm font-semibold text-[#2D6A4F]">Pedido pagado por completo.</p> : <div className="rounded-2xl border border-border-subtle bg-white p-4">
                  <h3 className="font-semibold">Registrar abono</h3>
                  <label className="mt-3 block text-xs font-semibold text-text-secondary" htmlFor={`payment-amount-${selected.id}`}>Monto del pago (CRC)<input className={fieldClass} id={`payment-amount-${selected.id}`} type="number" min="0.01" max={balance ?? undefined} step="0.01" value={amountDrafts[selected.id] ?? ""} onChange={event => setAmountDrafts(current => ({ ...current, [selected.id]: event.target.value }))} /></label>
                  <label className="mt-3 block text-xs font-semibold text-text-secondary" htmlFor={`payment-method-${selected.id}`}>Método de pago<select className={fieldClass} id={`payment-method-${selected.id}`} value={methodDrafts[selected.id] ?? "cash"} onChange={event => setMethodDrafts(current => ({ ...current, [selected.id]: event.target.value as PaymentMethod }))}>{methods.map(method => <option value={method.value} key={method.value}>{method.label}</option>)}</select></label>
                  <label className="mt-3 block text-xs font-semibold text-text-secondary" htmlFor={`payment-note-${selected.id}`}>Nota o referencia (opcional)<input className={fieldClass} id={`payment-note-${selected.id}`} maxLength={500} value={noteDrafts[selected.id] ?? ""} onChange={event => setNoteDrafts(current => ({ ...current, [selected.id]: event.target.value }))} /></label>
                  <p className="mt-2 text-xs text-text-secondary">Fecha y hora: al guardar, se registra la hora actual de Costa Rica.</p>
                  <button className={`${buttonClass} mt-4 w-full bg-brand-primary text-white`} type="button" disabled={saving === selected.id || !amountDrafts[selected.id]} onClick={() => void recordPayment(selected)}>{saving === selected.id ? "Guardando…" : "Guardar pago"}</button>
                </div>}
                <div><h3 className="font-semibold">Historial de pagos</h3>{selected.payments.length === 0 ? <p className="mt-2 text-sm text-text-secondary">Aún no hay pagos registrados.</p> : <ol className="mt-3 space-y-2">{selected.payments.map(payment => <li className="rounded-xl border border-border-subtle bg-white p-3 text-sm" key={payment.id}><div className="flex flex-wrap justify-between gap-2"><strong>{money(Number(payment.amount))} · {labels[payment.payment_method]}</strong><time className="text-xs text-text-secondary" dateTime={payment.received_at}>{dateTime(payment.received_at)}</time></div>{payment.note && <p className="mt-1 text-text-secondary">{payment.note}</p>}</li>)}</ol>}</div>
              </div>}

              {section === "tracking" && <div className="space-y-5 py-5">
                <p className="text-sm text-text-secondary">Elige Confirmado en Pedido y guarda los cambios para descontar los artículos en stock. Abastecimiento y entrega se registran por separado.</p>
                {selected.order_status === "pending_review" && selected.confirmed_at === null && <p className="rounded-xl border-l-[3px] border-brand-primary bg-brand-primary-soft p-3 text-sm leading-6">Al confirmar se descontarán {selected.items.filter(item => item.availability_snapshot === "in_stock").reduce((total, item) => total + item.quantity, 0)} unidades que estaban en stock al solicitar. Los artículos por encargo no descontarán inventario. Si un producto llega a cero, pasará a Por encargo.</p>}
                {selected.order_status === "confirmed" && (statusDrafts[selected.id]?.order_status === "cancelled") && <p className="rounded-xl border-l-[3px] border-[#8A5A12] bg-[#FEF3C7] p-3 text-sm leading-6">Cancelar no devuelve existencias automáticamente. Si conservas las unidades físicas, repónlas mediante un ajuste manual en inventario.</p>}
                {fields.map(field => <fieldset key={field.key}><legend className="mb-2 text-sm font-semibold">{field.label}</legend><div className="flex flex-wrap gap-2">{field.values.map(value => {
                  const draft = statusDrafts[selected.id] ?? selected;
                  const terminal = selected.order_status === "cancelled" || selected.order_status === "completed";
                  const invalidOrderTransition = field.key === "order_status" && (
                    (terminal && value !== selected.order_status)
                    || (selected.order_status === "confirmed" && value === "pending_review")
                    || (selected.order_status === "pending_review" && value === "completed")
                    || (selected.order_status === "pending_review" && selected.confirmed_at !== null && value === "confirmed")
                  );
                  const disabled = invalidOrderTransition || (value === "completed" && (draft.fulfillment_status !== "delivered" || selected.payment_status !== "paid"));
                  return <button type="button" key={value} disabled={disabled} aria-pressed={draft[field.key] === value} onClick={() => changeStatus(selected.id, field.key, value)} className={`${buttonClass} border px-3 ${draft[field.key] === value ? "border-brand-primary bg-brand-primary text-white" : "border-border-subtle bg-white text-text-primary hover:bg-brand-primary-soft"} disabled:opacity-40`}>{labels[value]}</button>;
                })}</div></fieldset>)}
                <div className="grid grid-cols-1 gap-2 rounded-2xl bg-surface-soft p-3 text-xs sm:grid-cols-3"><p>Pedido<span className="mt-1 block"><StatusBadge context="order" status={(statusDrafts[selected.id] ?? selected).order_status} size="compact" /></span></p><p>Proveedor<span className="mt-1 block"><StatusBadge context="procurement" status={(statusDrafts[selected.id] ?? selected).procurement_status} size="compact" /></span></p><p>Entrega<span className="mt-1 block"><StatusBadge context="fulfillment" status={(statusDrafts[selected.id] ?? selected).fulfillment_status} size="compact" /></span></p></div>
                {statusWarnings({ ...selected, ...(statusDrafts[selected.id] ?? {}) }).length > 0 && <div className="space-y-2" aria-label="Avisos de seguimiento">{statusWarnings({ ...selected, ...(statusDrafts[selected.id] ?? {}) }).map(warning => <p className="rounded-xl border border-[#FDE68A] bg-[#FEF3C7] px-3 py-2.5 text-sm text-[#754A0B]" role="status" key={warning}>{warning}</p>)}</div>}
                <button className={`${buttonClass} w-full bg-brand-primary text-white`} type="button" disabled={saving === selected.id || !statusDrafts[selected.id] || fields.every(field => statusDrafts[selected.id]?.[field.key] === selected[field.key])} onClick={() => void saveStatuses(selected)}>{saving === selected.id ? "Guardando…" : selected.order_status === "pending_review" && statusDrafts[selected.id]?.order_status === "confirmed" ? selected.items.some(item => item.availability_snapshot === "in_stock") ? "Confirmar pedido y descontar stock" : "Confirmar pedido" : "Guardar seguimiento"}</button>
                <div className="border-t border-border-subtle pt-4">
                  <h3 className="font-semibold">Historial de cambios</h3>
                  {selected.history.length === 0 ? <p className="mt-2 text-sm text-text-secondary">Aún no hay cambios registrados.</p> : <ol className="mt-3 space-y-3">{selected.history.map(change => <li key={change.id} className="relative border-l border-border-subtle pb-1 pl-4 text-sm last:pb-0"><span className="absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full bg-brand-primary" aria-hidden="true" /><div className="flex flex-wrap justify-between gap-2"><strong>{historyTypeLabels[change.status_type] ?? "Cambio"}: {change.previous_value ? `${labels[change.previous_value] ?? change.previous_value} → ` : ""}{labels[change.next_value] ?? change.next_value}</strong><time className="text-xs text-text-secondary" dateTime={change.created_at}>{dateTime(change.created_at)}</time></div>{change.note && <p className="mt-1 text-text-secondary">{change.note}</p>}</li>)}</ol>}
                </div>
              </div>}

              {section === "notes" && <div className="space-y-4 py-5">
                <p className="text-sm text-text-secondary">Notas internas para recordar coordinaciones del pedido.</p>
                <label className="block text-xs font-semibold text-text-secondary" htmlFor={`admin-note-${selected.id}`}>Nota interna<textarea className={`${fieldClass} min-h-32 resize-y py-3`} id={`admin-note-${selected.id}`} maxLength={2000} value={adminNoteDrafts[selected.id] ?? ""} onChange={event => setAdminNoteDrafts(current => ({ ...current, [selected.id]: event.target.value }))} placeholder="Ej. Cliente recoge el viernes…" /></label>
                <button className={`${buttonClass} w-full bg-brand-primary text-white`} type="button" disabled={saving === selected.id} onClick={() => void saveAdminNotes(selected)}>{saving === selected.id ? "Guardando…" : "Guardar nota"}</button>
              </div>}
            </section>
          </div>
        );
      })()}
    </section>
  );
}

function paymentToRow(payment: PaymentResponse["payment"]): Payment {
  return { id: payment.payment_id, amount: payment.amount, payment_method: payment.payment_method, note: payment.note, received_at: payment.received_at };
}
