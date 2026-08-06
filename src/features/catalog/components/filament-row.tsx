"use client";

import { useState } from "react";

import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { deleteFilament, updateFilament } from "@/features/catalog/filament-actions";
import { formatPriceCents } from "@/lib/format";

import type { FilamentOption } from "../types";
import { FILAMENT_TYPE_LABELS, FilamentForm } from "./filament-form";

export function FilamentRow({ material }: { material: FilamentOption }) {
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <TableRow>
        <TableCell colSpan={5}>
          <FilamentForm
            mode="edit"
            initialValues={{
              name: material.name,
              type: material.type,
              hexColor: material.hexColor ?? "#2563eb",
              hexColorSecondary: material.hexColorSecondary ?? "#f97316",
              priceModifierReais: material.priceModifierCents / 100,
            }}
            onSubmit={(input) => updateFilament(material.id, input)}
            onCancel={() => setIsEditing(false)}
          />
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell>
        <span
          className="inline-block size-6 rounded-full border"
          style={{
            background: material.hexColorSecondary
              ? `linear-gradient(135deg, ${material.hexColor} 50%, ${material.hexColorSecondary} 50%)`
              : (material.hexColor ?? "#a1a1aa"),
          }}
        />
      </TableCell>
      <TableCell className="font-medium">{material.name}</TableCell>
      <TableCell>{FILAMENT_TYPE_LABELS[material.type]}</TableCell>
      <TableCell>{formatPriceCents(material.priceModifierCents)}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setIsEditing(true)}>
            Editar
          </Button>
          <ConfirmDeleteButton
            action={deleteFilament.bind(null, material.id)}
            description={`Excluir o material "${material.name}"? Produtos que usam esse material podem ficar sem opção de cor.`}
          />
        </div>
      </TableCell>
    </TableRow>
  );
}
