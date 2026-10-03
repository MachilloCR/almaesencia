import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ProductAvailabilityStatus } from "../types/database";

export type CartProduct = {
  id: string;
  name: string;
  slug: string;
  price: number;
  currency: string;
  availability_status: ProductAvailabilityStatus;
};

export type CartItem = CartProduct & { quantity: number };

type CartState = {
  items: CartItem[];
  add: (product: CartProduct) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
};

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      add: (product) =>
        set((state) => {
          const existing = state.items.find((item) => item.id === product.id);
          if (!existing) return { items: [...state.items, { ...product, quantity: 1 }] };
          return {
            items: state.items.map((item) =>
              item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
            ),
          };
        }),
      setQuantity: (productId, quantity) =>
        set((state) => ({
          items: quantity <= 0
            ? state.items.filter((item) => item.id !== productId)
            : state.items.map((item) => (item.id === productId ? { ...item, quantity } : item)),
        })),
      remove: (productId) => set((state) => ({ items: state.items.filter((item) => item.id !== productId) })),
      clear: () => set({ items: [] }),
    }),
    { name: "alma-esencia-cr-cart" },
  ),
);
