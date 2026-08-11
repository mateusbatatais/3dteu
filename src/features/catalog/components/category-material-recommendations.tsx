"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { updateCategoryRecommendedMaterialTypes } from "../category-actions";

interface MaterialTypeOption {
  id: string;
  name: string;
  materialName: string;
}

/**
 * Fase 1b do ROADMAP.md — marca quais Tipos de material são recomendados
 * pra produtos desta categoria. Só afeta o que vem marcado por padrão no
 * cadastro de produto (`NewProductForm`); nunca restringe quais cores o
 * admin pode escolher manualmente.
 */
export function CategoryMaterialRecommendations({
  categoryId,
  allMaterialTypes,
  recommendedTypeIds,
}: {
  categoryId: string;
  allMaterialTypes: MaterialTypeOption[];
  recommendedTypeIds: string[];
}) {
  const [selected, setSelected] = useState(() => new Set(recommendedTypeIds));
  const [isPending, startTransition] = useTransition();

  function toggle(typeId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(typeId)) next.delete(typeId);
      else next.add(typeId);
      return next;
    });
  }

  function handleSave() {
    startTransition(async () => {
      const result = await updateCategoryRecommendedMaterialTypes(categoryId, Array.from(selected));
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Materiais recomendados atualizados.");
    });
  }

  if (allMaterialTypes.length === 0) {
    return (
      <p className="mt-3 text-xs text-muted-foreground">
        Cadastre um material em /admin/materiais pra poder recomendar um pra esta categoria.
      </p>
    );
  }

  return (
    <div className="mt-3 border-t pt-3">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Materiais recomendados</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Vêm marcados por padrão ao cadastrar um produto nesta categoria — o admin ainda pode marcar outras cores na
        hora.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {allMaterialTypes.map((type) => {
          const isChecked = selected.has(type.id);
          return (
            <label
              key={type.id}
              className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                isChecked ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground"
              }`}
            >
              <input type="checkbox" checked={isChecked} onChange={() => toggle(type.id)} className="size-3.5" />
              {type.materialName} · {type.name}
            </label>
          );
        })}
      </div>
      <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={handleSave} className="mt-2">
        {isPending ? "Salvando..." : "Salvar recomendação"}
      </Button>
    </div>
  );
}
