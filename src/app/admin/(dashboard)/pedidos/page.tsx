import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAllOrdersForAdmin } from "@/features/orders/queries";
import { ORDER_STATUS_BADGE_CLASSES, ORDER_STATUS_LABELS } from "@/features/orders/types";
import { formatPriceCents } from "@/lib/format";

export default async function AdminPedidosPage() {
  const orderList = await getAllOrdersForAdmin();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Pedidos</h1>

      {orderList.length === 0 ? (
        <p className="mt-6 text-muted-foreground">Nenhum pedido ainda.</p>
      ) : (
        <Table className="mt-6">
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orderList.map((order) => (
              <TableRow key={order.id}>
                <TableCell>
                  <p className="font-medium">{order.customerName}</p>
                  <p className="text-sm text-muted-foreground">{order.customerEmail}</p>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={ORDER_STATUS_BADGE_CLASSES[order.status]}>
                    {ORDER_STATUS_LABELS[order.status]}
                  </Badge>
                </TableCell>
                <TableCell>{formatPriceCents(order.totalCents)}</TableCell>
                <TableCell>{order.createdAt.toLocaleDateString("pt-BR")}</TableCell>
                <TableCell className="text-right">
                  <Link href={`/admin/pedidos/${order.id}`} className="text-sm underline-offset-2 hover:underline">
                    Ver
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
