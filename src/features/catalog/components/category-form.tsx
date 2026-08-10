"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { slugify } from "@/lib/slugify";

import type { CategoryActionResult, CategoryInput } from "../category-actions";

const EMPTY_VALUES: CategoryInput = { name: "", slug: "", description: "" };

export function CategoryForm({
  mode,
  initialValues,
  onSubmit,
  onCancel,
}: {
  mode: "create" | "edit";
  initialValues?: CategoryInput;
  onSubmit: (input: CategoryInput) => Promise<CategoryActionResult>;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<CategoryInput>(initialValues ?? EMPTY_VALUES);
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof CategoryInput>(key: K, value: CategoryInput[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleNameChange(name: string) {
    update("name", name);
    if (!slugTouched) update("slug", slugify(name));
  }

  function handleSubmit() {
    startTransition(async () => {
      const result = await onSubmit(values);
      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(mode === "create" ? "Categoria criada." : "Categoria atualizada.");
      if (mode === "create") {
        setValues(EMPTY_VALUES);
        setSlugTouched(false);
      } else {
        onCancel?.();
      }
    });
  }

  return (
    <div className="flex max-w-2xl flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor={`category-name-${mode}`}>Nome</Label>
          <Input
            id={`category-name-${mode}`}
            value={values.name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Decoração"
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor={`category-slug-${mode}`}>Slug</Label>
          <Input
            id={`category-slug-${mode}`}
            value={values.slug}
            onChange={(e) => {
              setSlugTouched(true);
              update("slug", e.target.value);
            }}
            placeholder="decoracao"
          />
          <p className="text-xs text-muted-foreground">Usado na URL: /categorias/seu-slug</p>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`category-description-${mode}`}>Descrição (opcional)</Label>
        <Textarea
          id={`category-description-${mode}`}
          rows={2}
          value={values.description}
          onChange={(e) => update("description", e.target.value)}
          placeholder="Aparece no topo da página da categoria e ajuda no SEO."
        />
      </div>
      <div className="flex gap-2">
        <Button type="button" disabled={isPending || !values.name.trim() || !values.slug.trim()} onClick={handleSubmit}>
          {isPending ? "Salvando..." : mode === "create" ? "Adicionar categoria" : "Salvar"}
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
