import { useCartStore } from "../../stores/cart-store";

export default function CartLink() {
  const count = useCartStore((state) => state.items.reduce((total, item) => total + item.quantity, 0));

  return (
    <a className="relative inline-flex min-h-11 items-center rounded-full border-[1.5px] border-brand-primary px-4 text-sm font-semibold text-brand-primary transition hover:bg-brand-primary-soft" href="/solicitud">
      Mi solicitud{count > 0 ? ` (${count})` : ""}
    </a>
  );
}
