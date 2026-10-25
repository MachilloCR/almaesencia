import { type SubmitEvent, useMemo, useState } from "react";
import { Toaster, sileo } from "sileo";
import type { PublicProductAvailability } from "../../services/public-catalog";
import { useCartStore } from "../../stores/cart-store";
import StatusBadge from "../ui/StatusBadge";

function formatPrice(value: number, currency: string) {
  return new Intl.NumberFormat("es-CR", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

export default function RequestCart({ availability }: { availability: PublicProductAvailability[] }) {
  const { items, setQuantity, remove, clear } = useCartStore();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(() => new Set());
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const total = useMemo(() => items.reduce((sum, item) => sum + item.price * item.quantity, 0), [items]);
  const currentAvailability = useMemo(() => new Map(availability.map((product) => [product.id, product.availability_status])), [availability]);
  const hasOnOrder = items.some((item) => currentAvailability.get(item.id) === "on_order");
  const hasUnavailable = items.some((item) => !currentAvailability.has(item.id));

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (items.length === 0 || hasUnavailable) return;
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

  return (
    <>
      <Toaster position="top-right" options={{ fill: "#FFFFFF", roundness: 16, duration: 4_000 }} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8">
        <section className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.14em] text-brand-primary uppercase">Mi solicitud</p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-text-primary">Revisa tus productos</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">El precio es estimado. Confirmaremos disponibilidad y condiciones contigo antes de preparar el pedido.</p>

          {hasOnOrder && <p className="mt-4 flex items-start gap-2 rounded-xl border-l-[3px] border-brand-primary bg-brand-primary-soft px-3 py-3 text-sm leading-5 text-text-primary" role="status">
            <svg aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8h.01" /></svg>
            <span>Tu solicitud incluye productos por encargo. Confirmaremos sus tiempos de entrega contigo.</span>
          </p>}
          {hasUnavailable && <p className="mt-3 flex items-start gap-2 rounded-xl border-l-[3px] border-[#6B5E65] bg-[#F0ECEE] px-3 py-3 text-sm leading-5 text-text-primary" role="alert">
            <svg aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[#6B5E65]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v6m0 4h.01" /></svg>
            <span>Uno o más productos ya no están disponibles. Quítalos para poder enviar la solicitud.</span>
          </p>}

          {items.length === 0 ? (
            <div className="mt-6 rounded-[20px] border border-dashed border-border-subtle bg-surface-card px-5 py-10 text-center sm:py-12">
              <h2 className="font-display text-2xl font-semibold text-text-primary">Tu solicitud está vacía</h2>
              <p className="mt-2 text-sm text-text-secondary">Explora el catálogo y agrega los productos que te interesan.</p>
              <a className="mt-5 inline-flex min-h-11 items-center rounded-full bg-brand-primary px-5 py-3 text-sm font-semibold text-white hover:bg-brand-primary-hover" href="/">Explorar catálogo</a>
            </div>
          ) : (
            <div className="mt-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-xl font-semibold text-text-primary">Productos seleccionados</h2>
                <span className="shrink-0 text-xs font-semibold text-text-secondary" aria-live="polite">{items.length} {items.length === 1 ? "producto" : "productos"}</span>
              </div>
              <ul className="mt-3 space-y-3">
                {items.map((item) => {
                  const status = currentAvailability.get(item.id);
                  return (
                    <li className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-3 gap-y-3 rounded-[16px] border border-border-subtle bg-surface-card p-3 sm:grid-cols-[4rem_minmax(0,1fr)] sm:p-4" key={item.id}>
                      <div className="size-14 overflow-hidden rounded-xl border border-border-subtle bg-surface-soft sm:size-16">
                        {item.imageUrl && !failedImageIds.has(item.id) ? (
                          <img className="size-full object-contain p-0.5" src={item.imageUrl} alt={item.imageAltText || item.name} width="128" height="128" loading="lazy" onError={() => setFailedImageIds((current) => new Set(current).add(item.id))} />
                        ) : (
                          <div className="flex size-full items-center justify-center text-brand-primary/60" aria-hidden="true">
                            <svg className="size-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4.5 7.8 7.5 4.3 7.5-4.3M12 12.1V21" /></svg>
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 self-center">
                        <h3 className="line-clamp-2 font-display text-lg font-medium leading-5 text-text-primary">{item.name}</h3>
                        <p className="mt-1"><strong className="text-sm font-semibold tabular-nums text-text-primary">{formatPrice(item.price, item.currency)}</strong><span className="text-xs text-text-secondary"> · Precio estimado</span></p>
                      </div>
                      <div className="col-span-2 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-3">
                        <StatusBadge context="product" status={status ?? "unavailable"} size="compact" />
                        <div className="flex items-center gap-2">
                          <div className="inline-flex overflow-hidden rounded-lg border border-border-subtle bg-white">
                            <button className="min-h-11 w-11 shrink-0 border-r border-border-subtle text-lg font-medium text-brand-primary hover:bg-brand-primary-soft focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-primary disabled:cursor-not-allowed disabled:text-text-secondary/50" type="button" aria-label={"Disminuir cantidad de " + item.name} onClick={() => setQuantity(item.id, Math.max(1, item.quantity - 1))} disabled={item.quantity <= 1}>−</button>
                            <label className="sr-only" htmlFor={"quantity-" + item.id}>Cantidad de {item.name}</label>
                            <input className="min-h-11 w-11 border-0 bg-white px-1 text-center text-sm text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-primary" id={"quantity-" + item.id} type="number" min="1" max="100" value={item.quantity} onChange={(event) => setQuantity(item.id, Math.min(100, Math.max(1, Number(event.target.value) || 1)))} />
                            <button className="min-h-11 w-11 shrink-0 border-l border-border-subtle text-lg font-medium text-brand-primary hover:bg-brand-primary-soft focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-primary disabled:cursor-not-allowed disabled:text-text-secondary/50" type="button" aria-label={"Aumentar cantidad de " + item.name} onClick={() => setQuantity(item.id, Math.min(100, item.quantity + 1))} disabled={item.quantity >= 100}>+</button>
                          </div>
                          <button className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-brand-primary transition-colors hover:bg-brand-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary" type="button" onClick={() => remove(item.id)} aria-label={"Quitar " + item.name} title={"Quitar " + item.name}>
                            <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3" /></svg>
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

        {items.length > 0 && <aside className="h-fit rounded-[20px] border border-border-subtle bg-surface-card p-5 shadow-[0_4px_20px_-2px_rgba(134,54,93,0.05)] sm:p-6 lg:sticky lg:top-6">
          <h2 className="font-display text-2xl font-semibold text-text-primary">Enviar solicitud</h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">Necesitamos estos datos para contactarte y coordinar tu pedido.</p>
          <form className="mt-5 space-y-4" onSubmit={submit}>
            <label className="block text-sm font-semibold text-text-primary">Nombre
              <input className="mt-2 min-h-11 w-full rounded-lg border border-border-subtle px-3 font-normal outline-none focus:border-brand-primary focus:ring-3 focus:ring-brand-primary/12" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={120} required />
            </label>
            <label className="block text-sm font-semibold text-text-primary">Teléfono
              <input className="mt-2 min-h-11 w-full rounded-lg border border-border-subtle px-3 font-normal outline-none focus:border-brand-primary focus:ring-3 focus:ring-brand-primary/12" value={phone} onChange={(event) => setPhone(event.target.value)} minLength={8} maxLength={24} inputMode="tel" required />
            </label>
            <label className="block text-sm font-semibold text-text-primary">Detalle de entrega <span className="font-normal text-text-secondary">(opcional)</span>
              <textarea className="mt-2 min-h-24 w-full rounded-lg border border-border-subtle px-3 py-2 font-normal outline-none focus:border-brand-primary focus:ring-3 focus:ring-brand-primary/12" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} />
            </label>
            <div className="border-t border-border-subtle pt-4">
              <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><span className="text-sm text-text-secondary">Total estimado</span><strong className="ml-auto whitespace-nowrap text-xl font-semibold tabular-nums text-text-primary sm:text-2xl">{formatPrice(total, items[0].currency)}</strong></p>
              <button className="mt-4 min-h-11 w-full rounded-full bg-brand-primary px-5 py-3 text-sm font-semibold text-white hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:bg-brand-primary-soft disabled:text-text-secondary" type="submit" disabled={isSending || hasUnavailable}>{isSending ? "Enviando…" : "Enviar solicitud"}</button>
            </div>
          </form>
        </aside>}
      </div>
    </>
  );
}
