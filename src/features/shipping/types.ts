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
  carrierName: string;
  priceCents: number;
  estimatedDays: number;
}

/**
 * Contrato para o cálculo de frete. Fase 1: só "pickup" (retirada em mãos,
 * custo zero). Fase 2: implementar SuperfreteShippingProvider chamando a
 * API do Superfrete para cotação e emissão de etiqueta.
 */
export interface ShippingProvider {
  getQuotes(destinationZipCode: string, weightGrams: number): Promise<ShippingQuote[]>;
}
