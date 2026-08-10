"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { ProductActionResult, SizeOptionInput } from "../actions";

const EMPTY_VALUES: SizeOptionInput = { label: "", scaleFactor: 1, priceModifierReais: 0, weightModifierGrams: 0 };

export function SizeForm({
  mode,
  initialValues,
  onSubmit,
  onCancel,
}: {
  mode: "create" | "edit";
  initialValues?: SizeOptionInput;
  onSubmit: (input: SizeOptionInput) => Promise<ProductActionResult>;
  /** Obrigatório no modo "edit" — fecha o formulário depois de salvar/cancelar. */
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<SizeOptionInput>(initialValues ?? EMPTY_VALUES);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof SizeOptionInput>(key: K, value: SizeOptionInput[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit() {
    startTransition(async () => {
      const result = await onSubmit(values);
      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(mode === "create" ? "Tamanho criado." : "Tamanho atualizado.");
      if (mode === "create") {
        setValues(EMPTY_VALUES);
      } else {
        onCancel?.();
      }
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`size-label-${mode}`}>Label</Label>
        <Input
          id={`size-label-${mode}`}
          value={values.label}
          onChange={(e) => update("label", e.target.value)}
          placeholder="M"
          className="w-20"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`size-scale-${mode}`}>Escala</Label>
        <Input
          id={`size-scale-${mode}`}
          type="number"
          step="0.01"
          value={values.scaleFactor}
          onChange={(e) => update("scaleFactor", Number(e.target.value))}
          className="w-24"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`size-price-${mode}`}>Modificador (R$)</Label>
        <Input
          id={`size-price-${mode}`}
          type="number"
          step="0.01"
          value={values.priceModifierReais}
          onChange={(e) => update("priceModifierReais", Number(e.target.value))}
          className="w-28"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`size-weight-${mode}`}>Peso (g)</Label>
        <Input
          id={`size-weight-${mode}`}
          type="number"
          value={values.weightModifierGrams}
          onChange={(e) => update("weightModifierGrams", Number(e.target.value))}
          className="w-24"
        />
      </div>
      <div className="flex gap-2">
        <Button type="button" disabled={isPending || !values.label.trim()} onClick={handleSubmit}>
          {isPending ? "Salvando..." : mode === "create" ? "Adicionar tamanho" : "Salvar"}
        </Button>
        {mode === "edit" ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
            Cancelar
          </Button>
        ) : null}
      </div>
    </div>
  );
}
