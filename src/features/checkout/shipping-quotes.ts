import { getProductBySlug } from "@/features/catalog/queries";
import { getStoreSettings } from "@/features/shipping/queries";
import { superfreteProvider } from "@/features/shipping/superfrete";
import type { ShippingPackageItem, ShippingQuote } from "@/features/shipping/types";

import type { CartItem } from "./types";

// Fallback usado quando o produto ainda não tem peso/dimensão cadastrados
// no admin (campos novos, produtos antigos ficam null) — caixa pequena
// genérica, só pra cotação não quebrar até o admin preencher os valores reais.
const DEFAULT_PACKAGE_WEIGHT_GRAMS = 300;
const DEFAULT_PACKAGE_HEIGHT_CM = 4;
const DEFAULT_PACKAGE_WIDTH_CM = 12;
const DEFAULT_PACKAGE_LENGTH_CM = 16;

export interface ResolvedShippingQuotes {
  quotes: ShippingQuote[];
  error?: string;
}

/**
 * Busca os produtos reais do catálogo pra montar peso/dimensão (nunca confia
 * no que vier do cliente) e cota o frete. Usado tanto pela action pública
 * `getShippingQuotes` (mostra opções no checkout) quanto por `submitOrder`
 * (re-cota no servidor antes de gravar o pedido).
 */
export async function resolveShippingQuotes(
  zipCode: string,
  items: CartItem[],
): Promise<ResolvedShippingQuotes> {
  if (items.length === 0) return { quotes: [] };

  // Tudo aqui dentro (banco + Superfrete) é best-effort: qualquer falha vira
  // uma mensagem clara em vez de derrubar o checkout — mesmo princípio já
  // usado pra Woovi/Resend.
  try {
    const settings = await getStoreSettings();
    const originZipCode = settings?.zipCode ?? process.env.SUPERFRETE_ORIGIN_ZIP_CODE;
    if (!originZipCode) {
      return {
        quotes: [],
        error: "O frete ainda não está configurado pela loja. Escolha retirada em mãos por enquanto.",
      };
    }

    const packageItems: ShippingPackageItem[] = [];
    for (const item of items) {
      const product = await getProductBySlug(item.productSlug);
      if (!product) {
        return { quotes: [], error: `O produto "${item.productName}" não está mais disponível.` };
      }
      const size = product.sizeOptions.find((option) => option.id === item.selection.sizeId);

      packageItems.push({
        weightGrams: (product.weightGrams ?? DEFAULT_PACKAGE_WEIGHT_GRAMS) + (size?.weightModifierGrams ?? 0),
        heightCm: product.heightCm ?? DEFAULT_PACKAGE_HEIGHT_CM,
        widthCm: product.widthCm ?? DEFAULT_PACKAGE_WIDTH_CM,
        lengthCm: product.lengthCm ?? DEFAULT_PACKAGE_LENGTH_CM,
        quantity: item.quantity,
      });
    }

    const quotes = await superfreteProvider.getQuotes({
      originZipCode,
      destinationZipCode: zipCode,
      items: packageItems,
    });
    return { quotes };
  } catch (error) {
    console.error("[superfrete] falha ao cotar frete", error);
    return { quotes: [], error: "Não foi possível calcular o frete agora. Tente novamente em instantes." };
  }
}
