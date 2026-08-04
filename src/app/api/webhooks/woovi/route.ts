import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { wooviProvider } from "@/features/payments/woovi";
import { db } from "@/server/db/client";
import { orders, payments } from "@/server/db/schema";

interface WooviWebhookPayload {
  charge?: {
    correlationID: string;
    status: string;
  };
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-webhook-signature");

  if (!wooviProvider.verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as WooviWebhookPayload;
  const charge = payload.charge;

  if (!charge?.correlationID) {
    return NextResponse.json({ error: "payload sem correlationID" }, { status: 400 });
  }

  // O correlationID enviado na criação da cobrança é o próprio id do pedido.
  const orderId = charge.correlationID;

  if (charge.status === "COMPLETED") {
    await db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({ status: "paid", updatedAt: new Date() })
        // só avança se ainda estiver aguardando pagamento — evita um webhook
        // atrasado/duplicado regredir um pedido que já avançou de status
        .where(and(eq(orders.id, orderId), eq(orders.status, "awaiting_payment")));

      await tx
        .update(payments)
        .set({ status: "paid", paidAt: new Date(), rawWebhookPayload: payload })
        .where(eq(payments.orderId, orderId));
    });
  }

  return NextResponse.json({ received: true });
}
