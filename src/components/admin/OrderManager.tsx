import { useEffect, useMemo, useState } from "react";
import { Toaster, sileo } from "sileo";
import type { PaymentMethod, PaymentStatus } from "../../types/database";

type Item = { order_id: string; product_name_snapshot: string; quantity: number; unit_price_snapshot: number };
type Payment = {
  id: string;
  amount: number;
  payment_method: PaymentMethod;
  note: string | null;
  received_at: string;
};
type Order = {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  estimated_total: number;
  confirmed_total: number | null;
  currency: string;
  order_status: string;
  procurement_status: string;
  fulfillment_status: string;
  payment_status: PaymentStatus;
  admin_notes: string | null;
  created_at: string;
  items: Item[];
  payments: Payment[];
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
  { key: "procurement_status", label: "Abastecimiento", values: ["not_required", "ordered", "pending_supplier", "received"] },
  { key: "fulfillment_status", label: "Entrega", values: ["pending", "ready", "delivered"] },
];
const labels: Record<string, string> = {
  pending_review: "Pendiente de revisión", confirmed: "Confirmado", cancelled: "Cancelado", completed: "Completado",
  not_required: "No requerido", pending_supplier: "Pendiente de proveedor", ordered: "Solicitado", received: "Recibido",
  pending: "Pendiente", ready: "Listo", delivered: "Entregado", partial: "Abono parcial", paid: "Pagado",
  cash: "Efectivo", sinpe_movil: "SINPE Móvil", bank_transfer: "Transferencia bancaria", other: "Otro",
};
const methods: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Efectivo" },
  { value: "sinpe_movil", label: "SINPE Móvil" },
  { value: "bank_transfer", label: "Transferencia bancaria" },
  { value: "other", label: "Otro" },
];
const statusStyles: Record<string, string> = {
  pending_review: "bg-[#FEF3C7] text-[#8A5A12]", confirmed: "bg-[#E8F5E9] text-[#2D6A4F]",
  cancelled: "bg-[#F0ECEE] text-[#6B5E65]", completed: "bg-[#E5F2EA] text-[#216542]",
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

function nextAction(order: Order, paid: number) {
  if (order.order_status === "cancelled") return "Solicitud cancelada";
  if (order.order_status === "completed") return "Pedido finalizado";
  if (order.confirmed_total === null) return "Confirmar precio final";
  if (order.order_status === "pending_review") return "Confirmar condiciones con el cliente";
  if (order.procurement_status === "pending_supplier") return "Esperando al proveedor";
  if (order.procurement_status === "ordered") return "Registrar recepción del proveedor";
  if (order.fulfillment_status === "pending") return order.procurement_status === "not_required" || order.procurement_status === "received" ? "Preparar entrega" : "Coordinar abastecimiento";
  if (paid < order.confirmed_total) return "Registrar pago pendiente";
  if (order.fulfillment_status === "ready") return "Coordinar entrega";
  if (order.fulfillment_status === "delivered") return "Marcar pedido completado";
  return "Pedido en proceso";
}

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

  async function saveStatuses(order: Order) {
    const draft = statusDrafts[order.id];
    if (!draft) return;
    setSaving(order.id);
    try {
      const result = await sileo.promise(
        fetch("/api/admin/orders", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: order.id, orderStatus: draft.order_status, procurementStatus: draft.procurement_status, fulfillmentStatus: draft.fulfillment_status }),
        }).then(response => readResponse<{ order: Partial<Order> }>(response)),
        { loading: { title: "Actualizando pedido…" }, success: { title: "Pedido actualizado" }, error: error => ({ title: "No se pudo actualizar", description: String(error) }) },
      );
      setOrders(current => current.map(item => item.id === order.id ? { ...item, ...result.order } : item));
      setStatusDrafts(current => { const next = { ...current }; delete next[order.id]; return next; });
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
        { loading: { title: "Guardando total confirmado…" }, success: { title: "Total confirmado guardado" }, error: error => ({ title: "No se pudo guardar el total", description: String(error) }) },
      );
      setOrders(current => current.map(item => item.id === order.id ? { ...item, ...result.order } : item));
      setTotalDrafts(current => ({ ...current, [order.id]: String(result.order.confirmed_total) }));
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
              <li className="min-w-0 rounded-[20px] border border-border-subtle bg-white p-4 shadow-[0_4px_20px_-2px_rgba(134,54,93,0.05)] sm:p-5" key={order.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-brand-primary">#{order.order_number}<span className="ml-2 font-normal text-text-secondary">{dateTime(order.created_at)}</span></p>
                    <h2 className="mt-1 truncate font-display text-xl font-semibold text-text-primary">{order.customer_name}</h2>
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold ${statusStyles[order.order_status] ?? statusStyles.pending_review}`}>{labels[order.order_status] ?? order.order_status}</span>
                </div>

                <div className="mt-4 space-y-1.5 text-sm">
                  {order.items.slice(0, 2).map(item => <div className="flex justify-between gap-3" key={`${order.id}-${item.product_name_snapshot}`}><span className="min-w-0 truncate text-text-secondary">{item.quantity} × {item.product_name_snapshot}</span><span className="shrink-0 font-semibold">{money(Number(item.unit_price_snapshot) * item.quantity)}</span></div>)}
                  {order.items.length > 2 && <p className="text-xs text-text-secondary">y {order.items.length - 2} productos más</p>}
                </div>

                <div className="mt-4 rounded-xl bg-surface-soft p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-xs text-text-secondary">{order.confirmed_total === null ? "Precio estimado" : "Total confirmado"}</span>
                    <strong className="text-lg">{money(order.confirmed_total ?? Number(order.estimated_total))}</strong>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                    <span className={`rounded-full px-2.5 py-1 font-semibold ${order.payment_status === "paid" ? "bg-[#E8F5E9] text-[#2D6A4F]" : order.payment_status === "partial" ? "bg-[#F0EAFE] text-[#6541A5]" : "bg-white text-text-secondary"}`}>{labels[order.payment_status] ?? "Pendiente de pago"} · {money(paid)}</span>
                    <span className="text-right">Saldo: <strong>{balance === null ? "Por confirmar" : money(balance)}</strong></span>
                  </div>
                  {order.confirmed_total !== null && <div className="mt-2 h-2 overflow-hidden rounded-full bg-white" role="progressbar" aria-label="Progreso de pago" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><div className="h-full rounded-full bg-[#31B779] transition-[width]" style={{ width: `${progress}%` }} /></div>}
                </div>

                <div className="mt-3 grid grid-cols-3 gap-1.5 text-center text-[11px]">
                  {fields.map(field => <div className="min-w-0 rounded-lg bg-[#FAF7F8] px-1.5 py-2" key={field.key}><span className="block text-text-secondary">{field.label}</span><strong className="mt-0.5 block truncate text-text-primary">{labels[order[field.key]] ?? order[field.key]}</strong></div>)}
                </div>
                <p className="mt-3 rounded-lg border-l-[3px] border-brand-primary bg-brand-primary-soft px-3 py-2 text-xs text-text-primary"><span className="font-semibold">Siguiente:</span> {nextAction(order, paid)}</p>
                <p className="sr-only">{itemCount} productos en total.</p>
                <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
                  <button className={`${buttonClass} bg-brand-primary text-white hover:bg-brand-primary-hover`} type="button" onClick={() => openOrder(order)}>Gestionar</button>
                  <a className={`${buttonClass} border border-[#16A765] px-4 text-[#087D4B] hover:bg-[#EAF8F0]`} href={whatsappUrl(order)} target="_blank" rel="noreferrer" aria-label={`Contactar por WhatsApp a ${order.customer_name}`}>WhatsApp</a>
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
                <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Productos ({selected.items.length})</h3><span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${statusStyles[selected.order_status] ?? statusStyles.pending_review}`}>{labels[selected.order_status] ?? selected.order_status}</span></div>
                <ul className="space-y-2">{selected.items.map(item => <li className="flex justify-between gap-3 rounded-xl bg-white p-3 text-sm" key={`${selected.id}-${item.product_name_snapshot}`}><span className="min-w-0">{item.product_name_snapshot}<small className="block text-text-secondary">{item.quantity} {item.quantity === 1 ? "unidad" : "unidades"}</small></span><strong className="shrink-0">{money(Number(item.unit_price_snapshot) * item.quantity)}</strong></li>)}</ul>
                <div className="rounded-2xl bg-surface-soft p-4">
                  <label className="block text-xs font-semibold text-text-secondary" htmlFor={`confirmed-total-${selected.id}`}>{selected.confirmed_total === null ? "Confirmar precio final (CRC)" : "Total confirmado (CRC)"}
                    <input className={fieldClass} id={`confirmed-total-${selected.id}`} type="number" min="0.01" max="9999999999.99" step="0.01" value={totalDraft} onChange={event => setTotalDrafts(current => ({ ...current, [selected.id]: event.target.value }))} />
                  </label>
                  <p className="mt-2 text-xs leading-5 text-text-secondary">Precio estimado original: {money(Number(selected.estimated_total))}. Se conserva como referencia aunque cambie el total acordado.</p>
                  {selected.confirmed_total !== null && <p className="mt-2 text-sm">Total confirmado: <strong>{money(selected.confirmed_total)}</strong></p>}
                  <button className={`${buttonClass} mt-3 border border-brand-primary text-brand-primary hover:bg-white`} type="button" disabled={saving === selected.id || !totalDraft} onClick={() => void saveConfirmedTotal(selected)}>{saving === selected.id ? "Guardando…" : selected.confirmed_total === null ? "Confirmar precio final" : "Guardar cambio de precio"}</button>
                </div>
                <div className="rounded-2xl bg-white p-4"><div className="flex justify-between text-sm"><span>Pagado</span><strong>{money(paid)}</strong></div><div className="mt-2 flex justify-between text-sm"><span>Saldo pendiente</span><strong>{balance === null ? "Confirma el precio" : money(balance)}</strong></div>{selected.confirmed_total !== null && <><div className="mt-3 h-2 overflow-hidden rounded-full bg-brand-primary-soft" role="progressbar" aria-label="Progreso de pago" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><div className="h-full rounded-full bg-[#31B779]" style={{ width: `${progress}%` }} /></div><p className="mt-1 text-right text-xs text-text-secondary">{Math.round(progress)}% pagado</p></>}</div>
                <div className="flex gap-2"><button className={`${buttonClass} flex-1 bg-brand-primary text-white`} type="button" onClick={() => setSection("payments")}>Ver pagos</button><a className={`${buttonClass} flex-1 border border-[#16A765] text-[#087D4B]`} href={whatsappUrl(selected)} target="_blank" rel="noreferrer">WhatsApp</a></div>
              </div>}

              {section === "payments" && <div className="space-y-5 py-5">
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
                <p className="text-sm text-text-secondary">Los tres estados se guardan de forma independiente.</p>
                {fields.map(field => <fieldset key={field.key}><legend className="mb-2 text-sm font-semibold">{field.label}</legend><div className="flex flex-wrap gap-2">{field.values.map(value => { const draft = statusDrafts[selected.id] ?? selected; const disabled = value === "completed" && (draft.fulfillment_status !== "delivered" || selected.payment_status !== "paid"); return <button type="button" key={value} disabled={disabled} aria-pressed={draft[field.key] === value} onClick={() => changeStatus(selected.id, field.key, value)} className={`${buttonClass} border px-3 ${draft[field.key] === value ? "border-brand-primary bg-brand-primary text-white" : "border-border-subtle bg-white text-text-primary hover:bg-brand-primary-soft"} disabled:opacity-40`}>{labels[value]}</button>; })}</div></fieldset>)}
                <div className="grid grid-cols-3 gap-2 rounded-2xl bg-surface-soft p-3 text-center text-xs"><p>Pedido<strong className="mt-1 block text-[#2D6A4F]">{labels[(statusDrafts[selected.id] ?? selected).order_status]}</strong></p><p>Proveedor<strong className="mt-1 block text-[#2D6A4F]">{labels[(statusDrafts[selected.id] ?? selected).procurement_status]}</strong></p><p>Entrega<strong className="mt-1 block text-[#2D6A4F]">{labels[(statusDrafts[selected.id] ?? selected).fulfillment_status]}</strong></p></div>
                <button className={`${buttonClass} w-full bg-brand-primary text-white`} type="button" disabled={saving === selected.id || !statusDrafts[selected.id] || fields.every(field => statusDrafts[selected.id]?.[field.key] === selected[field.key])} onClick={() => void saveStatuses(selected)}>{saving === selected.id ? "Guardando…" : "Guardar cambios"}</button>
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
