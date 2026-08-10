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

interface ConfirmDeleteButtonProps {
  /**
   * Server action já com os ids fixados via `.bind(null, ...)` — sem
   * argumentos restantes. Pode devolver `{ error }` (ex.: bloqueado por uma
   * restrição de FK) pra mostrar um motivo específico em vez do genérico
   * "não foi possível excluir" — nesse caso o diálogo continua aberto.
   */
  action: () => Promise<void | { error?: string }> | void | { error?: string };
  description: string;
  label?: string;
  className?: string;
}

// Substitui os antigos `<form action={...}><button>Excluir</button></form>`
// crus (sem nenhuma confirmação) espalhados pelo admin — exclusão de
// material/parte/tamanho/imagem agora pede confirmação antes de disparar a action.
export function ConfirmDeleteButton({ action, description, label = "Excluir", className }: ConfirmDeleteButtonProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      try {
        const result = await action();
        if (result && "error" in result && result.error) {
          toast.error(result.error);
          return;
        }
        setOpen(false);
        toast.success("Excluído.");
      } catch {
        toast.error("Não foi possível excluir. Tente novamente.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button type="button" variant="ghost" size="sm" className={className} />}
      >
        {label}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar exclusão</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
          <Button type="button" variant="destructive" disabled={isPending} onClick={handleConfirm}>
            {isPending ? "Excluindo..." : "Excluir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
