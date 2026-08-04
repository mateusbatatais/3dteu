import type { ShippingProvider } from "./types";

// Implementado contra a documentação pública (developers.superfrete.com),
// mas sem um token real pra testar — igual aconteceu com a Woovi (ver
// CLAUDE.md). Se o formato de request/response não bater no primeiro teste
// de verdade, este arquivo é o único lugar a mexer; o resto do checkout só
// conhece a interface `ShippingProvider`.
const SUPERFRETE_API_URL = "https://api.superfrete.com/api/v0/calculator";

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

export const superfreteProvider: ShippingProvider = {
  async getQuotes({ originZipCode, destinationZipCode, items }) {
    const token = process.env.SUPERFRETE_API_TOKEN;
    if (!token) {
      throw new Error(
        "SUPERFRETE_API_TOKEN não configurada — cadastre em superfrete.com > Integrações.",
      );
    }

    const response = await fetch(SUPERFRETE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        // A Superfrete exige identificar a aplicação chamadora no User-Agent.
        "User-Agent": "Fidgets (3dteu.vercel.app)",
      },
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
};
