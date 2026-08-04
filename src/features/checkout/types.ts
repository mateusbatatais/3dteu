import type { ProductSelection } from "@/features/catalog/types";

export interface CartItem {
  productId: string;
  productSlug: string;
  productName: string;
  quantity: number;
  selection: ProductSelection;
  /** Resumo legível da configuração (ex.: "Tamanho M · Corpo: Azul/Laranja · Tampa: Azul"). */
  summary: string;
  /** Preço exibido no carrinho; sempre revalidado no servidor antes de gerar a cobrança. */
  estimatedUnitPriceCents: number;
}
