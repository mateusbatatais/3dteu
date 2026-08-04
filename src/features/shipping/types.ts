export type DeliveryMethod = "pickup" | "superfrete";

export interface ShippingAddress {
  recipientName: string;
  zipCode: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
}

export interface ShippingQuote {
  /** Id do serviço na Superfrete (ex.: "1" = PAC, "2" = SEDEX) — guardado no
   * pedido pra poder re-cotar o mesmo serviço na hora de comprar a etiqueta. */
  serviceId: string;
  carrierName: string;
  priceCents: number;
  estimatedDays: number;
}

/** Um item de carrinho já resolvido em peso/dimensão reais do catálogo. */
export interface ShippingPackageItem {
  weightGrams: number;
  heightCm: number;
  widthCm: number;
  lengthCm: number;
  quantity: number;
}

/**
 * Contrato para o cálculo de frete. Fase 1: só "pickup" (retirada em mãos,
 * custo zero, sem passar por aqui). Fase 2: SuperfreteShippingProvider
 * (`superfrete.ts`) chama a API real da Superfrete para cotação.
 */
export interface ShippingProvider {
  getQuotes(params: {
    originZipCode: string;
    destinationZipCode: string;
    items: ShippingPackageItem[];
  }): Promise<ShippingQuote[]>;
}
