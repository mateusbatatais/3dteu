"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MaterialActionResult, MaterialDeletionReplacement } from "@/features/catalog/material-actions";
import type { MaterialColorDeletionImpactRow } from "@/features/catalog/queries";

// Mesmo sentinel já usado em part-regions-panel.tsx pra "nenhum" num Select
// (Base UI não aceita value="" como opção real).
const NO_DEFAULT_VALUE = "__none__";

function rowKey(row: Pick<MaterialColorDeletionImpactRow, "kind" | "id">): string {
  return `${row.kind}:${row.id}`;
}

/**
 * Confirmação de exclusão de Material/Tipo/Cor que checa, antes de excluir,
 * se alguma peça/região de produto usa isso como material PADRÃO — se usar,
 * pede pra escolher o substituto em vez de zerar o padrão em silêncio
 * (decisão do usuário: "deixa excluir e remove do produto. se for a cor
 * padrao, pergunta por qual cor deve substituir").
 */
export function ConfirmDeleteMaterialButton({
  label,
  itemDescription,
  checkImpact,
  onConfirm,
}: {
  label: string;
  /** Ex.: `a cor "Azul"`, `o tipo "PLA"`, `o material "Resina"`. */
  itemDescription: string;
  checkImpact: () => Promise<MaterialColorDeletionImpactRow[]>;
  onConfirm: (replacements: MaterialDeletionReplacement[]) => Promise<MaterialActionResult>;
}) {
  const [open, setOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [impact, setImpact] = useState<MaterialColorDeletionImpactRow[] | null>(null);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    setError(null);
    if (!nextOpen || impact !== null) return;

    setIsChecking(true);
    checkImpact()
      .then((rows) => {
        setImpact(rows);
        setChoices(
          Object.fromEntries(rows.map((row) => [rowKey(row), row.remainingColors[0]?.id ?? NO_DEFAULT_VALUE])),
        );
      })
      .finally(() => setIsChecking(false));
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const replacements: MaterialDeletionReplacement[] = (impact ?? []).map((row) => ({
        kind: row.kind,
        id: row.id,
        newDefaultColorId: (() => {
          const chosen = choices[rowKey(row)];
          return chosen && chosen !== NO_DEFAULT_VALUE ? chosen : null;
        })(),
      }));

      const result = await onConfirm(replacements);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setImpact(null);
      toast.success("Excluído.");
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button type="button" variant="ghost" size="sm" />}>{label}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar exclusão</DialogTitle>
          <DialogDescription>Excluir {itemDescription}?</DialogDescription>
        </DialogHeader>

        {isChecking ? (
          <p className="text-sm text-muted-foreground">Verificando uso em produtos...</p>
        ) : impact && impact.length > 0 ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Isso é o material padrão em {impact.length} {impact.length === 1 ? "lugar" : "lugares"}. Escolha o que
              vira o novo padrão em cada um (ou deixe sem padrão):
            </p>
            <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
              {impact.map((row) => (
                <div key={rowKey(row)} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate" title={`${row.productName} · ${row.label}`}>
                    {row.productName} · {row.label}
                  </span>
                  <Select
                    value={choices[rowKey(row)] ?? NO_DEFAULT_VALUE}
                    onValueChange={(value) =>
                      setChoices((prev) => ({ ...prev, [rowKey(row)]: value ?? NO_DEFAULT_VALUE }))
                    }
                  >
                    <SelectTrigger className="w-40 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_DEFAULT_VALUE}>Sem padrão</SelectItem>
                      {row.remainingColors.map((color) => (
                        <SelectItem key={color.id} value={color.id}>
                          {color.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
          <Button type="button" variant="destructive" disabled={isPending || isChecking} onClick={handleConfirm}>
            {isPending ? "Excluindo..." : "Excluir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
