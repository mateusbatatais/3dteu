"use server";

import { revalidatePath } from "next/cache";

import { getProductByIdForAdmin } from "@/features/catalog/queries";
import { getOrderByIdForAdmin } from "@/features/orders/queries";
import { db } from "@/server/db/client";
import { shipments, storeSettings } from "@/server/db/schema";

import {
  DEFAULT_PACKAGE_HEIGHT_CM,
  DEFAULT_PACKAGE_LENGTH_CM,
  DEFAULT_PACKAGE_WEIGHT_GRAMS,
  DEFAULT_PACKAGE_WIDTH_CM,
} from "./constants";
import { getStoreSettings } from "./queries";
import { storeSettingsSchema, type StoreSettingsFormValues } from "./schemas";
import { superfreteProvider } from "./superfrete";
import type { ShippingAddress, ShippingPackageItem } from "./types";

export interface ActionResult {
  error?: string;
}

export async function updateStoreSettings(values: StoreSettingsFormValues): Promise<ActionResult> {
  const parsed = storeSettingsSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  // Campos *Reais são do formulário (reais) — a tabela guarda centavos, como
  // todo valor monetário do projeto; 0 vira null ("ainda não configurado"),
  // mesmo padrão de weightGrams etc. em catalog/actions.ts.
  const {
    fixedFeeReais,
    energyPriceReaisPerKwh,
    printerPowerWatts,
    profitMarginPercent,
    customModelFeeReais,
    ...addressFields
  } = parsed.data;
  const row = {
    ...addressFields,
    fixedFeeCents: fixedFeeReais > 0 ? Math.round(fixedFeeReais * 100) : null,
    energyPriceCentsPerKwh: energyPriceReaisPerKwh > 0 ? Math.round(energyPriceReaisPerKwh * 100) : null,
    printerPowerWatts: printerPowerWatts > 0 ? Math.round(printerPowerWatts) : null,
    profitMarginPercent: profitMarginPercent > 0 ? profitMarginPercent.toString() : null,
    customModelFeeCents: customModelFeeReais > 0 ? Math.round(customModelFeeReais * 100) : null,
  };

  await db
    .insert(storeSettings)
    .values({ id: "default", ...row })
    .onConflictDoUpdate({
      target: storeSettings.id,
      set: { ...row, updatedAt: new Date() },
    });

  revalidatePath("/admin/configuracoes");
  return {};
}

/**
 * Compra a etiqueta de verdade na Superfrete — gasta saldo real da carteira.
 * Só deve ser chamada a partir de um clique explícito do admin (nunca
 * automático); esse clique É a confirmação humana antes do gasto.
 */
export async function purchaseShippingLabel(orderId: string): Promise<ActionResult> {
  const order = await getOrderByIdForAdmin(orderId);
  if (!order) return { error: "Pedido não encontrado." };
  if (order.deliveryMethod !== "superfrete") {
    return { error: "Este pedido não usa envio pela Superfrete." };
  }
  if (order.shipment) {
    return { error: "Este pedido já tem uma etiqueta comprada." };
  }
  if (!order.shippingAddress || !order.shippingServiceId) {
    return { error: "Pedido sem endereço ou serviço de frete definido." };
  }

  const settings = await getStoreSettings();
  if (!settings?.senderName || !settings.senderDocument || !settings.senderPhone || !settings.zipCode) {
    return { error: "Configure o endereço de remetente em /admin/configuracoes antes de comprar etiquetas." };
  }

  const originAddress: ShippingAddress = {
    recipientName: settings.senderName,
    zipCode: settings.zipCode,
    street: settings.street ?? "",
    number: settings.number ?? "",
    complement: settings.complement ?? undefined,
    neighborhood: settings.neighborhood ?? "",
    city: settings.city ?? "",
    state: settings.state ?? "",
  };

  const packageItems: ShippingPackageItem[] = [];
  for (const item of order.items) {
    const product = await getProductByIdForAdmin(item.productId);
    if (!product) {
      return { error: `O produto do item "${item.productNameSnapshot}" não existe mais.` };
    }
    packageItems.push({
      weightGrams: product.weightGrams ?? DEFAULT_PACKAGE_WEIGHT_GRAMS,
      heightCm: product.heightCm ?? DEFAULT_PACKAGE_HEIGHT_CM,
      widthCm: product.widthCm ?? DEFAULT_PACKAGE_WIDTH_CM,
      lengthCm: product.lengthCm ?? DEFAULT_PACKAGE_LENGTH_CM,
      quantity: item.quantity,
    });
  }

  try {
    const result = await superfreteProvider.purchaseLabel({
      origin: {
        name: settings.senderName,
        document: settings.senderDocument,
        phone: settings.senderPhone,
        address: originAddress,
      },
      destination: {
        name: order.customerName,
        address: order.shippingAddress as ShippingAddress,
      },
      serviceId: order.shippingServiceId,
      items: packageItems,
    });

    await db.insert(shipments).values({
      orderId: order.id,
      externalId: result.externalId,
      trackingCode: result.trackingCode,
      labelUrl: result.labelUrl,
      status: "purchased",
      rawPayload: result.raw,
      purchasedAt: new Date(),
    });

    revalidatePath(`/admin/pedidos/${orderId}`);
    return {};
  } catch (error) {
    console.error("[superfrete] falha ao comprar etiqueta pro pedido", orderId, error);
    return { error: "Falha ao comprar a etiqueta na Superfrete. Tente novamente em instantes." };
  }
}
