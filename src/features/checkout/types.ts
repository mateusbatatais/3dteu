import type { ProductSelection } from "@/features/catalog/types";
import type { DeliveryMethod, ShippingAddress } from "@/features/shipping/types";

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

export interface CheckoutInput {
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  deliveryMethod: DeliveryMethod;
  shippingAddress?: ShippingAddress;
  items: CartItem[];
}
