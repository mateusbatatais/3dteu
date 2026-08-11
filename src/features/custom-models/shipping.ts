import { getStoreSettings } from "@/features/shipping/queries";
import { superfreteProvider } from "@/features/shipping/superfrete";
import type { ShippingPackageItem, ShippingQuote } from "@/features/shipping/types";

import type { CustomModelRequest } from "./queries";

export interface CustomModelShippingResult {
  quotes: ShippingQuote[];
  error?: string;
}

/**
 * Não reaproveita `resolveShippingQuotes` (checkout/shipping-quotes.ts) —
 * aquela resolve por `productSlug` via `getProductBySlug`, que só enxerga
 * produtos "published"; o produto oculto do modelo customizado só passa a
 * existir quando o pedido é confirmado. Aqui o peso/dimensão já são
 * conhecidos direto na request (medidos no servidor), então monta o item de
 * frete sem precisar de nenhum produto.
 */
export async function getCustomModelShippingQuotes(
  request: Pick<CustomModelRequest, "weightGrams" | "widthMm" | "heightMm" | "depthMm">,
  zipCode: string,
): Promise<CustomModelShippingResult> {
  if (!request.weightGrams || !request.widthMm || !request.heightMm || !request.depthMm) {
    return { quotes: [], error: "Este modelo ainda não foi medido." };
  }

  try {
    const settings = await getStoreSettings();
    const originZipCode = settings?.zipCode ?? process.env.SUPERFRETE_ORIGIN_ZIP_CODE;
    if (!originZipCode) {
      return {
        quotes: [],
        error: "O frete ainda não está configurado pela loja. Escolha retirada em mãos por enquanto.",
      };
    }

    const packageItem: ShippingPackageItem = {
      weightGrams: Math.ceil(Number(request.weightGrams)),
      heightCm: Math.ceil(Number(request.heightMm) / 10),
      widthCm: Math.ceil(Number(request.widthMm) / 10),
      lengthCm: Math.ceil(Number(request.depthMm) / 10),
      quantity: 1,
    };

    const quotes = await superfreteProvider.getQuotes({
      originZipCode,
      destinationZipCode: zipCode,
      items: [packageItem],
    });
    return { quotes };
  } catch (error) {
    console.error("[superfrete] falha ao cotar frete de modelo customizado", error);
    return { quotes: [], error: "Não foi possível calcular o frete agora. Tente novamente em instantes." };
  }
}
