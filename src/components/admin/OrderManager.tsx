import { useState } from "react";
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
  created_at: string;
  items: Item[];
  payments: Payment[];
};
type Props = { initialOrders: Order[] };
type StatusKey = "order_status" | "procurement_status" | "fulfillment_status";
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
  { key: "order_status", label: "Pedido", values: ["pending_review", "confirmed", "cancelled", "completed"] },
  { key: "procurement_status", label: "Abastecimiento", values: ["not_required", "pending_supplier", "ordered", "received"] },
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
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Costa_Rica",
}).format(new Date(value)).replace(/[\u00a0\u202f]/g, " ");
const fieldClass = "mt-1 min-h-11 w-full rounded-lg border border-border-subtle bg-white px-3 text-sm text-text-primary outline-none focus:border-brand-primary focus:ring-3 focus:ring-brand-primary/12";

async function readResponse<T>(response: Response): Promise<T> {
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "No fue posible guardar los cambios.");
  return data;
}

export default function OrderManager({ initialOrders }: Props) {
  const [orders, setOrders] = useState(initialOrders);
  const [saving, setSaving] = useState<string | null>(null);
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [methodDrafts, setMethodDrafts] = useState<Record<string, PaymentMethod>>({});

  function changeStatus(orderId: string, key: StatusKey, value: string) {
    setOrders(current => current.map(order => order.id === orderId ? { ...order, [key]: value } : order));
  }

  async function saveStatuses(order: Order) {
    setSaving(order.id);
    try {
      const result = await sileo.promise(
        fetch("/api/admin/orders", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: order.id,
            orderStatus: order.order_status,
            procurementStatus: order.procurement_status,
            fulfillmentStatus: order.fulfillment_status,
          }),
        }).then(response => readResponse<{ order: Partial<Order> }>(response)),
        {
          loading: { title: "Actualizando pedido…" },
          success: { title: "Pedido actualizado" },
          error: error => ({ title: "No se pudo actualizar", description: String(error) }),
        },
      );
      setOrders(current => current.map(item => item.id === order.id ? { ...item, ...result.order } : item));
    } catch {
      // Sileo ya presenta el error al administrador.
    } finally {
      setSaving(null);
    }
  }

  async function saveConfirmedTotal(order: Order) {
    setSaving(order.id);
    try {
      const result = await sileo.promise(
        fetch("/api/admin/orders/confirmed-total", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: order.id, confirmedTotal: order.confirmed_total }),
        }).then(response => readResponse<{ order: { confirmed_total: number; payment_status: PaymentStatus } }>(response)),
        {
          loading: { title: "Guardando total confirmado…" },
          success: { title: "Total confirmado guardado" },
          error: error => ({ title: "No se pudo guardar el total", description: String(error) }),
        },
      );
      setOrders(current => current.map(item => item.id === order.id ? { ...item, ...result.order } : item));
    } catch {
      // Sileo ya presenta el error al administrador.
    } finally {
      setSaving(null);
    }
  }

  async function recordPayment(order: Order) {
    const amount = Number(amountDrafts[order.id]);
    const paymentMethod = methodDrafts[order.id] ?? "cash";
    setSaving(order.id);
    try {
      const result = await sileo.promise(
        fetch("/api/admin/orders/payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: order.id,
            amount,
            paymentMethod,
            note: noteDrafts[order.id] ?? "",
          }),
        }).then(response => readResponse<PaymentResponse>(response)),
        {
          loading: { title: "Registrando pago…" },
          success: { title: "Pago registrado" },
          error: error => ({ title: "No se pudo registrar el pago", description: String(error) }),
        },
      );
      const payment = result.payment;
      setOrders(current => current.map(item => item.id === order.id
          ? { ...item, payment_status: payment.payment_status, payments: [paymentToRow(payment), ...item.payments] }
        : item));
      setAmountDrafts(current => ({ ...current, [order.id]: "" }));
      setNoteDrafts(current => ({ ...current, [order.id]: "" }));
    } catch {
      // Sileo ya presenta el error al administrador.
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="mt-10">
      <Toaster position="top-right" options={{ fill: "#fff", roundness: 16 }} />
      {orders.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-border-subtle bg-surface-card p-10 text-center text-sm text-text-secondary">Aún no hay solicitudes.</div>
      ) : (
        <ul className="max-w-3xl space-y-5">
          {orders.map(order => {
            const totalPaid = order.payments.reduce((total, payment) => total + Number(payment.amount), 0);
            const balance = order.confirmed_total === null ? null : Math.max(order.confirmed_total - totalPaid, 0);
            const totalDraft = order.confirmed_total === null ? "" : String(order.confirmed_total);
            return (
              <li className="rounded-[20px] border border-border-subtle bg-surface-card p-5 shadow-[0_4px_20px_-2px_rgba(134,54,93,0.08)]" key={order.id}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold text-brand-primary">#{order.order_number}</p>
                    <h2 className="mt-1 font-display text-xl font-semibold text-text-primary">{order.customer_name}</h2>
                    <p className="mt-1 text-sm text-text-secondary">{order.customer_phone} · {dateTime(order.created_at)}</p>
                  </div>
                  <span className={`rounded-full px-4 py-2 text-sm font-semibold shadow-sm ${statusStyles[order.order_status] ?? statusStyles.pending_review}`}>
                    {labels[order.order_status] ?? order.order_status}
                  </span>
                </div>

                <div className="mt-5 space-y-2 rounded-xl bg-brand-primary-soft p-3 text-sm text-text-primary">
                  {order.items.map(item => (
                    <div className="flex items-center justify-between gap-4 rounded-lg border border-white/80 bg-white/75 px-3 py-2.5" key={`${item.order_id}-${item.product_name_snapshot}`}>
                      <span>{item.quantity} × {item.product_name_snapshot}</span>
                      <strong>{money(Number(item.unit_price_snapshot) * item.quantity)}</strong>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${order.payment_status === "paid" ? "bg-[#E8F5E9] text-[#2D6A4F]" : "bg-brand-primary-soft text-brand-primary"}`}>
                    Pago: {labels[order.payment_status]}
                  </span>
                  <p className="text-sm font-semibold text-text-primary">Estimado: <strong className="ml-1 text-xl">{money(Number(order.estimated_total))}</strong></p>
                </div>

                <a className="mt-5 inline-flex min-h-11 items-center rounded-full bg-[#E8F0FF] px-5 text-sm font-semibold text-[#173E7A]" href={`https://wa.me/${order.customer_phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hola, te contactamos por tu solicitud ${order.order_number} de Alma Esencia CR.`)}`} target="_blank" rel="noreferrer">WhatsApp</a>

                <details className="mt-5 border-t border-border-subtle pt-4">
                  <summary className="cursor-pointer text-sm font-semibold text-brand-primary">Total y pagos</summary>
                  <div className="mt-4 rounded-xl bg-surface-soft p-4">
                    <label className="block text-xs font-semibold text-text-secondary" htmlFor={`confirmed-total-${order.id}`}>
                      Total confirmado (CRC)
                      <input
                        className={fieldClass}
                        id={`confirmed-total-${order.id}`}
                        type="number"
                        min="0.01"
                        max="9999999999.99"
                        step="0.01"
                        value={totalDraft}
                        onChange={event => setOrders(current => current.map(item => item.id === order.id
                          ? { ...item, confirmed_total: event.target.value === "" ? null : Number(event.target.value) }
                          : item))}
                      />
                    </label>
                    <p className="mt-2 text-xs leading-5 text-text-secondary">El monto estimado de la solicitud no se considera un precio final hasta que confirmes las condiciones con el cliente.</p>
                      <button className="mt-3 min-h-11 rounded-full border border-brand-primary px-5 text-sm font-semibold text-brand-primary disabled:opacity-60" type="button" disabled={saving === order.id || order.confirmed_total === null || order.confirmed_total <= 0} onClick={() => void saveConfirmedTotal(order)}>
                      Guardar total confirmado
                    </button>

                    <div className="mt-5 grid gap-2 text-sm sm:grid-cols-3">
                      <p>Total confirmado: <strong>{order.confirmed_total === null ? "Pendiente" : money(order.confirmed_total)}</strong></p>
                      <p>Pagado: <strong>{money(totalPaid)}</strong></p>
                      <p>Saldo: <strong>{balance === null ? "—" : money(balance)}</strong></p>
                    </div>

                    {order.payments.length > 0 && (
                      <div className="mt-5">
                        <h3 className="text-sm font-semibold text-text-primary">Pagos registrados</h3>
                        <ol className="mt-2 space-y-2">
                          {order.payments.map(payment => (
                            <li className="rounded-lg border border-border-subtle bg-white px-3 py-3 text-sm" key={payment.id}>
                              <div className="flex flex-wrap justify-between gap-2">
                                <strong>{money(Number(payment.amount))} · {labels[payment.payment_method]}</strong>
                                <time className="text-text-secondary" dateTime={payment.received_at}>{dateTime(payment.received_at)}</time>
                              </div>
                              {payment.note && <p className="mt-1 text-text-secondary">{payment.note}</p>}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {order.confirmed_total !== null && balance !== null && balance > 0 && (
                      <div className="mt-5 border-t border-border-subtle pt-4">
                        <h3 className="text-sm font-semibold text-text-primary">Registrar un pago recibido</h3>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <label className="text-xs font-semibold text-text-secondary" htmlFor={`payment-amount-${order.id}`}>
                            Monto (CRC)
                            <input className={fieldClass} id={`payment-amount-${order.id}`} type="number" min="0.01" max={balance} step="0.01" value={amountDrafts[order.id] ?? ""} onChange={event => setAmountDrafts(current => ({ ...current, [order.id]: event.target.value }))} />
                          </label>
                          <label className="text-xs font-semibold text-text-secondary" htmlFor={`payment-method-${order.id}`}>
                            Método
                            <select className={fieldClass} id={`payment-method-${order.id}`} value={methodDrafts[order.id] ?? "cash"} onChange={event => setMethodDrafts(current => ({ ...current, [order.id]: event.target.value as PaymentMethod }))}>
                              {methods.map(method => <option value={method.value} key={method.value}>{method.label}</option>)}
                            </select>
                          </label>
                          <label className="text-xs font-semibold text-text-secondary sm:col-span-2" htmlFor={`payment-note-${order.id}`}>
                            Nota (opcional)
                            <input className={fieldClass} id={`payment-note-${order.id}`} maxLength={500} value={noteDrafts[order.id] ?? ""} onChange={event => setNoteDrafts(current => ({ ...current, [order.id]: event.target.value }))} />
                          </label>
                        </div>
                        <button className="mt-3 min-h-11 rounded-full bg-brand-primary px-5 text-sm font-semibold text-white disabled:bg-brand-primary-soft" type="button" disabled={saving === order.id || !amountDrafts[order.id]} onClick={() => void recordPayment(order)}>
                          {saving === order.id ? "Guardando…" : "Registrar pago"}
                        </button>
                      </div>
                    )}
                  </div>
                </details>

                <details className="mt-4 border-t border-border-subtle pt-4">
                  <summary className="cursor-pointer text-sm font-semibold text-brand-primary">Actualizar estados</summary>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {fields.map(field => (
                      <label className="text-xs font-semibold text-text-secondary" key={field.key}>
                        {field.label}
                        <select className={fieldClass} value={order[field.key]} onChange={event => changeStatus(order.id, field.key, event.target.value)}>
                          {field.values.map(value => (
                            <option
                              key={value}
                              value={value}
                              disabled={value === "completed" && (order.fulfillment_status !== "delivered" || order.payment_status !== "paid")}
                            >
                              {labels[value]}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  <button className="mt-4 min-h-11 rounded-full bg-brand-primary px-5 text-sm font-semibold text-white disabled:bg-brand-primary-soft" type="button" disabled={saving === order.id} onClick={() => void saveStatuses(order)}>
                    {saving === order.id ? "Guardando…" : "Guardar cambios"}
                  </button>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function paymentToRow(payment: PaymentResponse["payment"]): Payment {
  return {
    id: payment.payment_id,
    amount: payment.amount,
    payment_method: payment.payment_method,
    note: payment.note,
    received_at: payment.received_at,
  };
}
