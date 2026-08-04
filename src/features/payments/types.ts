export type PaymentProviderName = "woovi" | "asaas";

export interface CreateChargeInput {
  orderId: string;
  amountCents: number;
  customerName: string;
  customerEmail: string;
}

export interface CreateChargeResult {
  externalId: string;
  pixQrCode: string;
  pixCopyPaste: string;
}

export type PaymentStatus = "pending" | "paid" | "expired" | "failed" | "refunded";

/**
 * Contrato comum a qualquer provedor de pagamento. A Fase 1 implementa só
 * WooviProvider (Pix); AsaasProvider (cartão/boleto) entra depois sem exigir
 * mudanças no fluxo de checkout, que depende apenas desta interface.
 */
export interface PaymentProvider {
  name: PaymentProviderName;
  createCharge(input: CreateChargeInput): Promise<CreateChargeResult>;
  /** Valida a assinatura do webhook antes de processar a notificação de pagamento. */
  verifyWebhookSignature(rawBody: string, signature: string | null): boolean;
}
