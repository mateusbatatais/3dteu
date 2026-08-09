import type { ShippingAddress, ShippingParty, ShippingProvider } from "./types";

// Implementado contra a documentação pública (developers.superfrete.com),
// mas sem um token real pra testar — igual aconteceu com a Woovi (ver
// CLAUDE.md). Se o formato de request/response não bater no primeiro teste
// de verdade, este arquivo é o único lugar a mexer; o resto do checkout/admin
// só conhece a interface `ShippingProvider`.
const SUPERFRETE_API_BASE = "https://api.superfrete.com/api/v0";

interface SuperfreteQuoteResponseItem {
  id: number | string;
  name: string;
  price: string | number;
  delivery_time?: number;
  error?: string;
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function authHeaders(token: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    // A Superfrete exige identificar a aplicação chamadora no User-Agent.
    "User-Agent": "3D Teu (3dteu.vercel.app)",
  };
}

function requireToken(): string {
  const token = process.env.SUPERFRETE_API_TOKEN;
  if (!token) {
    throw new Error("SUPERFRETE_API_TOKEN não configurada — cadastre em superfrete.com > Integrações.");
  }
  return token;
}

function addressPayload(party: ShippingParty, address: ShippingAddress) {
  return {
    name: party.name,
    document: party.document,
    phone: party.phone,
    address: address.street,
    number: address.number,
    complement: address.complement,
    district: address.neighborhood,
    city: address.city,
    state_abbr: address.state,
    postal_code: onlyDigits(address.zipCode),
    country_id: "BR",
  };
}

export const superfreteProvider: ShippingProvider = {
  async getQuotes({ originZipCode, destinationZipCode, items }) {
    const token = requireToken();

    const response = await fetch(`${SUPERFRETE_API_BASE}/calculator`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        from: { postal_code: onlyDigits(originZipCode) },
        to: { postal_code: onlyDigits(destinationZipCode) },
        products: items.map((item) => ({
          width: item.widthCm,
          height: item.heightCm,
          length: item.lengthCm,
          weight: item.weightGrams / 1000, // Superfrete espera kg, não gramas
          quantity: item.quantity,
        })),
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Falha ao cotar frete na Superfrete (${response.status}): ${body}`);
    }

    const data = (await response.json()) as SuperfreteQuoteResponseItem[];

    return data
      .filter((quote) => !quote.error)
      .map((quote) => ({
        serviceId: String(quote.id),
        carrierName: quote.name,
        priceCents: Math.round(Number(quote.price) * 100),
        estimatedDays: quote.delivery_time ?? 0,
      }));
  },

  // Sequência de 3 chamadas assumida a partir da documentação pública
  // (adicionar ao carrinho → pagar com saldo da carteira → gerar etiqueta).
  // Nunca testada contra a API real — é o primeiro lugar a conferir se a
  // compra de etiqueta falhar de um jeito inesperado.
  async purchaseLabel({ origin, destination, serviceId, items }) {
    const token = requireToken();
    const headers = authHeaders(token);

    const cartResponse = await fetch(`${SUPERFRETE_API_BASE}/cart`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        service: Number(serviceId),
        from: addressPayload(origin, origin.address),
        to: addressPayload(destination, destination.address),
        products: items.map((item) => ({
          width: item.widthCm,
          height: item.heightCm,
          length: item.lengthCm,
          weight: item.weightGrams / 1000,
          quantity: item.quantity,
        })),
      }),
    });
    if (!cartResponse.ok) {
      throw new Error(`Falha ao adicionar envio ao carrinho da Superfrete (${cartResponse.status}): ${await cartResponse.text()}`);
    }
    const cart = (await cartResponse.json()) as { id: string };

    const checkoutResponse = await fetch(`${SUPERFRETE_API_BASE}/checkout`, {
      method: "POST",
      headers,
      body: JSON.stringify({ orders: [cart.id] }),
    });
    if (!checkoutResponse.ok) {
      throw new Error(`Falha ao pagar o frete na Superfrete (${checkoutResponse.status}): ${await checkoutResponse.text()}`);
    }

    const labelResponse = await fetch(`${SUPERFRETE_API_BASE}/generate`, {
      method: "POST",
      headers,
      body: JSON.stringify({ orders: [cart.id] }),
    });
    if (!labelResponse.ok) {
      throw new Error(`Falha ao gerar a etiqueta na Superfrete (${labelResponse.status}): ${await labelResponse.text()}`);
    }
    const label = (await labelResponse.json()) as { tracking?: string; url?: string };

    return {
      externalId: cart.id,
      trackingCode: label.tracking ?? "",
      labelUrl: label.url ?? "",
      raw: { cart, label },
    };
  },
};
