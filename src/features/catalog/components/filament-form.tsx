"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import type { FilamentActionResult, FilamentInput } from "../filament-actions";
import type { FilamentType } from "../types";

export const FILAMENT_TYPE_LABELS: Record<FilamentType, string> = {
  solid_color: "Cor sólida",
  dual_color: "Dual-color",
  special: "Especial",
};

const EMPTY_VALUES: FilamentInput = {
  name: "",
  type: "solid_color",
  hexColor: "#2563eb",
  hexColorSecondary: "#f97316",
  priceModifierReais: 0,
};

export function FilamentForm({
  mode,
  initialValues,
  onSubmit,
  onCancel,
}: {
  mode: "create" | "edit";
  initialValues?: FilamentInput;
  onSubmit: (input: FilamentInput) => Promise<FilamentActionResult>;
  /** Obrigatório no modo "edit" — fecha o formulário depois de salvar/cancelar. */
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<FilamentInput>(initialValues ?? EMPTY_VALUES);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof FilamentInput>(key: K, value: FilamentInput[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit() {
    startTransition(async () => {
      const result = await onSubmit(values);
      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(mode === "create" ? "Material criado." : "Material atualizado.");
      if (mode === "create") {
        setValues(EMPTY_VALUES);
      } else {
        onCancel?.();
      }
    });
  }

  return (
    <div className="flex max-w-3xl flex-wrap items-end gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`filament-name-${mode}`}>Nome</Label>
        <Input
          id={`filament-name-${mode}`}
          value={values.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder="Azul"
          className="w-40"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`filament-type-${mode}`}>Tipo</Label>
        <Select value={values.type} onValueChange={(value) => update("type", value as FilamentType)}>
          <SelectTrigger id={`filament-type-${mode}`} className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(FILAMENT_TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`filament-hex-${mode}`}>Cor</Label>
        <Input
          id={`filament-hex-${mode}`}
          type="color"
          value={values.hexColor}
          onChange={(e) => update("hexColor", e.target.value)}
          className="w-16 p-1"
        />
      </div>
      {/* Só aparece pra dual-color — é isso que evita um material "sólido"
      acabar com uma 2ª cor sem o usuário nem ter escolhido isso. */}
      {values.type === "dual_color" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`filament-hex2-${mode}`}>2ª cor</Label>
          <Input
            id={`filament-hex2-${mode}`}
            type="color"
            value={values.hexColorSecondary ?? "#f97316"}
            onChange={(e) => update("hexColorSecondary", e.target.value)}
            className="w-16 p-1"
          />
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`filament-price-${mode}`}>Adicional (R$)</Label>
        <Input
          id={`filament-price-${mode}`}
          type="number"
          step="0.01"
          value={values.priceModifierReais}
          onChange={(e) => update("priceModifierReais", Number(e.target.value))}
          className="w-28"
        />
      </div>
      <div className="flex gap-2">
        <Button type="button" disabled={isPending || !values.name.trim()} onClick={handleSubmit}>
          {isPending ? "Salvando..." : mode === "create" ? "Adicionar" : "Salvar"}
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
