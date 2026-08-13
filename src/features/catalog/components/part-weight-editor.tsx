"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updatePartWeight } from "@/features/catalog/actions";

// Peso normalmente vem sozinho do upload (medido do arquivo) — este
// controle só existe pra corrigir manualmente quando a estimativa
// automática estiver errada (ex.: peça oca, material mais denso que o
// assumido). Mesmo padrão de "clique Editar → vira formulário" já usado
// em SizeRow/MaterialColorRow/CategoryRow.
export function PartWeightEditor({
  productId,
  partId,
  weightGrams,
}: {
  productId: string;
  partId: string;
  weightGrams: number | null;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(weightGrams?.toString() ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Peso inválido.");
      return;
    }
    startTransition(async () => {
      const result = await updatePartWeight(productId, partId, parsed);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Peso atualizado.");
      setIsEditing(false);
    });
  }

  if (isEditing) {
    return (
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={1}
          step={1}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="h-7 w-20 text-xs"
          autoFocus
        />
        <span className="text-xs text-muted-foreground">g</span>
        <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={isPending} onClick={handleSave}>
          {isPending ? "Salvando..." : "Salvar"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          disabled={isPending}
          onClick={() => {
            setValue(weightGrams?.toString() ?? "");
            setIsEditing(false);
          }}
        >
          Cancelar
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>{weightGrams !== null ? `Peso: ~${weightGrams}g` : "Peso ainda não medido — envie o arquivo 3D"}</span>
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className="font-medium text-primary underline-offset-2 hover:underline"
      >
        Editar
      </button>
    </div>
  );
}
