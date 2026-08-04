"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { updateOrderStatus } from "../actions";
import { ORDER_STATUS_LABELS, type OrderStatus } from "../types";

export function OrderStatusForm({ orderId, currentStatus }: { orderId: string; currentStatus: OrderStatus }) {
  const [status, setStatus] = useState<OrderStatus>(currentStatus);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const result = await updateOrderStatus(orderId, status);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Status atualizado.");
    });
  }

  return (
    <div className="mt-6 flex items-end gap-3 rounded-xl bg-card ring-1 ring-foreground/10 p-4">
      <div className="flex flex-1 flex-col gap-1.5">
        <label className="text-sm font-medium">Mudar status</label>
        <Select value={status} onValueChange={(value) => setStatus(value as OrderStatus)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="button" disabled={isPending} onClick={handleSave}>
        {isPending ? "Salvando..." : "Salvar"}
      </Button>
    </div>
  );
}
