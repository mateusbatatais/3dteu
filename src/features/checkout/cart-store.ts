import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { CartItem } from "./types";

interface CartState {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (index: number) => void;
  updateQuantity: (index: number, quantity: number) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      addItem: (item) => set((state) => ({ items: [...state.items, item] })),
      removeItem: (index) => set((state) => ({ items: state.items.filter((_, i) => i !== index) })),
      updateQuantity: (index, quantity) =>
        set((state) => ({
          items: state.items.map((item, i) =>
            i === index ? { ...item, quantity: Math.max(1, quantity) } : item,
          ),
        })),
      clear: () => set({ items: [] }),
    }),
    {
      name: "fidgets-cart",
      // Evita mismatch de hidratação: o servidor sempre renderiza carrinho vazio;
      // o valor real do localStorage só é aplicado depois do mount (ver CartHydrator).
      skipHydration: true,
    },
  ),
);
