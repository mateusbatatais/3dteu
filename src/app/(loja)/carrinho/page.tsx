"use client";

import { ShoppingCart } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useCartStore } from "@/features/checkout/cart-store";
import { formatPriceCents } from "@/lib/format";

export default function CarrinhoPage() {
  const items = useCartStore((state) => state.items);
  const removeItem = useCartStore((state) => state.removeItem);
  const updateQuantity = useCartStore((state) => state.updateQuantity);

  const totalCents = items.reduce((sum, item) => sum + item.estimatedUnitPriceCents * item.quantity, 0);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Carrinho</h1>

      {items.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-3 text-center">
          <ShoppingCart className="size-10 text-muted-foreground/50" />
          <p className="text-muted-foreground">Seu carrinho está vazio.</p>
          <Button render={<Link href="/produtos" />} nativeButton={false} className="mt-2">
            Ver catálogo
          </Button>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-6">
          <ul className="flex flex-col divide-y rounded-xl bg-card ring-1 ring-foreground/10">
            {items.map((item, index) => (
              <li key={`${item.productId}-${index}`} className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="font-medium">{item.productName}</p>
                  <p className="text-sm text-muted-foreground">{item.summary}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => updateQuantity(index, item.quantity - 1)}
                    >
                      −
                    </Button>
                    <span className="w-6 text-center text-sm">{item.quantity}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => updateQuantity(index, item.quantity + 1)}
                    >
                      +
                    </Button>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <p className="font-medium">{formatPriceCents(item.estimatedUnitPriceCents * item.quantity)}</p>
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="text-sm text-muted-foreground underline-offset-2 hover:underline"
                  >
                    Remover
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between border-t pt-4">
            <span className="text-lg font-semibold">Total</span>
            <span className="text-lg font-semibold">{formatPriceCents(totalCents)}</span>
          </div>

          <Button render={<Link href="/checkout" />} nativeButton={false} size="lg">
            Finalizar compra
          </Button>
        </div>
      )}
    </main>
  );
}
