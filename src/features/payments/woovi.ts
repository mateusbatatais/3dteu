import crypto from "node:crypto";

import type { CreateChargeInput, CreateChargeResult, PaymentProvider } from "./types";

const WOOVI_API_URL = "https://api.woovi.com/api/v1";

/**
 * Chave pública da Woovi para verificar a assinatura de webhooks (header
 * `x-webhook-signature`, RSA-SHA256). É a mesma para todos os merchants — só
 * serve para VERIFICAR, nunca para assinar — por isso é segura de deixar no
 * código-fonte, sem precisar de env var.
 * https://developers.woovi.com/docs/webhook/seguranca/webhook-signature-validation
 */
const WOOVI_WEBHOOK_PUBLIC_KEY_BASE64 =
  "LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0KTUlHZk1BMEdDU3FHU0liM0RRRUJBUVVBQTRHTkFEQ0JpUUtCZ1FDLytOdElranpldnZxRCtJM01NdjNiTFhEdApwdnhCalk0QnNSclNkY2EzcnRBd01jUllZdnhTbmQ3amFnVkxwY3RNaU94UU84aWVVQ0tMU1dIcHNNQWpPL3paCldNS2Jxb0c4TU5waS91M2ZwNnp6MG1jSENPU3FZc1BVVUcxOWJ1VzhiaXM1WloySVpnQk9iV1NwVHZKMGNuajYKSEtCQUE4MkpsbitsR3dTMU13SURBUUFCCi0tLS0tRU5EIFBVQkxJQyBLRVktLS0tLQo=";

interface WooviChargeResponse {
  charge: {
    transactionID?: string;
    identifier?: string;
    correlationID: string;
    status: string;
    qrCodeImage: string;
    brCode: string;
  };
}

export const wooviProvider: PaymentProvider = {
  name: "woovi",

  async createCharge(input: CreateChargeInput): Promise<CreateChargeResult> {
    const appId = process.env.WOOVI_APP_ID;
    if (!appId) {
      throw new Error("WOOVI_APP_ID não configurada — cadastre em Woovi > Configurações > Aplicações.");
    }

    const response = await fetch(`${WOOVI_API_URL}/charge`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Woovi não usa prefixo "Bearer": o AppID vai puro no header.
        Authorization: appId,
      },
      body: JSON.stringify({
        correlationID: input.orderId,
        value: input.amountCents,
        comment: `Pedido ${input.orderId.slice(0, 8)}`,
        customer: {
          name: input.customerName,
          email: input.customerEmail,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Falha ao criar cobrança na Woovi (${response.status}): ${body}`);
    }

    const data = (await response.json()) as WooviChargeResponse;

    return {
      externalId: data.charge.transactionID ?? data.charge.identifier ?? input.orderId,
      pixQrCode: data.charge.qrCodeImage,
      pixCopyPaste: data.charge.brCode,
    };
  },

  verifyWebhookSignature(rawBody, signature) {
    if (!signature) return false;

    try {
      const publicKey = Buffer.from(WOOVI_WEBHOOK_PUBLIC_KEY_BASE64, "base64").toString("ascii");
      const verifier = crypto.createVerify("sha256");
      verifier.write(Buffer.from(rawBody));
      verifier.end();
      return verifier.verify(publicKey, signature, "base64");
    } catch {
      return false;
    }
  },
};
