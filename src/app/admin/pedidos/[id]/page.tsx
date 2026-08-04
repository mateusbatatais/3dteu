import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateOrderStatus } from "@/features/orders/actions";
import { getOrderByIdForAdmin } from "@/features/orders/queries";
import { ORDER_STATUS_LABELS } from "@/features/orders/types";
import { formatPriceCents } from "@/lib/format";

export default async function AdminPedidoPage({ params }: PageProps<"/admin/pedidos/[id]">) {
  const { id } = await params;

  const order = await getOrderByIdForAdmin(id);
  if (!order) notFound();

  const payment = order.payments[0];

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Pedido de {order.customerName}</h1>
        <Badge>{ORDER_STATUS_LABELS[order.status]}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {order.customerEmail} {order.customerPhone ? `· ${order.customerPhone}` : ""}
      </p>

      <div className="mt-6 rounded-lg border p-4">
        <h2 className="text-sm font-medium">Itens</h2>
        <ul className="mt-3 flex flex-col divide-y">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-center justify-between py-2">
              <div>
                <p>{item.productNameSnapshot}</p>
                <p className="text-sm text-muted-foreground">Quantidade: {item.quantity}</p>
              </div>
              <p>{formatPriceCents(item.subtotalCents)}</p>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between border-t pt-3 font-medium">
          <span>Total</span>
          <span>{formatPriceCents(order.totalCents)}</span>
        </div>
      </div>

      <div className="mt-6 rounded-lg border p-4">
        <h2 className="text-sm font-medium">Pagamento</h2>
        {payment ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Woovi · status: {payment.status} {payment.paidAt ? `· pago em ${payment.paidAt.toLocaleString("pt-BR")}` : ""}
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Nenhuma cobrança gerada ainda.</p>
        )}
      </div>

      <form action={updateOrderStatus.bind(null, order.id)} className="mt-6 flex items-end gap-3 rounded-lg border p-4">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="status" className="text-sm font-medium">
            Mudar status
          </label>
          <Select name="status" defaultValue={order.status}>
            <SelectTrigger id="status" className="w-full">
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
        <Button type="submit">Salvar</Button>
      </form>
    </div>
  );
}
