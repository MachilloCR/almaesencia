import { useCartStore } from "../../stores/cart-store";

export default function CartLink() {
  const count = useCartStore((state) => state.items.reduce((total, item) => total + item.quantity, 0));

  return (
    <a
      className="relative inline-flex min-h-11 items-center gap-2 rounded-full bg-brand-primary px-5 text-sm font-semibold text-white shadow-[0_6px_18px_-4px_rgba(44,26,35,0.38)] transition-colors hover:bg-brand-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
      href="/solicitud"
      aria-label={`Mi solicitud${count > 0 ? `, ${count} ${count === 1 ? "artículo" : "artículos"}` : ""}`}
    >
      <svg aria-hidden="true" className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.5 8h13l1 12h-15l1-12Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 8V6a3 3 0 0 1 6 0v2" />
      </svg>
      <span>Mi solicitud</span>
      {count > 0 && (
        <span className="absolute -top-2 -right-1.5 inline-flex min-h-6 min-w-6 items-center justify-center rounded-full border-2 border-surface bg-white px-1.5 text-xs font-bold leading-none text-brand-primary shadow-sm" aria-hidden="true">
          {count}
        </span>
      )}
    </a>
  );
}
