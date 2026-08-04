"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPriceCents } from "@/lib/format";

import { submitOrder } from "../actions";
import { useCartStore } from "../cart-store";

export function CheckoutForm() {
  const router = useRouter();
  const items = useCartStore((state) => state.items);
  const clearCart = useCartStore((state) => state.clear);

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const totalCents = items.reduce((sum, item) => sum + item.estimatedUnitPriceCents * item.quantity, 0);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await submitOrder({ customerName, customerEmail, customerPhone, items });

      if (result.error) {
        setError(result.error);
        return;
      }

      clearCart();
      router.push(`/pedido/${result.orderToken}`);
    });
  }

  if (items.length === 0) {
    return <p className="text-muted-foreground">Seu carrinho está vazio.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="rounded-xl bg-muted/40 p-4">
        <h2 className="text-sm font-medium">Entrega</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Por enquanto só retirada em mãos — combinamos o local/horário por e-mail depois da confirmação.
          Envio pelos Correios/Superfrete chega em breve.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="customerName">Nome</Label>
          <Input id="customerName" required value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="customerEmail">E-mail</Label>
          <Input
            id="customerEmail"
            type="email"
            required
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Enviamos o link de acompanhamento do pedido pra ele.</p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="customerPhone">Telefone (opcional)</Label>
          <Input id="customerPhone" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
        </div>
      </div>

      <div className="flex items-center justify-between border-t pt-4">
        <span className="text-lg font-semibold">Total</span>
        <span className="text-lg font-semibold">{formatPriceCents(totalCents)}</span>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button type="submit" size="lg" disabled={isPending}>
        {isPending ? "Enviando..." : "Confirmar pedido"}
      </Button>
    </form>
  );
}
