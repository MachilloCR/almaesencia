import { type SubmitEvent, useMemo, useState } from "react";
import { Toaster, sileo } from "sileo";
import { useCartStore } from "../../stores/cart-store";

function formatPrice(value: number, currency: string) {
  return new Intl.NumberFormat("es-CR", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

export default function RequestCart() {
  const { items, setQuantity, remove, clear } = useCartStore();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const total = useMemo(() => items.reduce((sum, item) => sum + item.price * item.quantity, 0), [items]);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (items.length === 0) return;
    setIsSending(true);

    try {
      const response = await sileo.promise(
        fetch("/api/orders/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerName: name,
            customerPhone: phone,
            deliveryNotes: notes,
            items: items.map((item) => ({ productId: item.id, quantity: item.quantity })),
          }),
        }).then(async (result) => {
          const data = (await result.json()) as { orderNumber?: string; error?: string };
          if (!result.ok || !data.orderNumber) throw new Error(data.error ?? "No fue posible enviar la solicitud.");
          return data;
        }),
        {
          loading: { title: "Enviando solicitud…" },
          success: { title: "Solicitud enviada", description: "Revisaremos disponibilidad y detalles contigo." },
          error: (error) => ({ title: "No se pudo enviar", description: String(error) }),
        },
      );
      if (response.orderNumber) setOrderNumber(response.orderNumber);
      clear();
    } catch {
      // Sileo muestra el motivo del error.
    } finally {
      setIsSending(false);
    }
  }

  if (orderNumber) {
    return <section className="rounded-[20px] border border-border-subtle bg-surface-card p-8 text-center shadow-[0_4px_20px_-2px_rgba(134,54,93,0.05)]"><p className="text-xs font-semibold tracking-[0.14em] text-brand-primary uppercase">Solicitud enviada</p><h1 className="mt-3 font-display text-3xl font-semibold text-text-primary">Gracias por escribirnos</h1><p className="mt-4 text-sm leading-6 text-text-secondary">Tu código de solicitud es <strong className="text-text-primary">{orderNumber}</strong>. Confirmaremos disponibilidad, precio final y entrega antes de continuar.</p><a className="mt-7 inline-flex min-h-11 items-center rounded-full bg-brand-primary px-5 py-3 text-sm font-semibold text-white hover:bg-brand-primary-hover" href="/">Volver al catálogo</a></section>;
  }

  return <><Toaster position="top-right" options={{ fill: "#FFFFFF", roundness: 16, duration: 4_000 }} />
    <div className="grid gap-8 lg:grid-cols-[minmax(0,42rem)_22rem]">
      <section><p className="text-xs font-semibold tracking-[0.14em] text-brand-primary uppercase">Mi solicitud</p><h1 className="mt-3 font-display text-3xl font-semibold text-text-primary">Revisa tus productos</h1><p className="mt-3 text-sm leading-6 text-text-secondary">El precio es estimado. Confirmaremos disponibilidad y condiciones contigo antes de preparar el pedido.</p>
        {items.length === 0 ? <div className="mt-7 rounded-[20px] border border-dashed border-border-subtle bg-surface-card px-6 py-12 text-center"><h2 className="font-display text-2xl font-semibold text-text-primary">Tu solicitud está vacía</h2><a className="mt-5 inline-flex min-h-11 items-center rounded-full bg-brand-primary px-5 py-3 text-sm font-semibold text-white hover:bg-brand-primary-hover" href="/">Explorar catálogo</a></div> : <ul className="mt-7 space-y-3">{items.map((item) => <li className="flex flex-wrap items-center justify-between gap-4 rounded-[16px] border border-border-subtle bg-surface-card p-4" key={item.id}><div><h2 className="font-display text-xl font-medium text-text-primary">{item.name}</h2><p className="mt-1 text-sm text-text-secondary">{formatPrice(item.price, item.currency)} · Precio estimado</p></div><div className="flex items-center gap-2"><label className="sr-only" htmlFor={`quantity-${item.id}`}>Cantidad de {item.name}</label><input className="min-h-11 w-16 rounded-lg border border-border-subtle px-2 text-center" id={`quantity-${item.id}`} type="number" min="1" max="100" value={item.quantity} onChange={(event) => setQuantity(item.id, Math.max(1, Number(event.target.value) || 1))} /><button className="min-h-11 rounded-full px-3 text-sm font-semibold text-brand-primary hover:bg-brand-primary-soft" type="button" onClick={() => remove(item.id)}>Quitar</button></div></li>)}</ul>}</section>
      {items.length > 0 && <aside className="h-fit rounded-[20px] border border-border-subtle bg-surface-card p-6 shadow-[0_4px_20px_-2px_rgba(134,54,93,0.05)]"><h2 className="font-display text-2xl font-semibold text-text-primary">Enviar solicitud</h2><p className="mt-2 text-sm leading-6 text-text-secondary">Necesitamos estos datos para contactarte y coordinar tu pedido.</p><form className="mt-6 space-y-4" onSubmit={submit}><label className="block text-sm font-semibold text-text-primary">Nombre<input className="mt-2 min-h-11 w-full rounded-lg border border-border-subtle px-3 font-normal" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={120} required /></label><label className="block text-sm font-semibold text-text-primary">Teléfono<input className="mt-2 min-h-11 w-full rounded-lg border border-border-subtle px-3 font-normal" value={phone} onChange={(event) => setPhone(event.target.value)} minLength={8} maxLength={24} inputMode="tel" required /></label><label className="block text-sm font-semibold text-text-primary">Detalle de entrega <span className="font-normal text-text-secondary">(opcional)</span><textarea className="mt-2 min-h-24 w-full rounded-lg border border-border-subtle px-3 py-2 font-normal" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} /></label><div className="border-t border-border-subtle pt-4"><p className="flex justify-between text-sm text-text-secondary"><span>Total estimado</span><strong className="text-text-primary">{formatPrice(total, items[0].currency)}</strong></p><button className="mt-5 min-h-11 w-full rounded-full bg-brand-primary px-5 py-3 text-sm font-semibold text-white hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:bg-brand-primary-soft disabled:text-text-secondary" type="submit" disabled={isSending}>{isSending ? "Enviando…" : "Enviar solicitud"}</button></div></form></aside>}
    </div></>;
}
