"use client";

import { useState } from "react";

import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatPriceCents } from "@/lib/format";

import { deleteSizeOption, updateSizeOption } from "../actions";
import { SizeForm } from "./size-form";

interface SizeRowData {
  id: string;
  label: string;
  scaleFactor: string | number;
  priceModifierCents: number;
  weightModifierGrams: number;
}

export function SizeRow({ productId, size }: { productId: string; size: SizeRowData }) {
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <TableRow>
        <TableCell colSpan={5}>
          <SizeForm
            mode="edit"
            initialValues={{
              label: size.label,
              scaleFactor: Number(size.scaleFactor),
              priceModifierReais: size.priceModifierCents / 100,
              weightModifierGrams: size.weightModifierGrams,
            }}
            onSubmit={(input) => updateSizeOption(productId, size.id, input)}
            onCancel={() => setIsEditing(false)}
          />
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{size.label}</TableCell>
      <TableCell>{size.scaleFactor}x</TableCell>
      <TableCell>{formatPriceCents(size.priceModifierCents)}</TableCell>
      <TableCell>
        {size.weightModifierGrams >= 0 ? "+" : ""}
        {size.weightModifierGrams}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setIsEditing(true)}>
            Editar
          </Button>
          <ConfirmDeleteButton
            action={deleteSizeOption.bind(null, productId, size.id)}
            description={`Excluir o tamanho "${size.label}"? Pedidos já feitos não são afetados.`}
          />
        </div>
      </TableCell>
    </TableRow>
  );
}
