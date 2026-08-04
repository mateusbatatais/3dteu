"use client";

import { useEffect } from "react";

import { useCartStore } from "../cart-store";

/** Monta uma vez no layout raiz para reidratar o carrinho do localStorage após o mount. */
export function CartHydrator() {
  useEffect(() => {
    useCartStore.persist.rehydrate();
  }, []);

  return null;
}
