"use server";

import { calculateProductPriceCents, InvalidSelectionError } from "@/features/catalog/pricing";
import { getProductBySlug } from "@/features/catalog/queries";
import { sendOrderConfirmationEmail } from "@/features/orders/email";
import { wooviProvider } from "@/features/payments/woovi";
import { db } from "@/server/db/client";
import { orderItems, orders, payments } from "@/server/db/schema";

import type { CartItem } from "./types";

export interface SubmitOrderInput {
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  items: CartItem[];
}

export interface SubmitOrderResult {
  error?: string;
  orderToken?: string;
}

export async function submitOrder(input: SubmitOrderInput): Promise<SubmitOrderResult> {
  if (!input.customerName.trim() || !input.customerEmail.trim()) {
    return { error: "Preencha nome e e-mail." };
  }
  if (input.items.length === 0) {
    return { error: "Seu carrinho está vazio." };
  }

  // Recalcula tudo a partir do catálogo atual — nunca confia no preço vindo do
  // carrinho do cliente (que é só uma estimativa exibida na UI).
  const resolvedItems: Array<{
    productId: string;
    productNameSnapshot: string;
    quantity: number;
    configuration: CartItem["selection"];
    unitPriceCents: number;
    subtotalCents: number;
  }> = [];

  for (const item of input.items) {
    const product = await getProductBySlug(item.productSlug);
    if (!product) {
      return { error: `O produto "${item.productName}" não está mais disponível.` };
    }

    let unitPriceCents: number;
    try {
      unitPriceCents = calculateProductPriceCents(product, item.selection);
    } catch (error) {
      if (error instanceof InvalidSelectionError) return { error: error.message };
      throw error;
    }

    resolvedItems.push({
      productId: product.id,
      productNameSnapshot: product.name,
      quantity: item.quantity,
      configuration: item.selection,
      unitPriceCents,
      subtotalCents: unitPriceCents * item.quantity,
    });
  }

  // Fase 1: só retirada em mãos (Superfrete entra na Fase 2).
  const shippingCostCents = 0;
  const totalCents = resolvedItems.reduce((sum, item) => sum + item.subtotalCents, 0) + shippingCostCents;

  const [order] = await db
    .insert(orders)
    .values({
      customerName: input.customerName.trim(),
      customerEmail: input.customerEmail.trim(),
      customerPhone: input.customerPhone?.trim() || null,
      deliveryMethod: "pickup",
      shippingAddress: null,
      shippingCostCents,
      totalCents,
    })
    .returning();

  await db.insert(orderItems).values(
    resolvedItems.map((item) => ({
      orderId: order.id,
      productId: item.productId,
      productNameSnapshot: item.productNameSnapshot,
      quantity: item.quantity,
      configuration: item.configuration,
      unitPriceCents: item.unitPriceCents,
      subtotalCents: item.subtotalCents,
    })),
  );

  // Gerar a cobrança Pix é "best effort": se a Woovi não estiver configurada
  // ou a chamada falhar, o pedido já foi criado normalmente — a página de
  // rastreio mostra que o pagamento ainda não foi gerado nesse caso.
  try {
    const charge = await wooviProvider.createCharge({
      orderId: order.id,
      amountCents: totalCents,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
    });

    await db.insert(payments).values({
      orderId: order.id,
      provider: "woovi",
      externalId: charge.externalId,
      pixQrCode: charge.pixQrCode,
      pixCopyPaste: charge.pixCopyPaste,
      status: "pending",
    });
  } catch (error) {
    console.error("[woovi] falha ao gerar cobrança para o pedido", order.id, error);
  }

  // Mesma lógica de "best effort": um e-mail que falha não deve derrubar o pedido já criado.
  try {
    await sendOrderConfirmationEmail({
      customerEmail: order.customerEmail,
      customerName: order.customerName,
      orderToken: order.publicToken,
      totalCents: order.totalCents,
    });
  } catch (error) {
    console.error("[resend] falha ao enviar e-mail de confirmação do pedido", order.id, error);
  }

  return { orderToken: order.publicToken };
}
