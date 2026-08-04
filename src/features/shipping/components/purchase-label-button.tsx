"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { purchaseShippingLabel } from "../actions";

export function PurchaseLabelButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    // O clique + confirmação aqui É a autorização humana explícita antes do
    // gasto real de saldo na carteira Superfrete — a compra nunca acontece sozinha.
    const confirmed = window.confirm(
      "Isso vai comprar a etiqueta de verdade, gastando saldo real da sua carteira Superfrete. Confirmar?",
    );
    if (!confirmed) return;

    setError(null);
    startTransition(async () => {
      const result = await purchaseShippingLabel(orderId);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={handleClick}>
        {isPending ? "Comprando..." : "Comprar etiqueta com Superfrete"}
      </Button>
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
