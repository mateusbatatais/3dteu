"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { submitProductReview } from "../actions";
import { StarRatingPicker } from "./star-rating";

export function ReviewForm({
  productId,
  defaultValues,
}: {
  productId: string;
  /** Presente quando o cliente já avaliou esse produto — o formulário edita em vez de criar. */
  defaultValues?: { rating: number; comment: string };
}) {
  const [rating, setRating] = useState(defaultValues?.rating ?? 0);
  const [comment, setComment] = useState(defaultValues?.comment ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (rating < 1) {
      toast.error("Escolha uma nota de 1 a 5.");
      return;
    }

    startTransition(async () => {
      const result = await submitProductReview(productId, { rating, comment });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(defaultValues ? "Avaliação atualizada." : "Avaliação enviada. Obrigado!");
    });
  }

  return (
    <div className="rounded-xl bg-muted/30 p-4 ring-1 ring-foreground/10">
      <h3 className="text-sm font-medium">{defaultValues ? "Editar sua avaliação" : "Avaliar este produto"}</h3>
      <div className="mt-2">
        <StarRatingPicker value={rating} onChange={setRating} />
      </div>
      <Textarea
        className="mt-3"
        placeholder="Conte como foi sua experiência (opcional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={3}
      />
      <Button type="button" size="sm" className="mt-3" disabled={isPending} onClick={handleSubmit}>
        {isPending ? "Enviando..." : defaultValues ? "Salvar" : "Enviar avaliação"}
      </Button>
    </div>
  );
}
