import Image from "next/image";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { ORDER_STATUS_LABELS } from "@/features/orders/types";
import { getOrderByToken } from "@/features/orders/queries";
import type { ShippingAddress } from "@/features/shipping/types";
import { formatPriceCents } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PedidoPage({ params }: PageProps<"/pedido/[token]">) {
  const { token } = await params;

  const order = await getOrderByToken(token);
  if (!order) notFound();

  const payment = order.payments[0];
  const shippingAddress = order.shippingAddress as ShippingAddress | null;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Pedido</h1>
      <p className="mt-1 text-sm text-muted-foreground">Feito por {order.customerName}</p>

      <div className="mt-6 flex items-center gap-3">
        <Badge>{ORDER_STATUS_LABELS[order.status]}</Badge>
        <span className="text-sm text-muted-foreground">
          {order.deliveryMethod === "pickup" ? "Retirada em mãos" : `Envio · ${order.shippingCarrierName ?? "Superfrete"}`}
        </span>
      </div>

      {shippingAddress ? (
        <div className="mt-4 rounded-xl bg-card p-4 text-sm ring-1 ring-foreground/10">
          <p className="font-medium">Endereço de entrega</p>
          <p className="mt-1 text-muted-foreground">
            {shippingAddress.street}, {shippingAddress.number}
            {shippingAddress.complement ? ` - ${shippingAddress.complement}` : ""}
            <br />
            {shippingAddress.neighborhood} · {shippingAddress.city}/{shippingAddress.state} · CEP{" "}
            {shippingAddress.zipCode}
          </p>
        </div>
      ) : null}

      <ul className="mt-6 flex flex-col divide-y rounded-xl bg-card ring-1 ring-foreground/10">
        {order.items.map((item) => (
          <li key={item.id} className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium">{item.productNameSnapshot}</p>
              <p className="text-sm text-muted-foreground">Quantidade: {item.quantity}</p>
            </div>
            <p className="font-medium">{formatPriceCents(item.subtotalCents)}</p>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-col gap-1 border-t pt-4">
        {order.shippingCostCents > 0 ? (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Frete</span>
            <span>{formatPriceCents(order.shippingCostCents)}</span>
          </div>
        ) : null}
        <div className="flex items-center justify-between">
          <span className="text-lg font-semibold">Total</span>
          <span className="text-lg font-semibold">{formatPriceCents(order.totalCents)}</span>
        </div>
      </div>

      {order.status === "awaiting_payment" ? (
        payment?.pixQrCode ? (
          <div className="mt-8 flex flex-col items-center gap-3 rounded-xl bg-card ring-1 ring-foreground/10 p-6 text-center">
            <p className="font-medium">Pague com Pix pra confirmar o pedido</p>
            <Image src={payment.pixQrCode} alt="QR code Pix" width={220} height={220} unoptimized />
            <p className="w-full break-all rounded bg-muted p-2 text-xs">{payment.pixCopyPaste}</p>
            <p className="text-xs text-muted-foreground">Depois de pagar, atualize esta página para ver a confirmação.</p>
          </div>
        ) : (
          <p className="mt-8 rounded-xl bg-card ring-1 ring-foreground/10 p-4 text-sm text-muted-foreground">
            Seu pedido foi registrado, mas a cobrança Pix ainda não foi gerada. Em breve entraremos em contato
            com as instruções de pagamento.
          </p>
        )
      ) : null}
    </main>
  );
}
