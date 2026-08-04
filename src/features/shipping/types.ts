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

export interface ShippingParty {
  name: string;
  address: ShippingAddress;
  /** CPF/CNPJ e telefone só são exigidos do remetente (a loja), não do destinatário. */
  document?: string;
  phone?: string;
}

export interface PurchaseLabelInput {
  origin: ShippingParty;
  destination: ShippingParty;
  serviceId: string;
  items: ShippingPackageItem[];
}

export interface PurchaseLabelResult {
  externalId: string;
  trackingCode: string;
  labelUrl: string;
  /** Resposta bruta da transportadora, guardada em `shipments.rawPayload` para auditoria. */
  raw: unknown;
}

/**
 * Contrato para o cálculo de frete e emissão de etiqueta. Fase 1: só
 * "pickup" (retirada em mãos, custo zero, sem passar por aqui). Fase 2:
 * SuperfreteShippingProvider (`superfrete.ts`) chama a API real da
 * Superfrete.
 */
export interface ShippingProvider {
  getQuotes(params: {
    originZipCode: string;
    destinationZipCode: string;
    items: ShippingPackageItem[];
  }): Promise<ShippingQuote[]>;
  /** Compra o frete de verdade (gasta saldo real) — só deve ser chamado a
   * partir de um clique explícito do admin, nunca automaticamente. */
  purchaseLabel(input: PurchaseLabelInput): Promise<PurchaseLabelResult>;
}
