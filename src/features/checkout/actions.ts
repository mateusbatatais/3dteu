"use server";

import { calculateProductPriceCents, InvalidSelectionError } from "@/features/catalog/pricing";
import { getProductBySlug } from "@/features/catalog/queries";
import { sendOrderConfirmationEmail } from "@/features/orders/email";
import { wooviProvider } from "@/features/payments/woovi";
import type { DeliveryMethod, ShippingAddress } from "@/features/shipping/types";
import { db } from "@/server/db/client";
import { orderItems, orders, payments } from "@/server/db/schema";

import { resolveShippingQuotes } from "./shipping-quotes";
import type { CartItem } from "./types";

export interface SubmitOrderInput {
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  deliveryMethod: DeliveryMethod;
  /** Obrigatório quando deliveryMethod === "superfrete". */
  shippingAddress?: ShippingAddress;
  /** Id do serviço escolhido entre as opções de `getShippingQuotes` — o preço
   * nunca vem do cliente, é sempre re-buscado aqui a partir deste id. */
  shippingServiceId?: string;
  items: CartItem[];
}

export async function getShippingQuotes(zipCode: string, items: CartItem[]) {
  return resolveShippingQuotes(zipCode, items);
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

  let shippingCostCents = 0;
  let shippingCarrierName: string | null = null;
  let shippingServiceId: string | null = null;
  let shippingAddress: ShippingAddress | null = null;

  if (input.deliveryMethod === "superfrete") {
    if (!input.shippingAddress || !input.shippingServiceId) {
      return { error: "Preencha o endereço de entrega e escolha uma opção de frete." };
    }

    // Nunca confia no preço/transportadora vindo do cliente — re-cota com o
    // mesmo endereço e itens, e só aceita o serviceId escolhido se ele ainda
    // existir na resposta (preço pode ter mudado desde que o cliente cotou).
    const { quotes, error } = await resolveShippingQuotes(input.shippingAddress.zipCode, input.items);
    if (error) return { error };

    const quote = quotes.find((q) => q.serviceId === input.shippingServiceId);
    if (!quote) {
      return { error: "A opção de frete escolhida não está mais disponível. Calcule o frete de novo." };
    }

    shippingCostCents = quote.priceCents;
    shippingCarrierName = quote.carrierName;
    shippingServiceId = quote.serviceId;
    shippingAddress = input.shippingAddress;
  }

  const totalCents = resolvedItems.reduce((sum, item) => sum + item.subtotalCents, 0) + shippingCostCents;

  const [order] = await db
    .insert(orders)
    .values({
      customerName: input.customerName.trim(),
      customerEmail: input.customerEmail.trim(),
      customerPhone: input.customerPhone?.trim() || null,
      deliveryMethod: input.deliveryMethod,
      shippingAddress,
      shippingCostCents,
      shippingCarrierName,
      shippingServiceId,
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
